# 公式选择器字段5分类 — 设计规范

**日期：** 2026-04-03
**分支：** feat/summary-table-redesign
**背景：** 新增公式弹窗的字段选择面板目前只有3个分组，存在两个 bug（部门独有费用字段丢失、income 字段混入非结余分组），且缺少 config 计算字段和收入字段两个分组。本次将面板重构为5个语义清晰的分组，并同步修正电子部 config.js 标记。

---

## 一、字段标记体系

config.js 中每个字段通过布尔属性标记角色：

| 标记 | 含义 |
|---|---|
| `expense: true` | 参与结余公式，被减项（成本/费用） |
| `income: true` | 参与结余公式，被加项（收入/加回项） |
| `calc: true` | 系统自动计算（与 input 互斥） |
| `input: true` | 可录入字段 |
| `fixedExpense: true` | 可在固定费用配置里预设的字段（与分类无关） |

**标记互斥规则：**
- `expense` 和 `income` 不共存于同一字段（一个字段只能是加项或减项）
- `calc` 和 `input` 不共存

---

## 二、5分类定义与判断优先级

判断顺序（从上到下，命中即停止）：

```
1. income: true                          → 分类四：收入字段
2. expense: true                         → 分类一：结余费用字段
3. calc: true（expense/income 均为 false）→ 分类三：不参与结余公式计算字段
4. input: true（expense/income 均为 false）→ 分类二：不参与结余公式非计算字段
5. 常量                                  → 分类五：常量字段
```

### 分类一：结余费用字段

参与结余公式的被减项，包含：
- 所有 `expense: true` 的输入字段（共享 + 部门独有）
- 所有 `expense: true` 的计算字段（如车衣部的 `tax_expense`、`hk_daily_expense`，电子部的 `hk_expense`、`transport_packing_fee`、`hq_allocation`）

**装配部例外**：`planned_wage_tax`（计划总工资含*1.13）在 config.js 标记为 `expense: false`，但业务上参与清溪结余公式（作为被减数），在前端分类逻辑里硬编码处理：
```js
if (dept === 'assembly' && field.field === 'planned_wage_tax') → 归入分类一
```

### 分类二：不参与结余公式非计算字段

`input: true, expense: false, income: false` 的所有录入字段，如人数、产值、台数、工时等。

### 分类三：不参与结余公式计算字段

两类字段合并：
1. config.js 中 `calc: true, expense: false, income: false` 的系统计算字段（如开机率、总工资占产值%、人均产值等）
2. 用户在公式配置页保存的其他公式结果（从 `this.formulas` 加载，排除正在编辑的公式本身）

### 分类四：收入字段

`income: true` 的字段，参与结余公式但为正向加项：
- 印喷部：可收回工资、车发部回收工资、可收回印尼工资、可收回工具费、可回收油漆金额
- 装配部：可回收电费
- 电子部：帮定结余、贴片结余、插件结余、生产工资结余、生产工资结余(含1.13)、预估车间利润
- 胶袋部/吸塑部：边角料(收入)
- 车衣部：其他收入

### 分类五：常量字段

用户定义的按月生效常量，从 `constantNames` 加载，**已实现，不做改动**。

---

## 三、config.js 修改：电子部9个字段

**修改文件：** `modules/balance/config.js`，仅改 `electronic` 部门的 uniqueFields。

**新增 `income: true` 的6个字段（正向加项）：**

| field | label | 改动 |
|---|---|---|
| bonding_balance | 帮定结余 | 加 `income: true` |
| smt_balance | 贴片结余 | 加 `income: true` |
| plugin_balance | 插件结余 | 加 `income: true` |
| production_wage_balance | 生产工资结余 | 加 `income: true` |
| production_wage_balance_tax | 生产工资结余(含1.13) | 加 `income: true` |
| estimated_workshop_profit | 预估车间利润 | 加 `income: true` |

**新增 `expense: true` 的3个字段（负向减项，已是 calc）：**

| field | label | 改动 |
|---|---|---|
| hk_expense | 香港支出 | 加 `expense: true` |
| transport_packing_fee | 运输包装费 | 加 `expense: true` |
| hq_allocation | 总部支出 | 加 `expense: true` |

**安全说明：** calc.js 的主计算路径（DB 公式）不读取这些标记；电子部 fallback 逻辑（`calculateRecordHardcoded` 第363-408行）已硬编码字段名，不受标记变更影响。改标记不会影响任何计算结果。

---

## 四、前端 app.js 改动

**修改文件：** `public/js/app.js`，`FormulaConfigPage` 组件的 computed 属性和模板。

### 4.1 computed 属性：3个改为5个

**删除：**
- `filteredBalanceExpenseFields`
- `filteredNonBalanceExpenseFields`
- `filteredCalcFields`

**新增：**

```js
// 分类一：结余费用字段
filteredExpenseFields() {
  // 共享 expense 字段 + 部门独有 expense 字段（不用 f.editable 过滤）
  // + 装配部 planned_wage_tax 例外处理
}

// 分类二：不参与结余公式非计算字段
filteredNonExpenseInputFields() {
  // input: true, expense: false, income: false
  // 共享 + 部门独有，去重
}

// 分类三：不参与结余公式计算字段
filteredCalcFields() {
  // config calc 字段（calc: true, expense: false, income: false）
  // + this.formulas 里其他用户公式（排除自身）
}

// 分类四：收入字段
filteredIncomeFields() {
  // income: true 的所有字段（共享 + 部门独有）
}

// 分类五：常量字段（已有 constantNames，不动）
```

**Bug 修复：** 去掉 `f.editable` 过滤条件，改为直接遍历 `uniqueFields`，通过 `expense`/`income`/`calc` 标记分类。

### 4.2 模板：5个分组面板

| 顺序 | 分组名 | 背景色 | 空时 |
|---|---|---|---|
| 1 | 结余费用字段 | `#fdf0f0`（现有红色系） | 始终显示 |
| 2 | 收入字段 | `#f0faf5`（青绿色系） | `v-if` 隐藏 |
| 3 | 不参与结余公式非计算字段 | `#fef9ec`（现有黄色系） | 始终显示 |
| 4 | 不参与结余公式计算字段 | `#f0f4ff`（蓝色系） | `v-if` 隐藏 |
| 5 | 常量（按月生效） | `#fff8e1`（现有黄色系） | `v-if` 隐藏（已有） |

字段 badge 样式与现有一致：圆角标签，点击调用 `addFieldToken(f.field)`。字段名优先用 `shortLabel`，其次 `label`。

---

## 五、改动文件清单

| 文件 | 改动内容 |
|---|---|
| `modules/balance/config.js` | 电子部9个字段新增标记 |
| `public/js/app.js` | FormulaConfigPage：3个 computed 改为5个，模板3分组改为5分组 |

**不改动：** `modules/balance/calc.js`、`routes/settings.js`、`db/init.sql`、`public/css/theme.css`

---

## 六、验证步骤

1. 打开啤机部公式配置 → 新增公式弹窗 → 确认分类一显示共享11个费用字段 + 独有费用字段（杂工工资/天、机器维修等），分类二显示台数/人数字段，分类三显示 config calc 字段（开机率等）+ 用户公式
2. 打开印喷部 → 确认分类四（收入字段）显示可收回工资等5个字段
3. 打开装配部 → 确认分类一包含计划总工资含*1.13（例外处理），分类四显示可回收电费
4. 打开电子部 → 确认分类一包含香港支出/运输包装费/总部支出，分类四包含帮定结余等6个字段
5. 搜索框输入关键词，确认5个分组均参与过滤
