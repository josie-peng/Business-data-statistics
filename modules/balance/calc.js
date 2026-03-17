// modules/balance/calc.js
// 三工结余模块的计算公式（从 utils/calc.js 迁移，逻辑等价，增加了 parseFloat 防护）
const { DEPT_CONFIG, SHARED_EXPENSE_FIELDS } = require('../index');

function calculateRecord(dept, record) {
  const result = { ...record };
  const config = DEPT_CONFIG[dept];
  if (!config) return result;

  // 计算结余 = 日产值 - 所有费用
  const expenseFields = [...SHARED_EXPENSE_FIELDS, ...config.uniqueExpenseFields];
  const totalExpense = expenseFields.reduce((sum, field) => sum + (parseFloat(result[field]) || 0), 0);
  const dailyOutput = parseFloat(result.daily_output) || 0;

  result.balance = dailyOutput - totalExpense;
  result.balance_ratio = dailyOutput > 0 ? result.balance / dailyOutput : 0;

  // 部门独有计算
  if (dept === 'beer') {
    const total = parseFloat(result.total_machines) || 0;
    const running = parseFloat(result.running_machines) || 0;
    result.machine_rate = total > 0 ? running / total : 0;
    result.avg_output_per_machine = running > 0 ? dailyOutput / running : 0;
    // 新增：不含税产值 = 总产值/天 ÷ 1.13
    result.output_tax_incl = dailyOutput / 1.13;
    result.wage_ratio = dailyOutput > 0 ? ((parseFloat(result.worker_wage) || 0) + (parseFloat(result.supervisor_wage) || 0) + (parseFloat(result.misc_worker_wage) || 0)) / dailyOutput : 0;
    result.mold_cost_ratio = dailyOutput > 0 ? (parseFloat(result.mold_repair) || 0) / dailyOutput : 0;
    result.gate_cost_ratio = dailyOutput > 0 ? (parseFloat(result.gate_processing_fee) || 0) / dailyOutput : 0;
    result.avg_balance_per_machine = running > 0 ? result.balance / running : 0;
  } else if (dept === 'print') {
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
    // 新增：发湖南模费占产值%、发印尼模费占产值%
    result.hunan_mold_ratio = dailyOutput > 0 ? (parseFloat(result.hunan_mold_fee) || 0) / dailyOutput : 0;
    result.indonesia_mold_ratio = dailyOutput > 0 ? (parseFloat(result.indonesia_mold_fee) || 0) / dailyOutput : 0;
    // 修正：合计% = 结余% + 自动机模费占产值%
    result.total_ratio = result.balance_ratio + result.mold_fee_ratio;
  } else if (dept === 'assembly') {
    const workerCount = parseFloat(result.worker_count) || 0;
    const plannedWage = parseFloat(result.planned_wage_tax) || 0;
    result.avg_output_per_worker = workerCount > 0 ? dailyOutput / workerCount : 0;
    result.balance_minus_tape = result.balance - (parseFloat(result.tape) || 0);
    result.balance_tape_ratio = plannedWage > 0 ? result.balance_minus_tape / plannedWage : 0;
    // 修正：工具投资占计划工资% = (车间工具投资 + 夹具部工具投资) / 计划工资含税
    result.tool_invest_ratio = plannedWage > 0 ? ((parseFloat(result.workshop_tool_investment) || 0) + (parseFloat(result.fixture_tool_investment) || 0)) / plannedWage : 0;
    result.borrowed_wage_ratio = plannedWage > 0 ? (parseFloat(result.borrowed_worker_wage) || 0) / plannedWage : 0;
  }

  return result;
}

module.exports = { calculateRecord };
