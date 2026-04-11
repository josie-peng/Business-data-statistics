# 装配部结余公式按区域分开 + 明细表合计结构调整 + 大车间汇总只统计清溪

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 装配部结余公式按厂区（清溪/邵阳）采用不同计算方式；三个部门明细表底部合计区改为清溪合计+邵阳合计结构；大车间汇总模块只统计清溪厂区数据。

**Architecture:**
- 后端 `calc.js` 需要根据记录所属车间的区域（region）判断使用哪种结余公式
- 前端明细表底部合计区从"清溪合计+总合计"改为按区域分组显示（装配部无总合计）
- 汇总模块（`summary.js` 后端 + `app.js` 前端）增加 `WHERE w.region = '清溪'` 过滤

**Tech Stack:** Express + PostgreSQL + Vue 3 + Element Plus

---

### Task 1：后端 calc.js — 装配部结余公式按区域分开

**Files:**
- Modify: `modules/balance/calc.js:249-256`（hardcoded fallback 中的 assembly 分支）

**背景：** 当前装配部结余公式统一为 `balance = daily_output - SUM(expense)`。需要按区域分成两种：
- **清溪：** `balance = planned_wage_tax - (费用之和，不含 shipping_fee 和 recoverable_electricity)`
- **邵阳：** `balance = daily_output - (费用之和 + shipping_fee) + recoverable_electricity`

注意：数据库公式 (`formula_configs`) 也需要更新，但那是一条 SQL 语句，不涉及代码文件。hardcoded fallback 是代码层面的降级方案，必须同步更新。

- [ ] **Step 1: 修改 calc.js 中 assembly 分支的结余计算**

在 `calculateRecordHardcoded` 函数的 `else if (dept === 'assembly')` 分支中，结余计算需要在标准公式计算之后、根据 region 覆盖 `result.balance`。

当前代码（第 249-256 行）：
```javascript
  } else if (dept === 'assembly') {
    const workerCount = parseFloat(result.worker_count) || 0;
    const plannedWage = parseFloat(result.planned_wage_tax) || 0;
    result.avg_output_per_worker = workerCount > 0 ? dailyOutput / workerCount : 0;
    result.balance_minus_tape = result.balance - (parseFloat(result.tape) || 0);
    result.balance_tape_ratio = plannedWage > 0 ? result.balance_minus_tape / plannedWage : 0;
    result.tool_invest_ratio = plannedWage > 0 ? ((parseFloat(result.workshop_tool_investment) || 0) + (parseFloat(result.fixture_tool_investment) || 0)) / plannedWage : 0;
    result.borrowed_wage_ratio = plannedWage > 0 ? (parseFloat(result.borrowed_worker_wage) || 0) / plannedWage : 0;
  }
```

注意到此时 `result.balance` 已经由前面的通用公式计算好了（第 210 行：`result.balance = dailyOutput + totalIncome - totalExpense`）。

需要在 assembly 分支**最前面**根据 region 重新计算 balance：

```javascript
  } else if (dept === 'assembly') {
    const workerCount = parseFloat(result.worker_count) || 0;
    const plannedWage = parseFloat(result.planned_wage_tax) || 0;
    const shippingFee = parseFloat(result.shipping_fee) || 0;
    const recoverableElec = parseFloat(result.recoverable_electricity) || 0;

    // 装配部按区域使用不同结余公式
    const region = result.region || '';
    if (region === '湖南') {
      // 邵阳：总产值 - 费用(含运费) + 可回收电费
      // 通用公式已算好 balance = dailyOutput + totalIncome - totalExpense
      // 但通用公式中 shipping_fee 已在 expense 里（因为 config 标记 expense:true），
      // recoverable_electricity 已在 income 里（因为 config 标记 income:true），
      // 所以通用公式结果已经正确，无需调整
    } else {
      // 清溪：计划总工资含*1.13 - 费用(不含运费、不含可回收电费)
      // 通用公式结果为 dailyOutput + recoverableElec - totalExpense(含shipping)
      // 需要改为 plannedWage - (totalExpense - shippingFee)
      // 即 plannedWage - totalExpense + shippingFee
      result.balance = plannedWage - (totalExpense - shippingFee);
    }

    result.balance_ratio = dailyOutput > 0 ? result.balance / dailyOutput : 0;
    result.avg_output_per_worker = workerCount > 0 ? dailyOutput / workerCount : 0;
    result.balance_minus_tape = result.balance - (parseFloat(result.tape) || 0);
    result.balance_tape_ratio = plannedWage > 0 ? result.balance_minus_tape / plannedWage : 0;
    result.tool_invest_ratio = plannedWage > 0 ? ((parseFloat(result.workshop_tool_investment) || 0) + (parseFloat(result.fixture_tool_investment) || 0)) / plannedWage : 0;
    result.borrowed_wage_ratio = plannedWage > 0 ? (parseFloat(result.borrowed_worker_wage) || 0) / plannedWage : 0;
  }
```

