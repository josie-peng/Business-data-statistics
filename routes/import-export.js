const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const router = express.Router();
const { getAll, query } = require('../db/postgres');
const { authenticate, checkDataLock } = require('../middleware/auth');
const { DEPT_CONFIG, getAllInputFields, getColumnMap } = require('../modules');
const { calculateRecord } = require('../modules/balance/calc');
const { logAction } = require('../middleware/audit');
const asyncHandler = require('../utils/async-handler');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// 清理列名：去换行、多余空格、冒号、全角半角括号统一
function cleanColumnName(name) {
  return String(name).replace(/[\r\n]+/g, '').replace(/\s+/g, '').replace(/[:：]+$/, '').trim();
}

// 从模块配置自动生成 COLUMN_MAP
const COLUMN_MAP = getColumnMap('balance');

// 预计算反向映射（英文字段名 → 中文列名），用于导出
const REVERSE_COLUMN_MAP = {};
Object.entries(COLUMN_MAP).forEach(([cn, en]) => {
  if (!REVERSE_COLUMN_MAP[en]) REVERSE_COLUMN_MAP[en] = cn; // 保留第一个映射，避免覆盖
});

// POST /api/:dept/import
router.post('/:dept/import', authenticate, upload.single('file'), async (req, res) => {
  try {
    const { dept } = req.params;
    const config = DEPT_CONFIG[dept];
    if (!config) return res.status(400).json({ success: false, message: '无效部门' });
    if (!req.file) return res.status(400).json({ success: false, message: '请上传文件' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // defval: null ensures empty cells are included; blankrows:false skips empty rows
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, blankrows: false });

    console.log(`[Import] ${dept}: ${rows.length} raw rows, first row keys:`, rows.length > 0 ? Object.keys(rows[0]) : '(empty)');

    const workshops = await getAll('SELECT id, name FROM workshops WHERE department = ?', [dept]);
    const wsMap = {};
    workshops.forEach(w => { wsMap[w.name] = w.id; });
    console.log(`[Import] Available workshops for ${dept}:`, Object.keys(wsMap));

    const inputFields = getAllInputFields(dept);
    const allFields = [...inputFields, ...config.uniqueCalcFields, 'balance', 'balance_ratio',
                       'record_date', 'workshop_id', 'created_by', 'updated_by'];
    const inserted = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const record = {};

      Object.keys(raw).forEach(key => {
        const cleaned = cleanColumnName(key);
        const mapped = COLUMN_MAP[cleaned] || COLUMN_MAP[key.trim()] || cleaned;
        if (mapped !== '_skip_calc' && mapped !== '_beer_tool_extra') {
          record[mapped] = raw[key];
        }
      });

      // Skip summary/total rows (合计行)
      const wsName = record.workshop_name;
      if (!wsName || String(wsName).includes('合计')) {
        continue;
      }

      // Parse date: handle "2026/3/3周二" or Date objects or "2026-03-03" strings
      if (record.record_date instanceof Date) {
        record.record_date = record.record_date.toISOString().split('T')[0];
      } else if (typeof record.record_date === 'string') {
        // Strip weekday suffix like "周二", "星期二"
        let dateStr = record.record_date.replace(/[周星期][一二三四五六日天]/g, '').trim();
        // Try parsing "2026/3/3" format
        const parts = dateStr.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (parts) {
          record.record_date = `${parts[1]}-${parts[2].padStart(2, '0')}-${parts[3].padStart(2, '0')}`;
        }
      } else if (typeof record.record_date === 'number') {
        // Excel serial date number
        const d = new Date((record.record_date - 25569) * 86400000);
        record.record_date = d.toISOString().split('T')[0];
      }

      // Map workshop name to ID
      record.workshop_id = wsMap[record.workshop_name];
      if (!record.workshop_id) {
        errors.push(`第 ${i + 2} 行：车间 "${record.workshop_name}" 不存在`);
        continue;
      }

      const calculated = calculateRecord(dept, record);
      calculated.created_by = req.user.id;
      calculated.updated_by = req.user.id;

      // allFields 已在循环外构建
      const validFields = allFields.filter(f => calculated[f] !== undefined && calculated[f] !== '');
      const values = validFields.map(f => calculated[f]);
      const placeholders = validFields.map(() => '?').join(', ');

      try {
        const result = await query(
          `INSERT INTO ${config.tableName} (${validFields.join(', ')}) VALUES (${placeholders}) RETURNING id`,
          values
        );
        inserted.push(result.rows[0].id);
      } catch (e) {
        errors.push(`第 ${i + 2} 行：${e.message}`);
      }
    }

    await logAction(req.user.id, req.user.name, 'import', config.tableName, null, null, { count: inserted.length });
    const errMsg = errors.length > 0 ? `\n问题行: ${errors.join('; ')}` : '';
    res.json({ success: true, count: inserted.length, imported: inserted.length, errors,
               message: `导入成功，共 ${inserted.length} 条${errMsg}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/:dept/export
router.get('/:dept/export', authenticate, asyncHandler(async (req, res) => {
  const { dept } = req.params;
  const config = DEPT_CONFIG[dept];
  if (!config) return res.status(400).json({ success: false, message: '无效部门' });
  const { start_date, end_date, workshop_id } = req.query;

  let sql = `SELECT r.*, w.name as workshop_name FROM ${config.tableName} r
             LEFT JOIN workshops w ON r.workshop_id = w.id WHERE 1=1`;
  const params = [];
  if (start_date) { sql += ` AND r.record_date >= ?`; params.push(start_date); }
  if (end_date) { sql += ` AND r.record_date <= ?`; params.push(end_date); }
  if (workshop_id) { sql += ` AND r.workshop_id = ?`; params.push(workshop_id); }
  sql += ' ORDER BY r.record_date DESC, w.sort_order ASC';

  const records = await getAll(sql, params);

  const exportData = records.map(r => {
    const row = {};
    Object.keys(r).forEach(key => {
      const label = REVERSE_COLUMN_MAP[key] || key;
      if (!['id', 'workshop_id', 'created_by', 'updated_by', 'created_at', 'updated_at'].includes(key)) {
        row[label] = r[key];
      }
    });
    return row;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(exportData);
  XLSX.utils.book_append_sheet(wb, ws, config.label);
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(config.label)}.xlsx`);
  res.send(Buffer.from(buffer));
}));

module.exports = router;
