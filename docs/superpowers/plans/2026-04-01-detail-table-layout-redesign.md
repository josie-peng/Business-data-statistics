# 明细表布局改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复明细表三个布局问题：工具栏随页面横向滚动、日期/车间列在合计区未冻结、表格高度固定导致下方留白。

**Architecture:** 两处 CSS 修改（防止全页横向滚动、修复 sticky 容器）+ 一处 JS 修改（动态计算 el-table 高度，监听 resize 实时更新）。不改变任何业务逻辑，只影响 DeptRecordsPage 的展示层。

**Tech Stack:** Vue 3 CDN（Options API）、Element Plus el-table、CSS sticky positioning

---

## 文件改动范围

| 文件 | 改动内容 |
|------|---------|
| `public/css/theme.css` | ① `body` 加 `overflow-x:hidden`；② `.data-table-wrapper` 改 `overflow:hidden` |
| `public/js/app.js` | ③ `DeptRecordsPage` 新增 `tableHeight` 数据、`calcTableHeight` 方法、`mounted`/`beforeUnmount` 钩子；模板改 `:height="tableHeight"` |

---

## Task 1：防止全页横向滚动（工具栏固定问题）

**Files:**
- Modify: `public/css/theme.css:27`

**背景：** `body` 没有 `overflow-x:hidden`，导致当 el-table 内部宽度超出视口时，整页横向滚动，连工具栏也跟着移位。el-table 自带内部横向 scrollbar，无需让 body 横向滚。

- [ ] **Step 1：读取文件确认当前内容**

  打开 `public/css/theme.css`，找到第 27 行：
  ```css
  body { font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif; background: var(--neutral-bg); color: var(--text-primary); }
  ```

- [ ] **Step 2：修改 body 样式，禁止横向滚动**

  将第 27 行改为：
  ```css
  body { font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif; background: var(--neutral-bg); color: var(--text-primary); overflow-x: hidden; }
  ```

- [ ] **Step 3：验证**

  在浏览器打开系统，进入印喷部明细表，向右横向滚动表格。预期：工具栏（日期选择、各按钮）始终停在顶部，不随表格内容右移。

- [ ] **Step 4：Commit**

  ```bash
  git add public/css/theme.css
  git commit -m "fix: 禁止 body 横向滚动，工具栏不再随表格移位"
  ```

---

## Task 2：修复合计区冻结列 sticky 失效（列冻结问题）

**Files:**
- Modify: `public/css/theme.css:242-247`

**背景：** `.data-table-wrapper` 当前设置了 `overflow: clip`。`overflow: clip` 不会创建 scroll container，会破坏后代元素的 `position: sticky` 效果。改为 `overflow: hidden` 可保持裁剪效果，同时让 sticky 正常工作。

el-table 主体列已有 `fixed="left"`（selection 列、日期列、车间列），无需修改 `app.js`。只需修复 `#append` slot 内合计表格的 `.sa-fixed-col` sticky 失效问题。

- [ ] **Step 1：读取文件确认当前内容**

  打开 `public/css/theme.css`，找到第 242 行：
  ```css
  /* ===== 数据表格 ===== */
  .data-table-wrapper {
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    overflow: clip;
  }
  ```

- [ ] **Step 2：将 overflow: clip 改为 overflow: hidden**

  ```css
  /* ===== 数据表格 ===== */
  .data-table-wrapper {
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    overflow: hidden;
  }
  ```

- [ ] **Step 3：验证**

  在浏览器进入印喷部明细表，横向滚动表格到右侧。预期：
  - 主表格的「日期」「车间」列固定在左侧不动（el-table 的 fixed="left"）
  - 合计区（清溪合计/总合计等行）的「合计」「车间」列同样固定在左侧，不随数据列一起滚走

- [ ] **Step 4：Commit**

  ```bash
  git add public/css/theme.css
  git commit -m "fix: data-table-wrapper 改 overflow:hidden，合计区 sticky 冻结列生效"
  ```

---

## Task 3：表格高度自适应，填满屏幕（空白区问题）

**Files:**
- Modify: `public/js/app.js`（DeptRecordsPage 组件，约第 586-1200 行）

**背景：** 当前 el-table 写死 `height="500"`，屏幕较大时下方大片留白。改为动态计算高度：在 `mounted` 时用 `getBoundingClientRect` 量出工具栏底部到视口底部的距离，作为表格高度，并监听 `resize` 实时更新。

