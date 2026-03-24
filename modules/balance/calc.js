// modules/balance/calc.js
// 三工结余模块的计算引擎
// 优先从数据库读取公式配置 + 调用 formula-parser.js
// 数据库不可用时 fallback 到硬编码逻辑

const { getAll } = require('../../db/postgres');
const FormulaParser = require('../../shared/formula-parser');
const { DEPT_CONFIG, SHARED_EXPENSE_FIELDS, getCurrencyFields, getFixedExpenseFields } = require('../index');

// 公式和标签缓存（每 5 分钟刷新一次，避免每次计算都查数据库）
let formulaCache = {};   // { dept: [formulas] }
let tagCache = {};       // { dept: tagMap }
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

// 加载公式配置和标签到缓存
async function loadFormulasAndTags(dept) {
  const now = Date.now();
  if (formulaCache[dept] && (now - cacheTime) < CACHE_TTL) {
    return { formulas: formulaCache[dept], tags: tagCache[dept] };
  }

  try {
    // 加载公式
    const formulas = await getAll(
      'SELECT * FROM formula_configs WHERE module = ? AND department = ? AND enabled = true ORDER BY sort_order',
      ['balance', dept]
    );

    // 加载标签（合并 _shared 和部门特有）
    const tagRows = await getAll(
      'SELECT department, field_key, tag FROM field_tags WHERE module = ? AND (department = ? OR department = ?)',
      ['balance', '_shared', dept]
    );
    const tagMap = {};
    for (const r of tagRows) {
      if (!tagMap[r.department]) tagMap[r.department] = {};
      if (!tagMap[r.department][r.tag]) tagMap[r.department][r.tag] = [];
      tagMap[r.department][r.tag].push(r.field_key);
    }

    // 只有公式非空时才缓存（空表示数据库还没迁移数据）
    if (formulas.length > 0) {
      formulaCache[dept] = formulas;
      tagCache[dept] = tagMap;
      cacheTime = now;
    }

    return { formulas, tags: tagMap };
  } catch (err) {
    console.warn('[calc] 数据库读取公式失败，使用硬编码:', err.message);
    return { formulas: [], tags: {} };
  }
}

// 清除缓存（公式变更时调用）
function clearCache() {
  formulaCache = {};
  tagCache = {};
  cacheTime = 0;
}

// 根据记录日期查找当月生效的常量值
async function loadConstants(recordDate) {
  try {
    // recordDate 可能是 Date 对象或字符串
    const dateStr = recordDate instanceof Date
      ? recordDate.toISOString().substring(0, 7)
      : String(recordDate).substring(0, 7);
    if (!dateStr || dateStr.length < 7) return {};

    const rows = await getAll(
      `SELECT DISTINCT ON (name) name, value FROM formula_constants
       WHERE module = ? AND effective_month <= ? ORDER BY name, effective_month DESC`,
      ['balance', dateStr]
    );
    const map = {};
    for (const r of rows) { map[r.name] = parseFloat(r.value); }
    return map;
  } catch (err) {
    console.warn('[calc] 加载常量失败:', err.message);
    return {};
  }
}

// 加载某部门当月生效的固定费用配置
async function loadFixedExpenses(dept, recordDate) {
  try {
    const dateStr = recordDate instanceof Date
      ? recordDate.toISOString().substring(0, 7)
      : String(recordDate).substring(0, 7);
    if (!dateStr || dateStr.length < 7) return {};

    const moduleName = `balance_fixed_${dept}`;
    const rows = await getAll(
      `SELECT DISTINCT ON (name) name, value FROM formula_constants
       WHERE module = ? AND effective_month <= ? ORDER BY name, effective_month DESC`,
      [moduleName, dateStr]
    );
    const map = {};
    for (const r of rows) { map[r.name] = parseFloat(r.value); }
    return map;
  } catch (err) {
    console.warn('[calc] 加载固定费用失败:', err.message);
    return {};
  }
}

