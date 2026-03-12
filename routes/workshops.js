const express = require('express');
const router = express.Router();
const { getAll, getOne, query } = require('../db/postgres');
const { authenticate, requireStats } = require('../middleware/auth');

router.get('/', authenticate, async (req, res) => {
  try {
    const { department } = req.query;
    let sql = 'SELECT * FROM workshops WHERE 1=1';
    const params = [];
    if (department) { sql += ' AND department = ?'; params.push(department); }
    sql += ' ORDER BY department, sort_order';
    const rows = await getAll(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', authenticate, requireStats, async (req, res) => {
  try {
    const { name, region, department, sort_order } = req.body;
    const result = await query(
      'INSERT INTO workshops (name, region, department, sort_order) VALUES (?, ?, ?, ?) RETURNING *',
      [name, region, department, sort_order || 0]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/:id', authenticate, requireStats, async (req, res) => {
  try {
    const { name, region, department, sort_order, status } = req.body;
    await query(
      'UPDATE workshops SET name = ?, region = ?, department = ?, sort_order = ?, status = ? WHERE id = ?',
      [name, region, department, sort_order, status || 'active', req.params.id]
    );
    const updated = await getOne('SELECT * FROM workshops WHERE id = ?', [req.params.id]);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id', authenticate, requireStats, async (req, res) => {
  try {
    await query('DELETE FROM workshops WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
