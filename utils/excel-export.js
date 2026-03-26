'use strict';

const ExcelJS = require('exceljs');
const { getExportLabelMap } = require('../modules/index');
const { EXPORT_WORKSHOPS, DEPT_NAMES, EXPORT_FIELD_ORDER, sumRows } = require('../modules/balance/export-columns');

// ========================
// 颜色常量
// ========================
const C = {
  purple:     '7F41C0',   // 深晶紫（标题/表头背景）
  white:      'FFFFFF',
  black:      '333333',
  blue:       '0070C0',   // 蓝色（每日合计、月累计数据行）
  red:        'FF0000',   // 红色（总计行、负数）
  grayBorder: 'B0B0B0'    // 灰色细边框
};

const FONT_SIZE   = 9;
const HEADER_SIZE = 10;
const TITLE_SIZE  = 12;

// ========================
// 数值格式
// ========================
const FMT_NUMBER  = '#,##0.00;[Red](#,##0.00)';
const FMT_INTEGER = '0;[Red](0)';
const FMT_RATIO   = '0.00%;[Red](0.00%)';
const FMT_DATE    = 'yyyy/m/d';

// 人数字段（整数格式）
const INTEGER_FIELDS = new Set(['supervisor_count', 'worker_count', 'misc_workers', 'gate_workers']);

// 比率字段（百分比格式）
const RATIO_FIELDS = new Set([
  'machine_rate', 'pad_machine_rate', 'spray_machine_rate',
  'wage_ratio', 'mold_cost_ratio', 'gate_cost_ratio',
  'office_wage_ratio', 'mold_fee_ratio', 'hunan_mold_ratio', 'indonesia_mold_ratio',
  'total_ratio', 'balance_ratio', 'balance_tape_ratio', 'tool_invest_ratio', 'borrowed_wage_ratio',
  'outsource_balance_ratio', 'outsource_profit_ratio', 'raw_material_ratio'
]);

// ========================
// 辅助：获取字段数字格式
// ========================
function getNumFmt(field) {
  if (field === 'record_date') return FMT_DATE;
  if (INTEGER_FIELDS.has(field)) return FMT_INTEGER;
  if (RATIO_FIELDS.has(field)) return FMT_RATIO;
  return FMT_NUMBER;
}

// ========================
// 辅助：应用字体和填充到行（不含边框）
// ========================
function applyRowStyle(row, fontColor, bold, bgColor) {
  row.eachCell({ includeEmpty: true }, cell => {
    cell.font = { name: '宋体', size: FONT_SIZE, bold, color: { argb: 'FF' + fontColor } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    if (bgColor) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgColor } };
    }
  });
}

// ========================
// 辅助：应用灰细边框（所有单元格）
// ========================
function applyBorder(row, borderColor, style) {
  const borderDef = { style, color: { argb: 'FF' + borderColor } };
  row.eachCell({ includeEmpty: true }, cell => {
    cell.border = {
      top: borderDef, bottom: borderDef,
      left: borderDef, right: borderDef
    };
  });
}

// ========================
// 辅助：合计行上下黑色加粗框线（左右保持灰细）
// ========================
function applySubtotalBorder(row) {
  const thick = { style: 'medium', color: { argb: 'FF000000' } };
  const thin  = { style: 'thin',   color: { argb: 'FF' + C.grayBorder } };
  row.eachCell({ includeEmpty: true }, cell => {
    cell.border = {
      top:    thick,
      bottom: thick,
      left:   thin,
      right:  thin
    };
  });
}

// ========================
// 辅助：天分隔粗边框（仅上边框为粗黑，其余为灰细）
// ========================
function applyTopThickBorder(row) {
  const thick = { style: 'medium', color: { argb: 'FF000000' } };
  const thin  = { style: 'thin',   color: { argb: 'FF' + C.grayBorder } };
  row.eachCell({ includeEmpty: true }, cell => {
    cell.border = {
      top:    thick,
      bottom: thin,
      left:   thin,
      right:  thin
    };
  });
}

// ========================
// 辅助：设置行的数字格式
// ========================
function setNumFormats(row, columns) {
  row.eachCell({ includeEmpty: true }, (cell, colNum) => {
    const field = columns[colNum - 1];
    if (field && field !== 'workshop_name' && field !== 'remark') {
      cell.numFmt = getNumFmt(field);
    }
  });
}

