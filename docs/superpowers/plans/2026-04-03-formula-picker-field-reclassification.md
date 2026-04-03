# 公式选择器字段5分类重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将新增公式弹窗的字段选择面板从3分组重构为5分组，修复部门独有费用字段丢失的 bug，并补充收入字段和配置计算字段两个新分组。

**Architecture:** 两处改动，互相独立。①`modules/balance/config.js` 给电子部9个字段补标记（不影响计算）。②`public/js/app.js` 前端 DEPT_CONFIG 给所有部门独有字段补 `expense`/`income` 属性，然后把 FormulaConfigPage 的3个 computed 改写为5个，模板对应从3分组改为5分组。

**Tech Stack:** Node.js（config.js 后端），Vue 3 Options API CDN（app.js 前端），Jest（测试）

---

## 文件改动范围

| 文件 | 改动内容 |
|------|---------|
| `modules/balance/config.js` | 电子部9个字段新增 expense/income 标记 |
| `tests/calc.test.js` | 新增测试验证 getIncomeFields/getExpenseFields 返回正确字段 |
| `public/js/app.js` | ① DEPT_CONFIG：全部门独有字段补 expense/income 属性（约第36-321行）②FormulaConfigPage computed：删3旧增5新（约第3501-3536行）③ FormulaConfigPage 模板：3分组改5分组（约第3303-3350行）|

---

## Task 1：config.js — 电子部字段补标记 + 测试验证

**Files:**
- Modify: `modules/balance/config.js`（electronic 部门 uniqueFields，约第415-470行）
- Modify: `tests/calc.test.js`（新增验证断言）

**背景：** 电子部的6个"参与结余+"字段需加 `income: true`，3个"参与结余-"计算字段需加 `expense: true`。这些标记仅用于前端公式选择器分类显示，calc.js 的硬编码逻辑不受影响。

- [ ] **Step 1：读取 config.js 电子部字段（约第415-470行）**

  确认以下9个字段当前标记：
  ```
  bonding_balance      → input:true, expense:false（无 income）
  smt_balance          → input:true, expense:false
  plugin_balance       → input:true, expense:false
  production_wage_balance      → input:true
  production_wage_balance_tax  → input:true
  estimated_workshop_profit    → calc:true（无 income）
  hk_expense           → calc:true（无 expense）
  transport_packing_fee → calc:true（无 expense）
  hq_allocation        → calc:true（无 expense）
  ```

- [ ] **Step 2：给6个收入字段加 `income: true`**

  在 `modules/balance/config.js` electronic 部门，将以下6行：
  ```js
  { field: 'bonding_balance', label: '帮定结余', type: 'number', input: true, expense: false, currency: true },
  { field: 'smt_balance', label: '贴片结余', type: 'number', input: true, expense: false, currency: true },
  { field: 'plugin_balance', label: '插件结余', type: 'number', input: true, expense: false, currency: true },
  { field: 'production_wage_balance', label: '生产工资结余', type: 'number', input: true, expense: false, currency: true },
  { field: 'production_wage_balance_tax', label: '生产工资结余(含1.13)', type: 'number', input: true, expense: false, currency: true },
  { field: 'estimated_workshop_profit', label: '预估车间利润', type: 'number', calc: true,
  ```
  分别加上 `income: true`（保持其余属性不变）：
  ```js
  { field: 'bonding_balance', label: '帮定结余', type: 'number', input: true, expense: false, income: true, currency: true },
  { field: 'smt_balance', label: '贴片结余', type: 'number', input: true, expense: false, income: true, currency: true },
  { field: 'plugin_balance', label: '插件结余', type: 'number', input: true, expense: false, income: true, currency: true },
  { field: 'production_wage_balance', label: '生产工资结余', type: 'number', input: true, expense: false, income: true, currency: true },
  { field: 'production_wage_balance_tax', label: '生产工资结余(含1.13)', type: 'number', input: true, expense: false, income: true, currency: true },
  { field: 'estimated_workshop_profit', label: '预估车间利润', type: 'number', calc: true, income: true,
  ```

