# 费用配置与汇率转换 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现全局人民币→港币转换、固定费用月配置、费用汇算规则、汇率历史记录四个功能模块

**Architecture:** 复用现有 `formula_constants` 表存储固定费用配置，在 `routes/records.js` POST 流程中增加汇率转换层和固定费用代入逻辑，通过 `currency: true` 和 `fixedExpense: true` 标记区分字段类型。前端在部门明细表筛选栏新增固定费用配置弹窗。

**Tech Stack:** Express 5, PostgreSQL, Vue 3 + Element Plus (CDN), SheetJS

**Spec:** `docs/superpowers/specs/2026-03-24-expense-config-design.md`

---

## File Map

| 文件 | 操作 | 职责 |
|------|------|------|
| `db/init.sql` | 修改 | 新增 exchange_rate_history 表，三个部门表 ALTER 加列 |
| `modules/balance/config.js` | 修改 | 新增 `currency`/`fixedExpense` 标记，新增字段，修改字段属性 |
| `modules/balance/calc.js` | 修改 | 新增汇率转换逻辑、固定费用代入逻辑、新计算字段 |
| `modules/index.js` | 修改 | 导出新的辅助函数（getCurrencyFields, getFixedExpenseFields） |
| `routes/records.js` | 修改 | POST 流程增加汇率转换和固定费用代入 |
| `routes/settings.js` | 修改 | 常量接口权限放宽、汇率历史记录触发 |
| `routes/backup.js` | 修改 | 新增汇率历史查询接口 |
| `public/js/api.js` | 修改 | 新增固定费用和汇率历史 API |
| `public/js/app.js` | 修改 | DEPT_CONFIG 同步、固定费用配置弹窗、字段可编辑控制 |
| `routes/import-export.js` | 修改 | COLUMN_MAP 新增字段映射 |

---

## Task 1: 数据库变更 — 新增表和列

**Files:**
- Modify: `db/init.sql`

- [ ] **Step 1: 新增 exchange_rate_history 表**

在 `formula_constants` 表定义之后添加：

```sql
-- 汇率变更历史（每次修改 exchange_rate 时自动记录）
CREATE TABLE IF NOT EXISTS exchange_rate_history (
  id SERIAL PRIMARY KEY,
  effective_month VARCHAR(7) NOT NULL,
  old_value NUMERIC(10,4),
  new_value NUMERIC(10,4) NOT NULL,
  changed_by VARCHAR(100) NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);
```

- [ ] **Step 2: 啤机部表新增列**

在 `beer_records` 表定义中，在 `assembly_gate_parts_fee` 后面添加：

```sql
outsource_nozzle NUMERIC(12,2) DEFAULT 0,   -- 外发水口
```

在 `output_tax_incl` 后面添加：

```sql
per_capita_output NUMERIC(12,2) DEFAULT 0,  -- 人均产值
```

- [ ] **Step 3: 印喷部表新增列**

在 `print_records` 表定义中，在 `subsidy` 后面添加：

```sql
actual_material NUMERIC(12,2) DEFAULT 0,    -- 实际用料
```

- [ ] **Step 4: 执行 ALTER TABLE 并告知用户**

生成 ALTER TABLE 语句供用户执行：

```sql
-- 啤机部
ALTER TABLE beer_records ADD COLUMN IF NOT EXISTS per_capita_output NUMERIC(12,2) DEFAULT 0;
ALTER TABLE beer_records ADD COLUMN IF NOT EXISTS outsource_nozzle NUMERIC(12,2) DEFAULT 0;

-- 印喷部
ALTER TABLE print_records ADD COLUMN IF NOT EXISTS actual_material NUMERIC(12,2) DEFAULT 0;

-- 汇率历史表
CREATE TABLE IF NOT EXISTS exchange_rate_history (
  id SERIAL PRIMARY KEY,
  effective_month VARCHAR(7) NOT NULL,
  old_value NUMERIC(10,4),
  new_value NUMERIC(10,4) NOT NULL,
  changed_by VARCHAR(100) NOT NULL,
  changed_at TIMESTAMPTZ DEFAULT NOW()
);
```

- [ ] **Step 5: Commit**

```bash
git add db/init.sql
git commit -m "db: 新增 exchange_rate_history 表 + beer/print 表新增列"
```

---

## Task 2: 后端字段配置 — config.js 标记与新字段

