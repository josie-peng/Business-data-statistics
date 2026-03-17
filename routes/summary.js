const express = require('express');
const router = express.Router();
const { getAll } = require('../db/postgres');
const { authenticate } = require('../middleware/auth');
const { DEPT_CONFIG, getExpenseFields } = require('../modules');
const asyncHandler = require('../utils/async-handler');

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

module.exports = router;