- [ ] **Step 3：给3个费用计算字段加 `expense: true`**

  找到以下3行：
  ```js
  { field: 'hk_expense', label: '香港支出', type: 'number', calc: true,
  { field: 'transport_packing_fee', label: '运输包装费', type: 'number', calc: true,
  { field: 'hq_allocation', label: '总部支出', type: 'number', calc: true,
  ```
  各加上 `expense: true`（保持其余属性不变）：
  ```js
  { field: 'hk_expense', label: '香港支出', type: 'number', calc: true, expense: true,
  { field: 'transport_packing_fee', label: '运输包装费', type: 'number', calc: true, expense: true,
  { field: 'hq_allocation', label: '总部支出', type: 'number', calc: true, expense: true,
  ```

- [ ] **Step 4：读取 tests/calc.test.js 找到适合插入测试的位置**

  在文件末尾的 `describe` 块外或已有 describe 块内找插入点。

- [ ] **Step 5：新增测试验证电子部标记**

  在 `tests/calc.test.js` 末尾追加：
  ```js
  describe('config.js 电子部字段标记', () => {
    const { getIncomeFields, getExpenseFields } = require('../modules/index');

    test('getIncomeFields(electronic) 应包含6个收入字段', () => {
      const fields = getIncomeFields('electronic');
      expect(fields).toContain('bonding_balance');
      expect(fields).toContain('smt_balance');
      expect(fields).toContain('plugin_balance');
      expect(fields).toContain('production_wage_balance');
      expect(fields).toContain('production_wage_balance_tax');
      expect(fields).toContain('estimated_workshop_profit');
      expect(fields.length).toBe(6);
    });

    test('getExpenseFields(electronic) 应包含 hk_expense、transport_packing_fee、hq_allocation', () => {
      const fields = getExpenseFields('electronic');
      expect(fields).toContain('hk_expense');
      expect(fields).toContain('transport_packing_fee');
      expect(fields).toContain('hq_allocation');
    });
  });
  ```

- [ ] **Step 6：运行测试确认通过**

  ```bash
  cd "d:/03-AI related/02-Business data statistics"
  npm test
  ```
  预期：新增的2个测试全部 PASS，已有测试不受影响。

- [ ] **Step 7：Commit**

  ```bash
  git add modules/balance/config.js tests/calc.test.js
  git commit -m "feat: 电子部字段补 income/expense 标记，新增标记验证测试"
  ```

---

## Task 2：app.js DEPT_CONFIG — 三主部门字段补 expense/income 属性

**Files:**
- Modify: `public/js/app.js`（第36-115行，beer/print/assembly 的 uniqueFields）

**背景：** 前端 DEPT_CONFIG 字段对象目前没有 `expense`/`income` 属性，导致 computed 无法正确分类。三个主部门（非 selfContained）只需给独有字段加标记，共享字段通过 SHARED_WAGE/SHARED_EXPENSE 常量已知。

- [ ] **Step 1：读取 app.js 第36-58行（beer uniqueFields）确认当前内容**

- [ ] **Step 2：啤机部 — 给8个独有费用字段加 `expense: true`**

  找到以下8行，各加 `expense: true`：
  ```js
  // 改前 → 改后（示例）
  { field: 'misc_worker_wage', label: '杂工工资/天', shortLabel: '杂工工资', editable: true, type: 'number' },
  // 改为：
  { field: 'misc_worker_wage', label: '杂工工资/天', shortLabel: '杂工工资', editable: true, type: 'number', expense: true },
  ```
  需加 `expense: true` 的字段：`misc_worker_wage`、`machine_repair`、`mold_repair`、`materials`、`material_supplement`、`gate_processing_fee`、`assembly_gate_parts_fee`、`outsource_nozzle`

- [ ] **Step 3：读取 app.js 第59-93行（print uniqueFields）确认当前内容**

- [ ] **Step 4：印喷部 — 给8个费用字段加 `expense: true`**

  需加 `expense: true` 的字段：`repair_fee`、`materials`、`oil_water_amount`、`subsidy`、`actual_material`、`no_output_wage`、`assembly_wage_paid`、`non_recoverable_tool_fee`

- [ ] **Step 5：印喷部 — 给5个收入字段加 `income: true`**

  需加 `income: true` 的字段：`recoverable_wage`、`dept_recoverable_wage`、`recoverable_indonesia_wage`、`recoverable_tool_fee`、`recoverable_paint`

- [ ] **Step 6：读取 app.js 第94-115行（assembly uniqueFields）确认当前内容**