// 对所有金额字段执行人民币→港币转换
// skipFields: 已被其他步骤转换过的字段，跳过避免重复转换
function applyExchangeRate(dept, record, exchangeRate, skipFields = []) {
  if (!exchangeRate || exchangeRate === 0) return record;
  const result = { ...record };
  const currencyFields = getCurrencyFields(dept);
  const skipSet = new Set(skipFields);
  for (const field of currencyFields) {
    if (skipSet.has(field)) continue;
    if (result[field] !== undefined && result[field] !== null && result[field] !== '') {
      result[field] = parseFloat(result[field]) / exchangeRate;
    }
  }
  return result;
}

// 计算并代入固定费用到记录中
function applyFixedExpenses(dept, record, fixedConfig, exchangeRate) {
  const result = { ...record };
  const workDays = fixedConfig.work_days || 0;

  // 总台数（啤机，半永久，直接代入）
  if (dept === 'beer' && fixedConfig.total_machines) {
    result.total_machines = fixedConfig.total_machines;
  }

  // 房租 = 总房租 / 上班天数 / 汇率
  if (fixedConfig.rent && workDays > 0 && exchangeRate > 0) {
    result.rent = fixedConfig.rent / workDays / exchangeRate;
  }

  // 管工工资 = (底薪 + 奖金) / 上班天数 / 汇率
  const baseSalary = fixedConfig.gw_base_salary || 0;
  const bonus = fixedConfig.gw_bonus || 0;
  if ((baseSalary + bonus) > 0 && workDays > 0 && exchangeRate > 0) {
    result.supervisor_wage = (baseSalary + bonus) / workDays / exchangeRate;
  }

  // 水电费
  if (exchangeRate > 0) {
    if (dept === 'beer') {
      // 啤机：单价 × 开机台数 / 汇率
      const utilityUnit = fixedConfig.utility_unit || 0;
      const runningMachines = parseFloat(result.running_machines) || 0;
      if (utilityUnit > 0 && runningMachines > 0) {
        result.utility_fee = utilityUnit * runningMachines / exchangeRate;
      }
    } else {
      // 印喷/装配：总水电费 / 上班天数 / 汇率
      const utilityTotal = fixedConfig.utility_total || 0;
      if (utilityTotal > 0 && workDays > 0) {
        result.utility_fee = utilityTotal / workDays / exchangeRate;
      }
    }
  }

  return result;
}

// 基于数据库公式的计算
async function calculateRecordFromDB(dept, record) {
  const { formulas, tags } = await loadFormulasAndTags(dept);
  if (formulas.length === 0) {
    // 数据库无公式，fallback 到硬编码
    return calculateRecordHardcoded(dept, record);
  }

  // 根据记录日期查找常量
  const constants = await loadConstants(record.record_date);

  const result = { ...record };
  const calcResult = FormulaParser.calculateAll(formulas, result, tags, dept, constants);

  // 将计算结果合并到记录中
  for (const [key, value] of Object.entries(calcResult.results)) {
    if (value !== null) {
      result[key] = value;
    }
  }

  return result;
}