- [ ] **Step 1：在 data() 中新增 tableHeight**

  找到 `app.js` 中 `DeptRecordsPage` 组件的 `data()` 函数（约第 1049 行），在 `return { ... }` 对象内，在 `collapseState: {}` 之后加一行：

  **改前（约第 1097-1098 行）：**
  ```js
      // 折叠列状态（key: 分组名, value: true=收起 false=展开）
      collapseState: {}
    };
  ```

  **改后：**
  ```js
      // 折叠列状态（key: 分组名, value: true=收起 false=展开）
      collapseState: {},
      // 表格动态高度（由 calcTableHeight 计算）
      tableHeight: 500
    };
  ```

- [ ] **Step 2：在 methods 末尾新增 calcTableHeight 方法**

  `DeptRecordsPage` 组件末尾（约 2083-2085 行）当前结构：
  ```js
          this.settlementSubmitting = false;
        }
      }    // ← 最后一个方法 submitSettlement 的闭合
    }      // ← methods 对象的闭合
  };       // ← DeptRecordsPage 组件的闭合
  ```

  在 `submitSettlement` 的 `}` 之后、`methods` 闭合 `}` 之前插入：
  ```js
          this.settlementSubmitting = false;
        }
      },
      // 计算 el-table 动态高度：工具栏底部到视口底部的距离
      calcTableHeight() {
        this.$nextTick(() => {
          const toolbar = this.$el ? this.$el.querySelector('.toolbar') : null;
          if (toolbar) {
            const bottom = toolbar.getBoundingClientRect().bottom;
            this.tableHeight = window.innerHeight - bottom - 8;
          }
        });
      }
    }      // ← methods 对象的闭合
  };       // ← DeptRecordsPage 组件的闭合
  ```

- [ ] **Step 3：新增 mounted 和 beforeUnmount 钩子**

  在 `DeptRecordsPage` 的 `created()` 钩子（约第 1150 行）之后，`methods:` 之前，新增两个生命周期钩子：

  **改前：**
  ```js
    created() {
      this.initCollapseState();
    },
    methods: {
  ```

  **改后：**
  ```js
    created() {
      this.initCollapseState();
    },
    mounted() {
      this.calcTableHeight();
      this._tableResizeHandler = () => this.calcTableHeight();
      window.addEventListener('resize', this._tableResizeHandler);
    },
    beforeUnmount() {
      window.removeEventListener('resize', this._tableResizeHandler);
    },
    methods: {
  ```

- [ ] **Step 4：模板中将 height="500" 改为 :height="tableHeight"**

  在 `DeptRecordsPage` 的模板里找到第 657 行：
  ```html
  <el-table :data="tableData" border stripe height="500" style="width:100%"
  ```

  改为：
  ```html
  <el-table :data="tableData" border stripe :height="tableHeight" style="width:100%"
  ```

- [ ] **Step 5：验证**

  刷新浏览器，进入印喷部明细表。预期：
  - 表格撑满页面高度，合计区在底部，合计区下方没有空白
  - 改变浏览器窗口大小，表格高度随之自动调整
  - 数据行行高不变，只是能显示更多行

- [ ] **Step 6：Commit**

  ```bash
  git add public/js/app.js
  git commit -m "feat: 明细表高度自适应屏幕，消除底部空白"
  ```

---

## Task 4：三个部门全部回归测试

**背景：** DeptRecordsPage 被啤机/印喷/装配三个部门共用，需逐一验证。

- [ ] **Step 1：啤机部验证**

  进入啤机部明细表，检查：
  1. 工具栏在横向滚动时固定不动
  2. 表格高度撑满，下方无空白
  3. 横向滚动时日期/车间列及合计区车间列均固定在左侧

- [ ] **Step 2：印喷部验证**（同上）

- [ ] **Step 3：装配部验证**

  装配部有「更多费用」折叠列，验证折叠/展开操作后表格高度仍正常。

- [ ] **Step 4：验证固定费用弹窗和月底结算弹窗**

  确认弹窗仍能正常打开、提交，布局改动没有影响弹窗交互。

- [ ] **Step 5：最终 Commit**

  ```bash
  git add public/css/theme.css public/js/app.js
  git commit -m "feat: 明细表布局改版完成（工具栏固定+列冻结+高度自适应）"
  ```
