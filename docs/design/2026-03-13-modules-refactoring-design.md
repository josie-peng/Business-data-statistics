# 模块化重构设计：后端配置收拢到 modules/ 目录

**日期：** 2026-03-13
**方案：** 方案 B（后端统一，前端暂不动）
**目标：** 把分散在多个文件中的后端配置收拢到 `modules/balance/` 目录，为未来新增模块铺路

## 1. 背景

### 1.1 当前问题

系统将从"三工结余"扩展为多个平行模块（人数统计、设备统计、利润统计、接单统计等）。当前配置分散在 4 个文件中，新增字段需要同步修改 4 处：

| # | 文件 | 内容 |
|---|------|------|
| 1 | `utils/dept-config.js` | 字段分类（输入/费用/计算） |
| 2 | `routes/import-export.js` | Excel 中文列名 → 英文字段映射 (COLUMN_MAP) |
| 3 | `utils/calc.js` | 计算公式 |
| 4 | `public/js/app.js` | 前端 UI 字段配置 |

### 1.2 重构目标

- 后端的 #1、#2、#3 合并到同一个目录下
- 新增字段从改 4 处降到改 2 处（`modules/balance/config.js` + `public/js/app.js`）
- 新增模块时只需复制 `modules/balance/` 目录并修改配置
- 功能和行为完全不变（纯内部重构）

## 2. 新目录结构

```
modules/
  balance/                    ← 三工结余模块
    config.js                 ← 合并：字段定义 + 费用标记 + Excel列名别名
    calc.js                   ← 计算公式（从 utils/calc.js 迁移，逻辑不变）
  index.js                    ← 模块注册表 + 兼容层（对外暴露旧接口格式）
utils/
  dept-config.js              ← 删除（被 modules/balance/config.js 替代）
  calc.js                     ← 删除（被 modules/balance/calc.js 替代）
  async-handler.js            ← 保留（与模块无关）
```

## 3. config.js 数据结构

### 3.1 核心设计：每个字段是一个对象

以前字段名散落在多个数组中，现在合并为一个对象数组，通过标记（input/expense/calc）区分角色：