// ========================
// 辅助：按日期分组记录
// ========================
function groupByDate(records) {
  const map = {};
  for (const r of records) {
    const d = r.record_date instanceof Date
      ? r.record_date.toISOString().substring(0, 10)
      : String(r.record_date).substring(0, 10);
    if (!map[d]) map[d] = [];
    map[d].push(r);
  }
  return map;
}

// ========================
// 辅助：构建数据行数组（写入 Excel 用）
// ========================
function buildDataRow(columns, rec, dateStr, wsName) {
  return columns.map(f => {
    if (f === 'record_date')   return dateStr ? new Date(dateStr) : null;
    if (f === 'workshop_name') return wsName;
    const v = rec[f];
    return v !== undefined && v !== null && v !== '' ? Number(v) || 0 : '';
  });
}

// ========================
// 辅助：构建用于计算的纯数值行
// ========================
function buildNumericRow(rec) {
  const row = {};
  for (const [k, v] of Object.entries(rec)) {
    row[k] = parseFloat(v) || 0;
  }
  return row;
}

// ========================
// 辅助：构建合计/汇总行数组
// ========================
function buildSumRow(columns, summedRow, dateStr, label) {
  return columns.map(f => {
    if (f === 'record_date')   return dateStr ? new Date(dateStr) : '';
    if (f === 'workshop_name') return label;
    if (f === 'remark')        return '';
    const v = summedRow[f];
    return typeof v === 'number' && !isNaN(v) ? v : '';
  });
}

// ========================
// 辅助：日期格式化（用于标签文字）
// ========================
function formatDateLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function extractMonth(dateStr) {
  if (!dateStr) return '';
  return String(dateStr).substring(5, 7).replace(/^0/, '');
}

function buildDateRangeLabel(firstDate, lastDate) {
  return `${formatDateLabel(firstDate)}-${formatDateLabel(lastDate)}合计`;
}

