const express = require('express');
const router = express.Router();
const { getAll } = require('../db/postgres');
const { authenticate } = require('../middleware/auth');
const { DEPT_CONFIG } = require('../modules');
const asyncHandler = require('../utils/async-handler');

// GET /api/summary/overview
router.get('/overview', authenticate, asyncHandler(async (req, res) => {
  const { start_date, end_date } = req.query;
  const result = [];

  for (const [dept, config] of Object.entries(DEPT_CONFIG)) {
    let sql = `SELECT
      SUM(daily_output) as total_output,
      SUM(worker_wage + supervisor_wage) as total_wage,
      SUM(rent + utility_fee + tool_investment + equipment + renovation + misc_fee + shipping_fee + social_insurance + tax) as total_expense,
      SUM(balance) as total_balance
      FROM ${config.tableName} WHERE 1=1`;
    const params = [];
    if (start_date) { sql += ' AND record_date >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND record_date <= ?'; params.push(end_date); }

    const rows = await getAll(sql, params);
    const row = rows[0] || {};
    result.push({
      department: dept,
      label: config.label,
      total_output: parseFloat(row.total_output) || 0,
      total_wage: parseFloat(row.total_wage) || 0,
      total_expense: parseFloat(row.total_expense) || 0,
      total_balance: parseFloat(row.total_balance) || 0,
      balance_ratio: row.total_output > 0 ? row.total_balance / row.total_output : 0
    });
  }

  res.json({ success: true, data: result });
}));

module.exports = router;