**Files:**
- Modify: `modules/balance/config.js`
- Modify: `modules/index.js`

- [ ] **Step 1: 给 sharedFields 中的金额字段添加 `currency: true`**

`modules/balance/config.js` 行 17-36，为以下字段添加 `currency: true`：
- `daily_output`（总产值）
- `worker_wage`（员工工资）
- `supervisor_wage`（管工工资）— 同时添加 `fixedExpense: true`
- `rent`（房租）— 同时添加 `fixedExpense: true`
- `utility_fee`（水电费）— 同时添加 `fixedExpense: true`
- `tool_investment`, `equipment`, `renovation`, `misc_fee`, `shipping_fee`, `social_insurance`, `tax` — 都加 `currency: true`

示例修改：
```js
{ field: 'daily_output', label: '总产值/天', type: 'number', input: true, expense: false, currency: true,
  aliases: ['产值'] },
{ field: 'worker_wage', label: '员工工资/天', type: 'number', input: true, expense: true, currency: true,
  aliases: ['员工工资'] },
{ field: 'supervisor_wage', label: '管工工资/天', type: 'number', input: true, expense: true, currency: true, fixedExpense: true,
  aliases: ['生产管工工资'] },
{ field: 'rent', label: '房租', type: 'number', input: true, expense: true, currency: true, fixedExpense: true },
{ field: 'utility_fee', label: '水电费', type: 'number', input: true, expense: true, currency: true, fixedExpense: true },
```

- [ ] **Step 2: 啤机部 uniqueFields 修改**

1. `running_machines`（开机台数）：从 `type: 'integer', input: true` 改为 `type: 'number', input: false, calc: true`（因为 `run_hours / 24` 可能产生小数）
2. `assembly_gate_parts_fee`：`shortLabel` 改为 `'装配水口'`
3. 在 `output_tax_incl`（不含税产值）后面新增人均产值：
```js
{ field: 'per_capita_output', label: '人均产值', type: 'number', calc: true },
```
4. 在 `assembly_gate_parts_fee`（装配水口）后面新增外发水口：
```js
{ field: 'outsource_nozzle', label: '外发水口', shortLabel: '外发水口', type: 'number', input: true, expense: true, currency: true,
  aliases: ['外发批水口费用'] },
```
5. 所有金额类 input 字段添加 `currency: true`：`misc_worker_wage`, `machine_repair`, `mold_repair`, `materials`, `material_supplement`, `gate_processing_fee`, `assembly_gate_parts_fee`, `recoverable_gate_fee`
6. `total_machines` 添加 `fixedExpense: true`（半永久代入）

- [ ] **Step 3: 印喷部 uniqueFields 修改**

1. `total_hours`（总工时）：从 `input: true` 改为 `input: false, calc: true`
2. 在 `subsidy`（补贴）后面新增实际用料：
```js
{ field: 'actual_material', label: '实际用料', shortLabel: '实际用料', type: 'number', input: true, expense: true, currency: true,
  aliases: ['实际用原料金额'] },
```
3. 所有金额类 input 字段添加 `currency: true`：`repair_fee`, `materials`, `oil_water_amount`, `subsidy`, `no_output_wage`, `assembly_wage_paid`, `office_wage`, `recoverable_wage`, `dept_recoverable_wage`, `recoverable_indonesia_wage`, `recoverable_tool_fee`, `non_recoverable_tool_fee`, `recoverable_paint`, `auto_mold_fee`, `hunan_mold_fee`, `indonesia_mold_fee`

- [ ] **Step 4: 装配部 uniqueFields 修改**

1. 所有金额类 input 字段添加 `currency: true`：`planned_wage_tax`, `actual_wage`, `hunan_social_insurance`, `hunan_tax`, `workshop_repair`, `electrical_repair`, `workshop_materials`, `stretch_film`, `tape`, `recoverable_electricity`, `workshop_tool_investment`, `fixture_tool_investment`, `housing_subsidy`, `supplement`, `borrowed_worker_wage`

- [ ] **Step 5: modules/index.js 新增辅助函数**

在 `modules/index.js` 中导出新函数：