**问题：** `totalExpense` 是在函数顶部计算的局部变量，当前的 assembly 分支没有访问它。需要确认 `totalExpense` 的作用域覆盖到此处。查看代码第 203-204 行：
```javascript
const expenseFields = [...SHARED_EXPENSE_FIELDS, ...config.uniqueExpenseFields];
const totalExpense = expenseFields.reduce(...)
```
这些变量在函数体内，assembly 分支可以访问。✓

另外，通用公式第 210 行的 `result.balance = dailyOutput + totalIncome - totalExpense` 中：
- `totalIncome` 包含 `recoverable_electricity`（因为 config 标记 `income: true`）
- `totalExpense` 包含 `shipping_fee`（因为 config 标记 `expense: true`）

所以清溪的公式推导：
```
需要：balance = plannedWage - (totalExpense - shippingFee)
```
不需要减去 recoverableElec，因为清溪公式本身就不包含可回收电费。

邵阳的公式推导：
```
需要：balance = dailyOutput - totalExpense + recoverableElec
这正好等于 dailyOutput + totalIncome - totalExpense（通用公式结果）
因为 totalIncome 就是 recoverableElec
```
所以邵阳不需要修改，通用公式结果已正确。

- [ ] **Step 2: 确保 record 对象包含 region 信息**

检查 `calculateRecord` 的调用方——`routes/records.js` 中 POST/PUT 路由。record 对象是从数据库查询出来的，包含 `workshop_id`，但不一定包含 `region`。

需要在 `routes/records.js` 的保存逻辑中，查询车间的 region 并传入 record。

在 `routes/records.js` 中查找 `calculateRecord` 的调用位置，在调用前确保 record 包含 region 字段。如果当前的 SELECT 查询已经 JOIN workshops 获取了 region，则无需改动。如果没有，需要在调用 calculateRecord 前查询一次 workshop 的 region。

- [ ] **Step 3: 提交**

```bash
git add modules/balance/calc.js routes/records.js
git commit -m "feat: 装配部结余公式按区域分开（清溪用计划工资，邵阳用总产值）"
```

---

### Task 2：前端明细表列顺序调整 — 可回收电费移到结余前面

**Files:**
- Modify: `public/js/app.js:310-330`（FIELD_GROUP_AFTER_BALANCE 集合）

**背景：** 可回收电费 `recoverable_electricity` 当前在 `FIELD_GROUP_AFTER_BALANCE` 集合中（第 314 行），排在结余列后面。需要移到结余列前面。

- [ ] **Step 1: 从 FIELD_GROUP_AFTER_BALANCE 中移除 recoverable_electricity**

当前第 314 行：
```javascript
  // 不参与结余公式
  'recoverable_electricity',
```

删除这一行（含注释）。这样 `recoverable_electricity` 会归入 `groups.uniqueExpense`，自然排在结余列前面。

- [ ] **Step 2: 提交**

```bash
git add public/js/app.js
git commit -m "feat: 装配部可回收电费列移到结余列前面"
```

---

### Task 3：前端明细表底部合计区重构 — 按区域分组显示

