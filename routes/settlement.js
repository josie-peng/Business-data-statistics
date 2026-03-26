const express = require('express');
const router = express.Router();
const { getAll, getOne, query } = require('../db/postgres');
const { authenticate } = require('../middleware/auth');
const { logAction } = require('../middleware/audit');
const { DEPT_CONFIG } = require('../modules');
const asyncHandler = require('../utils/async-handler');

// 验证部门参数
function validateDept(req, res, next) {
  const { dept } = req.params;
  if (!DEPT_CONFIG[dept]) {
    return res.status(400).json({ success: false, message: '无效部门' });
  }
  next();
}

// 仅统计组可用
function requireStats(req, res, next) {
  if (req.user.role !== 'stats') {
    return res.status(403).json({ success: false, message: '仅统计组可使用月底结算' });
  }
  next();
}

// GET /api/:dept/settlement/preview?month=2026-03&workshop_id=1
// 返回指定月份+车间的记录天数和周日天数
router.get('/:dept/settlement/preview', authenticate, validateDept, requireStats, asyncHandler(async (req, res) => {
  const { dept } = req.params;
  const { month, workshop_id } = req.query;
  if (!month || !workshop_id) {
    return res.status(400).json({ success: false, message: '请选择月份和车间' });
  }

  const config = DEPT_CONFIG[dept];
  const [year, mon] = month.split('-').map(Number);

  // 查询该月该车间的所有记录日期
  const rows = await getAll(
    `SELECT id, record_date FROM ${config.tableName}
     WHERE workshop_id = ? AND EXTRACT(YEAR FROM record_date) = ? AND EXTRACT(MONTH FROM record_date) = ?
     ORDER BY record_date ASC`,
    [workshop_id, year, mon]
  );

  // 统计周日数
  let sundayCount = 0;
  const recordDates = rows.map(r => {
    const d = new Date(r.record_date);
    if (d.getDay() === 0) sundayCount++;
    return r.record_date;
  });

  res.json({
    success: true,
    data: {
      totalRecords: rows.length,
      sundayCount,
      recordDates,
      recordIds: rows.map(r => r.id)
    }
  });
}));

// POST /api/:dept/settlement/avg
// 均摊型结算：将实际月度总额均分到每天记录
// Body: { month, workshop_id, fields: { field_name: actualTotal, ... }, method: 'all' | 'existing' }
router.post('/:dept/settlement/avg', authenticate, validateDept, requireStats, asyncHandler(async (req, res) => {
  const { dept } = req.params;
  const { month, workshop_id, fields, method } = req.body;

  if (!month || !workshop_id || !fields || Object.keys(fields).length === 0) {
    return res.status(400).json({ success: false, message: '参数不完整' });
  }

  const config = DEPT_CONFIG[dept];
  const [year, mon] = month.split('-').map(Number);

  // 查询该月该车间有记录的天数
  const rows = await getAll(
    `SELECT id, record_date FROM ${config.tableName}
     WHERE workshop_id = ? AND EXTRACT(YEAR FROM record_date) = ? AND EXTRACT(MONTH FROM record_date) = ?`,
    [workshop_id, year, mon]
  );

  if (rows.length === 0) {
    return res.status(400).json({ success: false, message: '该月无记录' });
  }

  // method='all': 除以总记录天数; method='existing': 除以非周日记录天数
  let divisor;
  if (method === 'existing') {
    divisor = rows.filter(r => new Date(r.record_date).getDay() !== 0).length;
  } else {
    divisor = rows.length;
  }

  if (divisor === 0) {
    return res.status(400).json({ success: false, message: '有效天数为0，无法计算' });
  }

  // 构建 SET 子句
  const setClauses = [];
  const setValues = [];
  for (const [fieldName, actualTotal] of Object.entries(fields)) {
    const dailyValue = parseFloat(actualTotal) / divisor;
    setClauses.push(`${fieldName} = ?`);
    setValues.push(dailyValue);
  }

  // 添加 updated_by 和 updated_at
  setClauses.push('updated_by = ?', 'updated_at = NOW()');
  setValues.push(req.user.id);

  // WHERE 条件
  const recordIds = rows.map(r => r.id);
  const placeholders = recordIds.map(() => '?').join(', ');
  setValues.push(...recordIds);

  const sql = `UPDATE ${config.tableName} SET ${setClauses.join(', ')} WHERE id IN (${placeholders})`;
  await query(sql, setValues);

  // 重算结余（被更新字段可能是费用字段，需要重新计算 balance）
  const { calculateRecord } = require('../modules/balance/calc');
  for (const row of rows) {
    const current = await getOne(
      `SELECT * FROM ${config.tableName} WHERE id = ?`, [row.id]
    );
    const recalculated = await calculateRecord(dept, current);
    await query(
      `UPDATE ${config.tableName} SET balance = ?, balance_ratio = ? WHERE id = ?`,
      [recalculated.balance, recalculated.balance_ratio, row.id]
    );
  }

  await logAction(req.user.id, req.user.name, 'settlement_avg', config.tableName, null,
    { month, workshop_id, method }, { fields, updatedCount: recordIds.length });

  res.json({ success: true, updatedCount: recordIds.length });
}));

module.exports = router;
