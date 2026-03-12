const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { getAll, getOne, query } = require('../db/postgres');
const { authenticate, requireStats } = require('../middleware/auth');
const { logAction } = require('../middleware/audit');

// GET /api/users
router.get('/', authenticate, requireStats, async (req, res) => {
  try {
    const users = await getAll(`
      SELECT u.*, array_agg(um.module_name) FILTER (WHERE um.module_name IS NOT NULL) as modules
      FROM users u LEFT JOIN user_modules um ON u.id = um.user_id
      GROUP BY u.id ORDER BY u.id
    `);
    users.forEach(u => { delete u.password_hash; });
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/users
router.post('/', authenticate, requireStats, async (req, res) => {
  try {
    const { username, name, password, role, department, batch_permission } = req.body;
    if (!username || !name || !password) {
      return res.status(400).json({ success: false, message: '请填写必填项' });
    }
    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (username, password_hash, name, role, department, batch_permission)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id, username, name, role, department, batch_permission, status, created_at`,
      [username, hash, name, role || 'entry', department || null, batch_permission || false]
    );
    await logAction(req.user.id, req.user.name, 'create_user', 'users', result.rows[0].id, null, result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ success: false, message: '用户名已存在' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/users/:id
router.put('/:id', authenticate, requireStats, async (req, res) => {
  try {
    const { name, role, department, batch_permission } = req.body;
    const old = await getOne('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!old) return res.status(404).json({ success: false, message: '用户不存在' });

    await query(
      'UPDATE users SET name = ?, role = ?, department = ?, batch_permission = ?, updated_at = NOW() WHERE id = ?',
      [name || old.name, role || old.role, department, batch_permission ?? old.batch_permission, req.params.id]
    );
    const updated = await getOne('SELECT id, username, name, role, department, batch_permission, status FROM users WHERE id = ?', [req.params.id]);
    await logAction(req.user.id, req.user.name, 'update_user', 'users', req.params.id, old, updated);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/users/:id/status
router.put('/:id/status', authenticate, requireStats, async (req, res) => {
  try {
    const { status } = req.body;
    await query('UPDATE users SET status = ?, updated_at = NOW() WHERE id = ?', [status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/users/:id/password
router.put('/:id/password', authenticate, requireStats, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ success: false, message: '请输入新密码' });
    const hash = await bcrypt.hash(password, 10);
    await query('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [hash, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/users/:id/modules
router.get('/:id/modules', authenticate, requireStats, async (req, res) => {
  try {
    const modules = await getAll('SELECT module_name FROM user_modules WHERE user_id = ?', [req.params.id]);
    res.json({ success: true, data: modules.map(m => m.module_name) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/users/:id/modules
router.put('/:id/modules', authenticate, requireStats, async (req, res) => {
  try {
    const { modules } = req.body;
    await query('DELETE FROM user_modules WHERE user_id = ?', [req.params.id]);
    for (const mod of (modules || [])) {
      await query('INSERT INTO user_modules (user_id, module_name) VALUES (?, ?)', [req.params.id, mod]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