```js
// 获取需要汇率转换的字段列表
function getCurrencyFields(dept) {
  const shared = config.sharedFields.filter(f => f.currency).map(f => f.field);
  const unique = config.departments[dept]?.uniqueFields.filter(f => f.currency).map(f => f.field) || [];
  return [...shared, ...unique];
}

// 获取固定费用字段列表
function getFixedExpenseFields(dept) {
  const shared = config.sharedFields.filter(f => f.fixedExpense).map(f => f.field);
  const unique = config.departments[dept]?.uniqueFields.filter(f => f.fixedExpense).map(f => f.field) || [];
  return [...shared, ...unique];
}
```

- [ ] **Step 6: Commit**

```bash
git add modules/balance/config.js modules/index.js
git commit -m "feat: config.js 添加 currency/fixedExpense 标记 + 新增字段"
```

---

## Task 3: 后端计算引擎 — 汇率转换 + 固定费用代入

**Files:**
- Modify: `modules/balance/calc.js`
- Modify: `routes/records.js`

- [ ] **Step 1: calc.js 新增固定费用加载函数**

在 `loadConstants` 函数后面新增：

```js
// 加载某部门当月生效的固定费用配置
async function loadFixedExpenses(dept, recordDate) {
  try {
    const dateStr = recordDate instanceof Date
      ? recordDate.toISOString().substring(0, 7)
      : String(recordDate).substring(0, 7);
    if (!dateStr || dateStr.length < 7) return {};

    const moduleName = `balance_fixed_${dept}`;
    const rows = await getAll(
      `SELECT DISTINCT ON (name) name, value FROM formula_constants
       WHERE module = ? AND effective_month <= ? ORDER BY name, effective_month DESC`,
      [moduleName, dateStr]
    );
    const map = {};
    for (const r of rows) { map[r.name] = parseFloat(r.value); }
    return map;
  } catch (err) {
    console.warn('[calc] 加载固定费用失败:', err.message);
    return {};
  }
}
```

- [ ] **Step 2: calc.js 新增汇率转换函数**

```js
const { getCurrencyFields, getFixedExpenseFields } = require('../index');

// 对所有金额字段执行人民币→港币转换
// skipFields: 已被其他步骤转换过的字段（如固定费用、planned_wage_tax），跳过避免重复转换
function applyExchangeRate(dept, record, exchangeRate, skipFields = []) {
  if (!exchangeRate || exchangeRate === 0) return record;
  const result = { ...record };
  const currencyFields = getCurrencyFields(dept);
  const skipSet = new Set(skipFields);
  for (const field of currencyFields) {
    if (skipSet.has(field)) continue;  // 跳过已处理的字段
    if (result[field] !== undefined && result[field] !== null && result[field] !== '') {
      result[field] = parseFloat(result[field]) / exchangeRate;
    }
  }
  return result;
}
```

- [ ] **Step 3: calc.js 新增固定费用代入函数**

```js
// 计算并代入固定费用到记录中
function applyFixedExpenses(dept, record, fixedConfig, exchangeRate) {
  const result = { ...record };
  const workDays = fixedConfig.work_days || 0;

  // 总台数（啤机，半永久，直接代入）
  if (dept === 'beer' && fixedConfig.total_machines) {
    result.total_machines = fixedConfig.total_machines;
  }

  // 房租 = 总房租 / 上班天数 / 汇率
  if (fixedConfig.rent && workDays > 0 && exchangeRate > 0) {
    result.rent = fixedConfig.rent / workDays / exchangeRate;
  }

  // 管工工资 = (底薪 + 奖金) / 上班天数 / 汇率
  const baseSalary = fixedConfig.gw_base_salary || 0;
  const bonus = fixedConfig.gw_bonus || 0;
  if ((baseSalary + bonus) > 0 && workDays > 0 && exchangeRate > 0) {
    result.supervisor_wage = (baseSalary + bonus) / workDays / exchangeRate;
  }

  // 水电费
  if (exchangeRate > 0) {
    if (dept === 'beer') {
      // 啤机：单价 × 开机台数 / 汇率（开机台数需先计算好）
      const utilityUnit = fixedConfig.utility_unit || 0;
      const runningMachines = parseFloat(result.running_machines) || 0;
      if (utilityUnit > 0 && runningMachines > 0) {
        result.utility_fee = utilityUnit * runningMachines / exchangeRate;
      }
    } else {
      // 印喷/装配：总水电费 / 上班天数 / 汇率
      const utilityTotal = fixedConfig.utility_total || 0;
      if (utilityTotal > 0 && workDays > 0) {
        result.utility_fee = utilityTotal / workDays / exchangeRate;
      }
    }
  }

  return result;
}
```

