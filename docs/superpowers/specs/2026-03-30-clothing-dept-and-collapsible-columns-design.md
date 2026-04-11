# 车衣部模块 + 小部门自包含改造 + 折叠列功能

日期: 2026-03-30

## 1. 概述

本次改动包含四个部分:
1. **配色部计算修复** — 外发总利润改自动计算，补上两个利润率公式
2. **小部门自包含改造** — 胶袋/配色/吸塑/电子/车衣使用 `selfContained: true`，字段完全独立定义
3. **新增车衣部模块** — 新建数据表、字段配置、计算逻辑、前端明细表
4. **折叠列功能** — 所有明细表支持列分组折叠（"更多费用 ▶"）

## 2. 配色部计算修复

### 2.1 config.js 变更
- `total_profit`: `input: true` → `calc: true`，添加 `skipAliases: ['总利润', '外发总利润']`

### 2.2 calc.js 变更
```
total_profit = outsource_tax + outsource_profit
profit_ratio_ex_tax = outsource_profit / outsource_output  (除数为0时返回0)
profit_ratio_inc_tax = total_profit / outsource_output      (除数为0时返回0)
```

### 2.3 app.js 变更
- `total_profit`: `editable: true` → `editable: false, calculated: true`

## 3. 小部门自包含改造（方案 B）

### 3.1 原则
- 三大部门（啤机/印喷/装配）**不变**，继续使用 sharedFields 机制
- 小部门（bags/color/blister/electronic/clothing）标记 `selfContained: true`
- selfContained 部门的 `uniqueFields` 包含该部门使用的**全部字段**（人数、产值、工资、费用、计算、外发等）
- 不再从 sharedFields 注入字段

### 3.2 modules/index.js 适配
- `getAllInputFields(dept)`: selfContained 部门只从 uniqueFields 取
- `getExpenseFields(dept)`: selfContained 部门只从 uniqueFields 取
- `getCurrencyFields(dept)`: selfContained 部门只从 uniqueFields 取
- `getFixedExpenseFields(dept)`: selfContained 部门只从 uniqueFields 取
- `getIncomeFields(dept)`: 不变（已经只从 uniqueFields 取）

### 3.3 app.js 适配
- `getDeptColumns(dept)`: selfContained 部门不拼接 SHARED_* 数组，直接按 uniqueFields 顺序输出
- 各小部门的 `DEPT_CONFIG[dept].uniqueFields` 补全所有字段

### 3.4 数据库不变
现有小部门表已包含全部共享列，无需 ALTER TABLE。

### 3.5 现有小部门字段迁移

将 sharedFields 中各小部门实际使用的字段搬入 uniqueFields:

**胶袋部 (bags):**
- 从 sharedFields 搬入: supervisor_count, worker_count, daily_output, worker_wage, supervisor_wage, rent, utility_fee, tool_investment, equipment, renovation, misc_fee, shipping_fee, social_insurance, tax
- 原 uniqueFields 不变

**配色部 (color):**
- 从 sharedFields 搬入: supervisor_count, worker_count, daily_output, worker_wage, supervisor_wage, rent, utility_fee, tool_investment, equipment, renovation, misc_fee, shipping_fee, social_insurance, tax
- 原 uniqueFields 不变

**吸塑部 (blister):**
- 从 sharedFields 搬入: supervisor_count, worker_count, daily_output, worker_wage, supervisor_wage, rent, utility_fee, tool_investment, equipment, renovation, misc_fee, shipping_fee, social_insurance, tax
- 原 uniqueFields 不变

**电子部 (electronic):**
- 从 sharedFields 搬入: supervisor_count, worker_count, daily_output, rent, utility_fee, tool_investment, equipment, renovation, misc_fee
- 排除（不搬入）: worker_wage, supervisor_wage, social_insurance, tax, shipping_fee
- 原 uniqueFields 不变

## 4. 新增车衣部

### 4.1 基本信息
- 部门 key: `clothing`
- 数据表: `clothing_records`
- 车间: 华登B-A（清溪）, 华登B-B（清溪）
- 标记: `selfContained: true`
- 汇率转换: 是

### 4.2 数据库

新建 `clothing_records` 表，包含以下列:

```sql
CREATE TABLE IF NOT EXISTS clothing_records (
  id SERIAL PRIMARY KEY,
  record_date DATE NOT NULL,
  workshop_id INT REFERENCES workshops(id),
  -- 人数
  supervisor_count INT DEFAULT 0,
  misc_workers INT DEFAULT 0,
  worker_count INT DEFAULT 0,
  -- 产值
  daily_output NUMERIC(14,2) DEFAULT 0,
  -- 隐藏但保留
  total_machines INT DEFAULT 0,
  running_machines INT DEFAULT 0,
  machine_rate NUMERIC(8,4) DEFAULT 0,
  other_income NUMERIC(12,2) DEFAULT 0,
  avg_output_per_machine NUMERIC(14,2) DEFAULT 0,
  non_production_wage NUMERIC(12,2) DEFAULT 0,
  -- 工资
  worker_wage NUMERIC(12,2) DEFAULT 0,
  hq_allocation_wage NUMERIC(12,2) DEFAULT 0,
  supervisor_wage NUMERIC(12,2) DEFAULT 0,
  wage_ratio NUMERIC(8,4) DEFAULT 0,
  -- 费用
  rent NUMERIC(12,2) DEFAULT 0,
  utility_fee NUMERIC(12,2) DEFAULT 0,
  raw_material_cost NUMERIC(12,2) DEFAULT 0,
  tax_expense NUMERIC(12,2) DEFAULT 0,
  general_expense NUMERIC(12,2) DEFAULT 0,
  hk_daily_expense NUMERIC(12,2) DEFAULT 0,
  social_insurance_fund NUMERIC(12,2) DEFAULT 0,
  misc_fee NUMERIC(12,2) DEFAULT 0,
  tool_investment NUMERIC(12,2) DEFAULT 0,
  equipment NUMERIC(12,2) DEFAULT 0,
  materials NUMERIC(12,2) DEFAULT 0,
  raw_materials NUMERIC(12,2) DEFAULT 0,
  repair_fee NUMERIC(12,2) DEFAULT 0,
  renovation NUMERIC(12,2) DEFAULT 0,
  outsource_processing NUMERIC(12,2) DEFAULT 0,
  temp_worker_hours NUMERIC(12,2) DEFAULT 0,
  shipping_fee NUMERIC(12,2) DEFAULT 0,
  -- 结余
  balance NUMERIC(14,2) DEFAULT 0,
  balance_ratio NUMERIC(8,4) DEFAULT 0,
  avg_balance_per_machine NUMERIC(14,2) DEFAULT 0,
  -- 备注
  remark TEXT DEFAULT '',
  -- 元数据
  created_by INT,
  updated_by INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clothing_date ON clothing_records(record_date);
CREATE INDEX IF NOT EXISTS idx_clothing_workshop ON clothing_records(workshop_id);
```

新增车间数据:
```sql
INSERT INTO workshops (name, region, department, sort_order) VALUES
  ('华登B-A', '清溪', 'clothing', 1),
  ('华登B-B', '清溪', 'clothing', 2)
ON CONFLICT DO NOTHING;
```

### 4.3 字段配置 (config.js)

```
clothing: {
  tableName: 'clothing_records',
  label: '车衣部',
  workshops: ['华登B-A', '华登B-B'],
  selfContained: true,
  uniqueFields: [
    // 人数
    supervisor_count (integer, input, fixedExpense)
    misc_workers (integer, input)
    worker_count (integer, input)  label: '员工人数(含临时工)'
    // 产值
    daily_output (number, input, currency)
    // 隐藏但保留（collapsible: '更多费用'）
    total_machines (integer, input, collapsible)
    running_machines (integer, input, collapsible)
    machine_rate (ratio, calc, collapsible)
    other_income (number, input, income, currency, collapsible)
    avg_output_per_machine (number, calc, collapsible)
    non_production_wage (number, input, expense, currency, collapsible)
    // 工资
    worker_wage (number, input, expense, currency)
    hq_allocation_wage (number, input, expense, currency, fixedExpense)
    supervisor_wage (number, input, expense, currency, fixedExpense)
    wage_ratio (ratio, calc)
    // 费用（显示）
    raw_material_cost (number, input, expense, currency)
    tax_expense (number, calc, expense)  — 产值 × 3%
    general_expense (number, input, expense, currency)
    hk_daily_expense (number, calc, expense)  — 产值 × 1%
    social_insurance_fund (number, input, expense, currency)
    misc_fee (number, input, expense, currency)
    tool_investment (number, input, expense, currency)
    equipment (number, input, expense, currency)
    materials (number, input, expense, currency)
    raw_materials (number, input, expense, currency)
    repair_fee (number, input, expense, currency)
    renovation (number, input, expense, currency)
    outsource_processing (number, input, expense, currency)
    temp_worker_hours (number, input, expense, currency)
    shipping_fee (number, input, expense, currency)
    // 费用（折叠）— 用 collapsible 标记
    rent (number, input, expense, currency, fixedExpense, collapsible)
    utility_fee (number, input, expense, currency, fixedExpense, collapsible)
    // 结余
    balance (number, calc)
    balance_ratio (ratio, calc)
    avg_balance_per_machine (number, calc, collapsible)
    // 备注
    remark
  ]
}
```

### 4.4 计算逻辑 (calc.js)