- [ ] **Step 7：装配部 — 给11个费用字段加 `expense: true`**

  需加 `expense: true` 的字段：`actual_wage`、`hunan_social_insurance`、`hunan_tax`、`workshop_repair`、`electrical_repair`、`workshop_materials`、`stretch_film`、`workshop_tool_investment`、`fixture_tool_investment`、`housing_subsidy`、`supplement`

- [ ] **Step 8：装配部 — 给1个收入字段加 `income: true`**

  需加 `income: true` 的字段：`recoverable_electricity`

- [ ] **Step 9：Commit**

  ```bash
  git add public/js/app.js
  git commit -m "feat: 三主部门 DEPT_CONFIG 独有字段补 expense/income 属性"
  ```

---

## Task 3：app.js DEPT_CONFIG — 小部门字段补 expense/income 属性

**Files:**
- Modify: `public/js/app.js`（第116-321行，bags/color/blister/electronic/clothing 的 uniqueFields）

**背景：** 小部门均为 selfContained，共享字段已内嵌在 uniqueFields 中，需要一并标记。

- [ ] **Step 1：读取 app.js 第116-158行（bags uniqueFields）确认当前内容**

- [ ] **Step 2：胶袋部 — 给17个费用字段加 `expense: true`**

  需加 `expense: true` 的字段：`supervisor_wage`、`worker_wage`、`rent`、`utility_fee`、`tool_investment`、`equipment`、`renovation`、`misc_fee`、`shipping_fee`、`social_insurance`、`tax`、`misc_worker_wage`、`raw_material_cost`、`diesel`、`machine_repair`、`material_supplement`、`gate_processing_fee`

- [ ] **Step 3：胶袋部 — 给1个收入字段加 `income: true`**

  需加 `income: true` 的字段：`scrap_income`

- [ ] **Step 4：读取 app.js 第159-194行（color uniqueFields）确认当前内容**

- [ ] **Step 5：配色部 — 给15个费用字段加 `expense: true`**

  需加 `expense: true` 的字段：`supervisor_wage`、`worker_wage`、`rent`、`utility_fee`、`tool_investment`、`equipment`、`renovation`、`misc_fee`、`shipping_fee`、`social_insurance`、`tax`、`hq_allocation`、`raw_material_cost`、`color_powder`、`hk_expense`

- [ ] **Step 6：读取 app.js 第195-240行（blister uniqueFields）确认当前内容**

- [ ] **Step 7：吸塑部 — 给20个费用字段加 `expense: true`**

  需加 `expense: true` 的字段：`supervisor_wage`、`worker_wage`、`rent`、`utility_fee`、`tool_investment`、`equipment`、`renovation`、`misc_fee`、`shipping_fee`、`social_insurance`、`tax`、`misc_worker_wage`、`raw_material`、`supplies`、`materials`、`machine_repair`、`gate_processing_fee`、`material_supplement`、`cartons`、`plastic_bags`

- [ ] **Step 8：吸塑部 — 给1个收入字段加 `income: true`**

  需加 `income: true` 的字段：`scrap_income`

- [ ] **Step 9：读取 app.js 第241-278行（electronic uniqueFields）确认当前内容**

- [ ] **Step 10：电子部（前端）— 给15个费用字段加 `expense: true`**

  需加 `expense: true` 的字段（含3个计算字段）：`rent`、`utility_fee`、`tool_investment`、`equipment`、`renovation`、`misc_fee`、`production_supervisor_wage`、`office_supervisor_wage`、`shared_staff_wage`、`hk_expense`（calculated）、`severance_fee`、`excess_material`、`transport_packing_fee`（calculated）、`payable_tax`、`hq_allocation`（calculated）

- [ ] **Step 11：电子部（前端）— 给6个收入字段加 `income: true`**

  需加 `income: true` 的字段（含1个计算字段）：`bonding_balance`、`smt_balance`、`plugin_balance`、`production_wage_balance`、`production_wage_balance_tax`、`estimated_workshop_profit`（calculated）

- [ ] **Step 12：读取 app.js 第279-321行（clothing uniqueFields）确认当前内容**

- [ ] **Step 13：车衣部 — 给21个费用字段加 `expense: true`**

  需加 `expense: true` 的字段（含2个计算字段）：`worker_wage`、`hq_allocation_wage`、`supervisor_wage`、`non_production_wage`、`raw_material_cost`、`tax_expense`（calculated）、`general_expense`、`hk_daily_expense`（calculated）、`social_insurance_fund`、`misc_fee`、`tool_investment`、`equipment`、`materials`、`raw_materials`、`repair_fee`、`renovation`、`outsource_processing`、`temp_worker_hours`、`shipping_fee`、`rent`、`utility_fee`