```js
module.exports = {
  key: 'balance',
  label: '三工结余',

  // 所有部门共享的字段
  sharedFields: [
    { field: 'supervisor_count', label: '管工人数', type: 'integer', input: true, expense: false },
    { field: 'worker_count', label: '员工人数', type: 'integer', input: true, expense: false },
    { field: 'daily_output', label: '总产值/天', type: 'number', input: true, expense: false },
    { field: 'worker_wage', label: '员工工资/天', type: 'number', input: true, expense: true },
    { field: 'supervisor_wage', label: '管工工资/天', type: 'number', input: true, expense: true },
    { field: 'rent', label: '房租', type: 'number', input: true, expense: true },
    { field: 'utility_fee', label: '水电费', type: 'number', input: true, expense: true },
    { field: 'tool_investment', label: '工具投资', type: 'number', input: true, expense: true },
    { field: 'equipment', label: '设备', type: 'number', input: true, expense: true },
    { field: 'renovation', label: '装修', type: 'number', input: true, expense: true },
    { field: 'misc_fee', label: '杂费', type: 'number', input: true, expense: true },
    { field: 'shipping_fee', label: '运费', type: 'number', input: true, expense: true },
    { field: 'social_insurance', label: '社保', type: 'number', input: true, expense: true,
      aliases: ['湖南社保'] },
    { field: 'tax', label: '税收', type: 'number', input: true, expense: true,
      aliases: ['湖南税收'] },
  ],

  // 共享计算字段
  sharedCalcFields: [
    { field: 'balance', label: '结余金额', type: 'number', calc: true },
    { field: 'balance_ratio', label: '结余%', type: 'ratio', calc: true },
  ],

  // 导入时需要跳过的 Excel 列名
  skipColumns: ['结余金额', '结余%'],

  departments: {
    beer: {
      tableName: 'beer_records',
      label: '啤机部',
      workshops: ['兴信A', '兴信B', '华登', '邵阳'],
      uniqueFields: [
        // input: true, expense: false — 输入但不扣减
        { field: 'total_machines', label: '总台数', type: 'integer', input: true, expense: false,
          aliases: ['总台数'] },
        { field: 'running_machines', label: '开机台数', type: 'integer', input: true, expense: false },
        { field: 'misc_workers', label: '杂工人数', type: 'integer', input: true, expense: false },
        { field: 'gate_workers', label: '批水口人数', type: 'integer', input: true, expense: false },
        { field: 'run_hours', label: '开机时间', type: 'number', input: true, expense: false },
        { field: 'output_tax_incl', label: '总产值含税', type: 'number', input: true, expense: false,
          aliases: ['不含税产值（含税产值/1.13）', '不含税产值(含税产值/1.13)'] },
        // input: true, expense: true — 输入且扣减
        { field: 'misc_worker_wage', label: '杂工工资/天', type: 'number', input: true, expense: true },
        { field: 'machine_repair', label: '机器维修', type: 'number', input: true, expense: true },
        { field: 'mold_repair', label: '模具维修', type: 'number', input: true, expense: true },
        { field: 'gate_processing_fee', label: '批水口加工费', type: 'number', input: true, expense: true,
          aliases: ['批水口加工费（全包）', '批水口加工费(全包)'] },
        { field: 'assembly_gate_parts_fee', label: '装配批水口配件费', type: 'number', input: true, expense: true,
          aliases: ['装配帮啤机批水口加工配件费用', '装配帮啤机批水口配件费用'] },
        { field: 'recoverable_gate_fee', label: '可回收批水口费', type: 'number', input: true, expense: true,
          aliases: ['可回收外厂批水口加工费'] },
        { field: 'material_supplement', label: '原料补料', type: 'number', input: true, expense: true },
        { field: 'materials', label: '物料', type: 'number', input: true, expense: true },
        // calc: true — 计算字段（不可输入）
        { field: 'machine_rate', label: '开机率', type: 'ratio', calc: true,
          skipAliases: ['开机率'] },
        { field: 'avg_output_per_machine', label: '每台机平均产值', type: 'number', calc: true,
          skipAliases: ['每台机平均产值'] },
        { field: 'wage_ratio', label: '总工资占产值%', type: 'ratio', calc: true,
          skipAliases: ['总工资（包管工）占产值%', '总工资(包管工)占产值%'] },
        { field: 'mold_cost_ratio', label: '模具费用占产值比%', type: 'ratio', calc: true,
          skipAliases: ['模具费用占产值比%'] },
        { field: 'gate_cost_ratio', label: '批水口费用占产值比%', type: 'ratio', calc: true,
          skipAliases: ['批水口费用占产值比%'] },
        { field: 'avg_balance_per_machine', label: '平均每台结余', type: 'number', calc: true,
          skipAliases: ['平均每台结余'] },
      ]
    },
    // print 和 assembly 结构相同，字段不同
    print: { /* ... 完整字段列表在实现时填入 ... */ },
    assembly: { /* ... 完整字段列表在实现时填入 ... */ },
  }
};
```

### 3.2 aliases 和 skipAliases 说明

- `aliases`：Excel 导入时，这些中文列名都映射到同一个英文字段（替代 COLUMN_MAP 的多对一映射）
- `skipAliases`：Excel 导入时，这些列名应被跳过（计算字段，不需要导入）
- 字段的 `label` 本身也自动作为 alias（不需要重复写）

### 3.3 从对象数组推导出旧格式

兼容层通过 filter + map 推导：

```
input: true 的字段  →  uniqueInputFields 数组
expense: true 的字段  →  uniqueExpenseFields 数组
calc: true 的字段  →  uniqueCalcFields 数组
所有 aliases  →  COLUMN_MAP 对象
所有 skipAliases  →  COLUMN_MAP 中的 '_skip_calc' 条目
```

## 4. modules/index.js 兼容层

### 4.1 职责

- 加载所有模块的 config
- 对外导出与旧 `utils/dept-config.js` 完全兼容的接口
- 提供 `getColumnMap(moduleKey)` 生成 COLUMN_MAP
- 提供 `validateConfig()` 启动校验

### 4.2 导出接口

