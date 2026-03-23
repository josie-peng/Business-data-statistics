const express = require('express');
const router = express.Router();
const { getAll } = require('../db/postgres');
const { authenticate } = require('../middleware/auth');
const { DEPT_CONFIG, getExpenseFields, getExportLabelMap } = require('../modules');
const asyncHandler = require('../utils/async-handler');

// 费用分类映射（用于堆叠图）
const EXPENSE_CATEGORIES = {
  wage: ['worker_wage', 'supervisor_wage', 'misc_worker_wage', 'no_output_wage', 'assembly_wage_paid', 'office_wage', 'actual_wage', 'borrowed_worker_wage'],
  rent_utility: ['rent', 'utility_fee'],
  insurance_tax: ['social_insurance', 'tax', 'hunan_social_insurance', 'hunan_tax'],
  repair_material: ['tool_investment', 'equipment', 'renovation', 'machine_repair', 'mold_repair', 'materials', 'material_supplement', 'repair_fee', 'oil_water_amount', 'non_recoverable_tool_fee', 'workshop_repair', 'electrical_repair', 'workshop_materials', 'stretch_film', 'tape', 'supplement', 'workshop_tool_investment', 'fixture_tool_investment'],
  process_mold: ['gate_processing_fee', 'assembly_gate_parts_fee', 'auto_mold_fee', 'hunan_mold_fee', 'indonesia_mold_fee'],
  other: ['misc_fee', 'shipping_fee', 'subsidy']
};

// DEPRECATED: 被 /daily + /monthly 替代，保留兼容
// GET /api/summary/overview
// 返回各部门汇总数据，字段名与前端 SummaryPage 对齐
router.get('/overview', authenticate, asyncHandler(async (req, res) => {
  const { start_date, end_date } = req.query;
  const result = [];

  for (const [dept, config] of Object.entries(DEPT_CONFIG)) {
    // 获取该部门的全部费用字段（共有+独有），动态拼 SUM
    const expenseFields = getExpenseFields(dept);
    const expenseSumExpr = expenseFields.length > 0
      ? expenseFields.map(f => `COALESCE(${f}, 0)`).join(' + ')
      : '0';

    let sql = `SELECT
      SUM(daily_output) as daily_output,
      SUM(worker_wage + supervisor_wage) as total_wage,
      SUM(${expenseSumExpr}) as total_expense,
      SUM(balance) as balance,
      SUM(supervisor_count) as supervisor_count,
      SUM(worker_count) as worker_count,
      SUM(rent) as rent,
      SUM(utility_fee) as utility_fee,
      SUM(social_insurance) as social_insurance,
      SUM(tax) as tax
      FROM ${config.tableName} WHERE 1=1`;
    const params = [];
    if (start_date) { sql += ' AND record_date >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND record_date <= ?'; params.push(end_date); }

    const rows = await getAll(sql, params);
    const row = rows[0] || {};
    const dailyOutput = parseFloat(row.daily_output) || 0;
    const balance = parseFloat(row.balance) || 0;
    result.push({
      dept_name: config.label,
      daily_output: dailyOutput,
      total_wage: parseFloat(row.total_wage) || 0,
      total_expense: parseFloat(row.total_expense) || 0,
      balance: balance,
      balance_ratio: dailyOutput > 0 ? balance / dailyOutput : 0,
      supervisor_count: parseInt(row.supervisor_count) || 0,
      worker_count: parseInt(row.worker_count) || 0,
      rent: parseFloat(row.rent) || 0,
      utility_fee: parseFloat(row.utility_fee) || 0,
      social_insurance: parseFloat(row.social_insurance) || 0,
      tax: parseFloat(row.tax) || 0
    });
  }

  res.json({ success: true, data: result });
}));