// ========================
// 主导出函数
// ========================
async function buildExport(dept, records, startDate, endDate, workshopId) {
  const labelMap   = getExportLabelMap('balance');      // field → 中文标签
  const fieldOrder = EXPORT_FIELD_ORDER[dept];          // 导出列顺序
  const workshops  = EXPORT_WORKSHOPS[dept];            // { qingxi: [...], hunan: [...] }
  const deptName   = DEPT_NAMES[dept] || dept;

  // 如果指定了车间，只过滤出该车间
  let filteredQingxi = workshops.qingxi;
  let filteredHunan  = workshops.hunan;
  if (workshopId) {
    const wsRec = records.find(r => String(r.workshop_id) === String(workshopId));
    const wsName = wsRec ? wsRec.workshop_name : null;
    if (wsName) {
      filteredQingxi = workshops.qingxi.filter(n => n === wsName);
      filteredHunan  = workshops.hunan.filter(n => n === wsName);
    }
  }
  const allWorkshops = [...filteredQingxi, ...filteredHunan];

  if (!fieldOrder) throw new Error(`不支持的部门：${dept}`);

  // 列定义（含 record_date 和 workshop_name）
  const columns = ['record_date', 'workshop_name', ...fieldOrder];
  const headers = columns.map(f => {
    if (f === 'record_date')   return '日期';
    if (f === 'workshop_name') return '车间';
    return labelMap[f] || f;
  });

  // ── 构建工作簿 ──
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`${deptName}收支表`);

  // 设置列宽：统一12，备注列46
  ws.columns = columns.map(f => ({
    width: f === 'remark' ? 46 : 12
  }));

  // ── 第1行：标题 ──
  const month = extractMonth(startDate);
  const titleRow = ws.addRow([`2026年各厂${deptName}收支表 (${month}月份)`, ...Array(columns.length - 1).fill('')]);
  titleRow.height = 37;
  ws.mergeCells(titleRow.number, 1, titleRow.number, columns.length);
  titleRow.getCell(1).value     = `2026年各厂${deptName}收支表 (${month}月份)`;
  titleRow.getCell(1).font      = { name: '宋体', size: 20, bold: true, color: { argb: 'FF' + C.black } };
  titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  // ── 第2行：空行（行高7）──
  const emptyRow = ws.addRow([]);
  emptyRow.height = 7;

  // ── 第3行：表头（黑色字体，允许换行）──
  const headerRow = ws.addRow(headers);
  headerRow.height = 30;
  headerRow.eachCell({ includeEmpty: true }, (cell, i) => {
    cell.value     = headers[i - 1];
    cell.font      = { name: '宋体', size: HEADER_SIZE, bold: true, color: { argb: 'FF' + C.black } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border    = {
      top:    { style: 'thin', color: { argb: 'FF' + C.grayBorder } },
      bottom: { style: 'thin', color: { argb: 'FF' + C.grayBorder } },
      left:   { style: 'thin', color: { argb: 'FF' + C.grayBorder } },
      right:  { style: 'thin', color: { argb: 'FF' + C.grayBorder } }
    };
  });

  // ── 按日期分组记录 ──
  const byDate      = groupByDate(records);
  const sortedDates = Object.keys(byDate).sort();

  let firstDate, lastDate;

  for (const dateStr of sortedDates) {
    const dayRecords = byDate[dateStr];
    if (!firstDate) firstDate = dateStr;
    lastDate = dateStr;

    // 记录本天第一行的行号（用于合并日期列）
    const firstDayRowNum = ws.rowCount + 1;

    // ── 写入清溪车间数据行 ──
    filteredQingxi.forEach((wsName, i) => {
      const rec     = dayRecords.find(r => r.workshop_name === wsName) || {};
      const rowData = buildDataRow(columns, rec, dateStr, wsName);
      const excelRow = ws.addRow(rowData);
      excelRow.height = 18;
      applyBorder(excelRow, C.grayBorder, 'thin');
      applyRowStyle(excelRow, C.black, true, null);
      // 每天第一行加粗上边框（天分隔线）
      if (i === 0) applyTopThickBorder(excelRow);
      setNumFormats(excelRow, columns);
    });

    // ── 清溪合计行（紧跟清溪车间行之后，普通细框）──
    const qingxiNums = filteredQingxi.map(wsName => {
      const rec = dayRecords.find(r => r.workshop_name === wsName) || {};
      return buildNumericRow(rec);
    });
    const qingxiSum = sumRows(dept, qingxiNums);
    const qRow = ws.addRow(buildSumRow(columns, qingxiSum, dateStr, '清溪合计'));
    qRow.height = 18;
    applyBorder(qRow, C.grayBorder, 'thin');
    applyRowStyle(qRow, C.blue, true, null);
    setNumFormats(qRow, columns);

    // ── 写入湖南车间数据行 ──
    filteredHunan.forEach(wsName => {
      const rec     = dayRecords.find(r => r.workshop_name === wsName) || {};
      const rowData = buildDataRow(columns, rec, dateStr, wsName);
      const excelRow = ws.addRow(rowData);
      excelRow.height = 18;
      applyBorder(excelRow, C.grayBorder, 'thin');
      applyRowStyle(excelRow, C.black, true, null);
      setNumFormats(excelRow, columns);
    });

    // ── 邵阳合计行（紧跟湖南车间行之后，普通细框）──
    const hunanNums = filteredHunan.map(wsName => {
      const rec = dayRecords.find(r => r.workshop_name === wsName) || {};
      return buildNumericRow(rec);
    });
    const hunanSum = sumRows(dept, hunanNums);
    const hRow = ws.addRow(buildSumRow(columns, hunanSum, dateStr, '邵阳合计'));
    hRow.height = 18;
    applyBorder(hRow, C.grayBorder, 'thin');
    applyRowStyle(hRow, C.blue, true, null);
    setNumFormats(hRow, columns);

    // 合并日期列（本天所有行）
    const lastDayRowNum = ws.rowCount;
    if (lastDayRowNum > firstDayRowNum) {
      ws.mergeCells(firstDayRowNum, 1, lastDayRowNum, 1);
      ws.getCell(firstDayRowNum, 1).alignment = { horizontal: 'center', vertical: 'middle' };
    }
  }

  // ── 最后一天底部粗边框 ──
  if (ws.lastRow) {
    ws.lastRow.eachCell({ includeEmpty: true }, cell => {
      const existing = cell.border || {};
      cell.border = { ...existing, bottom: { style: 'medium', color: { argb: 'FF000000' } } };
    });
  }

  // ── 空行分隔 ──
  ws.addRow([]);

  // ── 底部月累计区域 ──
  // 预先计算各车间月累计
  const workshopMonthlyTotals = {};
  allWorkshops.forEach(wsName => {
    const wsNums = sortedDates.map(d => {
      const rec = (byDate[d] || []).find(r => r.workshop_name === wsName) || {};
      return buildNumericRow(rec);
    });
    workshopMonthlyTotals[wsName] = sumRows(dept, wsNums);
  });

  const summaryStartRow = ws.rowCount + 1;
  const dateRangeLabel  = buildDateRangeLabel(firstDate, lastDate);

  // 清溪各车间月累计行（蓝色）
  filteredQingxi.forEach(wsName => {
    const rowData  = buildSumRow(columns, workshopMonthlyTotals[wsName], null, wsName);
    const excelRow = ws.addRow(rowData);
    excelRow.height = 18;
    applyBorder(excelRow, C.grayBorder, 'thin');
    applyRowStyle(excelRow, C.blue, true, null);
    setNumFormats(excelRow, columns);
  });

  // 清溪总计行（红色）
  const qingxiAllNums = filteredQingxi.flatMap(wsName => {
    return sortedDates.map(d => buildNumericRow((byDate[d] || []).find(r => r.workshop_name === wsName) || {}));
  });
  const qingxiMonthTotal = sumRows(dept, qingxiAllNums);
  const qTotalRow = ws.addRow(buildSumRow(columns, qingxiMonthTotal, null, '清溪总计'));
  qTotalRow.height = 18;
  applyBorder(qTotalRow, C.grayBorder, 'thin');
  applyRowStyle(qTotalRow, C.red, true, null);
  setNumFormats(qTotalRow, columns);

  // 邵阳各车间月累计行（蓝色）
  filteredHunan.forEach(wsName => {
    const rowData  = buildSumRow(columns, workshopMonthlyTotals[wsName], null, wsName);
    const excelRow = ws.addRow(rowData);
    excelRow.height = 18;
    applyBorder(excelRow, C.grayBorder, 'thin');
    applyRowStyle(excelRow, C.blue, true, null);
    setNumFormats(excelRow, columns);
  });

  // 邵阳总计行（红色）
  const hunanAllNums = filteredHunan.flatMap(wsName => {
    return sortedDates.map(d => buildNumericRow((byDate[d] || []).find(r => r.workshop_name === wsName) || {}));
  });
  const hunanMonthTotal = sumRows(dept, hunanAllNums);
  const hTotalRow = ws.addRow(buildSumRow(columns, hunanMonthTotal, null, '邵阳总计'));
  hTotalRow.height = 18;
  applyBorder(hTotalRow, C.grayBorder, 'thin');
  applyRowStyle(hTotalRow, C.red, true, null);
  setNumFormats(hTotalRow, columns);

  // 合并底部区域 A 列（"日期范围合计" 标签），在所有行写完后执行
  const summaryEndRow = ws.rowCount;
  if (summaryEndRow >= summaryStartRow) {
    if (summaryEndRow > summaryStartRow) {
      ws.mergeCells(summaryStartRow, 1, summaryEndRow, 1);
    }
    ws.getCell(summaryStartRow, 1).value     = dateRangeLabel;
    ws.getCell(summaryStartRow, 1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws.getCell(summaryStartRow, 1).font      = { name: '宋体', size: FONT_SIZE, bold: true, color: { argb: 'FF' + C.blue } };
  }

  // 月累计区第一行加粗上边框（必须在 mergeCells 之后设置，否则合并操作会重置边框）
  const thin = { style: 'thin', color: { argb: 'FF' + C.grayBorder } };
  const thick = { style: 'medium', color: { argb: 'FF000000' } };
  ws.getRow(summaryStartRow).eachCell({ includeEmpty: true }, cell => {
    cell.border = { top: thick, bottom: thin, left: thin, right: thin };
  });

  // ── 总合计行（红色，A+B 合并） ──
  const allNums   = allWorkshops.flatMap(wsName => {
    return sortedDates.map(d => buildNumericRow((byDate[d] || []).find(r => r.workshop_name === wsName) || {}));
  });
  const grandTotal = sumRows(dept, allNums);
  const grandRow   = ws.addRow(buildSumRow(columns, grandTotal, null, '总合计'));
  grandRow.height  = 18;
  ws.mergeCells(grandRow.number, 1, grandRow.number, 2);
  grandRow.getCell(1).value     = '总合计';
  grandRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  applyBorder(grandRow, C.grayBorder, 'thin');
  applyRowStyle(grandRow, C.red, true, null);
  setNumFormats(grandRow, columns);
  // 总合计行加粗下边框（整个表格的底部边界，用明确对象避免合并格展开问题）
  const thinB  = { style: 'thin',   color: { argb: 'FF' + C.grayBorder } };
  const thickB = { style: 'medium', color: { argb: 'FF000000' } };
  grandRow.eachCell({ includeEmpty: true }, cell => {
    cell.border = { top: thinB, bottom: thickB, left: thinB, right: thinB };
  });

  // ── 导出 Buffer ──
  return wb.xlsx.writeBuffer();
}

module.exports = { buildExport };