```
// 自动计算费用
tax_expense = daily_output * 0.03
hk_daily_expense = daily_output * 0.01

// 结余 = 产值 + 其他收入 - 全部费用
balance = daily_output + other_income - SUM(所有 expense:true 字段)

// 比率
machine_rate = running_machines / total_machines
avg_output_per_machine = daily_output / running_machines
wage_ratio = (non_production_wage + worker_wage + supervisor_wage) / daily_output
balance_ratio = balance / daily_output
avg_balance_per_machine = balance / running_machines
```

### 4.5 固定费用配置

通过 formula_constants 表配置（module = 'balance_fixed_clothing'）:

| 配置项 | name | 说明 |
|--------|------|------|
| 管工人数 | supervisor_count | 直接代入 |
| 管工底薪 | gw_base_salary | 含后勤工资 |
| 管工奖金 | gw_bonus | 后勤奖金 |
| 总部分摊 | hq_allocation_wage_total | 月总额 |
| 上班天数 | work_days | 当月上班天数 |
| 房租 | rent_daily | 每天房租（直接代入） |
| 水电费 | utility_daily | 每天水电（直接代入） |

注意: 房租和水电是"每天固定值"直接代入，不像其他部门需要"月总额/天数"。

## 5. 折叠列功能

### 5.1 机制

- 字段定义中添加 `collapsible: '组名'` 标记
- 同一组名的字段在表格中连续排列
- 在折叠组的位置显示一个窄列（约30px），带 ▶/◀ 图标和竖向文字"更多费用"
- 点击后展开/收起该组所有列
- 默认状态: 收起
- 折叠状态存 localStorage（key: `collapse_${dept}_${groupName}`），刷新后保持

### 5.2 各部门的折叠配置

**三大部门（啤机/印喷/装配）:**
- 共有费用中的以下字段归入"更多费用"组:
  - rent, utility_fee, tool_investment, equipment, renovation, misc_fee, shipping_fee, social_insurance, tax
- 在 SHARED_EXPENSE 数组中标记 collapsible

**胶袋部 (bags):**
- selfContained，在对应字段上标记 collapsible:
  - rent, utility_fee, tool_investment, equipment, renovation, misc_fee, shipping_fee, social_insurance, tax

**配色部 (color):**
- selfContained，折叠:
  - rent, utility_fee, tool_investment, equipment, renovation, misc_fee, shipping_fee, social_insurance, tax

**吸塑部 (blister):**
- selfContained，折叠:
  - rent, utility_fee, tool_investment, equipment, renovation, misc_fee, shipping_fee, social_insurance, tax

**电子部 (electronic):**
- selfContained，折叠:
  - rent, utility_fee, tool_investment, equipment, renovation, misc_fee

**车衣部 (clothing):**
- selfContained，折叠（全部归入一个"更多费用"组）:
  - total_machines, running_machines, machine_rate, other_income, avg_output_per_machine, non_production_wage
  - rent, utility_fee
  - avg_balance_per_machine

### 5.3 前端实现

**getDeptColumns() 修改:**
- 遍历字段列表，将 collapsible 字段收集到组中
- 在组的位置插入一个虚拟的 `{ field: '_collapse_更多费用', type: 'collapse', group: '更多费用' }` 列
- 折叠时隐藏组内所有列，只显示触发列
- 展开时显示所有列，触发列图标变为 ◀

**CSS (theme.css):**
- `.collapse-trigger-col`: 宽度 30px，背景色与表头一致，cursor: pointer
- `.collapse-trigger-col .label`: 竖向文字，writing-mode: vertical-rl
- 过渡动画: 简单的列显示/隐藏即可

### 5.4 折叠列与 Excel 导出

- 导出时始终导出全部列（包括折叠中的列），不受折叠状态影响
- 导入时全部列都可映射，不受折叠状态影响

## 6. 前端路由与导航

### 6.1 app.js 注册

- `SMALL_DEPARTMENTS` 添加 `clothing: '车衣部'`
- `ALL_BALANCE_DEPARTMENTS` 自动包含
- `BREADCRUMB_MAP` 添加 `'/clothing': '三工结余 / 车衣部'`
- `isDeptPage` 添加 `'/clothing'`
- `deptMap` 添加 `'/clothing': 'clothing'`

### 6.2 侧边栏

在电子部下方、汇总前添加:
```html
<a class="menu-item" :class="{ active: currentRoute === '/clothing' }" @click="navigate('/clothing')">
  <span class="icon">👔</span>
  <span v-show="!sidebarCollapsed">车衣部</span>
</a>
```

## 7. 不涉及的部分

- 三大部门（啤机/印喷/装配）的字段定义和计算逻辑不变
- Excel 导入导出逻辑不变（COLUMN_MAP 自动从字段定义生成）
- 汇总表不变
- 搪胶部暂不添加
- 邵阳兴信车间暂不添加