// GET /api/summary/dashboard?year=2026&month=3
// 看板数据：卡片汇总 + 部门对比 + 月度趋势 + 费用构成
router.get('/dashboard', authenticate, asyncHandler(async (req, res) => {
  const { year, month } = req.query;
  if (!year) return res.status(400).json({ success: false, message: '缺少 year 参数' });

  const yearNum = parseInt(year);
  const monthNum = month ? parseInt(month) : null;

  // === 1. 卡片数据 + 部门对比 ===
  const departments = [];
  let totalOutput = 0, totalExpense = 0, totalBalance = 0;

  for (const [dept, config] of Object.entries(DEPT_CONFIG)) {
    const expenseFields = getExpenseFields(dept);
    const expenseSumExpr = expenseFields.map(f => `COALESCE(${f}, 0)`).join(' + ');

    let sql = `SELECT SUM(daily_output) as output, SUM(${expenseSumExpr}) as expense, SUM(balance) as balance
               FROM ${config.tableName}
               WHERE EXTRACT(YEAR FROM record_date) = ?`;
    const params = [yearNum];
    if (monthNum) { sql += ` AND EXTRACT(MONTH FROM record_date) = ?`; params.push(monthNum); }

    const rows = await getAll(sql, params);
    const r = rows[0] || {};
    const output = parseFloat(r.output) || 0;
    const expense = parseFloat(r.expense) || 0;
    const balance = parseFloat(r.balance) || 0;
    departments.push({
      dept, label: config.label, output, expense, balance,
      ratio: output > 0 ? balance / output : 0
    });
    totalOutput += output;
    totalExpense += expense;
    totalBalance += balance;
  }

  // === 1b. 查询上一期数据，计算环比 ===
  // 有月份：对比上个月；无月份（全年）：对比上一年
  let prevYear = yearNum, prevMonth = null;
  if (monthNum) {
    prevMonth = monthNum - 1;
    if (prevMonth === 0) { prevMonth = 12; prevYear = yearNum - 1; }
  } else {
    prevYear = yearNum - 1;
  }
  let prevOutput = 0, prevExpense = 0, prevBalance = 0;
  for (const [dept, config] of Object.entries(DEPT_CONFIG)) {
    const expenseFields = getExpenseFields(dept);
    const expenseSumExpr = expenseFields.map(f => `COALESCE(${f}, 0)`).join(' + ');
    let sql = `SELECT SUM(daily_output) as output, SUM(${expenseSumExpr}) as expense, SUM(balance) as balance
               FROM ${config.tableName}
               WHERE EXTRACT(YEAR FROM record_date) = ?`;
    const params = [prevYear];
    if (prevMonth) { sql += ` AND EXTRACT(MONTH FROM record_date) = ?`; params.push(prevMonth); }
    const rows = await getAll(sql, params);
    const r = rows[0] || {};
    prevOutput += parseFloat(r.output) || 0;
    prevExpense += parseFloat(r.expense) || 0;
    prevBalance += parseFloat(r.balance) || 0;
  }
  const prevRatio = prevOutput > 0 ? prevBalance / prevOutput : 0;

  // 环比变化率：(当期 - 上期) / |上期|，上期为0则返回null
  const calcChange = (curr, prev) => prev !== 0 ? (curr - prev) / Math.abs(prev) : null;

  const cards = {
    total_output: totalOutput,
    total_expense: totalExpense,
    total_balance: totalBalance,
    avg_ratio: totalOutput > 0 ? totalBalance / totalOutput : 0,
    // 环比数据
    output_change: calcChange(totalOutput, prevOutput),
    expense_change: calcChange(totalExpense, prevExpense),
    balance_change: calcChange(totalBalance, prevBalance),
    ratio_change: calcChange(totalOutput > 0 ? totalBalance / totalOutput : 0, prevRatio),
    prev_label: monthNum ? `${prevYear}-${String(prevMonth).padStart(2, '0')}` : `${prevYear}年`
  };

  // === 2. 月度趋势（该年每月每个部门的结余率）===
  const trendMap = {};
  for (let m = 1; m <= 12; m++) {
    trendMap[`${yearNum}-${String(m).padStart(2, '0')}`] = {};
  }
  for (const [dept, config] of Object.entries(DEPT_CONFIG)) {
    const sql = `SELECT EXTRACT(MONTH FROM record_date)::int as m,
                 SUM(daily_output) as output, SUM(balance) as balance
                 FROM ${config.tableName}
                 WHERE EXTRACT(YEAR FROM record_date) = ?
                 GROUP BY EXTRACT(MONTH FROM record_date)`;
    const rows = await getAll(sql, [yearNum]);
    for (const r of rows) {
      const key = `${yearNum}-${String(r.m).padStart(2, '0')}`;
      const output = parseFloat(r.output) || 0;
      const balance = parseFloat(r.balance) || 0;
      if (trendMap[key]) trendMap[key][`${dept}_ratio`] = output > 0 ? balance / output : 0;
    }
  }
  const monthlyTrend = Object.entries(trendMap).sort().map(([month, data]) => ({
    month, beer_ratio: 0, print_ratio: 0, assembly_ratio: 0, ...data
  }));

  // === 3. 费用构成（该年每月按分类汇总，三部门合计）===
  const breakdownMap = {};
  for (let m = 1; m <= 12; m++) {
    const key = `${yearNum}-${String(m).padStart(2, '0')}`;
    breakdownMap[key] = {};
    for (const cat of Object.keys(EXPENSE_CATEGORIES)) breakdownMap[key][cat] = 0;
  }
  for (const [dept, config] of Object.entries(DEPT_CONFIG)) {
    const allExpense = getExpenseFields(dept);
    const selectClauses = allExpense.map(f => `SUM(COALESCE(${f}, 0)) as ${f}`).join(', ');
    const sql = `SELECT EXTRACT(MONTH FROM record_date)::int as m, ${selectClauses}
                 FROM ${config.tableName}
                 WHERE EXTRACT(YEAR FROM record_date) = ?
                 GROUP BY EXTRACT(MONTH FROM record_date)`;
    const rows = await getAll(sql, [yearNum]);
    for (const r of rows) {
      const key = `${yearNum}-${String(r.m).padStart(2, '0')}`;
      if (!breakdownMap[key]) continue;
      for (const [cat, fields] of Object.entries(EXPENSE_CATEGORIES)) {
        for (const f of fields) {
          if (r[f] !== undefined) breakdownMap[key][cat] += parseFloat(r[f]) || 0;
        }
      }
    }
  }
  const expenseBreakdown = Object.entries(breakdownMap).sort().map(([month, data]) => ({ month, ...data }));

  res.json({ success: true, data: { cards, departments, monthly_trend: monthlyTrend, expense_breakdown: expenseBreakdown } });
}));