```js
module.exports = {
  // === 兼容旧接口（让路由文件只改 require 路径）===
  DEPT_CONFIG,                  // { beer: { tableName, label, ... }, print: ..., assembly: ... }
  SHARED_INPUT_FIELDS,          // ['supervisor_count', 'worker_count', ...]
  SHARED_CALC_FIELDS,           // ['balance', 'balance_ratio']
  SHARED_EXPENSE_FIELDS,        // ['worker_wage', 'supervisor_wage', ...]
  getAllInputFields(dept),      // [...shared, ...unique input fields, 'remark']
  getAllFields(dept),           // [...shared, ...shared calc, ...unique, ...unique calc, 'remark']
  getExpenseFields(dept),       // [...shared expense, ...unique expense]

  // === 新接口 ===
  MODULES,                      // { balance: { key, label, departments } }
  getColumnMap(moduleKey),      // 生成 COLUMN_MAP 对象
  getModuleConfig(moduleKey, dept),  // 获取某模块某部门的完整配置
  validateConfig(),             // 启动校验
};
```

## 5. calc.js 迁移

### 5.1 文件位置变化

`utils/calc.js` → `modules/balance/calc.js`

### 5.2 代码变化

- 计算逻辑完全不变
- require 路径从 `require('./dept-config')` 改为 `require('../index')`（或直接从 config 中获取费用字段列表）

## 6. 路由文件改动

### 6.1 records.js

```diff
- const { DEPT_CONFIG, getAllInputFields } = require('../utils/dept-config');
- const { calculateRecord } = require('../utils/calc');
+ const { DEPT_CONFIG, getAllInputFields } = require('../modules');
+ const { calculateRecord } = require('../modules/balance/calc');
```

其余代码不变。

### 6.2 import-export.js

```diff
- const { DEPT_CONFIG, getAllInputFields } = require('../utils/dept-config');
- const { calculateRecord } = require('../utils/calc');
+ const { DEPT_CONFIG, getAllInputFields, getColumnMap } = require('../modules');
+ const { calculateRecord } = require('../modules/balance/calc');

- // 中文列名 → 英文字段名映射（基于实际Excel表头）
- const COLUMN_MAP = {
-   '日期': 'record_date',
-   '车间': 'workshop_name',
-   ... (100+ 行)
- };
+ // 从模块配置自动生成
+ const COLUMN_MAP = getColumnMap('balance');
```

REVERSE_COLUMN_MAP 的生成逻辑保持不变（已在模块外，从 COLUMN_MAP 推导）。

### 6.3 summary.js

```diff
- const { DEPT_CONFIG } = require('../utils/dept-config');
+ const { DEPT_CONFIG } = require('../modules');
```

### 6.4 server.js

```diff
- const { validateConfig } = require('./utils/dept-config');
+ const { validateConfig } = require('./modules');
```

## 7. 测试

### 7.1 现有测试迁移

```diff
- const { calculateRecord } = require('../utils/calc');
+ const { calculateRecord } = require('../modules/balance/calc');
```

测试用例不变，跑通即证明计算逻辑无误。

### 7.2 新增兼容性测试

新增 `tests/modules.test.js`，验证兼容层输出与旧配置完全一致：

- `DEPT_CONFIG` 结构正确（包含 tableName, label, uniqueInputFields 等）
- `getAllInputFields('beer')` 返回正确的字段数组
- `getExpenseFields('beer')` 返回正确的费用字段数组
- `getColumnMap('balance')` 包含所有原 COLUMN_MAP 的映射
- `validateConfig()` 不抛错

## 8. 删除的文件

| 文件 | 替代 |
|------|------|
| `utils/dept-config.js` | `modules/balance/config.js` + `modules/index.js` |
| `utils/calc.js` | `modules/balance/calc.js` |

## 9. 不动的文件

| 文件 | 原因 |
|------|------|
| `public/js/app.js` | 前端不动（方案 B 核心约束） |
| `public/css/theme.css` | 样式无关 |
| `db/init.sql` | 数据库不变 |
| `utils/async-handler.js` | 与模块无关 |
| `routes/auth.js` | 不依赖 DEPT_CONFIG |
| `routes/users.js` | 不依赖 DEPT_CONFIG |
| `routes/workshops.js` | 不依赖 DEPT_CONFIG |
| `routes/settings.js` | 不依赖 DEPT_CONFIG |
| `routes/audit-logs.js` | 不依赖 DEPT_CONFIG |
| `routes/backup.js` | 不依赖 DEPT_CONFIG |

## 10. 未来扩展路径

新增模块（如人数统计）时：

1. 创建 `modules/headcount/config.js`（定义字段和别名）
2. 创建 `modules/headcount/calc.js`（定义计算公式）
3. 在 `modules/index.js` 注册新模块
4. 数据库新建对应的表
5. 前端 `app.js` 添加对应的 UI 配置（等做了 API 下发后这步也可省略）