// 硬编码 fallback（原始逻辑，保留作为降级方案）
function calculateRecordHardcoded(dept, record) {
  const result = { ...record };
  const config = DEPT_CONFIG[dept];
  if (!config) return result;

  const expenseFields = [...SHARED_EXPENSE_FIELDS, ...config.uniqueExpenseFields];
  const totalExpense = expenseFields.reduce((sum, field) => sum + (parseFloat(result[field]) || 0), 0);
  const dailyOutput = parseFloat(result.daily_output) || 0;

  result.balance = dailyOutput - totalExpense;
  result.balance_ratio = dailyOutput > 0 ? result.balance / dailyOutput : 0;

  if (dept === 'beer') {
    // 开机台数 = 开机时间 / 24（计算字段）
    const runHours = parseFloat(result.run_hours) || 0;
    result.running_machines = runHours > 0 ? runHours / 24 : 0;

    const total = parseFloat(result.total_machines) || 0;
    const running = parseFloat(result.running_machines) || 0;
    result.machine_rate = total > 0 ? running / total : 0;
    result.avg_output_per_machine = running > 0 ? dailyOutput / running : 0;
    result.output_tax_incl = dailyOutput / 1.13;

    // 人均产值（新增）
    const workerCount = parseFloat(result.worker_count) || 0;
    result.per_capita_output = workerCount > 0 ? dailyOutput / workerCount : 0;

    result.wage_ratio = dailyOutput > 0 ? ((parseFloat(result.worker_wage) || 0) + (parseFloat(result.supervisor_wage) || 0) + (parseFloat(result.misc_worker_wage) || 0)) / dailyOutput : 0;
    result.mold_cost_ratio = dailyOutput > 0 ? (parseFloat(result.mold_repair) || 0) / dailyOutput : 0;
    result.gate_cost_ratio = dailyOutput > 0 ? (parseFloat(result.gate_processing_fee) || 0) / dailyOutput : 0;
    result.avg_balance_per_machine = running > 0 ? result.balance / running : 0;
  } else if (dept === 'print') {
    // 总工时 = 员工人数 × 员工工时（计算字段）
    result.total_hours = (parseFloat(result.worker_count) || 0) * (parseFloat(result.work_hours) || 0);

    const padTotal = parseFloat(result.pad_total_machines) || 0;
    const padRunning = parseFloat(result.pad_running_machines) || 0;
    const sprayTotal = parseFloat(result.spray_total_machines) || 0;
    const sprayRunning = parseFloat(result.spray_running_machines) || 0;
    result.pad_machine_rate = padTotal > 0 ? padRunning / padTotal : 0;
    result.spray_machine_rate = sprayTotal > 0 ? sprayRunning / sprayTotal : 0;
    result.avg_output_per_worker = (parseFloat(result.worker_count) || 0) > 0 ? dailyOutput / parseFloat(result.worker_count) : 0;
    result.wage_ratio = dailyOutput > 0 ? ((parseFloat(result.worker_wage) || 0) + (parseFloat(result.supervisor_wage) || 0)) / dailyOutput : 0;
    result.office_wage_ratio = dailyOutput > 0 ? (parseFloat(result.office_wage) || 0) / dailyOutput : 0;
    result.mold_fee_ratio = dailyOutput > 0 ? (parseFloat(result.auto_mold_fee) || 0) / dailyOutput : 0;
    result.hunan_mold_ratio = dailyOutput > 0 ? (parseFloat(result.hunan_mold_fee) || 0) / dailyOutput : 0;
    result.indonesia_mold_ratio = dailyOutput > 0 ? (parseFloat(result.indonesia_mold_fee) || 0) / dailyOutput : 0;
    result.total_ratio = result.balance_ratio + result.mold_fee_ratio;
  } else if (dept === 'assembly') {
    const workerCount = parseFloat(result.worker_count) || 0;
    const plannedWage = parseFloat(result.planned_wage_tax) || 0;
    result.avg_output_per_worker = workerCount > 0 ? dailyOutput / workerCount : 0;
    result.balance_minus_tape = result.balance - (parseFloat(result.tape) || 0);
    result.balance_tape_ratio = plannedWage > 0 ? result.balance_minus_tape / plannedWage : 0;
    result.tool_invest_ratio = plannedWage > 0 ? ((parseFloat(result.workshop_tool_investment) || 0) + (parseFloat(result.fixture_tool_investment) || 0)) / plannedWage : 0;
    result.borrowed_wage_ratio = plannedWage > 0 ? (parseFloat(result.borrowed_worker_wage) || 0) / plannedWage : 0;
  }

  return result;
}

// 对外接口：异步版本（使用数据库公式）
async function calculateRecord(dept, record) {
  return calculateRecordFromDB(dept, record);
}

module.exports = { calculateRecord, clearCache, loadConstants, loadFixedExpenses, applyExchangeRate, applyFixedExpenses };