**Files:**
- Modify: `public/js/app.js:585-623`（summary-footer 模板）
- Modify: `public/js/app.js:1036-1098`（loadData 方法中 summaryData 的构建逻辑）

**背景：** 当前底部合计区结构为：各车间行 → 清溪合计 → 总合计。需要改为：
- 啤机/印喷：清溪车间行 → 清溪合计 → 邵阳车间行 → 总合计
- 装配：清溪车间行 → 清溪合计 → 邵阳车间行 → 邵阳合计（无总合计）

- [ ] **Step 1: 修改 loadData 中的 summaryData 构建逻辑**

当前逻辑（第 1036-1098 行）将所有车间放入 `workshops` 对象，按区域累加到 `regions`，然后累加到 `total`。

需要改为将车间按区域分组：

```javascript
const rawSummary = summaryRes.data || summaryRes || [];
if (Array.isArray(rawSummary) && rawSummary.length > 0) {
  const qingxiWorkshops = {};  // 清溪车间
  const hunanWorkshops = {};   // 邵阳车间
  const regions = {};
  const total = {};
  const numFields = this.columns.map(c => c.field);
  numFields.forEach(f => { total[f] = 0; });

  for (const row of rawSummary) {
    const regionKey = row.region || '清溪';
    if (regionKey === '湖南') {
      hunanWorkshops[row.workshop_name] = row;
    } else {
      qingxiWorkshops[row.workshop_name] = row;
    }
    if (!regions[regionKey]) {
      regions[regionKey] = {};
      numFields.forEach(f => { regions[regionKey][f] = 0; });
    }
    numFields.forEach(f => {
      regions[regionKey][f] += parseFloat(row[f]) || 0;
      total[f] += parseFloat(row[f]) || 0;
    });
  }

  // 重算比率字段
  const calcRatios = (obj) => {
    const fn = RATIO_FORMULAS[this.dept];
    if (fn) fn(obj);
  };
  Object.values(regions).forEach(calcRatios);
  calcRatios(total);

  this.summaryData = {
    qingxiWorkshops,
    hunanWorkshops,
    regions,
    total,
    hasHunan: Object.keys(hunanWorkshops).length > 0
  };
} else {
  this.summaryData = null;
}
```

- [ ] **Step 2: 修改 summary-footer 模板**

当前模板（第 585-623 行）需要替换为按区域分组的结构：

```html
<div class="summary-footer" v-if="summaryData">
  <table style="width:100%; border-collapse:collapse;">
    <tr class="summary-header-row">
      <td style="width:40px"></td>
      <td style="width:50px"></td>
      <td style="width:110px">合计</td>
      <td style="width:80px">车间</td>
      <td v-for="col in columns" :key="'sh-'+col.field"
          :class="col.calculated ? 'sh-calc' : ''"
          :style="{ width: getColumnWidth(col) + 'px', textAlign: 'right' }">
        {{ col.shortLabel || col.label }}
      </td>
    </tr>
    <!-- 清溪车间行 -->
    <template v-for="(wsData, wsName) in summaryData.qingxiWorkshops" :key="'qxws-'+wsName">
      <tr class="workshop-row">
        <td></td><td></td><td></td>
        <td>{{ wsName }}</td>
        <td v-for="col in columns" :key="'qxwd-'+wsName+'-'+col.field" style="text-align:right;">
          {{ formatSummaryCell(wsData, col) }}
        </td>
      </tr>
    </template>
    <!-- 清溪合计 -->
    <tr class="region-row" v-if="summaryData.regions">
      <td></td><td></td><td></td>
      <td>清溪合计</td>
      <td v-for="col in columns" :key="'qx-'+col.field" style="text-align:right;">
        {{ formatSummaryCell(summaryData.regions['清溪'], col) }}
      </td>
    </tr>
    <!-- 邵阳车间行 -->
    <template v-if="summaryData.hasHunan" v-for="(wsData, wsName) in summaryData.hunanWorkshops" :key="'hnws-'+wsName">
      <tr class="workshop-row">
        <td></td><td></td><td></td>
        <td>{{ wsName }}</td>
        <td v-for="col in columns" :key="'hnwd-'+wsName+'-'+col.field" style="text-align:right;">
          {{ formatSummaryCell(wsData, col) }}
        </td>
      </tr>
    </template>
    <!-- 邵阳合计（仅装配部显示） -->
    <tr class="region-row" v-if="summaryData.hasHunan && dept === 'assembly'">
      <td></td><td></td><td></td>
      <td>邵阳合计</td>
      <td v-for="col in columns" :key="'hn-'+col.field" style="text-align:right;">
        {{ formatSummaryCell(summaryData.regions['湖南'], col) }}
      </td>
    </tr>
    <!-- 总合计（装配部不显示） -->
    <tr class="total-row" v-if="dept !== 'assembly'">
      <td></td><td></td><td></td>
      <td>总合计</td>
      <td v-for="col in columns" :key="'tt-'+col.field" style="text-align:right;">
        {{ formatSummaryCell(summaryData.total, col) }}
      </td>
    </tr>
  </table>
</div>
```