- [ ] **Step 14：车衣部 — 给1个收入字段加 `income: true`**

  需加 `income: true` 的字段：`other_income`

- [ ] **Step 15：Commit**

  ```bash
  git add public/js/app.js
  git commit -m "feat: 小部门 DEPT_CONFIG 字段补 expense/income 属性（胶袋/配色/吸塑/电子/车衣）"
  ```

---

## Task 4：app.js — 3个 computed 改为5个

**Files:**
- Modify: `public/js/app.js`（约第3500-3540行，FormulaConfigPage computed 属性）

**背景：** 删除 `filteredBalanceExpenseFields`、`filteredNonBalanceExpenseFields`、`filteredCalcFields`，替换为5个新 computed。

- [ ] **Step 1：读取 app.js 第3500-3540行，确认3个旧 computed 的确切位置**

- [ ] **Step 2：将3个旧 computed 整体替换为以下5个**

  ```js
  // 分类一：结余费用字段（expense:true，含 calc+expense；装配部 planned_wage_tax 例外）
  filteredExpenseFields() {
    const search = this.fieldSearch.toLowerCase();
    const dept = this.currentDept;
    const deptConfig = DEPT_CONFIG[dept];
    let fields;
    if (deptConfig?.selfContained) {
      // selfContained：所有字段均在 uniqueFields，直接按 expense 过滤
      fields = (deptConfig.uniqueFields || []).filter(f => f.expense);
    } else {
      // 非 selfContained：共享费用字段 + 部门独有 expense 字段
      const shared = [...SHARED_WAGE, ...SHARED_EXPENSE];
      const sharedKeys = new Set(shared.map(f => f.field));
      const unique = (deptConfig?.uniqueFields || []).filter(f => f.expense && !sharedKeys.has(f.field));
      // 装配部例外：planned_wage_tax 参与清溪结余公式（被减数），归入本分类
      const extra = (dept === 'assembly')
        ? (deptConfig.uniqueFields || []).filter(f => f.field === 'planned_wage_tax')
        : [];
      fields = [...shared, ...unique, ...extra];
    }
    return fields.filter(f =>
      !search || (f.shortLabel || f.label || '').toLowerCase().includes(search) || f.field.includes(search)
    );
  },

  // 分类二：不参与结余公式非计算字段（editable, 无 expense, 无 income, 非 calculated）
  filteredNonExpenseInputFields() {
    const search = this.fieldSearch.toLowerCase();
    const dept = this.currentDept;
    const deptConfig = DEPT_CONFIG[dept];
    let fields;
    if (deptConfig?.selfContained) {
      fields = (deptConfig.uniqueFields || []).filter(f => f.editable && !f.expense && !f.income && !f.calculated);
    } else {
      const shared = [...SHARED_PEOPLE, ...SHARED_OUTPUT];
      const sharedKeys = new Set(shared.map(f => f.field));
      const unique = (deptConfig?.uniqueFields || []).filter(f =>
        f.editable && !f.expense && !f.income && !f.calculated &&
        !sharedKeys.has(f.field) &&
        !(dept === 'assembly' && f.field === 'planned_wage_tax')
      );
      fields = [...shared, ...unique];
    }
    return fields.filter(f =>
      !search || (f.shortLabel || f.label || '').toLowerCase().includes(search) || f.field.includes(search)
    );
  },

  // 分类三：不参与结余公式计算字段（calculated, 无 expense, 无 income）+ 用户保存的公式
  filteredCalcFields() {
    const search = this.fieldSearch.toLowerCase();
    const deptConfig = DEPT_CONFIG[this.currentDept];
    // 排除 balance/balance_ratio（结果字段，不应作为构建公式的引用来源）
    const configCalc = (deptConfig?.uniqueFields || []).filter(f =>
      f.calculated && !f.expense && !f.income &&
      f.field !== 'balance' && f.field !== 'balance_ratio'
    );
    const userFormulas = this.formulas
      .filter(f => f.field_key !== this.form.field_key)
      .map(f => ({ field: f.field_key, label: f.field_label, shortLabel: f.field_label }));
    return [...configCalc, ...userFormulas].filter(f =>
      !search || (f.shortLabel || f.label || '').toLowerCase().includes(search) || f.field.includes(search)
    );
  },

  // 分类四：收入字段（income:true，参与结余公式正向加项）
  filteredIncomeFields() {
    const search = this.fieldSearch.toLowerCase();
    const deptConfig = DEPT_CONFIG[this.currentDept];
    const fields = (deptConfig?.uniqueFields || []).filter(f => f.income);
    return fields.filter(f =>
      !search || (f.shortLabel || f.label || '').toLowerCase().includes(search) || f.field.includes(search)
    );
  },
  ```

  **注意：** 分类五（常量）使用现有的 `constantNames`，不需要新 computed，模板中直接用 `constantNames`。

