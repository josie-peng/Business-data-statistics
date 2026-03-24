# 小部门结余模块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有三工结余模块中扩展4个小部门（胶袋/配色/吸塑/电子），复用明细表、路由、导入导出，新增小部门汇总。

**Architecture:** 扩展 `modules/balance/config.js` 添加4个部门定义，复用 `routes/records.js` 和 `routes/import-export.js`。前端复用 `DeptRecordsPage` 组件，新增侧边栏导航和小部门汇总视图。

**Tech Stack:** Express + PostgreSQL + Vue 3 + Element Plus（CDN）

**Spec:** `docs/superpowers/specs/2026-03-24-small-dept-module-design.md`

---

## File Map

| 文件 | 操作 | 职责 |
|------|------|------|
| `db/init.sql` | 修改 | 新增4张数据表 + 索引 + 初始车间数据 |
| `modules/balance/config.js` | 修改 | 新增4个部门的字段定义 |
| `modules/balance/calc.js` | 修改 | 新增4个部门的 hardcoded 计算逻辑 |
| `modules/index.js` | 修改 | 支持 `income` 字段属性（边角料） |
| `routes/summary.js` | 修改 | 新增小部门汇总 API |
| `public/js/app.js` | 修改 | 新增前端 DEPT_CONFIG + 侧边栏 + 路由 + 小部门汇总 |

**不需要修改的文件（自动适配）：**
- `routes/records.js` — 通过 `DEPT_CONFIG[dept]` 自动支持新部门
- `routes/import-export.js` — `getColumnMap('balance')` 自动包含新部门字段
- `server.js` — 路由已注册，无需新增

---

### Task 1: 数据库建表 + 初始车间数据

**Files:**
- Modify: `db/init.sql`

需要执行的 ALTER TABLE / INSERT 语句也会列出，供用户在现有数据库上执行。

- [ ] **Step 1: 在 init.sql 末尾（assembly_records 之后、初始数据之前）添加4张数据表**

每张表结构：共有字段（与 beer_records 一致）+ 部门独有字段 + 元数据。