- [ ] **Step 4: calc.js 新增啤机/印喷计算字段**

在 `calculateRecordHardcoded` 函数的 beer 分支中：
```js
// 开机台数 = 开机时间 / 24（改为计算字段）
const runHours = parseFloat(result.run_hours) || 0;
result.running_machines = runHours > 0 ? runHours / 24 : 0;

// 人均产值（新增，展示字段）
const workerCount = parseFloat(result.worker_count) || 0;
result.per_capita_output = workerCount > 0 ? dailyOutput / workerCount : 0;
```

在 print 分支中：
```js
// 总工时 = 员工人数 × 员工工时（改为计算字段）
result.total_hours = (parseFloat(result.worker_count) || 0) * (parseFloat(result.work_hours) || 0);
```

- [ ] **Step 5: calc.js 装配部计划总工资特殊公式**

在 assembly 分支中，添加社保系数计算（在结余计算之前）：
```js
// 计划总工资含*1.13：输入人民币 × 1.13 / 汇率（1.13 是固定社保系数）
// 注意：这个字段在 applyExchangeRate 之前已通过普通 currency 转换处理了 /汇率
// 但还需要额外 ×1.13，所以在转换后追加
```

注意：`planned_wage_tax` 的特殊处理需要在 records.js 中完成（见 Step 6）。

- [ ] **Step 6: records.js POST 流程改造**

修改 `POST /:dept/records` 处理函数（行 41-68），在 `calculateRecord` 调用前增加转换层：

