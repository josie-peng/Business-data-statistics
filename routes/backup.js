const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { authenticate, requireStats, requireStatsOrManagement } = require('../middleware/auth');
const { getAll } = require('../db/postgres');
const asyncHandler = require('../utils/async-handler');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const PG_DUMP = '"C:/Program Files/PostgreSQL/17/bin/pg_dump.exe"';
const PSQL = '"C:/Program Files/PostgreSQL/17/bin/psql.exe"';

// 创建备份：仅统计组
router.post('/', authenticate, requireStats, asyncHandler(async (req, res) => {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const filename = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
  const filepath = path.join(BACKUP_DIR, filename);
  const dbName = process.env.DB_NAME || 'production_system';
  const dbPassword = process.env.DB_PASSWORD || 'postgres123';
  execSync(`${PG_DUMP} -U postgres ${dbName} > "${filepath}"`, { env: { ...process.env, PGPASSWORD: dbPassword } });
  res.json({ success: true, filename, size: fs.statSync(filepath).size });
}));

// 查看备份列表：统计组+管理层
router.get('/list', authenticate, requireStatsOrManagement, asyncHandler(async (req, res) => {
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

// GET /api/backup/exchange-rate-history — 汇率变更历史
router.get('/exchange-rate-history', authenticate, asyncHandler(async (req, res) => {
  const rows = await getAll(
    `SELECT effective_month, old_value, new_value, changed_by, changed_at
     FROM exchange_rate_history ORDER BY effective_month DESC, changed_at DESC`
  );

  // 按月份聚合
  const monthMap = {};
  for (const row of rows) {
    const m = row.effective_month;
    if (!monthMap[m]) {
      monthMap[m] = { month: m, currentValue: null, changes: [] };
    }
    // 最新的 new_value 就是当前值
    if (!monthMap[m].currentValue) {
      monthMap[m].currentValue = parseFloat(row.new_value);
    }
    monthMap[m].changes.push({
      date: new Date(row.changed_at).toLocaleDateString('zh-CN'),
      from: row.old_value ? parseFloat(row.old_value).toString() : '—',
      to: parseFloat(row.new_value).toString(),
      operator: row.changed_by
    });
  }

  res.json({ success: true, data: Object.values(monthMap) });
}));

module.exports = router;