// DEPRECATED: 被 /daily + /monthly 替代，保留兼容
// GET /api/summary/detail?dept=beer&start_date=2026-03-01&end_date=2026-03-31
// 汇总表数据：总览模式（无dept）或部门明细模式（有dept）
router.get('/detail', authenticate, asyncHandler(async (req, res) => {
  const { dept, start_date, end_date } = req.query;
  const balanceConfig = require('../modules/balance/config');

  // 日期条件构建辅助函数
  const buildDateWhere = (alias, params) => {
    let where = '';
    if (start_date) { where += ` AND ${alias}record_date >= ?`; params.push(start_date); }
    if (end_date) { where += ` AND ${alias}record_date <= ?`; params.push(end_date); }
    return where;
  };

  if (!dept) {
    // === 总览模式：返回三部门的所有字段汇总 ===
    const deptResults = [];

    for (const [dKey, config] of Object.entries(DEPT_CONFIG)) {
      const sharedExpFields = balanceConfig.sharedFields.filter(f => f.expense).map(f => f.field);
      const uniqueExpFields = config.uniqueExpenseFields;
      const allExpFields = [...sharedExpFields, ...uniqueExpFields];

      // 查询所有需要的字段
      const allFields = ['daily_output', 'supervisor_count', 'worker_count', ...allExpFields, 'balance'];
      const selectClauses = allFields.map(f => `SUM(COALESCE(${f}, 0)) as ${f}`).join(', ');
      const params = [];
      let sql = `SELECT ${selectClauses} FROM ${config.tableName} WHERE 1=1`;
      sql += buildDateWhere('', params);

      const rows = await getAll(sql, params);
      const r = rows[0] || {};
      const output = parseFloat(r.daily_output) || 0;
      const balance = parseFloat(r.balance) || 0;

      // 构建该部门的行数据
      const deptRows = [];
      // 产值
      deptRows.push({ category: '产值', field: 'daily_output', label: '总产值', value: output });
      // 人员
      deptRows.push({ category: '人员', field: 'supervisor_count', label: '管工人数', value: parseFloat(r.supervisor_count) || 0 });
      deptRows.push({ category: '人员', field: 'worker_count', label: '员工人数', value: parseFloat(r.worker_count) || 0 });
      // 共有费用
      for (const sf of balanceConfig.sharedFields) {
        if (sf.expense) {
          deptRows.push({ category: '共有', field: sf.field, label: sf.label.replace('/天', ''), value: parseFloat(r[sf.field]) || 0 });
        }
      }
      // 独有费用
      const deptConf = balanceConfig.departments[dKey];
      for (const uf of deptConf.uniqueFields) {
        if (uf.expense) {
          deptRows.push({ category: '独有', field: uf.field, label: uf.label, value: parseFloat(r[uf.field]) || 0 });
        }
      }

      deptResults.push({ dept: dKey, label: config.label, rows: deptRows, balance, balance_ratio: output > 0 ? balance / output : 0 });
    }

    // 构建总览行结构：统一行 + 各部门值
    const allRows = [];
    const rowDefs = [];
    // 产值和人员（共有）
    rowDefs.push({ category: '产值', field: 'daily_output', label: '总产值' });
    rowDefs.push({ category: '人员', field: 'supervisor_count', label: '管工人数' });
    rowDefs.push({ category: '人员', field: 'worker_count', label: '员工人数' });
    // 共有费用
    for (const sf of balanceConfig.sharedFields) {
      if (sf.expense) rowDefs.push({ category: '共有', field: sf.field, label: sf.label.replace('/天', '') });
    }
    // 各部门独有费用
    for (const [dKey, deptConf] of Object.entries(balanceConfig.departments)) {
      for (const uf of deptConf.uniqueFields) {
        if (uf.expense) rowDefs.push({ category: DEPT_CONFIG[dKey].label.replace('部', '') + '独有', field: uf.field, label: uf.label, dept: dKey });
      }
    }

    for (const rd of rowDefs) {
      const row = { category: rd.category, field: rd.field, label: rd.label };
      let rowTotal = 0;
      for (const dr of deptResults) {
        // 部门独有字段只在对应部门显示值，其他部门显示 null
        if (rd.dept && rd.dept !== dr.dept) {
          row[dr.dept] = null;
        } else {
          const found = dr.rows.find(r => r.field === rd.field);
          if (found) { row[dr.dept] = found.value; rowTotal += found.value; }
          else { row[dr.dept] = null; }
        }
      }
      row.total = rowTotal;
      allRows.push(row);
    }

    // 费用总计行
    const expTotalRow = { category: '合计', field: '_expense_total', label: '费用总计' };
    let grandExpTotal = 0;
    for (const dr of deptResults) {
      const deptExp = dr.rows.filter(r => r.category === '共有' || r.category === '独有')
        .reduce((s, r) => s + r.value, 0);
      expTotalRow[dr.dept] = deptExp;
      grandExpTotal += deptExp;
    }
    expTotalRow.total = grandExpTotal;
    allRows.push(expTotalRow);

    // 结余行
    const balanceRow = { category: '结余', field: 'balance', label: '结余' };
    const ratioRow = { category: '结余', field: 'balance_ratio', label: '结余率' };
    let grandBalance = 0, grandOutput = 0;
    for (const dr of deptResults) {
      balanceRow[dr.dept] = dr.balance;
      grandBalance += dr.balance;
      const deptOutput = dr.rows.find(r => r.field === 'daily_output')?.value || 0;
      grandOutput += deptOutput;
      ratioRow[dr.dept] = dr.balance_ratio;
    }
    balanceRow.total = grandBalance;
    ratioRow.total = grandOutput > 0 ? grandBalance / grandOutput : 0;
    allRows.push(balanceRow);
    allRows.push(ratioRow);

    res.json({ success: true, data: { mode: 'overview', rows: allRows, departments: ['beer', 'print', 'assembly'] } });

  } else {
    // === 部门明细模式 ===
    const config = DEPT_CONFIG[dept];
    if (!config) return res.status(400).json({ success: false, message: '未知部门: ' + dept });
    const deptConf = balanceConfig.departments[dept];

    // 构建需要查询的字段列表
    const queryFields = ['daily_output', 'supervisor_count', 'worker_count'];
    for (const sf of balanceConfig.sharedFields) { if (sf.expense) queryFields.push(sf.field); }
    for (const uf of deptConf.uniqueFields) { if (uf.expense) queryFields.push(uf.field); }
    queryFields.push('balance');

    const selectClauses = queryFields.map(f => `SUM(COALESCE(r.${f}, 0)) as ${f}`).join(', ');
    const params = [];
    let sql = `SELECT w.name as workshop_name, ${selectClauses}
               FROM ${config.tableName} r LEFT JOIN workshops w ON r.workshop_id = w.id
               WHERE 1=1`;
    sql += buildDateWhere('r.', params);
    sql += ` GROUP BY w.id, w.name, w.sort_order ORDER BY w.sort_order`;

    const dbRows = await getAll(sql, params);
    const workshops = dbRows.map(r => r.workshop_name);

    // 构建行数据
    const rows = [];
    // 产值
    rows.push({ category: '产值', field: 'daily_output', label: '总产值',
      values: Object.fromEntries(dbRows.map(r => [r.workshop_name, parseFloat(r.daily_output) || 0])),
      total: dbRows.reduce((s, r) => s + (parseFloat(r.daily_output) || 0), 0) });
    // 人员
    for (const f of ['supervisor_count', 'worker_count']) {
      const label = f === 'supervisor_count' ? '管工人数' : '员工人数';
      rows.push({ category: '人员', field: f, label,
        values: Object.fromEntries(dbRows.map(r => [r.workshop_name, parseFloat(r[f]) || 0])),
        total: dbRows.reduce((s, r) => s + (parseFloat(r[f]) || 0), 0) });
    }
    // 共有费用
    for (const sf of balanceConfig.sharedFields) {
      if (!sf.expense) continue;
      rows.push({ category: '共有', field: sf.field, label: sf.label.replace('/天', ''),
        values: Object.fromEntries(dbRows.map(r => [r.workshop_name, parseFloat(r[sf.field]) || 0])),
        total: dbRows.reduce((s, r) => s + (parseFloat(r[sf.field]) || 0), 0) });
    }
    // 独有费用
    for (const uf of deptConf.uniqueFields) {
      if (!uf.expense) continue;
      rows.push({ category: '独有', field: uf.field, label: uf.label,
        values: Object.fromEntries(dbRows.map(r => [r.workshop_name, parseFloat(r[uf.field]) || 0])),
        total: dbRows.reduce((s, r) => s + (parseFloat(r[uf.field]) || 0), 0) });
    }

    // 费用总计
    const expenseTotal = {};
    for (const ws of workshops) {
      expenseTotal[ws] = rows.filter(r => r.category === '共有' || r.category === '独有')
        .reduce((s, r) => s + (r.values[ws] || 0), 0);
    }
    expenseTotal.total = Object.values(expenseTotal).reduce((s, v) => s + v, 0);

    // 结余
    const balance = {};
    const balanceRatio = {};
    for (const r of dbRows) {
      balance[r.workshop_name] = parseFloat(r.balance) || 0;
      const wsOutput = parseFloat(r.daily_output) || 0;
      balanceRatio[r.workshop_name] = wsOutput > 0 ? (parseFloat(r.balance) || 0) / wsOutput : 0;
    }
    balance.total = dbRows.reduce((s, r) => s + (parseFloat(r.balance) || 0), 0);
    const totalOut = dbRows.reduce((s, r) => s + (parseFloat(r.daily_output) || 0), 0);
    balanceRatio.total = totalOut > 0 ? balance.total / totalOut : 0;

    res.json({ success: true, data: { mode: 'detail', dept, workshops, rows, expense_total: expenseTotal, balance, balance_ratio: balanceRatio } });
  }
}));

