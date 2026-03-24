# 小部门结余模块设计

## 概述

在现有三工结余模块（啤机/印喷/装配）基础上，扩展4个小部门：胶袋部、配色部、吸塑部、电子部。复用现有架构（config.js 字段体系 + DeptRecordsPage 组件 + records/import-export 路由），新增小部门汇总。

## 方案：扩展现有 balance 模块

不新建独立模块，直接在 `modules/balance/config.js` 中添加4个部门定义，复用全部后端路由和前端组件。

### 理由
- 明细表结构一致（日期+车间+字段+结余）
- `DeptRecordsPage` 通过 `dept` prop 驱动，天然支持新部门
- `routes/records.js` 的 `/:dept/records` CRUD 自动适用
- `routes/import-export.js` 的 COLUMN_MAP 自动生成

## 部门配置

| 部门 | key | 数据表 | 车间 | 说明 |
|------|-----|--------|------|------|
| 胶袋部 | `bags` | `bags_records` | 小部门 | 有机台、边角料(收入) |
| 配色部 | `color` | `color_records` | 小部门 | 无机台、无杂工 |
| 吸塑部 | `blister` | `blister_records` | 小部门 | 有机台、边角料(收入) |
| 电子部 | `electronic` | `electronic_records` | 登信 | 结构差异大，有子部门结余 |

## 字段设计

### 共享字段（复用现有 sharedFields）

所有4个小部门复用：supervisor_count, worker_count, daily_output, worker_wage, supervisor_wage, rent, utility_fee, tool_investment, equipment, renovation, misc_fee, shipping_fee, social_insurance, tax

某部门不用的字段留空即可。

### 胶袋部 uniqueFields

| 字段名 | 标签 | 类型 | 输入/计算 | 费用 |
|--------|------|------|----------|------|
| total_machines | 总台数 | integer | 输入 | - |
| running_machines | 开机台数 | integer | 输入 | - |
| machine_rate | 开机率 | ratio | 计算 | - |
| misc_workers | 杂工人数 | integer | 输入 | - |
| per_capita_output | 人均产值 | number | 计算 | - |
| scrap_income | 边角料(收入) | number | 输入 | **收入(负费用)** |
| avg_output_per_machine | 每台机平均产值 | number | 计算 | - |
| misc_worker_wage | 杂工工资/天 | number | 输入 | 费用 |
| wage_ratio | 总工资占产值% | ratio | 计算 | - |
| raw_material_cost | 原料成本 | number | 输入 | 费用 |
| diesel | 柴油 | number | 输入 | 费用 |
| machine_repair | 机器维修 | number | 输入 | 费用 |
| material_supplement | 原料补料/损耗 | number | 输入 | 费用 |
| gate_processing_fee | 批水口加工费 | number | 输入 | 费用 |
| avg_balance_per_machine | 平均每台结余 | number | 计算 | - |
| outsource_output | 外发产值 | number | 输入 | - |
| outsource_profit | 利润 | number | 输入 | - |
| outsource_profit_ratio | 占比率 | ratio | 计算 | - |

结余公式：`结余 = 产值 + 边角料(收入) - 所有费用`

### 配色部 uniqueFields

| 字段名 | 标签 | 类型 | 输入/计算 | 费用 |
|--------|------|------|----------|------|
| wage_ratio | 总工资占产值% | ratio | 计算 | - |
| hq_allocation | 总部分摊 | number | 输入 | 费用 |
| raw_material_cost | 原料成本 | number | 输入 | 费用 |
| color_powder | 色粉 | number | 输入 | 费用 |
| hk_expense | 税收/香港开支 | number | 输入 | 费用 |
| outsource_output | 外发产值 | number | 输入 | - |
| outsource_tax | 税收(外发) | number | 输入 | - |
| outsource_profit | 利润 | number | 输入 | - |
| total_profit | 总利润 | number | 输入 | - |
| profit_ratio_ex_tax | 不含税比润 | ratio | 计算 | - |
| profit_ratio_inc_tax | 含税总比润 | ratio | 计算 | - |

### 吸塑部 uniqueFields