- [ ] **Step 3: 提交**

```bash
git add public/js/app.js
git commit -m "feat: 三部门明细表底部合计区按区域分组显示"
```

---

### Task 4：大车间汇总 — TAB改名 + 只统计清溪数据

**Files:**
- Modify: `public/js/app.js:1799`（TAB 名称）
- Modify: `routes/summary.js:564-573`（monthly 接口 SQL 添加清溪过滤）
- Modify: `routes/summary.js:96-100`（dashboard 接口 SQL 添加清溪过滤）
- Modify: `routes/summary.js:131-140`（dashboard 上月对比 SQL 添加清溪过滤）
- Modify: `routes/summary.js:161-176`（dashboard 趋势 SQL 添加清溪过滤）
- Modify: `routes/summary.js:415-523`（daily 接口 SQL 添加清溪过滤）

**背景：** 三个大车间部门的汇总只统计清溪厂区数据。需要在所有查询中增加 `WHERE w.region = '清溪'` 条件。

- [ ] **Step 1: 前端 TAB 名称改为"清溪汇总"**

`public/js/app.js` 第 1799 行：
```javascript
// 改前
<button class="main-tab-btn" :class="{ active: mainTab === 'table' }" @click="switchMainTab('table')">汇总表</button>
// 改后
<button class="main-tab-btn" :class="{ active: mainTab === 'table' }" @click="switchMainTab('table')">清溪汇总</button>
```

- [ ] **Step 2: summary.js — dashboard 接口添加清溪过滤**

在 `/dashboard` 路由中，所有三个 SQL 查询（本月、上月、趋势）添加 `AND w.region = '清溪'`：

第 98-100 行附近的 SQL：
```sql
-- 改前
WHERE EXTRACT(YEAR FROM record_date) = ?
-- 改后（注意要 JOIN workshops）
FROM ${config.tableName} r
JOIN workshops w ON r.workshop_id = w.id
WHERE w.region = '清溪' AND EXTRACT(YEAR FROM record_date) = ?
```

同理处理上月对比和趋势查询。

- [ ] **Step 3: summary.js — monthly 接口添加清溪过滤**

`/monthly` 路由中第 570-573 行的 SQL 已经有 `JOIN workshops w`，只需添加 `AND w.region = '清溪'`：

```sql
-- 改前
WHERE r.record_date >= ? AND r.record_date < ?
-- 改后
WHERE w.region = '清溪' AND r.record_date >= ? AND r.record_date < ?
```

- [ ] **Step 4: summary.js — daily 接口添加清溪过滤**

`/daily` 路由中，月度合计 SQL（第 447-456 行）和每日明细 SQL（第 473-481 行）都需要添加 `AND w.region = '清溪'`。

月度合计 SQL：
```sql
-- 改前
WHERE r.record_date >= ? AND r.record_date < ?
-- 改后
WHERE w.region = '清溪' AND r.record_date >= ? AND r.record_date < ?
```

