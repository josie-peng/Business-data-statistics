const express = require('express');
const router = express.Router();
const { getAll } = require('../db/postgres');
const { authenticate } = require('../middleware/auth');
const { DEPT_CONFIG, getExpenseFields } = require('../modules');
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

  const cards = {
    total_output: totalOutput,
    total_expense: totalExpense,
    total_balance: totalBalance,
    avg_ratio: totalOutput > 0 ? totalBalance / totalOutput : 0
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

module.exports = router;
