# 明细表布局改版设计规范

**日期：** 2026-04-01  
**分支：** feat/summary-table-redesign  
**影响范围：** 三个部门明细表页（啤机/印喷/装配）的前端展示层

---

## 背景

明细表当前存在三个视觉/交互问题：
1. 工具栏随表格横向滚动一起移动，滚到右边后工具栏消失
2. 日期和车间两列没有固定冻结，向右滚动后无法对齐数据
3. `el-table` 设置了固定 `height="500"`，屏幕较大时下方出现大片空白

---

## 改动一：工具栏固定，不随横向滚动移位

**问题根因：** `.dept-records-page` 是普通块级容器，`.data-table-wrapper` 内的横向滚动会带动整个页面布局偏移，导致上方工具栏视觉上跟着移位（实为页面级横向滚动）。

**方案：** 将 `.dept-records-page` 改为 flex 纵向布局，明确隔离工具栏和表格两个层级：
- 工具栏 div：`flex-shrink: 0`，宽度不超过视口，`overflow: hidden`
- 表格容器 `.data-table-wrapper`：`flex: 1`，内部允许横向滚动

**关键 CSS（`theme.css`）：**
```css
.dept-records-page {
  display: flex;
  flex-direction: column;
  height: 100%;          /* 撑满父容器 */
  overflow: hidden;
}
.dept-records-page .toolbar {
  flex-shrink: 0;
  overflow: hidden;      /* 工具栏本身不溢出 */
}
.dept-records-page .data-table-wrapper {
  flex: 1;
  overflow: hidden;      /* 让 el-table 内部滚动 */
  min-height: 0;         /* flex 子项必须加，否则不收缩 */
}
```

---

## 改动二：日期 + 车间列冻结（确保生效）

**现状：** `el-table` 主体列已有 `fixed="left"`（选择列、日期列、车间列），主表格冻结逻辑正确。问题在于 `#append` slot 内的自定义合计 `<table>` 使用 `.sa-fixed-col` 做 sticky，可能因父容器 `overflow` 设置不当导致 sticky 失效。

**方案：**
- 主表格列：保持现有 `fixed="left"` 不变，确认宽度对齐（selection 40px、日期 120px、车间 95px）
- 合计区 `.sa-fixed-col`：确保样式为 `position: sticky; z-index: 2`，且滚动容器（`el-table` 内的 `.el-scrollbar__wrap`）的 `overflow-x: auto` 是合计表的直接滚动祖先

**无需修改 `app.js` 的 `fixed="left"` 声明**，只需通过 CSS 修复合计区 sticky 失效问题。

---

## 改动三：表格高度自适应，填满剩余屏幕

**问题：** `el-table` 写死 `height="500"`，屏幕较高时下方留白。

**方案：** 改为动态高度，用 Vue 的 `data` 属性 `tableHeight` 驱动，通过计算 `window.innerHeight` 减去页头和工具栏的占用高度得出。

**实现要点（`app.js` 内 `DeptRecordsPage` 组件）：**

```js
// data 中新增
tableHeight: 500,

// methods 中新增
calcTableHeight() {
  // 顶部导航高度 + 工具栏高度 + 上下内边距，实现时用 getBoundingClientRect 实测
  const toolbar = document.querySelector('.dept-records-page .toolbar');
  const toolbarBottom = toolbar ? toolbar.getBoundingClientRect().bottom : 104;
  this.tableHeight = window.innerHeight - toolbarBottom - 8; // 8px 底部留白
},

// mounted 中调用
mounted() {
  this.calcTableHeight();
  window.addEventListener('resize', this.calcTableHeight);
},
beforeUnmount() {
  window.removeEventListener('resize', this.calcTableHeight);
},
```

**模板：**
```html
<!-- 将 height="500" 改为 :height="tableHeight" -->
<el-table :data="tableData" :height="tableHeight" ...>
```

---

## 文件改动范围

| 文件 | 改动内容 |
|------|---------|
| `public/css/theme.css` | 改动一的 CSS：dept-records-page flex 布局 |
| `public/js/app.js` | 改动三：tableHeight 数据驱动 + resize 监听；确认改动二的 fixed 属性存在 |

> 合计区 sticky 问题（改动二）若 CSS 已足够修复，则只改 `theme.css`；若需调整合计表结构才能让 sticky 生效，则涉及 `app.js`。

---

## 不在本次范围内

- 其他页面（汇总页、设置页）的布局
- 行高、字体大小等视觉风格调整
- 新增字段或计算逻辑