`bags_records` 独有字段：
```sql
-- 胶袋部数据表
CREATE TABLE IF NOT EXISTS bags_records (
  id SERIAL PRIMARY KEY,
  record_date DATE NOT NULL,
  workshop_id INT REFERENCES workshops(id),
  -- 共有字段
  supervisor_count INT DEFAULT 0,
  worker_count INT DEFAULT 0,
  daily_output NUMERIC(14,2) DEFAULT 0,
  worker_wage NUMERIC(12,2) DEFAULT 0,
  supervisor_wage NUMERIC(12,2) DEFAULT 0,
  rent NUMERIC(12,2) DEFAULT 0,
  utility_fee NUMERIC(12,2) DEFAULT 0,
  tool_investment NUMERIC(12,2) DEFAULT 0,
  equipment NUMERIC(12,2) DEFAULT 0,
  renovation NUMERIC(12,2) DEFAULT 0,
  misc_fee NUMERIC(12,2) DEFAULT 0,
  shipping_fee NUMERIC(12,2) DEFAULT 0,
  social_insurance NUMERIC(12,2) DEFAULT 0,
  tax NUMERIC(12,2) DEFAULT 0,
  balance NUMERIC(14,2) DEFAULT 0,
  balance_ratio NUMERIC(8,4) DEFAULT 0,
  remark TEXT DEFAULT '',
  -- 胶袋独有字段
  total_machines INT DEFAULT 0,
  running_machines INT DEFAULT 0,
  machine_rate NUMERIC(8,4) DEFAULT 0,
  misc_workers INT DEFAULT 0,
  per_capita_output NUMERIC(12,2) DEFAULT 0,
  scrap_income NUMERIC(12,2) DEFAULT 0,
  avg_output_per_machine NUMERIC(14,2) DEFAULT 0,
  misc_worker_wage NUMERIC(12,2) DEFAULT 0,
  wage_ratio NUMERIC(8,4) DEFAULT 0,
  raw_material_cost NUMERIC(12,2) DEFAULT 0,
  diesel NUMERIC(12,2) DEFAULT 0,
  machine_repair NUMERIC(12,2) DEFAULT 0,
  material_supplement NUMERIC(12,2) DEFAULT 0,
  gate_processing_fee NUMERIC(12,2) DEFAULT 0,
  avg_balance_per_machine NUMERIC(14,2) DEFAULT 0,
  outsource_output NUMERIC(14,2) DEFAULT 0,
  outsource_profit NUMERIC(14,2) DEFAULT 0,
  outsource_profit_ratio NUMERIC(8,4) DEFAULT 0,
  -- 元数据
  created_by INT,
  updated_by INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

`color_records` 独有字段：
```sql
-- 配色部数据表
CREATE TABLE IF NOT EXISTS color_records (
  id SERIAL PRIMARY KEY,
  record_date DATE NOT NULL,
  workshop_id INT REFERENCES workshops(id),
  -- 共有字段（同上，省略）
  supervisor_count INT DEFAULT 0,
  worker_count INT DEFAULT 0,
  daily_output NUMERIC(14,2) DEFAULT 0,
  worker_wage NUMERIC(12,2) DEFAULT 0,
  supervisor_wage NUMERIC(12,2) DEFAULT 0,
  rent NUMERIC(12,2) DEFAULT 0,
  utility_fee NUMERIC(12,2) DEFAULT 0,
  tool_investment NUMERIC(12,2) DEFAULT 0,
  equipment NUMERIC(12,2) DEFAULT 0,
  renovation NUMERIC(12,2) DEFAULT 0,
  misc_fee NUMERIC(12,2) DEFAULT 0,
  shipping_fee NUMERIC(12,2) DEFAULT 0,
  social_insurance NUMERIC(12,2) DEFAULT 0,
  tax NUMERIC(12,2) DEFAULT 0,
  balance NUMERIC(14,2) DEFAULT 0,
  balance_ratio NUMERIC(8,4) DEFAULT 0,
  remark TEXT DEFAULT '',
  -- 配色独有字段
  wage_ratio NUMERIC(8,4) DEFAULT 0,
  hq_allocation NUMERIC(12,2) DEFAULT 0,
  raw_material_cost NUMERIC(12,2) DEFAULT 0,
  color_powder NUMERIC(12,2) DEFAULT 0,
  hk_expense NUMERIC(12,2) DEFAULT 0,
  outsource_output NUMERIC(14,2) DEFAULT 0,
  outsource_tax NUMERIC(12,2) DEFAULT 0,
  outsource_profit NUMERIC(14,2) DEFAULT 0,
  total_profit NUMERIC(14,2) DEFAULT 0,
  profit_ratio_ex_tax NUMERIC(8,4) DEFAULT 0,
  profit_ratio_inc_tax NUMERIC(8,4) DEFAULT 0,
  -- 元数据
  created_by INT,
  updated_by INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

`blister_records` 独有字段：
```sql
-- 吸塑部数据表
CREATE TABLE IF NOT EXISTS blister_records (
  id SERIAL PRIMARY KEY,
  record_date DATE NOT NULL,
  workshop_id INT REFERENCES workshops(id),
  -- 共有字段
  supervisor_count INT DEFAULT 0,
  worker_count INT DEFAULT 0,
  daily_output NUMERIC(14,2) DEFAULT 0,
  worker_wage NUMERIC(12,2) DEFAULT 0,
  supervisor_wage NUMERIC(12,2) DEFAULT 0,
  rent NUMERIC(12,2) DEFAULT 0,
  utility_fee NUMERIC(12,2) DEFAULT 0,
  tool_investment NUMERIC(12,2) DEFAULT 0,
  equipment NUMERIC(12,2) DEFAULT 0,
  renovation NUMERIC(12,2) DEFAULT 0,
  misc_fee NUMERIC(12,2) DEFAULT 0,
  shipping_fee NUMERIC(12,2) DEFAULT 0,
  social_insurance NUMERIC(12,2) DEFAULT 0,
  tax NUMERIC(12,2) DEFAULT 0,
  balance NUMERIC(14,2) DEFAULT 0,
  balance_ratio NUMERIC(8,4) DEFAULT 0,
  remark TEXT DEFAULT '',
  -- 吸塑独有字段
  total_machines INT DEFAULT 0,
  running_machines INT DEFAULT 0,
  machine_rate NUMERIC(8,4) DEFAULT 0,
  misc_workers INT DEFAULT 0,
  avg_output_per_machine NUMERIC(14,2) DEFAULT 0,
  misc_worker_wage NUMERIC(12,2) DEFAULT 0,
  wage_ratio NUMERIC(8,4) DEFAULT 0,
  raw_material NUMERIC(12,2) DEFAULT 0,
  raw_material_ratio NUMERIC(8,4) DEFAULT 0,
  supplies NUMERIC(12,2) DEFAULT 0,
  materials NUMERIC(12,2) DEFAULT 0,
  machine_repair NUMERIC(12,2) DEFAULT 0,
  gate_processing_fee NUMERIC(12,2) DEFAULT 0,
  material_supplement NUMERIC(12,2) DEFAULT 0,
  cartons NUMERIC(12,2) DEFAULT 0,
  plastic_bags NUMERIC(12,2) DEFAULT 0,
  scrap_income NUMERIC(12,2) DEFAULT 0,
  avg_balance_per_machine NUMERIC(14,2) DEFAULT 0,
  outsource_output NUMERIC(14,2) DEFAULT 0,
  outsource_profit NUMERIC(14,2) DEFAULT 0,
  outsource_profit_ratio NUMERIC(8,4) DEFAULT 0,
  -- 元数据
  created_by INT,
  updated_by INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

`electronic_records` 独有字段：
```sql
-- 电子部数据表
CREATE TABLE IF NOT EXISTS electronic_records (
  id SERIAL PRIMARY KEY,
  record_date DATE NOT NULL,
  workshop_id INT REFERENCES workshops(id),
  -- 共有字段
  supervisor_count INT DEFAULT 0,
  worker_count INT DEFAULT 0,
  daily_output NUMERIC(14,2) DEFAULT 0,
  worker_wage NUMERIC(12,2) DEFAULT 0,
  supervisor_wage NUMERIC(12,2) DEFAULT 0,
  rent NUMERIC(12,2) DEFAULT 0,
  utility_fee NUMERIC(12,2) DEFAULT 0,
  tool_investment NUMERIC(12,2) DEFAULT 0,
  equipment NUMERIC(12,2) DEFAULT 0,
  renovation NUMERIC(12,2) DEFAULT 0,
  misc_fee NUMERIC(12,2) DEFAULT 0,
  shipping_fee NUMERIC(12,2) DEFAULT 0,
  social_insurance NUMERIC(12,2) DEFAULT 0,
  tax NUMERIC(12,2) DEFAULT 0,
  balance NUMERIC(14,2) DEFAULT 0,
  balance_ratio NUMERIC(8,4) DEFAULT 0,
  remark TEXT DEFAULT '',
  -- 电子独有字段
  bonding_balance NUMERIC(14,2) DEFAULT 0,
  smt_balance NUMERIC(14,2) DEFAULT 0,
  plugin_balance NUMERIC(14,2) DEFAULT 0,
  production_wage_balance NUMERIC(14,2) DEFAULT 0,
  production_wage_balance_tax NUMERIC(14,2) DEFAULT 0,
  estimated_workshop_profit NUMERIC(14,2) DEFAULT 0,
  production_supervisor_wage NUMERIC(12,2) DEFAULT 0,
  office_supervisor_wage NUMERIC(12,2) DEFAULT 0,
  shared_staff_wage NUMERIC(12,2) DEFAULT 0,
  hk_expense NUMERIC(12,2) DEFAULT 0,
  severance_fee NUMERIC(12,2) DEFAULT 0,
  excess_material NUMERIC(12,2) DEFAULT 0,
  transport_packing_fee NUMERIC(12,2) DEFAULT 0,
  payable_tax NUMERIC(12,2) DEFAULT 0,
  hq_allocation NUMERIC(12,2) DEFAULT 0,
  estimated_tax NUMERIC(12,2) DEFAULT 0,
  outsource_output NUMERIC(14,2) DEFAULT 0,
  outsource_planned_wage NUMERIC(14,2) DEFAULT 0,
  outsource_actual_wage NUMERIC(14,2) DEFAULT 0,
  outsource_wage_balance NUMERIC(14,2) DEFAULT 0,
  outsource_balance_ratio NUMERIC(8,4) DEFAULT 0,
  -- 元数据
  created_by INT,
  updated_by INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

- [ ] **Step 2: 添加初始车间数据**

在现有 workshops INSERT 语句中追加：
```sql
  ('小部门', '清溪', 'bags', 1),
  ('小部门', '清溪', 'color', 1),
  ('小部门', '清溪', 'blister', 1),
  ('登信', '清溪', 'electronic', 1)
```

- [ ] **Step 3: 添加索引**

```sql
CREATE INDEX IF NOT EXISTS idx_bags_date ON bags_records(record_date);
CREATE INDEX IF NOT EXISTS idx_bags_workshop ON bags_records(workshop_id);
CREATE INDEX IF NOT EXISTS idx_color_date ON color_records(record_date);
CREATE INDEX IF NOT EXISTS idx_color_workshop ON color_records(workshop_id);
CREATE INDEX IF NOT EXISTS idx_blister_date ON blister_records(record_date);
CREATE INDEX IF NOT EXISTS idx_blister_workshop ON blister_records(workshop_id);
CREATE INDEX IF NOT EXISTS idx_electronic_date ON electronic_records(record_date);
CREATE INDEX IF NOT EXISTS idx_electronic_workshop ON electronic_records(workshop_id);
```

- [ ] **Step 4: 在现有数据库执行建表**

告知用户需要执行的 SQL（CREATE TABLE + INSERT workshops + CREATE INDEX），用户自行执行。

- [ ] **Step 5: Commit**

```bash
git add db/init.sql
git commit -m "feat: 小部门数据表结构（胶袋/配色/吸塑/电子）"
```

---

### Task 2: 后端字段配置（config.js）

**Files:**
- Modify: `modules/balance/config.js:47-229` (departments 对象)

在 `departments` 对象中，在 `assembly` 之后添加4个新部门配置。字段定义格式与现有部门完全一致。

- [ ] **Step 1: 添加 bags 部门配置**

在 `modules/balance/config.js` 的 `departments` 对象中，`assembly: {...}` 后面添加：

```javascript
    bags: {
      tableName: 'bags_records',
      label: '胶袋部',
      workshops: ['小部门'],
      sharedFieldAliases: {},
      uniqueFields: [
        // 机台组
        { field: 'total_machines', label: '总台数', type: 'integer', input: true, expense: false },
        { field: 'running_machines', label: '开机台数', type: 'integer', input: true, expense: false },
        { field: 'machine_rate', label: '开机率', type: 'ratio', calc: true,
          skipAliases: ['开机率'] },
        // 人数组
        { field: 'misc_workers', label: '杂工人数', type: 'integer', input: true, expense: false },
        // 产值组
        { field: 'per_capita_output', label: '人均产值', type: 'number', calc: true,
          skipAliases: ['人均产值'] },
        { field: 'scrap_income', label: '边角料(收入)', type: 'number', input: true, expense: false, income: true, currency: true,
          aliases: ['边角料（收入）'] },
        { field: 'avg_output_per_machine', label: '每台机平均产值', type: 'number', calc: true,
          skipAliases: ['每台机平均产值'] },
        // 工资组
        { field: 'misc_worker_wage', label: '杂工工资/天', type: 'number', input: true, expense: true, currency: true },
        { field: 'wage_ratio', label: '总工资占产值%', type: 'ratio', calc: true,
          skipAliases: ['总工资（包管工）占产值%', '总工资(包管工)占产值%'] },
        // 费用组
        { field: 'raw_material_cost', label: '原料成本', type: 'number', input: true, expense: true, currency: true },
        { field: 'diesel', label: '柴油', type: 'number', input: true, expense: true, currency: true },
        { field: 'machine_repair', label: '机器维修', type: 'number', input: true, expense: true, currency: true },
        { field: 'material_supplement', label: '原料补料/损耗', type: 'number', input: true, expense: true, currency: true,
          aliases: ['原料补料'] },
        { field: 'gate_processing_fee', label: '批水口加工费', type: 'number', input: true, expense: true, currency: true,
          aliases: ['批水口加工费用'] },
        // 结余组
        { field: 'avg_balance_per_machine', label: '平均每台结余', type: 'number', calc: true,
          skipAliases: ['平均每台结余'] },
        // 外发组
        { field: 'outsource_output', label: '外发产值', type: 'number', input: true, expense: false, currency: true },
        { field: 'outsource_profit', label: '利润', type: 'number', input: true, expense: false, currency: true },
        { field: 'outsource_profit_ratio', label: '占比率', type: 'ratio', calc: true,
          skipAliases: ['占比率'] },
      ]
    },
```

- [ ] **Step 2: 添加 color 部门配置**

```javascript
    color: {
      tableName: 'color_records',
      label: '配色部',
      workshops: ['小部门'],
      sharedFieldAliases: {},
      uniqueFields: [
        // 工资组
        { field: 'wage_ratio', label: '总工资占产值%', type: 'ratio', calc: true,
          skipAliases: ['总工资（包管工）占产值%', '总工资(包管工)占产值%'] },
        // 费用组
        { field: 'hq_allocation', label: '总部分摊', type: 'number', input: true, expense: true, currency: true },
        { field: 'raw_material_cost', label: '原料成本', type: 'number', input: true, expense: true, currency: true },
        { field: 'color_powder', label: '色粉', type: 'number', input: true, expense: true, currency: true },
        { field: 'hk_expense', label: '税收/香港开支', type: 'number', input: true, expense: true, currency: true,
          aliases: ['税收、香港开支'] },
        // 外发组
        { field: 'outsource_output', label: '外发产值', type: 'number', input: true, expense: false, currency: true },
        { field: 'outsource_tax', label: '税收(外发)', type: 'number', input: true, expense: false, currency: true },
        { field: 'outsource_profit', label: '利润', type: 'number', input: true, expense: false, currency: true },
        { field: 'total_profit', label: '总利润', type: 'number', input: true, expense: false, currency: true },
        { field: 'profit_ratio_ex_tax', label: '不含税比润', type: 'ratio', calc: true,
          skipAliases: ['不含税比润'] },
        { field: 'profit_ratio_inc_tax', label: '含税总比润', type: 'ratio', calc: true,
          skipAliases: ['含税总比润'] },
      ]
    },
```

- [ ] **Step 3: 添加 blister 部门配置**

```javascript
    blister: {
      tableName: 'blister_records',
      label: '吸塑部',
      workshops: ['小部门'],
      sharedFieldAliases: {},
      uniqueFields: [
        // 机台组
        { field: 'total_machines', label: '总台数', type: 'integer', input: true, expense: false },
        { field: 'running_machines', label: '开机台数', type: 'integer', input: true, expense: false },
        { field: 'machine_rate', label: '开机率', type: 'ratio', calc: true,
          skipAliases: ['开机率'] },
        // 人数组
        { field: 'misc_workers', label: '杂工人数', type: 'integer', input: true, expense: false },
        // 产值组
        { field: 'avg_output_per_machine', label: '每台机平均产值', type: 'number', calc: true,
          skipAliases: ['每台机平均产值'] },
        // 工资组
        { field: 'misc_worker_wage', label: '杂工工资/天', type: 'number', input: true, expense: true, currency: true },
        { field: 'wage_ratio', label: '总工资占产值%', type: 'ratio', calc: true,
          skipAliases: ['总工资（包管工）占产值%', '总工资(包管工)占产值%'] },
        // 费用组
        { field: 'raw_material', label: '原料', type: 'number', input: true, expense: true, currency: true },
        { field: 'raw_material_ratio', label: '原料比率', type: 'ratio', calc: true,
          skipAliases: ['原料比率'] },
        { field: 'supplies', label: '用料', type: 'number', input: true, expense: true, currency: true },
        { field: 'materials', label: '物料', type: 'number', input: true, expense: true, currency: true },
        { field: 'machine_repair', label: '机器维修', type: 'number', input: true, expense: true, currency: true },
        { field: 'gate_processing_fee', label: '批水口加工费', type: 'number', input: true, expense: true, currency: true,
          aliases: ['批水口加工费用'] },
        { field: 'material_supplement', label: '原料补料', type: 'number', input: true, expense: true, currency: true },
        { field: 'cartons', label: '纸箱', type: 'number', input: true, expense: true, currency: true },
        { field: 'plastic_bags', label: '胶袋', type: 'number', input: true, expense: true, currency: true },
        { field: 'scrap_income', label: '边角料(收入)', type: 'number', input: true, expense: false, income: true, currency: true,
          aliases: ['边角料'] },
        // 结余组
        { field: 'avg_balance_per_machine', label: '平均每台结余', type: 'number', calc: true,
          skipAliases: ['平均每台结余'] },
        // 外发组
        { field: 'outsource_output', label: '外发产值', type: 'number', input: true, expense: false, currency: true },
        { field: 'outsource_profit', label: '外发利润', type: 'number', input: true, expense: false, currency: true },
        { field: 'outsource_profit_ratio', label: '外发利润率%', type: 'ratio', calc: true,
          skipAliases: ['外发利润率%'] },
      ]
    },
```

- [ ] **Step 4: 添加 electronic 部门配置**

```javascript
    electronic: {
      tableName: 'electronic_records',
      label: '电子部',
      workshops: ['登信'],
      sharedFieldAliases: {
        rent: ['厂租', '厂 租'],
        tool_investment: ['工具', '工 具'],
      },
      uniqueFields: [
        // 子部门结余
        { field: 'bonding_balance', label: '帮定结余', type: 'number', input: true, expense: false, currency: true },
        { field: 'smt_balance', label: '贴片结余', type: 'number', input: true, expense: false, currency: true },
        { field: 'plugin_balance', label: '插件结余', type: 'number', input: true, expense: false, currency: true },
        // 工资结余（计算）
        { field: 'production_wage_balance', label: '生产工资结余', type: 'number', calc: true,
          skipAliases: ['生产工资结余'] },
        { field: 'production_wage_balance_tax', label: '生产工资结余(含1.13)', type: 'number', calc: true,
          skipAliases: ['生产工资结余（含1.13）'] },
        { field: 'estimated_workshop_profit', label: '预估车间利润', type: 'number', calc: true,
          skipAliases: ['预估车间利润（产值*0.05）'] },
        // 工资组（独有，替代共享的 worker_wage/supervisor_wage）
        { field: 'production_supervisor_wage', label: '生产管工工资', type: 'number', input: true, expense: true, currency: true },
        { field: 'office_supervisor_wage', label: '办公室管工工资', type: 'number', input: true, expense: true, currency: true },
        { field: 'shared_staff_wage', label: '共用人员工资', type: 'number', input: true, expense: true, currency: true },
        // 费用组
        { field: 'hk_expense', label: '香港支出', type: 'number', input: true, expense: true, currency: true,
          aliases: ['香港支出(占产值约1.0%)'] },
        { field: 'severance_fee', label: '离职补贴费用', type: 'number', input: true, expense: true, currency: true },
        { field: 'excess_material', label: '超出原材料', type: 'number', input: true, expense: true, currency: true },
        { field: 'transport_packing_fee', label: '运输包装费', type: 'number', input: true, expense: true, currency: true },
        { field: 'payable_tax', label: '应缴税收', type: 'number', input: true, expense: true, currency: true },
        { field: 'hq_allocation', label: '总部支出', type: 'number', input: true, expense: true, currency: true,
          aliases: ['总部支出（占产值）0.0029'] },
        // 其他
        { field: 'estimated_tax', label: '预计税金', type: 'number', input: true, expense: false, currency: true },
        // 外发组
        { field: 'outsource_output', label: '外发产值', type: 'number', input: true, expense: false, currency: true,
          aliases: ['外发产值($)'] },
        { field: 'outsource_planned_wage', label: '外发计划工资(含1.13)', type: 'number', input: true, expense: false, currency: true },
        { field: 'outsource_actual_wage', label: '外发实际工资', type: 'number', input: true, expense: false, currency: true },
        { field: 'outsource_wage_balance', label: '外发人工结余', type: 'number', calc: true,
          skipAliases: ['外发人工结余'] },
        { field: 'outsource_balance_ratio', label: '外发结余比例', type: 'ratio', calc: true,
          skipAliases: ['外发结余比例'] },
      ]
    },
```

- [ ] **Step 5: 在 skipColumns 中追加新的计算列名**

在 `balanceConfig.skipColumns` 数组中追加：
```javascript
'每台机平均产值', '平均每台结余', '总工资占产值%', '原料比率', '外发利润率%', '占比率',
'不含税比润', '含税总比润', '生产工资结余', '生产工资结余(含1.13)', '预估车间利润',
'外发人工结余', '外发结余比例'
```

- [ ] **Step 6: Commit**

```bash
git add modules/balance/config.js
git commit -m "feat: 小部门字段配置（胶袋/配色/吸塑/电子）"
```

---

### Task 3: 支持 income 字段（边角料）

**Files:**
- Modify: `modules/index.js:61-63` (getExpenseFields)
- Modify: `modules/index.js` (新增 getIncomeFields)

边角料(收入)标记为 `income: true, expense: false`。结余公式需要：`结余 = 产值 + 收入合计 - 费用合计`。

- [ ] **Step 1: 在 modules/index.js 中新增 getIncomeFields 函数**

在 `getExpenseFields` 函数之后添加：
```javascript
function getIncomeFields(dept) {
  const deptConf = balanceConfig.departments[dept];
  if (!deptConf) return [];
  // income 字段只在部门独有字段中（共享字段没有 income）
  return deptConf.uniqueFields.filter(f => f.income).map(f => f.field);
}
```

- [ ] **Step 2: 导出 getIncomeFields**

在 `module.exports` 中添加 `getIncomeFields`。

- [ ] **Step 3: Commit**

```bash
git add modules/index.js
git commit -m "feat: 新增 getIncomeFields 支持边角料(收入)字段"
```

---

### Task 4: 后端计算逻辑（calc.js hardcoded fallback）

**Files:**
- Modify: `modules/balance/calc.js:193-249` (calculateRecordHardcoded 函数)

在 hardcoded fallback 中为4个新部门添加基础计算逻辑。详细公式待用户后续提供，先用通用模式。

- [ ] **Step 1: 修改结余计算支持 income 字段**

在 `calculateRecordHardcoded` 函数中，将通用结余计算改为支持收入字段：

当前逻辑（约第199行）：
```javascript
const totalExpense = expenseFields.reduce((sum, field) => sum + (parseFloat(result[field]) || 0), 0);
const dailyOutput = parseFloat(result.daily_output) || 0;
result.balance = dailyOutput - totalExpense;
```

改为：
```javascript
const { getIncomeFields } = require('../index');
// ... 在函数内部
const totalExpense = expenseFields.reduce((sum, field) => sum + (parseFloat(result[field]) || 0), 0);
const dailyOutput = parseFloat(result.daily_output) || 0;
const incomeFields = getIncomeFields(dept);
const totalIncome = incomeFields.reduce((sum, field) => sum + (parseFloat(result[field]) || 0), 0);
result.balance = dailyOutput + totalIncome - totalExpense;
```

注意：在文件顶部的 require 中，`getIncomeFields` 已经从 `../index` 导入（需要把它加到现有的 destructure 中）。

- [ ] **Step 2: 添加 bags 部门计算**

在 `assembly` 分支之后添加：
```javascript
  } else if (dept === 'bags') {
    const running = parseFloat(result.running_machines) || 0;
    const total = parseFloat(result.total_machines) || 0;
    const workerCount = parseFloat(result.worker_count) || 0;
    result.machine_rate = total > 0 ? running / total : 0;
    result.per_capita_output = workerCount > 0 ? dailyOutput / workerCount : 0;
    result.avg_output_per_machine = running > 0 ? dailyOutput / running : 0;
    result.wage_ratio = dailyOutput > 0 ? ((parseFloat(result.worker_wage) || 0) + (parseFloat(result.supervisor_wage) || 0) + (parseFloat(result.misc_worker_wage) || 0)) / dailyOutput : 0;
    result.avg_balance_per_machine = running > 0 ? result.balance / running : 0;
    const outsourceOutput = parseFloat(result.outsource_output) || 0;
    const outsourceProfit = parseFloat(result.outsource_profit) || 0;
    result.outsource_profit_ratio = outsourceOutput > 0 ? outsourceProfit / outsourceOutput : 0;
  }
```

- [ ] **Step 3: 添加 color 部门计算**

```javascript
  } else if (dept === 'color') {
    result.wage_ratio = dailyOutput > 0 ? ((parseFloat(result.worker_wage) || 0) + (parseFloat(result.supervisor_wage) || 0)) / dailyOutput : 0;
    // profit_ratio_ex_tax / profit_ratio_inc_tax 待用户提供详细规则
    result.profit_ratio_ex_tax = 0;
    result.profit_ratio_inc_tax = 0;
  }
```

- [ ] **Step 4: 添加 blister 部门计算**

```javascript
  } else if (dept === 'blister') {
    const running = parseFloat(result.running_machines) || 0;
    const total = parseFloat(result.total_machines) || 0;
    result.machine_rate = total > 0 ? running / total : 0;
    result.avg_output_per_machine = running > 0 ? dailyOutput / running : 0;
    result.wage_ratio = dailyOutput > 0 ? ((parseFloat(result.worker_wage) || 0) + (parseFloat(result.supervisor_wage) || 0) + (parseFloat(result.misc_worker_wage) || 0)) / dailyOutput : 0;
    result.raw_material_ratio = dailyOutput > 0 ? (parseFloat(result.raw_material) || 0) / dailyOutput : 0;
    result.avg_balance_per_machine = running > 0 ? result.balance / running : 0;
    const outsourceOutput = parseFloat(result.outsource_output) || 0;
    const outsourceProfit = parseFloat(result.outsource_profit) || 0;
    result.outsource_profit_ratio = outsourceOutput > 0 ? outsourceProfit / outsourceOutput : 0;
  }
```

- [ ] **Step 5: 添加 electronic 部门计算**

```javascript
  } else if (dept === 'electronic') {
    // 生产工资结余 = 帮定结余 + 贴片结余 + 插件结余
    const bondingBal = parseFloat(result.bonding_balance) || 0;
    const smtBal = parseFloat(result.smt_balance) || 0;
    const pluginBal = parseFloat(result.plugin_balance) || 0;
    result.production_wage_balance = bondingBal + smtBal + pluginBal;
    result.production_wage_balance_tax = result.production_wage_balance * 1.13;
    result.estimated_workshop_profit = dailyOutput * 0.05;
    // 外发
    const outsourcePlanned = parseFloat(result.outsource_planned_wage) || 0;
    const outsourceActual = parseFloat(result.outsource_actual_wage) || 0;
    result.outsource_wage_balance = outsourcePlanned - outsourceActual;
    const outsourceOutput = parseFloat(result.outsource_output) || 0;
    result.outsource_balance_ratio = outsourceOutput > 0 ? result.outsource_wage_balance / outsourceOutput : 0;
  }
```

- [ ] **Step 6: Commit**

```bash
git add modules/balance/calc.js modules/index.js
git commit -m "feat: 小部门计算逻辑（hardcoded fallback）"
```

---

### Task 5: 前端 DEPT_CONFIG + 常量更新

**Files:**
- Modify: `public/js/app.js:35-128` (DEPT_CONFIG, ALL_DEPARTMENTS, BALANCE_DEPARTMENTS)

- [ ] **Step 1: 在前端 DEPT_CONFIG 中添加4个部门**

在 `assembly: {...}` 之后添加 `bags`、`color`、`blister`、`electronic` 的前端字段定义。格式参考现有部门（每个字段有 field, label, shortLabel, editable, type, calculated 等属性）。

具体字段列表照搬设计文档中的独有字段表，转换为前端格式。例如 bags:

```javascript
  bags: { key: 'bags', name: '胶袋部', uniqueFields: [
    { field: 'total_machines', label: '总台数', shortLabel: '总台数', editable: true, type: 'integer' },
    { field: 'running_machines', label: '开机台数', shortLabel: '开机台数', editable: true, type: 'integer' },
    { field: 'machine_rate', label: '开机率', shortLabel: '开机率', editable: false, type: 'ratio', calculated: true, formula: '开机台数 / 总台数' },
    { field: 'misc_workers', label: '杂工人数', shortLabel: '杂工人数', editable: true, type: 'integer' },
    { field: 'per_capita_output', label: '人均产值', shortLabel: '人均产值', editable: false, type: 'number', calculated: true, formula: '产值/天 / 员工人数' },
    { field: 'scrap_income', label: '边角料(收入)', shortLabel: '边角料', editable: true, type: 'number' },
    { field: 'avg_output_per_machine', label: '每台机平均产值', shortLabel: '台均产值', editable: false, type: 'number', calculated: true, formula: '产值/天 / 开机台数' },
    { field: 'misc_worker_wage', label: '杂工工资/天', shortLabel: '杂工工资', editable: true, type: 'number' },
    { field: 'wage_ratio', label: '总工资占产值%', shortLabel: '工资占比', editable: false, type: 'ratio', calculated: true, formula: '(员工工资+管工工资+杂工工资) / 产值/天' },
    { field: 'raw_material_cost', label: '原料成本', shortLabel: '原料成本', editable: true, type: 'number' },
    { field: 'diesel', label: '柴油', shortLabel: '柴油', editable: true, type: 'number' },
    { field: 'machine_repair', label: '机器维修', shortLabel: '机器维修', editable: true, type: 'number' },
    { field: 'material_supplement', label: '原料补料/损耗', shortLabel: '原料补料', editable: true, type: 'number' },
    { field: 'gate_processing_fee', label: '批水口加工费', shortLabel: '水口加工', editable: true, type: 'number' },
    { field: 'avg_balance_per_machine', label: '平均每台结余', shortLabel: '台均结余', editable: false, type: 'number', calculated: true, formula: '结余金额 / 开机台数' },
    { field: 'outsource_output', label: '外发产值', shortLabel: '外发产值', editable: true, type: 'number' },
    { field: 'outsource_profit', label: '利润', shortLabel: '利润', editable: true, type: 'number' },
    { field: 'outsource_profit_ratio', label: '占比率', shortLabel: '占比率', editable: false, type: 'ratio', calculated: true, formula: '利润 / 外发产值' },
  ]},
```

color:
```javascript
  color: { key: 'color', name: '配色部', uniqueFields: [
    { field: 'wage_ratio', label: '总工资占产值%', shortLabel: '工资占比', editable: false, type: 'ratio', calculated: true, formula: '(员工工资+管工工资) / 产值/天' },
    { field: 'hq_allocation', label: '总部分摊', shortLabel: '总部分摊', editable: true, type: 'number' },
    { field: 'raw_material_cost', label: '原料成本', shortLabel: '原料成本', editable: true, type: 'number' },
    { field: 'color_powder', label: '色粉', shortLabel: '色粉', editable: true, type: 'number' },
    { field: 'hk_expense', label: '税收/香港开支', shortLabel: '港支出', editable: true, type: 'number' },
    { field: 'outsource_output', label: '外发产值', shortLabel: '外发产值', editable: true, type: 'number' },
    { field: 'outsource_tax', label: '税收(外发)', shortLabel: '外发税', editable: true, type: 'number' },
    { field: 'outsource_profit', label: '利润', shortLabel: '利润', editable: true, type: 'number' },
    { field: 'total_profit', label: '总利润', shortLabel: '总利润', editable: true, type: 'number' },
    { field: 'profit_ratio_ex_tax', label: '不含税比润', shortLabel: '不含税%', editable: false, type: 'ratio', calculated: true },
    { field: 'profit_ratio_inc_tax', label: '含税总比润', shortLabel: '含税%', editable: false, type: 'ratio', calculated: true },
  ]},
```

blister:
```javascript
  blister: { key: 'blister', name: '吸塑部', uniqueFields: [
    { field: 'total_machines', label: '总台数', shortLabel: '总台数', editable: true, type: 'integer' },
    { field: 'running_machines', label: '开机台数', shortLabel: '开机台数', editable: true, type: 'integer' },
    { field: 'machine_rate', label: '开机率', shortLabel: '开机率', editable: false, type: 'ratio', calculated: true, formula: '开机台数 / 总台数' },
    { field: 'misc_workers', label: '杂工人数', shortLabel: '杂工人数', editable: true, type: 'integer' },
    { field: 'avg_output_per_machine', label: '每台机平均产值', shortLabel: '台均产值', editable: false, type: 'number', calculated: true, formula: '产值/天 / 开机台数' },
    { field: 'misc_worker_wage', label: '杂工工资/天', shortLabel: '杂工工资', editable: true, type: 'number' },
    { field: 'wage_ratio', label: '总工资占产值%', shortLabel: '工资占比', editable: false, type: 'ratio', calculated: true, formula: '(员工工资+管工工资+杂工工资) / 产值/天' },
    { field: 'raw_material', label: '原料', shortLabel: '原料', editable: true, type: 'number' },
    { field: 'raw_material_ratio', label: '原料比率', shortLabel: '原料比', editable: false, type: 'ratio', calculated: true, formula: '原料 / 产值/天' },
    { field: 'supplies', label: '用料', shortLabel: '用料', editable: true, type: 'number' },
    { field: 'materials', label: '物料', shortLabel: '物料', editable: true, type: 'number' },
    { field: 'machine_repair', label: '机器维修', shortLabel: '机器维修', editable: true, type: 'number' },
    { field: 'gate_processing_fee', label: '批水口加工费', shortLabel: '水口加工', editable: true, type: 'number' },
    { field: 'material_supplement', label: '原料补料', shortLabel: '原料补料', editable: true, type: 'number' },
    { field: 'cartons', label: '纸箱', shortLabel: '纸箱', editable: true, type: 'number' },
    { field: 'plastic_bags', label: '胶袋', shortLabel: '胶袋', editable: true, type: 'number' },
    { field: 'scrap_income', label: '边角料(收入)', shortLabel: '边角料', editable: true, type: 'number' },
    { field: 'avg_balance_per_machine', label: '平均每台结余', shortLabel: '台均结余', editable: false, type: 'number', calculated: true, formula: '结余金额 / 开机台数' },
    { field: 'outsource_output', label: '外发产值', shortLabel: '外发产值', editable: true, type: 'number' },
    { field: 'outsource_profit', label: '外发利润', shortLabel: '外发利润', editable: true, type: 'number' },
    { field: 'outsource_profit_ratio', label: '外发利润率%', shortLabel: '外发利%', editable: false, type: 'ratio', calculated: true, formula: '外发利润 / 外发产值' },
  ]},
```

electronic:
```javascript
  electronic: { key: 'electronic', name: '电子部', uniqueFields: [
    { field: 'bonding_balance', label: '帮定结余', shortLabel: '帮定结余', editable: true, type: 'number' },
    { field: 'smt_balance', label: '贴片结余', shortLabel: '贴片结余', editable: true, type: 'number' },
    { field: 'plugin_balance', label: '插件结余', shortLabel: '插件结余', editable: true, type: 'number' },
    { field: 'production_wage_balance', label: '生产工资结余', shortLabel: '工资结余', editable: false, type: 'number', calculated: true, formula: '帮定结余 + 贴片结余 + 插件结余' },
    { field: 'production_wage_balance_tax', label: '生产工资结余(含1.13)', shortLabel: '结余含税', editable: false, type: 'number', calculated: true, formula: '生产工资结余 × 1.13' },
    { field: 'estimated_workshop_profit', label: '预估车间利润', shortLabel: '预估利润', editable: false, type: 'number', calculated: true, formula: '产值/天 × 0.05' },
    { field: 'production_supervisor_wage', label: '生产管工工资', shortLabel: '生产管工', editable: true, type: 'number' },
    { field: 'office_supervisor_wage', label: '办公室管工工资', shortLabel: '办公管工', editable: true, type: 'number' },
    { field: 'shared_staff_wage', label: '共用人员工资', shortLabel: '共用工资', editable: true, type: 'number' },
    { field: 'hk_expense', label: '香港支出', shortLabel: '港支出', editable: true, type: 'number' },
    { field: 'severance_fee', label: '离职补贴费用', shortLabel: '离职补贴', editable: true, type: 'number' },
    { field: 'excess_material', label: '超出原材料', shortLabel: '超原材料', editable: true, type: 'number' },
    { field: 'transport_packing_fee', label: '运输包装费', shortLabel: '运输包装', editable: true, type: 'number' },
    { field: 'payable_tax', label: '应缴税收', shortLabel: '应缴税', editable: true, type: 'number' },
    { field: 'hq_allocation', label: '总部支出', shortLabel: '总部支出', editable: true, type: 'number' },
    { field: 'estimated_tax', label: '预计税金', shortLabel: '预计税金', editable: true, type: 'number' },
    { field: 'outsource_output', label: '外发产值', shortLabel: '外发产值', editable: true, type: 'number' },
    { field: 'outsource_planned_wage', label: '外发计划工资(含1.13)', shortLabel: '外发计划', editable: true, type: 'number' },
    { field: 'outsource_actual_wage', label: '外发实际工资', shortLabel: '外发实际', editable: true, type: 'number' },
    { field: 'outsource_wage_balance', label: '外发人工结余', shortLabel: '外发结余', editable: false, type: 'number', calculated: true, formula: '外发计划工资 - 外发实际工资' },
    { field: 'outsource_balance_ratio', label: '外发结余比例', shortLabel: '外发比例', editable: false, type: 'ratio', calculated: true, formula: '外发人工结余 / 外发产值' },
  ]},
```

- [ ] **Step 2: 更新 ALL_DEPARTMENTS**

将 `bags_color: '胶袋/配色'` 替换为：
```javascript
  bags: '胶袋部', color: '配色部', blister: '吸塑部',
```
保留 `electronic: '电子部'`（已存在）。删除旧的 `bags_color` 和 `blister: '吸塑'`。

- [ ] **Step 3: 新增 SMALL_DEPARTMENTS 常量**

在 `BALANCE_DEPARTMENTS` 之后添加：
```javascript
const SMALL_DEPARTMENTS = { bags: '胶袋部', color: '配色部', blister: '吸塑部', electronic: '电子部' };
```

- [ ] **Step 4: 移除 loadWorkshops 中的硬编码过滤**

在 `DeptRecordsPage` 的 `loadWorkshops` 方法（约第710行），将硬编码的 `allowedWorkshops` 过滤改为按部门动态获取：

```javascript
    async loadWorkshops() {
      try {
        const res = await API.get('/workshops', { department: this.dept });
        this.workshopList = (res.data || res || [])
          .map(w => ({ id: w.id, name: w.name, region: w.region, company: w.company, sort_order: w.sort_order }));
      } catch (err) { console.error('Failed to load workshops', err); }
    },
```

去掉 `allowedWorkshops` 过滤，因为 API 已经按 `department` 参数过滤了正确的车间。

- [ ] **Step 5: 更新 isDeptPage 和 currentDept 计算属性**

在主应用的 `computed` 中（约第3687行）：

```javascript
    isDeptPage() {
      return ['/beer', '/print', '/assembly', '/bags', '/color', '/blister', '/electronic'].includes(this.currentRoute);
    },
    currentDept() {
      const deptMap = { '/beer': 'beer', '/print': 'print', '/assembly': 'assembly',
        '/bags': 'bags', '/color': 'color', '/blister': 'blister', '/electronic': 'electronic' };
      return deptMap[this.currentRoute] || '';
    },
```

- [ ] **Step 6: 更新 BREADCRUMB_MAP**

在 `BREADCRUMB_MAP`（约第3580行）中添加：
```javascript
  '/bags': '三工结余 / 胶袋部',
  '/color': '三工结余 / 配色部',
  '/blister': '三工结余 / 吸塑部',
  '/electronic': '三工结余 / 电子部',
  '/small-summary': '结余收支汇总 / 小部门汇总',
```

- [ ] **Step 7: Commit**

```bash
git add public/js/app.js
git commit -m "feat: 前端小部门配置 + 路由映射"
```

---

### Task 6: 侧边栏导航

**Files:**
- Modify: `public/js/app.js:3604-3632` (sidebar template)

- [ ] **Step 1: 在三工结余组（装配部之后、结余收支汇总之前）添加4个小部门菜单**

在 `<a class="menu-item" ... @click="navigate('/assembly')">` 之后添加：

```html
            <a class="menu-item" :class="{ active: currentRoute === '/bags' }" @click="navigate('/bags')">
              <span class="icon">🛍️</span>
              <span v-show="!sidebarCollapsed">胶袋部</span>
            </a>
            <a class="menu-item" :class="{ active: currentRoute === '/color' }" @click="navigate('/color')">
              <span class="icon">🎨</span>
              <span v-show="!sidebarCollapsed">配色部</span>
            </a>
            <a class="menu-item" :class="{ active: currentRoute === '/blister' }" @click="navigate('/blister')">
              <span class="icon">📦</span>
              <span v-show="!sidebarCollapsed">吸塑部</span>
            </a>
            <a class="menu-item" :class="{ active: currentRoute === '/electronic' }" @click="navigate('/electronic')">
              <span class="icon">💡</span>
              <span v-show="!sidebarCollapsed">电子部</span>
            </a>
```

- [ ] **Step 2: 在结余收支汇总的子菜单中添加"小部门汇总"**

在 `<a class="menu-item sub-item" ... @click="navigate('/summary')">大车间汇总</a>` 之后添加：

```html
                <a class="menu-item sub-item" :class="{ active: currentRoute === '/small-summary' }" @click="navigate('/small-summary')">
                  <span class="icon">📋</span>
                  小部门汇总
                </a>
```

- [ ] **Step 3: Commit**

```bash
git add public/js/app.js
git commit -m "feat: 侧边栏新增小部门导航 + 小部门汇总入口"
```

---

### Task 7: 公式配置 Tab 扩展

**Files:**
- Modify: `public/js/app.js:2112` (FormulaConfig 的部门 radio-group)
- Modify: `public/js/app.js:2364` (重算历史的部门选择)
- Modify: `public/js/app.js:2437` (FormulaConfig data 中的 BALANCE_DEPARTMENTS)

- [ ] **Step 1: 创建 ALL_BALANCE_DEPARTMENTS 常量**

在 `SMALL_DEPARTMENTS` 之后添加：
```javascript
// 所有参与结余计算的部门（三工 + 小部门，用于公式配置等）
const ALL_BALANCE_DEPARTMENTS = { ...BALANCE_DEPARTMENTS, ...SMALL_DEPARTMENTS };
```

- [ ] **Step 2: 修改 FormulaConfig 使用 ALL_BALANCE_DEPARTMENTS**

将 FormulaConfig 组件中所有引用 `BALANCE_DEPARTMENTS` 的地方改为 `ALL_BALANCE_DEPARTMENTS`：

- 第2112行：radio-group 改为 `v-for="(label, key) in ALL_BALANCE_DEPARTMENTS"`
- 第2364行：el-option 改为 `v-for="(label, key) in ALL_BALANCE_DEPARTMENTS"`
- 第2437行：data 中改为 `ALL_BALANCE_DEPARTMENTS`

- [ ] **Step 3: 更新数据锁定组件中的部门列表**

DataLocks 组件中引用 `BALANCE_DEPARTMENTS` 的地方（约第3252/3268/3286行），改为 `ALL_BALANCE_DEPARTMENTS`。

- [ ] **Step 4: 更新模块授权对话框**

在 UserManagementPage 的模块授权对话框（约第1896行）中，在现有3个部门 checkbox 后添加4个小部门：
```html
            <el-checkbox label="bags">胶袋部</el-checkbox>
            <el-checkbox label="color">配色部</el-checkbox>
            <el-checkbox label="blister">吸塑部</el-checkbox>
            <el-checkbox label="electronic">电子部</el-checkbox>
            <el-checkbox label="small-summary">小部门汇总</el-checkbox>
```

- [ ] **Step 5: Commit**

```bash
git add public/js/app.js
git commit -m "feat: 公式配置/数据锁定/模块授权支持小部门"
```

---

### Task 8: 汇总路由隔离 + 小部门汇总 API

**Files:**
- Modify: `routes/summary.js`

**关键问题**：现有 `/dashboard`、`/monthly`、`/detail` 接口都遍历 `Object.entries(DEPT_CONFIG)`。添加4个新部门后，小部门会混入三工汇总，导致数据错误。必须做隔离。

- [ ] **Step 1: 定义部门分组常量**

在 `routes/summary.js` 顶部（`EXPENSE_CATEGORIES` 之前）添加：
```javascript
// 三工主部门（大车间汇总/看板仅包含这3个）
const MAIN_DEPTS = ['beer', 'print', 'assembly'];
// 小部门
const SMALL_DEPTS = ['bags', 'color', 'blister', 'electronic'];
```

- [ ] **Step 2: 将现有接口的 DEPT_CONFIG 遍历限定为 MAIN_DEPTS**

在以下4个接口中，将 `for (const [dept, config] of Object.entries(DEPT_CONFIG))` 改为仅遍历主部门：

```javascript
// 辅助函数（文件顶部）
function getMainDeptEntries() {
  return MAIN_DEPTS.map(d => [d, DEPT_CONFIG[d]]).filter(([, c]) => c);
}
```

需要修改的接口：
- `GET /overview`（约第25行）：`Object.entries(DEPT_CONFIG)` → `getMainDeptEntries()`
- `GET /dashboard`（约第84、118、155、180行）：4处 `Object.entries(DEPT_CONFIG)` → `getMainDeptEntries()`
- `GET /detail`（约第222行，无dept参数时的总览模式）：`Object.entries(DEPT_CONFIG)` → `getMainDeptEntries()`，第326行 `departments: ['beer', 'print', 'assembly']` 改为 `departments: MAIN_DEPTS`
- `GET /monthly`（约第537行）：`Object.entries(DEPT_CONFIG)` → `getMainDeptEntries()`

`GET /daily` 不需要改（它接收 dept 参数，已通过 `DEPT_CONFIG[dept]` 校验）。

- [ ] **Step 3: 修复 /dashboard 的 monthlyTrend 默认值**

第170行 `{ beer_ratio: 0, print_ratio: 0, assembly_ratio: 0, ...data }` 改为动态生成：
```javascript
const defaultRatios = {};
MAIN_DEPTS.forEach(d => { defaultRatios[`${d}_ratio`] = 0; });
// ...
const monthlyTrend = Object.entries(trendMap).sort().map(([month, data]) => ({
  month, ...defaultRatios, ...data
}));
```

- [ ] **Step 4: 添加 GET /api/summary/small-monthly**

在 `/monthly` 路由之后、`module.exports` 之前添加。逻辑与 `/monthly` 基本相同，但遍历 `SMALL_DEPTS`，合计行标签改为 `'小部门合计'`：

```javascript
// GET /api/summary/small-monthly?month=2026-03
router.get('/small-monthly', authenticate, asyncHandler(async (req, res) => {
  const { month } = req.query;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: '无效月份格式' });

  const [year, mon] = month.split('-').map(Number);
  const startDate = `${year}-${String(mon).padStart(2, '0')}-01`;
  const endDate = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, '0')}-01`;
  const prevMon = mon === 1 ? 12 : mon - 1;
  const prevYear = mon === 1 ? year - 1 : year;
  const prevStart = `${prevYear}-${String(prevMon).padStart(2, '0')}-01`;
  const prevEnd = startDate;

  const shownSharedFields = ['worker_wage', 'supervisor_wage', 'rent', 'utility_fee', 'social_insurance', 'tax'];
  const otherSharedFields = ['tool_investment', 'equipment', 'renovation', 'misc_fee', 'shipping_fee'];

  const departments = [];
  const prevDepartments = [];

  for (const dept of SMALL_DEPTS) {
    const config = DEPT_CONFIG[dept];
    if (!config) continue;
    const tableName = config.tableName;
    const expenseFields = getExpenseFields(dept);
    const uniqueExpenseFields = expenseFields.filter(f => !shownSharedFields.includes(f) && !otherSharedFields.includes(f));
    const otherFields = [...otherSharedFields.filter(f => expenseFields.includes(f)), ...uniqueExpenseFields];
    const otherExpr = otherFields.length > 0 ? otherFields.map(f => `SUM(COALESCE(${f}, 0))`).join(' + ') : '0';
    const totalExpenseExpr = expenseFields.length > 0 ? expenseFields.map(f => `SUM(COALESCE(${f}, 0))`).join(' + ') : '0';

    const sql = `SELECT
      SUM(COALESCE(daily_output, 0)) AS daily_output,
      ${shownSharedFields.map(f => `SUM(COALESCE(${f}, 0)) AS ${f}`).join(', ')},
      ${otherExpr} AS other_expense,
      ${totalExpenseExpr} AS total_expense
      FROM ${tableName} r
      JOIN workshops w ON r.workshop_id = w.id
      WHERE r.record_date >= ? AND r.record_date < ?`;

    const [curr = {}] = await getAll(sql, [startDate, endDate]);
    curr.balance = (curr.daily_output || 0) - (curr.total_expense || 0);
    curr.balance_ratio = curr.daily_output > 0 ? curr.balance / curr.daily_output : 0;
    curr.dept = dept;
    curr.label = config.label;
    departments.push(curr);

    const [prev = {}] = await getAll(sql, [prevStart, prevEnd]);
    prev.balance = (prev.daily_output || 0) - (prev.total_expense || 0);
    prev.balance_ratio = prev.daily_output > 0 ? prev.balance / prev.daily_output : 0;
    prev.dept = dept;
    prev.label = config.label;
    prevDepartments.push(prev);
  }

  const calcTotal = (depts) => {
    const t = { dept: 'total', label: '小部门合计' };
    const numKeys = ['daily_output', ...shownSharedFields, 'other_expense', 'total_expense', 'balance'];
    numKeys.forEach(k => { t[k] = depts.reduce((sum, d) => sum + (Number(d[k]) || 0), 0); });
    t.balance_ratio = t.daily_output > 0 ? t.balance / t.daily_output : 0;
    return t;
  };

  const currentTotal = calcTotal(departments);
  const prevTotal = calcTotal(prevDepartments);

  const calcComparison = (curr, prev) => {
    const pctChange = (c, p) => p > 0 ? (c - p) / p : null;
    return {
      dept: curr.dept, label: curr.label,
      output_change: (curr.daily_output || 0) - (prev.daily_output || 0),
      output_change_pct: pctChange(curr.daily_output, prev.daily_output),
      expense_change: (curr.total_expense || 0) - (prev.total_expense || 0),
      expense_change_pct: pctChange(curr.total_expense, prev.total_expense),
      balance_change: (curr.balance || 0) - (prev.balance || 0),
      balance_change_pct: pctChange(curr.balance, prev.balance),
      ratio_change: (curr.balance_ratio || 0) - (prev.balance_ratio || 0),
      prev_balance: prev.balance || 0, curr_balance: curr.balance || 0
    };
  };

  const comparison = departments.map((d, i) => calcComparison(d, prevDepartments[i]));
  comparison.push(calcComparison(currentTotal, prevTotal));

  res.json({
    current: { departments, total: currentTotal },
    comparison: { departments: comparison, prev_month: `${prevYear}-${String(prevMon).padStart(2, '0')}` }
  });
}));
```

注意：边角料(收入)的部门，balance 计算应为 `产值 + income - expense`。但汇总 API 直接读取数据库中已存储的 `balance` 字段（CRUD 时已由 calc.js 计算好），所以汇总逻辑无需额外处理。

- [ ] **Step 5: Commit**

```bash
git add routes/summary.js
git commit -m "feat: 汇总路由隔离主/小部门 + 小部门月度汇总 API"
```

---

### Task 9: 前端小部门汇总页面

**Files:**
- Modify: `public/js/app.js` (主应用 template + SummaryPage 或新组件)

小部门汇总的 UI 结构参考大车间汇总的"按日汇总"和"按月汇总"视图。

- [ ] **Step 1: 创建 SmallSummaryPage 组件**

新增一个 Vue 组件 `SmallSummaryPage`，结构参考 `SummaryPage` 但：
- 按日汇总：部门选择按钮改为 bags/color/blister/electronic
- 按月汇总：调用 `/api/summary/small-monthly`，合计行标签为"小部门合计"
- 不需要可视化看板（小部门数据量小）

```javascript
const SmallSummaryPage = {
  template: `<div class="summary-page">
    <div class="main-tab-bar">
      <button class="main-tab-btn" :class="{ active: tableView === 'daily' }" @click="switchTableView('daily')">按日汇总</button>
      <button class="main-tab-btn" :class="{ active: tableView === 'monthly' }" @click="switchTableView('monthly')">按月汇总</button>
    </div>
    <!-- 按日汇总：复用与大车间相同的结构 -->
    <!-- 按月汇总：复用与大车间相同的结构 -->
  </div>`,
  // ...
};
```

由于 SmallSummaryPage 的逻辑与 SummaryPage 的按日/按月汇总高度相似，可以从 SummaryPage 复制相关代码，修改部门列表和 API 调用路径。

- [ ] **Step 2: 注册组件和路由**

在主应用中：
```javascript
app.component('small-summary-page', SmallSummaryPage);
```

在主应用 template 的 page-content 中添加：
```html
<small-summary-page v-else-if="currentRoute === '/small-summary'" />
```

- [ ] **Step 3: 添加 API 封装**

在 `public/js/api.js` 中添加：
```javascript
async getSmallSummaryMonthly(params) { return this.get('/summary/small-monthly', params); },
```

（按日汇总可复用现有 `getSummaryDaily`，因为 `/daily` 接口已支持新部门。）

- [ ] **Step 4: Commit**

```bash
git add public/js/app.js public/js/api.js
git commit -m "feat: 小部门汇总前端页面"
```

---

### Task 10: 集成测试 + 验证

- [ ] **Step 1: 执行数据库建表 SQL**

告知用户执行 CREATE TABLE + INSERT workshops + CREATE INDEX。

- [ ] **Step 2: 重启服务验证启动**

```bash
cd "D:/03-AI related/02-Business data statistics" && npm start
```

检查控制台无报错，`[配置校验] 所有部门费用字段配置校验通过` 包含新部门。

- [ ] **Step 3: 验证明细表 CRUD**

浏览器访问 `http://localhost:6001/#/bags`，验证：
- 侧边栏显示4个小部门
- 明细表列正确（共享字段 + 独有字段）
- 新增一条记录，车间默认为"小部门"
- 编辑、删除功能正常
- 对4个部门分别测试

- [ ] **Step 4: 验证小部门汇总**

访问 `http://localhost:6001/#/small-summary`，验证：
- 按日汇总可切换4个部门
- 按月汇总显示4个部门数据 + 小部门合计行

- [ ] **Step 5: 验证公式配置**

访问系统设置 → 公式配置，验证：
- Tab 栏显示7个部门（啤机/印喷/装配 + 胶袋/配色/吸塑/电子）
- 可为小部门新增公式

- [ ] **Step 6: 验证 Excel 导入导出**

对胶袋部测试 Excel 导出，检查列头是否与字段定义一致。

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: 小部门结余模块完成（胶袋/配色/吸塑/电子）"
```
