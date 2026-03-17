const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { authenticate, requireStats } = require('../middleware/auth');
const asyncHandler = require('../utils/async-handler');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const PG_DUMP = '"C:/Program Files/PostgreSQL/17/bin/pg_dump.exe"';
const PSQL = '"C:/Program Files/PostgreSQL/17/bin/psql.exe"';

router.post('/', authenticate, requireStats, asyncHandler(async (req, res) => {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const filename = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
  const filepath = path.join(BACKUP_DIR, filename);
  const dbName = process.env.DB_NAME || 'production_system';
  const dbPassword = process.env.DB_PASSWORD || 'postgres123';
  execSync(`${PG_DUMP} -U postgres ${dbName} > "${filepath}"`, { env: { ...process.env, PGPASSWORD: dbPassword } });
  res.json({ success: true, filename, size: fs.statSync(filepath).size });
}));

router.get('/list', authenticate, requireStats, asyncHandler(async (req, res) => {
  if (!fs.existsSync(BACKUP_DIR)) return res.json({ success: true, data: [] });
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(f => { const s = fs.statSync(path.join(BACKUP_DIR, f)); return { filename: f, size: s.size, created: s.mtime }; })
    .sort((a, b) => b.created - a.created);
  res.json({ success: true, data: files });
}));

router.post('/restore', authenticate, requireStats, asyncHandler(async (req, res) => {
  const { filename } = req.body;
  const filepath = path.join(BACKUP_DIR, path.basename(filename));
  if (!fs.existsSync(filepath)) return res.status(404).json({ success: false, message: '备份文件不存在' });
  const dbName = process.env.DB_NAME || 'production_system';
  const dbPassword = process.env.DB_PASSWORD || 'postgres123';
  execSync(`${PSQL} -U postgres ${dbName} < "${filepath}"`, { env: { ...process.env, PGPASSWORD: dbPassword } });
  res.json({ success: true });
}));

module.exports = router;