- [ ] **Step 3：Commit**

  ```bash
  git add public/js/app.js
  git commit -m "refactor: FormulaConfigPage computed 从3个改为5个，修复部门独有费用字段丢失 bug"
  ```

---

## Task 5：app.js — 模板3分组改为5分组

**Files:**
- Modify: `public/js/app.js`（约第3303-3350行，字段选择面板模板）

**背景：** 将当前3个分组 div 替换为5个分组，更新 computed 引用名和分组标题。

- [ ] **Step 1：读取 app.js 第3303-3351行，确认当前3个分组的完整内容**

- [ ] **Step 2：将整个字段选择面板内容（搜索框之后到 `</div>` 结束之前）替换为以下5分组**

  ```html
  <!-- 分类一：结余费用字段 -->
  <div>
    <div style="padding:6px 12px; background:#fdf0f0; border-bottom:1px solid #f0d4d4; font-weight:600; font-size:13px; display:flex; justify-content:space-between;">
      <span>结余费用字段</span>
      <span style="color:#999;">{{ filteredExpenseFields.length }}</span>
    </div>
    <div style="padding:8px 12px; display:flex; flex-wrap:wrap; gap:6px;">
      <span v-for="f in filteredExpenseFields" :key="f.field"
            style="display:inline-block; padding:3px 10px; border-radius:14px; cursor:pointer; font-size:12px; background:#fff3e0; border:1px solid #ffe0b2; color:#e65100;"
            @click="addFieldToken(f.field)">{{ f.shortLabel || f.label }}</span>
    </div>
  </div>
  <!-- 分类四：收入字段 -->
  <div v-if="filteredIncomeFields.length > 0">
    <div style="padding:6px 12px; background:#f0faf5; border-bottom:1px solid #b2dfdb; font-weight:600; font-size:13px; display:flex; justify-content:space-between;">
      <span>收入字段</span>
      <span style="color:#999;">{{ filteredIncomeFields.length }}</span>
    </div>
    <div style="padding:8px 12px; display:flex; flex-wrap:wrap; gap:6px;">
      <span v-for="f in filteredIncomeFields" :key="f.field"
            style="display:inline-block; padding:3px 10px; border-radius:14px; cursor:pointer; font-size:12px; background:#e0f7f4; border:1px solid #80cbc4; color:#00695c;"
            @click="addFieldToken(f.field)">{{ f.shortLabel || f.label }}</span>
    </div>
  </div>
  <!-- 分类二：不参与结余公式非计算字段 -->
  <div v-if="filteredNonExpenseInputFields.length > 0">
    <div style="padding:6px 12px; background:#fef9ec; border-bottom:1px solid #f0e0b0; font-weight:600; font-size:13px; display:flex; justify-content:space-between;">
      <span>不参与结余公式非计算字段</span>
      <span style="color:#999;">{{ filteredNonExpenseInputFields.length }}</span>
    </div>
    <div style="padding:8px 12px; display:flex; flex-wrap:wrap; gap:6px;">
      <span v-for="f in filteredNonExpenseInputFields" :key="f.field"
            style="display:inline-block; padding:3px 10px; border-radius:14px; cursor:pointer; font-size:12px; background:#fef3cd; border:1px solid #fbd96a; color:#8a6200;"
            @click="addFieldToken(f.field)">{{ f.shortLabel || f.label }}</span>
    </div>
  </div>
  <!-- 分类三：不参与结余公式计算字段 -->
  <div v-if="filteredCalcFields.length > 0">
    <div style="padding:6px 12px; background:#f0f4ff; border-bottom:1px solid #c5cae9; font-weight:600; font-size:13px; display:flex; justify-content:space-between;">
      <span>不参与结余公式计算字段</span>
      <span style="color:#999;">{{ filteredCalcFields.length }}</span>
    </div>
    <div style="padding:8px 12px; display:flex; flex-wrap:wrap; gap:6px;">
      <span v-for="f in filteredCalcFields" :key="f.field_key || f.field"
            style="display:inline-block; padding:3px 10px; border-radius:14px; cursor:pointer; font-size:12px; background:#e8eaf6; border:1px solid #9fa8da; color:#283593;"
            @click="addFieldToken(f.field_key || f.field)">{{ f.shortLabel || f.label }}</span>
    </div>
  </div>
  <!-- 分类五：常量（按月生效）-->
  <div v-if="constantNames.length > 0">
    <div style="padding:6px 12px; background:#fff8e1; border-bottom:1px solid #ffe082; font-weight:600; font-size:13px; display:flex; justify-content:space-between;">
      <span>常量（按月生效）</span>
      <span style="color:#999;">{{ constantNames.length }}</span>
    </div>
    <div style="padding:8px 12px; display:flex; flex-wrap:wrap; gap:6px;">
      <span v-for="c in constantNames" :key="c.name"
            style="display:inline-block; padding:3px 10px; border-radius:14px; cursor:pointer; font-size:12px; background:#fff8e1; border:1px solid #ffe082; color:#f57f17;"
            @click="addConstantToken(c.name)">{{ c.label + '（$' + c.name + '）' }}</span>
    </div>
  </div>
  ```

