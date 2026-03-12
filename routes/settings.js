const express = require('express');
const router = express.Router();
const { getAll, getOne, query } = require('../db/postgres');
const { authenticate, requireStats } = require('../middleware/auth');

// === 费用项管理 ===
router.get('/expense-items', authenticate, async (req, res) => {
  try {
    const { department } = req.query;
    let sql = 'SELECT * FROM expense_items WHERE 1=1';
    const params = [];
    if (department) { sql += ' AND department = ?'; params.push(department); }
    sql += ' ORDER BY department, sort_order';
    res.json({ success: true, data: await getAll(sql, params) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/expense-items/:id', authenticate, requireStats, async (req, res) => {
  try {
    const { display_name, sort_order, enabled } = req.body;
    await query(
      'UPDATE expense_items SET display_name = ?, sort_order = ?, enabled = ? WHERE id = ?',
      [display_name, sort_order, enabled, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// === 计算规则 ===
router.get('/calc-rules', authenticate, async (req, res) => {
  try {
    const { department } = req.query;
    let sql = 'SELECT * FROM calc_rules WHERE 1=1';
    const params = [];
    if (department) { sql += ' AND department = ?'; params.push(department); }
    res.json({ success: true, data: await getAll(sql, params) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/calc-rules/:id', authenticate, requireStats, async (req, res) => {
  try {
    const { participating_fields } = req.body;
    await query(
      'UPDATE calc_rules SET participating_fields = ?, updated_at = NOW() WHERE id = ?',
      [participating_fields, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// === 数据锁定 ===
router.get('/data-locks', authenticate, async (req, res) => {
  try {
    const locks = await getAll(`
      SELECT dl.*, u.name as locked_by_name FROM data_locks dl
      LEFT JOIN users u ON dl.locked_by = u.id
      ORDER BY dl.department, dl.lock_month DESC
    `);
    res.json({ success: true, data: locks });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/data-locks', authenticate, requireStats, async (req, res) => {
  try {
    const { department, lock_month } = req.body;
    const result = await query(
      'INSERT INTO data_locks (department, lock_month, locked_by) VALUES (?, ?, ?) RETURNING *',
      [department, lock_month, req.user.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ success: false, message: '该月已锁定' });
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/data-locks/:id', authenticate, requireStats, async (req, res) => {
  try {
    await query('DELETE FROM data_locks WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