```js
router.post('/:dept/records', authenticate, modulePermission('balance'), validateDept, checkDataLock, asyncHandler(async (req, res) => {
  const { dept } = req.params;
  const config = DEPT_CONFIG[dept];
  const inputFields = getAllInputFields(dept);
  const records = Array.isArray(req.body) ? req.body : [req.body];
  const inserted = [];

  // 查询当月汇率（取第一条记录的日期）
  const firstDate = records[0]?.record_date;
  const { loadConstants, loadFixedExpenses, applyExchangeRate, applyFixedExpenses } = require('../modules/balance/calc');
  const constants = await loadConstants(firstDate);
  const exchangeRate = constants.exchange_rate;
  if (!exchangeRate) {
    return res.status(400).json({ success: false, message: '请先在系统设置中配置当月汇率（exchange_rate）' });
  }

  // 加载固定费用配置
  const fixedConfig = await loadFixedExpenses(dept, firstDate);

  for (const raw of records) {
    // 第一步：计算依赖字段（开机台数、总工时）— 在转换前用原始值计算
    let processed = { ...raw };

    // 啤机：开机台数 = 开机时间 / 24
    if (dept === 'beer') {
      const runHours = parseFloat(processed.run_hours) || 0;
      processed.running_machines = runHours > 0 ? runHours / 24 : 0;
    }
    // 印喷：总工时 = 员工人数 × 员工工时
    if (dept === 'print') {
      processed.total_hours = (parseFloat(processed.worker_count) || 0) * (parseFloat(processed.work_hours) || 0);
    }

    // 第二步：代入固定费用（使用开机台数等已计算的值）
    processed = applyFixedExpenses(dept, processed, fixedConfig, exchangeRate);

    // 第三步：装配部 planned_wage_tax 特殊处理（×1.13 后再转港币）
    if (dept === 'assembly' && processed.planned_wage_tax) {
      processed.planned_wage_tax = parseFloat(processed.planned_wage_tax) * 1.13 / exchangeRate;
    }

    // 第四步：汇率转换
    // 必须跳过已在前面步骤中转换过的字段，避免重复除以汇率
    const skipFields = [
      ...getFixedExpenseFields(dept),   // 固定费用字段（rent, supervisor_wage, utility_fee 等）已在 step2 转换
      ...(dept === 'assembly' ? ['planned_wage_tax'] : []),  // 装配部已在 step3 特殊处理
    ];
    processed = applyExchangeRate(dept, processed, exchangeRate, skipFields);

    // 第五步：计算结余等衍生字段
    const calculated = await calculateRecord(dept, processed);

    // 后续与原逻辑相同...
    const allFields = [...inputFields, ...config.uniqueCalcFields, 'balance', 'balance_ratio',
                       'record_date', 'workshop_id', 'created_by', 'updated_by'];
    calculated.created_by = req.user.id;
    calculated.updated_by = req.user.id;

    const validFields = allFields.filter(f => calculated[f] !== undefined);
    const values = validFields.map(f => calculated[f]);
    const placeholders = validFields.map(() => '?').join(', ');

    const result = await query(
      `INSERT INTO ${config.tableName} (${validFields.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    inserted.push(result.rows[0]);
    await logAction(req.user.id, req.user.name, 'create', config.tableName, result.rows[0].id, null, result.rows[0]);
  }

  res.json({ success: true, data: inserted.length === 1 ? inserted[0] : inserted });
}));
```

关键注意：
- `applyExchangeRate` 通过 `skipFields` 参数跳过已转换的字段（固定费用字段 + planned_wage_tax），避免重复除以汇率
- PUT 路由不做汇率转换（编辑时直接修改港币值）
- 需要从 modules/index.js 导入 `getFixedExpenseFields`：`const { DEPT_CONFIG, getAllInputFields, getFixedExpenseFields } = require('../modules');`

- [ ] **Step 7: calc.js 导出新函数**

更新 `module.exports`：
```js
module.exports = { calculateRecord, clearCache, loadConstants, loadFixedExpenses, applyExchangeRate, applyFixedExpenses };
```

- [ ] **Step 8: Commit**

```bash
git add modules/balance/calc.js routes/records.js
git commit -m "feat: POST 流程增加汇率转换 + 固定费用代入逻辑"
```

---

## Task 4: 后端 — 常量接口权限调整 + 汇率历史

**Files:**
- Modify: `routes/settings.js`
- Modify: `routes/backup.js`

- [ ] **Step 1: settings.js 常量接口权限放宽**

找到 `POST /constants`（约行 79），将 `requireStats` 改为条件判断：

```js
// 新增/更新常量值（某月）
// 固定费用配置（balance_fixed_*）允许录入员操作，其他常量仍需统计组权限
router.post('/constants', authenticate, asyncHandler(async (req, res) => {
  const { module: mod, name, label, value, effective_month } = req.body;
  if (!name || !label || value === undefined || !effective_month) {
    return res.status(400).json({ success: false, message: '必填项缺失' });
  }

  // 非固定费用模块需要统计组权限
  const isFixedExpense = mod && mod.startsWith('balance_fixed_');
  if (!isFixedExpense && req.user.role !== 'stats') {
    return res.status(403).json({ success: false, message: '仅统计组可操作' });
  }

  // 汇率历史记录触发
  if (name === 'exchange_rate') {
    const existing = await getOne(
      'SELECT value FROM formula_constants WHERE module = ? AND name = ? AND effective_month = ?',
      [mod || 'balance', name, effective_month]
    );
    await query(
      `INSERT INTO exchange_rate_history (effective_month, old_value, new_value, changed_by)
       VALUES (?, ?, ?, ?)`,
      [effective_month, existing ? existing.value : null, value, req.user.name || req.user.username]
    );
  }

  const result = await query(
    `INSERT INTO formula_constants (module, name, label, value, effective_month)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (module, name, effective_month) DO UPDATE SET value = ?, label = ?, updated_at = NOW()
     RETURNING *`,
    [mod || 'balance', name, label, value, effective_month, value, label]
  );
  res.json({ success: true, data: result.rows[0] });
}));
```

同样修改 `DELETE /constants/:id`，允许固定费用模块的录入员删除。

- [ ] **Step 2: backup.js 新增汇率历史查询接口**

```js
// GET /api/backup/exchange-rate-history
router.get('/exchange-rate-history', authenticate, asyncHandler(async (req, res) => {
  // 按月份分组查询
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
```

- [ ] **Step 3: Commit**

```bash
git add routes/settings.js routes/backup.js
git commit -m "feat: 常量接口权限放宽 + 汇率历史记录触发和查询"
```

---

## Task 5: 前端 — API 封装 + DEPT_CONFIG 同步

**Files:**
- Modify: `public/js/api.js`
- Modify: `public/js/app.js`（DEPT_CONFIG 部分）

- [ ] **Step 1: api.js 新增 API 方法**

在 `deleteConstant` 后面添加：

```js
// === 固定费用配置 API（复用常量接口，module 区分）===
getFixedExpenses(dept, params) {
  return this.get('/settings/constants', { module: `balance_fixed_${dept}`, ...params });
},
saveFixedExpense(dept, data) {
  return this.post('/settings/constants', { module: `balance_fixed_${dept}`, ...data });
},

// === 汇率历史 API ===
getExchangeRateHistory() { return this.get('/backup/exchange-rate-history'); },
```

- [ ] **Step 2: app.js DEPT_CONFIG 同步字段变更**

在 `public/js/app.js` 的前端 `DEPT_CONFIG` 中同步以下变更：

**啤机部：**
1. `running_machines`：改为 `calculated: true`（删除 `editable: true`）
2. `assembly_gate_parts_fee`：`shortLabel` 改为 `'装配水口'`
3. 在 `output_tax_incl` 后新增：`{ field: 'per_capita_output', label: '人均产值', calculated: true }`
4. 在 `assembly_gate_parts_fee` 后新增：`{ field: 'outsource_nozzle', label: '外发水口', shortLabel: '外发水口' }`

**印喷部：**
1. `total_hours`：改为 `calculated: true`（删除 `editable: true`）
2. 在 `subsidy` 后新增：`{ field: 'actual_material', label: '实际用料', shortLabel: '实际用料' }`

**固定费用字段标记：** 在前端 DEPT_CONFIG 中为 `total_machines`(啤机)、`rent`、`supervisor_wage`、`utility_fee` 添加 `fixedExpense: true` 属性，用于前端判断可编辑性。

- [ ] **Step 3: Commit**

```bash
git add public/js/api.js public/js/app.js
git commit -m "feat: 前端 API 封装 + DEPT_CONFIG 同步新字段和标记"
```

---

## Task 6: 前端 — 固定费用配置弹窗

**Files:**
- Modify: `public/js/app.js`（RecordsTable 组件区域）

- [ ] **Step 1: 筛选栏新增按钮**

在工具栏模板（约行 310，批量删除按钮之前）添加：

```html
<button class="fixed-expense-btn" @click="showFixedExpenseDialog" v-if="currentDept">
  ⚙ 固定费用配置
</button>
```

- [ ] **Step 2: 新增固定费用弹窗模板**

参考 `public/preview-fixed-expense.html` 中已确认的 UI，在 app.js 的 template 中添加弹窗组件。包含：
- 快捷标签区（根据当前部门动态显示不同标签）
- 通用输入行（项目名、英文标识、月份、值、保存按钮）
- 管工工资专用行（底薪、奖金、月份、上班天数、保存按钮）
- 已配置列表（el-table）
- 说明区

快捷标签根据部门动态生成：
```js
// 啤机部特有：总台数、水电单价
// 印喷/装配：总水电费
// 三部门共有：房租、管工底薪、管工奖金、上班天数
```

- [ ] **Step 3: 新增 data 和 methods**

```js
// data 新增
fixedExpenseVisible: false,
fixedExpenseList: [],
fixedExpenseForm: { name: '', label: '', effective_month: '', value: '' },
gwForm: { baseSalary: '', bonus: '', month: '', workDays: '' },
fixedExpenseLoading: false,
fixedExpenseSaving: false,
activeFixedTag: '',

// methods 新增
async showFixedExpenseDialog() {
  this.fixedExpenseVisible = true;
  this.fixedExpenseForm = { name: '', label: '', effective_month: '', value: '' };
  this.gwForm = { baseSalary: '', bonus: '', month: '', workDays: '' };
  await this.loadFixedExpenses();
},

async loadFixedExpenses() {
  this.fixedExpenseLoading = true;
  try {
    const res = await API.getFixedExpenses(this.currentDept);
    this.fixedExpenseList = res.data || [];
  } catch (err) {
    ElementPlus.ElMessage.error('加载固定费用配置失败');
  } finally {
    this.fixedExpenseLoading = false;
  }
},

async handleSaveFixedExpense() {
  const f = this.fixedExpenseForm;
  if (!f.name || !f.label || f.value === '') {
    ElementPlus.ElMessage.warning('请填写完整信息');
    return;
  }
  this.fixedExpenseSaving = true;
  try {
    await API.saveFixedExpense(this.currentDept, {
      name: f.name,
      label: f.label,
      value: f.value,
      effective_month: f.effective_month || '0000-00'  // 半永久用哨兵值
    });
    ElementPlus.ElMessage.success('保存成功');
    f.value = '';
    f.effective_month = '';
    await this.loadFixedExpenses();
  } catch (err) {
    ElementPlus.ElMessage.error('保存失败: ' + (err.message || ''));
  } finally {
    this.fixedExpenseSaving = false;
  }
},

async handleSaveGwForm() {
  const g = this.gwForm;
  if (!g.month || !g.workDays) {
    ElementPlus.ElMessage.warning('请填写月份和上班天数');
    return;
  }
  this.fixedExpenseSaving = true;
  try {
    // 保存底薪（半永久，仅当有值时更新）
    if (g.baseSalary) {
      await API.saveFixedExpense(this.currentDept, {
        name: 'gw_base_salary', label: '管工底薪', value: g.baseSalary, effective_month: '0000-00'
      });
    }
    // 保存奖金（每月）
    if (g.bonus) {
      await API.saveFixedExpense(this.currentDept, {
        name: 'gw_bonus', label: '管工奖金', value: g.bonus, effective_month: g.month
      });
    }
    // 保存上班天数（每月）
    await API.saveFixedExpense(this.currentDept, {
      name: 'work_days', label: '上班天数', value: g.workDays, effective_month: g.month
    });
    ElementPlus.ElMessage.success('管工工资配置保存成功');
    await this.loadFixedExpenses();
  } catch (err) {
    ElementPlus.ElMessage.error('保存失败: ' + (err.message || ''));
  } finally {
    this.fixedExpenseSaving = false;
  }
},

fillFixedTag(name, label) {
  this.activeFixedTag = name;
  this.fixedExpenseForm.name = name;
  this.fixedExpenseForm.label = label;
},
```

- [ ] **Step 4: 固定费用字段可编辑性控制**

修改单元格编辑逻辑，在 `saveCell` 或单元格渲染处添加判断：

```js
// 判断字段是否为固定费用字段且当前用户为录入员
isCellReadonly(field) {
  const col = this.getColumnConfig(field);
  if (col?.fixedExpense && this.currentUser?.role !== 'stats') {
    return true;  // 录入员不可编辑固定费用字段
  }
  return false;
},
```

在模板中对固定费用字段使用紫色底色（`--summary-bg: #F3E5F5`）。

- [ ] **Step 5: CSS 样式**

在 `public/css/theme.css` 中添加：

```css
/* 固定费用配置按钮 */
.fixed-expense-btn {
  background: #fff8e1;
  border: 1px solid #ffe082;
  color: #f57f17;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s;
}
.fixed-expense-btn:hover {
  background: #fff3c4;
  border-color: #ffd54f;
}

/* 固定费用单元格（自动代入，录入员只读） */
.cell-fixed-expense {
  background: var(--summary-bg) !important;
  color: var(--primary);
  font-weight: 500;
}
```

- [ ] **Step 6: Commit**

```bash
git add public/js/app.js public/css/theme.css
git commit -m "feat: 固定费用配置弹窗 + 字段可编辑控制"
```

---

## Task 7: 前端 — 汇率历史查询界面

**Files:**
- Modify: `public/js/app.js`（BackupPage 组件区域）

- [ ] **Step 1: 在数据备份页面添加汇率历史区域**

在备份页面模板中添加：

```html
<el-card shadow="hover" style="margin-top:20px;">
  <template #header>
    <span style="font-weight:600;">汇率变更记录</span>
  </template>
  <el-table :data="rateHistory" border stripe size="small" v-loading="rateHistoryLoading">
    <el-table-column prop="month" label="月份" width="100" align="center" />
    <el-table-column prop="currentValue" label="当前汇率" width="100" align="center">
      <template #default="{ row }">
        <span style="font-weight:600;color:#7F41C0;">{{ row.currentValue }}</span>
      </template>
    </el-table-column>
    <el-table-column label="历史修改记录" min-width="280">
      <template #default="{ row }">
        <div v-for="(c, i) in row.changes" :key="i" style="font-size:12px;color:#666;line-height:1.8;">
          {{ c.date }} &nbsp; {{ c.from }} → {{ c.to }}
          <span style="color:#999;margin-left:4px;">（{{ c.operator }}）</span>
        </div>
        <span v-if="!row.changes || !row.changes.length" style="color:#ccc;">无修改</span>
      </template>
    </el-table-column>
  </el-table>
</el-card>
```

- [ ] **Step 2: 新增 data 和 methods**

```js
// data
rateHistory: [],
rateHistoryLoading: false,

// methods（在备份页面的 mounted 或打开时调用）
async loadRateHistory() {
  this.rateHistoryLoading = true;
  try {
    const res = await API.getExchangeRateHistory();
    this.rateHistory = res.data || [];
  } catch (err) {
    console.error('加载汇率历史失败:', err);
  } finally {
    this.rateHistoryLoading = false;
  }
},
```

- [ ] **Step 3: Commit**

```bash
git add public/js/app.js
git commit -m "feat: 数据备份模块新增汇率历史查询界面"
```

---

## Task 8: Excel 导入导出 — 新增字段映射

**Files:**
- Modify: `routes/import-export.js`

- [ ] **Step 1: 啤机部 COLUMN_MAP 新增映射**

在啤机部的 COLUMN_MAP 中添加：
```js
'人均产值': 'per_capita_output',
'外发水口': 'outsource_nozzle',
'外发批水口费用': 'outsource_nozzle',
```

同时将 `装配批水口配件费` 的别名确认包含 `装配水口`：
```js
'装配水口': 'assembly_gate_parts_fee',
```

- [ ] **Step 2: 印喷部 COLUMN_MAP 新增映射**

```js
'实际用料': 'actual_material',
'实际用原料金额': 'actual_material',
```

- [ ] **Step 3: config.js skipColumns 更新**

在 `modules/balance/config.js` 的 `skipColumns` 数组中添加新的计算字段名称：
```js
skipColumns: ['结余金额', '结余%', '人均产值'],
```

- [ ] **Step 4: Excel 导入的汇率转换**

Excel 导入（`routes/import-export.js` 的 POST 路由）最终也调用 `routes/records.js` 的 POST 接口保存数据。因此导入的数据也会经过 Task 3 的转换流程，自动完成人民币→港币转换。需确认导入流程是走 records.js POST 还是直接 INSERT：
- 如果走 records.js POST：无需额外处理
- 如果直接 INSERT：需要在导入逻辑中加入同样的汇率转换步骤

- [ ] **Step 5: Commit**

```bash
git add routes/import-export.js
git commit -m "feat: Excel 导入导出新增字段映射"
```

---

## Task 9: 重算历史功能扩展

**Files:**
- Modify: `routes/settings.js`（recalculate 接口）

- [ ] **Step 1: 扩展 recalculate 接口**

在现有 recalculate 接口中，增加固定费用代入和汇率转换的重算逻辑：

```js
// 在重算循环中，对每条记录：
// 1. 加载该记录日期对应月份的汇率和固定费用配置
// 2. 用原始输入值（需要反算出人民币值）重新执行转换
// 3. 代入固定费用
// 4. 重新计算衍生字段
```

注意：由于数据库中存的是港币值，重算时如果需要重新从人民币转换，需要用旧汇率反算 → 再用新汇率正算。这个逻辑较复杂，建议先支持"固定费用代入重算"（不涉及汇率变更），汇率变更重算作为后续优化。

- [ ] **Step 2: Commit**

```bash
git add routes/settings.js
git commit -m "feat: 重算历史支持固定费用代入"
```

---

## Task 10: 验证与清理

- [ ] **Step 1: 启动服务验证**

```bash
cd "D:\03-AI related\02-Business data statistics"
npm start
```

- [ ] **Step 2: 功能验证清单**

1. 打开系统设置 → 常量配置 → 确认汇率（exchange_rate）已配置
2. 打开啤机部明细表 → 点击「⚙ 固定费用配置」→ 配置总台数、房租、管工底薪+奖金、水电单价、上班天数
3. 新增一条啤机部记录 → 输入人民币产值和费用 → 保存 → 验证：
   - 总台数自动代入
   - 房租、管工工资、水电费自动计算并显示港币值
   - 其他金额字段显示港币值（输入值/汇率）
   - 开机台数自动计算（开机时间/24）
   - 人均产值自动计算
   - 结余正确
4. 编辑该记录 → 确认显示港币值，可直接修改
5. 录入员登录 → 确认固定费用字段紫色底色不可编辑
6. 切换印喷/装配部 → 验证固定费用配置和汇率转换
7. 数据备份模块 → 确认汇率历史显示

- [ ] **Step 3: 删除预览文件**

```bash
git rm public/preview-fixed-expense.html
git commit -m "chore: 删除费用配置 UI 预览文件"
```