| 字段名 | 标签 | 类型 | 输入/计算 | 费用 |
|--------|------|------|----------|------|
| total_machines | 总台数 | integer | 输入 | - |
| running_machines | 开机台数 | integer | 输入 | - |
| machine_rate | 开机率 | ratio | 计算 | - |
| misc_workers | 杂工人数 | integer | 输入 | - |
| avg_output_per_machine | 每台机平均产值 | number | 计算 | - |
| misc_worker_wage | 杂工工资/天 | number | 输入 | 费用 |
| wage_ratio | 总工资占产值% | ratio | 计算 | - |
| raw_material | 原料 | number | 输入 | 费用 |
| raw_material_ratio | 原料比率 | ratio | 计算 | - |
| supplies | 用料 | number | 输入 | 费用 |
| materials | 物料 | number | 输入 | 费用 |
| machine_repair | 机器维修 | number | 输入 | 费用 |
| gate_processing_fee | 批水口加工费 | number | 输入 | 费用 |
| material_supplement | 原料补料 | number | 输入 | 费用 |
| cartons | 纸箱 | number | 输入 | 费用 |
| plastic_bags | 胶袋 | number | 输入 | 费用 |
| scrap_income | 边角料(收入) | number | 输入 | **收入(负费用)** |
| avg_balance_per_machine | 平均每台结余 | number | 计算 | - |
| outsource_output | 外发产值 | number | 输入 | - |
| outsource_profit | 外发利润 | number | 输入 | - |
| outsource_profit_ratio | 外发利润率% | ratio | 计算 | - |

结余公式：`结余 = 产值 + 边角料(收入) - 所有费用`

### 电子部 uniqueFields

| 字段名 | 标签 | 类型 | 输入/计算 | 费用 |
|--------|------|------|----------|------|
| bonding_balance | 帮定结余 | number | 输入 | - |
| smt_balance | 贴片结余 | number | 输入 | - |
| plugin_balance | 插件结余 | number | 输入 | - |
| production_wage_balance | 生产工资结余 | number | 计算 | - |
| production_wage_balance_tax | 生产工资结余(含1.13) | number | 计算 | - |
| estimated_workshop_profit | 预估车间利润 | number | 计算 | - |
| production_supervisor_wage | 生产管工工资 | number | 输入 | 费用 |
| office_supervisor_wage | 办公室管工工资 | number | 输入 | 费用 |
| shared_staff_wage | 共用人员工资 | number | 输入 | 费用 |
| hk_expense | 香港支出 | number | 输入 | 费用 |
| severance_fee | 离职补贴费用 | number | 输入 | 费用 |
| excess_material | 超出原材料 | number | 输入 | 费用 |
| transport_packing_fee | 运输包装费 | number | 输入 | 费用 |
| payable_tax | 应缴税收 | number | 输入 | 费用 |
| hq_allocation | 总部支出 | number | 输入 | 费用 |
| estimated_tax | 预计税金 | number | 输入 | - |
| outsource_output | 外发产值 | number | 输入 | - |
| outsource_planned_wage | 外发计划工资(含1.13) | number | 输入 | - |
| outsource_actual_wage | 外发实际工资 | number | 输入 | - |
| outsource_wage_balance | 外发人工结余 | number | 计算 | - |
| outsource_balance_ratio | 外发结余比例 | ratio | 计算 | - |

## 边角料(收入)处理

胶袋部和吸塑部有 `scrap_income` 字段，这是一笔收入而非费用。
- 在 config.js 中标记 `income: true`（新增属性）
- 结余公式：`结余 = 产值 + scrap_income - 费用合计`
- calc.js hardcoded 逻辑和公式引擎都需支持
- 字段标记 `expense: false`，不参与费用合计

## 侧边栏导航

```
三工结余
  ├─ 啤机部
  ├─ 印喷部
  ├─ 装配部
  ├─ 胶袋部（新）
  ├─ 配色部（新）
  ├─ 吸塑部（新）
  ├─ 电子部（新）
  ├─ 结余收支汇总
  │   ├─ 大车间汇总
  │   ├─ 小部门汇总（新）
  │   └─ 全厂结余汇总（新，后续设计）
```

## 小部门汇总

参考大车间汇总的"按月汇总"视图，但不分车间直接按部门汇总。

| 部门 | 总产值 | 员工工资 | 管工工资 | 房租 | 水电费 | ... | 其他费用 | 费用合计 | 结余 | 结余率 |

查询范围：bags, color, blister, electronic 四个部门。

## 公式设置

在现有公式设置 Tab 栏（啤机部/印喷部/装配部）后新增4个 Tab：胶袋部、配色部、吸塑部、电子部。每个部门可独立配置计算公式。

## 同步清单（开发铁律 7.3）

每个新部门需同步4处：
1. `db/init.sql` — 建表
2. `modules/balance/config.js` — 字段定义
3. `routes/import-export.js` — COLUMN_MAP 自动生成（无需手动）
4. `public/js/app.js` — 前端 DEPT_CONFIG + 侧边栏 + 路由

另需修改：
- `modules/balance/calc.js` — hardcoded fallback
- `modules/index.js` — DEPT_CONFIG 自动从 config.js 推导（无需手动）
- `routes/summary.js` — 小部门汇总 API
- `server.js` — 如有新路由需注册

## 计算规则

先用基础 hardcoded 逻辑（开机率、人均产值、平均每台结余等参考现有啤机/装配部门模式），详细公式规则待用户后续提供。