每日明细 SQL 同理。

- [ ] **Step 5: summary.js — detail 接口添加清溪过滤**

`/detail` 路由中两处 SQL 查询也需要添加清溪过滤（总览模式和部门明细模式）。

总览模式（第 243-244 行）：
```sql
-- 改前
FROM ${config.tableName} WHERE 1=1
-- 改后（需要 JOIN workshops）
FROM ${config.tableName} r JOIN workshops w ON r.workshop_id = w.id WHERE w.region = '清溪'
```

部门明细模式（第 354-358 行）已有 JOIN workshops，添加 `AND w.region = '清溪'`。

- [ ] **Step 6: summary.js — overview 接口添加清溪过滤**

`/overview` 路由（第 42-56 行）的 SQL 没有 JOIN workshops，需要添加：
```sql
-- 改前
FROM ${config.tableName} WHERE 1=1
-- 改后
FROM ${config.tableName} r JOIN workshops w ON r.workshop_id = w.id WHERE w.region = '清溪'
```
同时更新字段引用（加 `r.` 前缀）。

- [ ] **Step 7: 提交**

```bash
git add public/js/app.js routes/summary.js
git commit -m "feat: 大车间汇总模块改名清溪汇总，只统计清溪厂区数据"
```

---

### Task 5：数据库公式更新 — 装配部按区域结余公式

**Files:**
- 新增: `scripts/migrate-assembly-balance-by-region.sql`

**背景：** 数据库 `formula_configs` 表中装配部的 balance 公式也需要更新，以支持按区域计算。但由于 `formula_parser.js` 目前不支持条件分支（按 region），需要评估：
- 如果 formula_parser 支持条件表达式 → 更新 formula_text
- 如果不支持 → hardcoded fallback 已在 Task 1 处理，数据库公式暂保持现状，由 calc.js 的 hardcoded 逻辑兜底

这个任务先创建迁移脚本，并提供手动执行的 SQL 说明。

- [ ] **Step 1: 创建迁移 SQL 脚本**

```sql
-- 装配部结余公式按区域分开
-- 注意：当前 formula_parser 不支持按 region 条件分支
-- hardcoded fallback (calc.js) 已处理区域逻辑
-- 此脚本将装配部公式标记为使用 hardcoded，确保不走 DB 公式路径

-- 方案：禁用装配部的 DB balance 公式，强制走 hardcoded fallback
UPDATE formula_configs
SET enabled = false
WHERE module = 'balance'
  AND department = 'assembly'
  AND field_key = 'balance';

-- 同时禁用 balance_ratio（因为它依赖 balance）
UPDATE formula_configs
SET enabled = false
WHERE module = 'balance'
  AND department = 'assembly'
  AND field_key = 'balance_ratio';
```

- [ ] **Step 2: 提交并告知用户需要执行的 SQL**

```bash
git add scripts/migrate-assembly-balance-by-region.sql
git commit -m "chore: 装配部结余公式迁移脚本（禁用DB公式，走硬编码区域逻辑）"
```

用户需要手动执行：
```bash
psql -h localhost -p 5432 -U postgres -d production_system -f scripts/migrate-assembly-balance-by-region.sql
```

---

### Task 6：验证测试

- [ ] **Step 1: 启动服务并验证**

```bash
npm start
```

验证步骤：
1. 打开装配部明细表，确认"可回收电费"列在"结余金额"列之前
2. 录入一条清溪车间记录（如兴信A），确认结余 = 计划总工资含*1.13 - 费用（不含运费和可回收电费）
3. 录入一条邵阳华登记录，确认结余 = 总产值 - 费用（含运费）+ 可回收电费
4. 查看底部合计区：
   - 啤机/印喷：清溪车间 → 清溪合计 → 邵阳车间 → 总合计
   - 装配：清溪车间 → 清溪合计 → 邵阳车间 → 邵阳合计（无总合计）
5. 进入大车间汇总，确认 TAB 名为"清溪汇总"
6. 确认汇总数据不包含邵阳华登的数据
