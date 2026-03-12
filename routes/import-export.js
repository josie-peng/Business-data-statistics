const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const router = express.Router();
const { getAll, query } = require('../db/postgres');
const { authenticate, checkDataLock } = require('../middleware/auth');
const { DEPT_CONFIG, getAllInputFields } = require('../utils/dept-config');
const { calculateRecord } = require('../utils/calc');
const { logAction } = require('../middleware/audit');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// 中文列名 → 英文字段名映射
const COLUMN_MAP = {
  '日期': 'record_date', '车间': 'workshop_name',
  '管工人数': 'supervisor_count', '员工人数': 'worker_count',
  '总产值/天': 'daily_output', '员工工资/天': 'worker_wage',
  '管工工资/天': 'supervisor_wage', '房租': 'rent',
  '水电费': 'utility_fee', '工具投资': 'tool_investment',
  '设备': 'equipment', '装修': 'renovation',
  '杂费': 'misc_fee', '运费': 'shipping_fee',
  '社保': 'social_insurance', '税收': 'tax', '备注': 'remark',
  // 啤机独有
  '总台数': 'total_machines', '开机台数': 'running_machines',
  '杂工人数': 'misc_workers', '批水口人数': 'gate_workers',
  '开机时间': 'run_hours', '总产值含税': 'output_tax_incl',
  '杂工工资/天': 'misc_worker_wage', '机器维修': 'machine_repair',
  '模具维修': 'mold_repair', '批水口加工费': 'gate_processing_fee',
  '装配帮啤机批水口配件费用': 'assembly_gate_parts_fee',
  '可回收外厂批水口加工费': 'recoverable_gate_fee',
  '原料补料': 'material_supplement',
  // 印喷独有
  '移印总台数': 'pad_total_machines', '移印开机台数': 'pad_running_machines',
  '喷油总台数': 'spray_total_machines', '喷油开机台数': 'spray_running_machines',
  '工作时间': 'work_hours', '总工时': 'total_hours',
  '补贴': 'subsidy', '物料': 'materials', '维修费': 'repair_fee',
  '油水金额': 'oil_water_amount', '无产出工资': 'no_output_wage',
  '可回收工资': 'recoverable_wage', '可回收印尼工资': 'recoverable_indonesia_wage',
  '不可回收工具费': 'non_recoverable_tool_fee', '可回收工具费': 'recoverable_tool_fee',
  '可回收油漆': 'recoverable_paint', '部门可回收工资': 'dept_recoverable_wage',
  '装配工资代付': 'assembly_wage_paid', '办公室工资': 'office_wage',
  '自动模费': 'auto_mold_fee', '湖南模费': 'hunan_mold_fee', '印尼模费': 'indonesia_mold_fee',
  // 装配独有
  '人均产值': 'avg_output_per_worker', '计划工资含税': 'planned_wage_tax',
  '实际工资': 'actual_wage', '车间维修': 'workshop_repair',
  '电工维修': 'electrical_repair', '车间物料': 'workshop_materials',
  '拉伸膜': 'stretch_film', '补料': 'supplement',
  '住房补贴': 'housing_subsidy', '可回收电费': 'recoverable_electricity',
  '胶带': 'tape', '借调工人工资': 'borrowed_worker_wage'
};

// POST /api/:dept/import
router.post('/:dept/import', authenticate, upload.single('file'), async (req, res) => {
  try {
    const { dept } = req.params;
    const config = DEPT_CONFIG[dept];
    if (!config) return res.status(400).json({ success: false, message: '无效部门' });
    if (!req.file) return res.status(400).json({ success: false, message: '请上传文件' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const workshops = await getAll('SELECT id, name FROM workshops WHERE department = ?', [dept]);
    const wsMap = {};
    workshops.forEach(w => { wsMap[w.name] = w.id; });

    const inputFields = getAllInputFields(dept);
    const inserted = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const record = {};

      Object.keys(raw).forEach(key => {
        const mapped = COLUMN_MAP[key.trim()] || key.trim();
        record[mapped] = raw[key];
      });

      if (record.record_date instanceof Date) {
        record.record_date = record.record_date.toISOString().split('T')[0];
      }

      if (record.workshop_name) {
        record.workshop_id = wsMap[record.workshop_name];
        if (!record.workshop_id) {
          errors.push(`第 ${i + 2} 行：车间 "${record.workshop_name}" 不存在`);
          continue;
        }
      }

      const calculated = calculateRecord(dept, record);
      calculated.created_by = req.user.id;
      calculated.updated_by = req.user.id;

      const allFields = [...inputFields, ...config.uniqueCalcFields, 'balance', 'balance_ratio',
                         'record_date', 'workshop_id', 'created_by', 'updated_by'];
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
    res.json({ success: true, imported: inserted.length, errors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/:dept/export
router.get('/:dept/export', authenticate, async (req, res) => {
  try {
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

    const reverseMap = {};
    Object.entries(COLUMN_MAP).forEach(([cn, en]) => { reverseMap[en] = cn; });

    const exportData = records.map(r => {
      const row = {};
      Object.keys(r).forEach(key => {
        const label = reverseMap[key] || key;
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
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
