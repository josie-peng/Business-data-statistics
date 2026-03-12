const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { authenticate, requireStats } = require('../middleware/auth');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const PG_DUMP = '"C:/Program Files/PostgreSQL/17/bin/pg_dump.exe"';
const PSQL = '"C:/Program Files/PostgreSQL/17/bin/psql.exe"';

router.post('/', authenticate, requireStats, async (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const filename = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
    const filepath = path.join(BACKUP_DIR, filename);
    const dbName = process.env.DB_NAME || 'production_system';
    const dbPassword = process.env.DB_PASSWORD || 'postgres123';
    execSync(`${PG_DUMP} -U postgres ${dbName} > "${filepath}"`, { env: { ...process.env, PGPASSWORD: dbPassword } });
    res.json({ success: true, filename, size: fs.statSync(filepath).size });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/list', authenticate, requireStats, async (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return res.json({ success: true, data: [] });
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.sql'))
      .map(f => ({ filename: f, size: fs.statSync(path.join(BACKUP_DIR, f)).size, created: fs.statSync(path.join(BACKUP_DIR, f)).mtime }))
      .sort((a, b) => b.created - a.created);
    res.json({ success: true, data: files });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/restore', authenticate, requireStats, async (req, res) => {
  try {
    const { filename } = req.body;
    const filepath = path.join(BACKUP_DIR, path.basename(filename));
    if (!fs.existsSync(filepath)) return res.status(404).json({ success: false, message: '备份文件不存在' });
    const dbName = process.env.DB_NAME || 'production_system';
    const dbPassword = process.env.DB_PASSWORD || 'postgres123';
    execSync(`${PSQL} -U postgres ${dbName} < "${filepath}"`, { env: { ...process.env, PGPASSWORD: dbPassword } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