// GET /api/summary/daily?dept=beer&month=2026-03
// 返回按日汇总数据：月度合计 + 每日卡片
router.get('/daily', authenticate, asyncHandler(async (req, res) => {
  const { dept, month } = req.query;
  if (!dept || !DEPT_CONFIG[dept]) return res.status(400).json({ error: '无效部门' });
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: '无效月份格式，应为 YYYY-MM' });

  const config = DEPT_CONFIG[dept];
  const tableName = config.tableName;
  const expenseFields = getExpenseFields(dept);

  // 构建 SELECT 字段列表：daily_output + 所有 expense 字段
  const allFields = ['daily_output', ...expenseFields];
  const selectFields = allFields.map(f => `COALESCE(r.${f}, 0) AS ${f}`).join(', ');
  const sumFields = allFields.map(f => `SUM(COALESCE(r.${f}, 0)) AS ${f}`).join(', ');

  // 解析月份为日期范围
  const [year, mon] = month.split('-').map(Number);
  const startDate = `${year}-${String(mon).padStart(2, '0')}-01`;
  const endDate = mon === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(mon + 1).padStart(2, '0')}-01`;

  // 费用合计表达式
  const expenseSumExpr = expenseFields.length > 0
    ? expenseFields.map(f => `COALESCE(r.${f}, 0)`).join(' + ')
    : '0';
  const expenseSumAgg = expenseFields.length > 0
    ? expenseFields.map(f => `SUM(COALESCE(r.${f}, 0))`).join(' + ')
    : '0';

  // 1. 月度合计（按车间分组）
  const monthlySQL = `
    SELECT w.name AS workshop_name,
      ${sumFields},
      ${expenseSumAgg} AS total_expense
    FROM ${tableName} r
    JOIN workshops w ON r.workshop_id = w.id
    WHERE r.record_date >= ? AND r.record_date < ?
    GROUP BY w.name, w.sort_order
    ORDER BY w.sort_order
  `;
  const monthlyRows = await getAll(monthlySQL, [startDate, endDate]);

  // 计算每行的 balance 和 balance_ratio
  for (const row of monthlyRows) {
    row.balance = (row.daily_output || 0) - (row.total_expense || 0);
    row.balance_ratio = row.daily_output > 0 ? row.balance / row.daily_output : 0;
  }

  // 月度合计行
  const monthlyTotal = {};
  allFields.forEach(f => { monthlyTotal[f] = monthlyRows.reduce((sum, r) => sum + (Number(r[f]) || 0), 0); });
  monthlyTotal.total_expense = monthlyRows.reduce((sum, r) => sum + (Number(r.total_expense) || 0), 0);
  monthlyTotal.balance = (monthlyTotal.daily_output || 0) - (monthlyTotal.total_expense || 0);
  monthlyTotal.balance_ratio = monthlyTotal.daily_output > 0 ? monthlyTotal.balance / monthlyTotal.daily_output : 0;

  // 2. 每日明细（按日期+车间）
  const dailySQL = `
    SELECT r.record_date, w.name AS workshop_name,
      ${selectFields},
      ${expenseSumExpr} AS total_expense
    FROM ${tableName} r
    JOIN workshops w ON r.workshop_id = w.id
    WHERE r.record_date >= ? AND r.record_date < ?
    ORDER BY r.record_date DESC, w.sort_order
  `;
  const dailyRows = await getAll(dailySQL, [startDate, endDate]);

  // 按日期分组
  const dailyMap = {};
  for (const row of dailyRows) {
    row.balance = (row.daily_output || 0) - (row.total_expense || 0);
    row.balance_ratio = row.daily_output > 0 ? row.balance / row.daily_output : 0;

    const dateStr = typeof row.record_date === 'string'
      ? row.record_date.slice(0, 10)
      : row.record_date.toISOString().slice(0, 10);

    if (!dailyMap[dateStr]) dailyMap[dateStr] = [];
    dailyMap[dateStr].push(row);
  }

  // 构建每日卡片数据（含合计行）
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const daily = Object.entries(dailyMap).map(([date, workshops]) => {
    const total = {};
    allFields.forEach(f => { total[f] = workshops.reduce((sum, r) => sum + (Number(r[f]) || 0), 0); });
    total.total_expense = workshops.reduce((sum, r) => sum + (Number(r.total_expense) || 0), 0);
    total.balance = (total.daily_output || 0) - (total.total_expense || 0);
    total.balance_ratio = total.daily_output > 0 ? total.balance / total.daily_output : 0;

    const d = new Date(date + 'T00:00:00');
    return { date, weekday: weekdays[d.getDay()], workshops, total };
  });

  // 字段列定义（供前端动态建列）
  const labelMap = getExportLabelMap('balance');
  const columns = allFields.map(f => ({
    field: f,
    label: labelMap[f] || f
  }));

  res.json({
    columns,
    monthly: { workshops: monthlyRows, total: monthlyTotal },
    daily
  });
}));

// GET /api/summary/monthly?month=2026-03
// 返回三部门月度汇总 + 环比对比
router.get('/monthly', authenticate, asyncHandler(async (req, res) => {
  const { month } = req.query;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: '无效月份格式' });

  const [year, mon] = month.split('-').map(Number);
  const startDate = `${year}-${String(mon).padStart(2, '0')}-01`;
  const endDate = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, '0')}-01`;

  // 上月范围
  const prevMon = mon === 1 ? 12 : mon - 1;
  const prevYear = mon === 1 ? year - 1 : year;
  const prevStart = `${prevYear}-${String(prevMon).padStart(2, '0')}-01`;
  const prevEnd = startDate;

  // 共有费用中要单独展示的字段
  const shownSharedFields = ['worker_wage', 'supervisor_wage', 'rent', 'utility_fee', 'social_insurance', 'tax'];
  // 归入"其他费用"的共有字段
  const otherSharedFields = ['tool_investment', 'equipment', 'renovation', 'misc_fee', 'shipping_fee'];

  const departments = [];
  const prevDepartments = [];

  for (const [dept, config] of Object.entries(DEPT_CONFIG)) {
    const tableName = config.tableName;
    const expenseFields = getExpenseFields(dept);
    const uniqueExpenseFields = expenseFields.filter(f => !shownSharedFields.includes(f) && !otherSharedFields.includes(f));

    // "其他费用" = 独有费用 + otherSharedFields中存在的
    const otherFields = [...otherSharedFields.filter(f => expenseFields.includes(f)), ...uniqueExpenseFields];
    const otherExpr = otherFields.length > 0
      ? otherFields.map(f => `SUM(COALESCE(${f}, 0))`).join(' + ')
      : '0';

    const totalExpenseExpr = expenseFields.length > 0
      ? expenseFields.map(f => `SUM(COALESCE(${f}, 0))`).join(' + ')
      : '0';

    const sql = `
      SELECT
        SUM(COALESCE(daily_output, 0)) AS daily_output,
        ${shownSharedFields.map(f => `SUM(COALESCE(${f}, 0)) AS ${f}`).join(', ')},
        ${otherExpr} AS other_expense,
        ${totalExpenseExpr} AS total_expense
      FROM ${tableName} r
      JOIN workshops w ON r.workshop_id = w.id
      WHERE r.record_date >= ? AND r.record_date < ?
    `;

    // 本月数据
    const [curr = {}] = await getAll(sql, [startDate, endDate]);
    curr.balance = (curr.daily_output || 0) - (curr.total_expense || 0);
    curr.balance_ratio = curr.daily_output > 0 ? curr.balance / curr.daily_output : 0;
    curr.dept = dept;
    curr.label = config.label;
    departments.push(curr);

    // 上月数据
    const [prev = {}] = await getAll(sql, [prevStart, prevEnd]);
    prev.balance = (prev.daily_output || 0) - (prev.total_expense || 0);
    prev.balance_ratio = prev.daily_output > 0 ? prev.balance / prev.daily_output : 0;
    prev.dept = dept;
    prev.label = config.label;
    prevDepartments.push(prev);
  }

  // 计算合计行（三部门汇总）
  const calcTotal = (depts) => {
    const t = { dept: 'total', label: '三工合计' };
    const numKeys = ['daily_output', ...shownSharedFields, 'other_expense', 'total_expense', 'balance'];
    numKeys.forEach(k => { t[k] = depts.reduce((sum, d) => sum + (Number(d[k]) || 0), 0); });
    t.balance_ratio = t.daily_output > 0 ? t.balance / t.daily_output : 0;
    return t;
  };

  const currentTotal = calcTotal(departments);
  const prevTotal = calcTotal(prevDepartments);

  // 计算环比变化
  const calcComparison = (curr, prev) => {
    const pctChange = (c, p) => p > 0 ? (c - p) / p : null;
    return {
      dept: curr.dept,
      label: curr.label,
      output_change: (curr.daily_output || 0) - (prev.daily_output || 0),
      output_change_pct: pctChange(curr.daily_output, prev.daily_output),
      expense_change: (curr.total_expense || 0) - (prev.total_expense || 0),
      expense_change_pct: pctChange(curr.total_expense, prev.total_expense),
      balance_change: (curr.balance || 0) - (prev.balance || 0),
      balance_change_pct: pctChange(curr.balance, prev.balance),
      ratio_change: (curr.balance_ratio || 0) - (prev.balance_ratio || 0),
      prev_balance: prev.balance || 0,
      curr_balance: curr.balance || 0
    };
  };

  const comparison = departments.map((d, i) => calcComparison(d, prevDepartments[i]));
  comparison.push(calcComparison(currentTotal, prevTotal));

  res.json({
    current: {
      departments,
      total: currentTotal
    },
    comparison: {
      departments: comparison,
      prev_month: `${prevYear}-${String(prevMon).padStart(2, '0')}`
    }
  });
}));

module.exports = router;
