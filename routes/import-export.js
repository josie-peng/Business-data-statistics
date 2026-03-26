const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const router = express.Router();
const { getAll, query } = require('../db/postgres');
const { authenticate, checkDataLock, modulePermission } = require('../middleware/auth');
const { DEPT_CONFIG, getAllInputFields, getColumnMap, getExportLabelMap, getFixedExpenseFields } = require('../modules');
const { calculateRecord, loadConstants, loadFixedExpenses, applyExchangeRate, applyFixedExpenses } = require('../modules/balance/calc');
const { logAction } = require('../middleware/audit');
const asyncHandler = require('../utils/async-handler');
const { buildExport } = require('../utils/excel-export');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// 清理列名：去换行、多余空格、冒号、全角半角括号统一
// 人工编辑的 Excel 表头不规范：可能含换行、多余空格、全角符号等
function cleanColumnName(name) {
  return String(name)
    .replace(/[\r\n]+/g, '')   // 去换行
    .replace(/\s+/g, '')       // 去所有空格
    .replace(/[:：]+$/, '')    // 去尾部冒号
    .replace(/（/g, '(').replace(/）/g, ')')  // 全角括号→半角
    .replace(/，/g, ',')       // 全角逗号→半角
    .trim();
}

// 从模块配置自动生成 COLUMN_MAP
const COLUMN_MAP = getColumnMap('balance');

// 预构建"归一化"映射表：把所有 COLUMN_MAP 的 key 也做 cleanColumnName 处理
// 这样即使 config 里的 label 带全角括号，导入时也能匹配
const NORMALIZED_MAP = {};
Object.entries(COLUMN_MAP).forEach(([cn, en]) => {
  const normalized = cleanColumnName(cn);
  if (!NORMALIZED_MAP[normalized]) NORMALIZED_MAP[normalized] = en;
});

// 预计算反向映射（英文字段名 → 中文列名），用于导出
// 使用 getExportLabelMap 覆盖所有字段（含计算字段），确保导出表头全部为中文
const REVERSE_COLUMN_MAP = getExportLabelMap('balance');

// 匹配 Excel 列名到数据库字段名
// 尝试顺序：精确匹配 → 清理后匹配 → 归一化映射匹配
function matchColumn(rawKey) {
  // 1. 精确匹配（原始列名 trim 后）
  const trimmed = rawKey.trim();
  if (COLUMN_MAP[trimmed]) return COLUMN_MAP[trimmed];
  // 2. 清理后匹配（去换行、空格、全角符号）
  const cleaned = cleanColumnName(rawKey);
  if (COLUMN_MAP[cleaned]) return COLUMN_MAP[cleaned];
  // 3. 归一化映射匹配
  if (NORMALIZED_MAP[cleaned]) return NORMALIZED_MAP[cleaned];
  // 4. 未匹配，返回清理后的原始名（后续会被忽略，因为不在 allFields 中）
  return cleaned;
}

