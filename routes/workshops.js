const express = require('express');
const router = express.Router();
const { getAll, query } = require('../db/postgres');
const { authenticate, requireStats } = require('../middleware/auth');
const asyncHandler = require('../utils/async-handler');

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { department, region } = req.query;
  let sql = 'SELECT * FROM workshops WHERE 1=1';
  const params = [];
  if (department) { sql += ' AND department = ?'; params.push(department); }
  if (region) { sql += ' AND region = ?'; params.push(region); }
  sql += " ORDER BY CASE region WHEN '清溪' THEN 1 WHEN '邵阳' THEN 2 WHEN '河源' THEN 3 ELSE 9 END, sort_order";
  const rows = await getAll(sql, params);
  res.json({ success: true, data: rows });
}));

router.post('/', authenticate, requireStats, asyncHandler(async (req, res) => {
  const { name, region, department, company, sort_order } = req.body;
  const result = await query(
    'INSERT INTO workshops (name, region, department, company, sort_order) VALUES (?, ?, ?, ?, ?) RETURNING *',
    [name, region, department || null, company || null, sort_order || 0]
  );
  res.json({ success: true, data: result.rows[0] });
}));

router.put('/:id', authenticate, requireStats, asyncHandler(async (req, res) => {
  const { name, region, department, company, sort_order, status } = req.body;
  const result = await query(
    'UPDATE workshops SET name = ?, region = ?, department = ?, company = ?, sort_order = ?, status = ? WHERE id = ? RETURNING *',
    [name, region, department || null, company || null, sort_order, status || 'active', req.params.id]
  );
  res.json({ success: true, data: result.rows[0] });
}));

router.delete('/:id', authenticate, requireStats, asyncHandler(async (req, res) => {
  await query('DELETE FROM workshops WHERE id = ?', [req.params.id]);
  res.json({ success: true });
}));

module.exports = router;