- [ ] **Step 3：Commit**

  ```bash
  git add public/js/app.js
  git commit -m "feat: 公式选择器字段面板改为5分组（结余费用/收入/非计算/计算/常量）"
  ```

---

## Task 6：回归验证

- [ ] **Step 1：运行全量测试确认无回归**

  ```bash
  npm test
  ```
  预期：所有测试 PASS

- [ ] **Step 2：启动服务器**

  ```bash
  npm start
  ```

- [ ] **Step 3：啤机部验证**

  打开浏览器 → 公式配置 → 啤机部 → 新增公式 → 可视化模式

  - **结余费用字段**：应显示11个共享字段（管工工资/天、员工工资/天、房租、水电费、工具投资、设备、装修、杂费、运费、社保、税收）**+** 8个独有字段（杂工工资/天、机器维修、模具维修、物料、原料补料、批水口加工费、装配批水口配件费、外发批水口加工费）= **19个**
  - **收入字段**：不显示（啤机部无 income 字段）
  - **不参与结余公式非计算字段**：应显示管工人数、员工人数、总产值/天 + 总台数、开机时间、杂工人数、批水口人数
  - **不参与结余公式计算字段**：开机台数、开机率、不含税产值、人均产值、台均产值、总工资占比%、平均每台结余、模维占比%、水口占比% + 用户已保存公式

- [ ] **Step 4：印喷部验证**

  - **结余费用字段**：11个共享 + 8个独有费用字段（补贴、维修费、物料、油水金额、实际用料、无产值工资、付装配工资、不可回收工具费）= **19个**
  - **收入字段**：应显示5个（可收回工资、车发部回收工资、可收回印尼工资、可收回工具费、可回收油漆金额）
  - **不参与结余公式非计算字段**：管工人数、员工人数、产值/天 + 移印台数、移印开机、喷油台数、喷油开机、杂工人数、员工工时、做办工资、自动机模费、发湖南模费、发印尼模费

- [ ] **Step 5：装配部验证**

  - **结余费用字段**：11个共享 + 11个独有费用 + 1个例外（计划总工资含*1.13）= **23个**
  - **收入字段**：应显示1个（可回收电费）

- [ ] **Step 6：电子部验证**

  - **结余费用字段**：rent/水电/工具/设备/装修/杂费 + 生产管工/办公管工/共用工资 + 香港支出/运输包装/总部支出 + 离职补贴/超出原材料/应缴税收 = **15个**
  - **收入字段**：帮定结余、贴片结余、插件结余、生产工资结余、生产工资结余含税、预估车间利润 = **6个**

- [ ] **Step 7：搜索框过滤验证**

  在任意部门输入"工资"，确认5个分组均正确过滤，只显示含"工资"的字段。

- [ ] **Step 8：最终 Commit（如无额外改动）**

  ```bash
  git add public/js/app.js
  git commit -m "chore: 公式选择器5分类功能验证完成"
  ```