// POST /api/:dept/import
router.post('/:dept/import', authenticate, modulePermission('balance'), upload.single('file'), async (req, res) => {
  try {
    const { dept } = req.params;
    const config = DEPT_CONFIG[dept];
    if (!config) return res.status(400).json({ success: false, message: '无效部门' });
    if (!req.file) return res.status(400).json({ success: false, message: '请上传文件' });

    // 不使用 cellDates:true，避免时区偏差导致日期差一天
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });

    // 步骤1：填充合并单元格（新模版导出时日期列合并，导入需展开）
    function fillMergedCells(ws) {
      if (!ws['!merges']) return;
      for (const merge of ws['!merges']) {
        const topLeft = XLSX.utils.encode_cell(merge.s);
        const value = ws[topLeft] ? ws[topLeft].v : undefined;
        for (let r = merge.s.r; r <= merge.e.r; r++) {
          for (let c = merge.s.c; c <= merge.e.c; c++) {
            const addr = XLSX.utils.encode_cell({ r, c });
            if (addr === topLeft) continue;
            if (value !== undefined) {
              ws[addr] = ws[addr] || { t: typeof value === 'number' ? 'n' : 's' };
              ws[addr].v = value;
            }
          }
        }
      }
    }
    for (const sheetName of workbook.SheetNames) {
      fillMergedCells(workbook.Sheets[sheetName]);
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    // 步骤2：检测格式（新模版第3行为表头，含"日期"；旧格式第1行为表头）
    // 检查第3行（row index=2）A列是否含"日期"字样
    const thirdRowHeader = sheet['A3'] ? String(sheet['A3'].v || '') : '';
    const isNewFormat = thirdRowHeader.includes('日期');
    const jsonRange = isNewFormat ? 2 : 0;   // range=2 → 从第3行起读表头；range=0 → 从第1行起
    console.log(`[Import] 格式检测: ${isNewFormat ? '新模版(range=2)' : '旧格式(range=0)'}, A3="${thirdRowHeader}"`);

    // defval: null ensures empty cells are included; blankrows:false skips empty rows
    const rows = XLSX.utils.sheet_to_json(sheet, { range: jsonRange, defval: null, blankrows: false });

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

    // 导入时也需要汇率转换和固定费用代入（与 records.js POST 逻辑一致）
    // 取第一条有效记录的日期来加载配置
    let importExchangeRate = null;
    let importFixedConfig = {};

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const record = {};

      const unmapped = []; // 记录未匹配的列名，用于调试
      Object.keys(raw).forEach(key => {
        const mapped = matchColumn(key);
        if (mapped === '_skip_calc' || mapped === '_beer_tool_extra') return;
        // 如果映射结果是中文（未找到英文字段名），记录为未匹配
        if (/[\u4e00-\u9fa5]/.test(mapped)) {
          unmapped.push(`"${cleanColumnName(key)}" → 未匹配`);
        }
        record[mapped] = raw[key];
      });
      if (i === 0 && unmapped.length > 0) {
        console.log(`[Import] 第1行未匹配的列:`, unmapped);
      }

      // 跳过合计行和空车间名：含"合计"、"总计"、空值
      const wsName = record.workshop_name;
      if (!wsName || String(wsName).includes('合计') || String(wsName).includes('总计')) {
        continue;
      }

      // 解析日期：Excel 序列号 / 字符串 "2026/3/3周二" / Date 对象
      if (typeof record.record_date === 'number') {
        // Excel 日期序列号 → 用 SSF.parse_date_code 直接解析，无时区偏差
        const parsed = XLSX.SSF.parse_date_code(record.record_date);
        record.record_date = `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
      } else if (record.record_date instanceof Date) {
        // Date 对象 → 用本地时间避免 UTC 时区偏差
        const d = record.record_date;
        record.record_date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      } else if (typeof record.record_date === 'string') {
        // 字符串 → 去掉"周二"等后缀，解析日期格式
        let dateStr = record.record_date.replace(/[周星期][一二三四五六日天]/g, '').trim();
        const parts = dateStr.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (parts) {
          record.record_date = `${parts[1]}-${parts[2].padStart(2, '0')}-${parts[3].padStart(2, '0')}`;
        }
      }

      // Map workshop name to ID
      record.workshop_id = wsMap[record.workshop_name];
      if (!record.workshop_id) {
        errors.push(`第 ${i + 2} 行：车间 "${record.workshop_name}" 不存在`);
        continue;
      }

      // 首次遇到有效记录时加载汇率和固定费用配置
      if (importExchangeRate === null && record.record_date) {
        const constants = await loadConstants(record.record_date);
        importExchangeRate = constants.exchange_rate || 0;
        if (!importExchangeRate) {
          return res.status(400).json({ success: false, message: '请先在系统设置中配置当月汇率（exchange_rate）' });
        }
        importFixedConfig = await loadFixedExpenses(dept, record.record_date);
      }

      // 汇率转换和固定费用代入（与 records.js POST 一致的5步流程）
      let processed = { ...record };

      // 第一步：计算依赖字段
      if (dept === 'beer') {
        const runHours = parseFloat(processed.run_hours) || 0;
        processed.running_machines = runHours > 0 ? runHours / 24 : 0;
      }
      if (dept === 'print') {
        processed.total_hours = (parseFloat(processed.worker_count) || 0) * (parseFloat(processed.work_hours) || 0);
      }

      // 第二步：代入固定费用
      processed = applyFixedExpenses(dept, processed, importFixedConfig, importExchangeRate);

      // 第三步：装配部 planned_wage_tax 特殊处理
      if (dept === 'assembly' && processed.planned_wage_tax) {
        processed.planned_wage_tax = parseFloat(processed.planned_wage_tax) * 1.13 / importExchangeRate;
      }

      // 第四步：汇率转换
      const skipFields = [
        ...getFixedExpenseFields(dept),
        ...(dept === 'assembly' ? ['planned_wage_tax'] : []),
      ];
      processed = applyExchangeRate(dept, processed, importExchangeRate, skipFields);

      // 第五步：计算结余等衍生字段
      const calculated = await calculateRecord(dept, processed);
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

    console.log(`[Import] 结果: 成功 ${inserted.length} 条, 失败 ${errors.length} 条`);
    if (errors.length > 0) console.log(`[Import] 错误详情:`, errors);
    await logAction(req.user.id, req.user.name, 'import', config.tableName, null, null, { count: inserted.length });
    const errMsg = errors.length > 0 ? `\n问题行: ${errors.join('; ')}` : '';
    res.json({ success: true, count: inserted.length, imported: inserted.length, errors,
               message: `导入成功，共 ${inserted.length} 条${errMsg}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/:dept/export — 样式化 Excel 导出（exceljs）
router.get('/:dept/export', authenticate, asyncHandler(async (req, res) => {
  const { dept } = req.params;
  const config = DEPT_CONFIG[dept];
  if (!config) return res.status(400).json({ success: false, message: '无效部门' });
  const { start_date, end_date, workshop_id } = req.query;

  let sql = `SELECT r.*, w.name as workshop_name FROM ${config.tableName} r
             JOIN workshops w ON r.workshop_id = w.id WHERE 1=1`;
  const params = [];
  if (start_date)  { sql += ' AND r.record_date >= ?'; params.push(start_date); }
  if (end_date)    { sql += ' AND r.record_date <= ?'; params.push(end_date); }
  if (workshop_id) { sql += ' AND r.workshop_id = ?';  params.push(workshop_id); }
  sql += ' ORDER BY r.record_date ASC, w.sort_order ASC';

  const records = await getAll(sql, params);
  const buffer  = await buildExport(dept, records, start_date, end_date, workshop_id);

  const deptNames = { beer: '啤机部', print: '印喷部', assembly: '装配部' };
  const deptName  = deptNames[dept] || dept;
  const filename  = encodeURIComponent(`${deptName}收支表_${start_date || '全部'}.xlsx`);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
  res.send(buffer);
}));

module.exports = router;
