---
phase: 1
slug: bug
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest（已安装，package.json scripts.test = "jest --verbose"） |
| **Config file** | package.json（无独立 jest.config.js） |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 2 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01 | 01 | 0 | BUG-01 | integration | `npm test -- --testPathPattern=bug-fixes` | ❌ W0 | ⬜ pending |
| 01-02 | 01 | 0 | BUG-02 | unit/SQL | `npm test -- --testPathPattern=bug-fixes` | ❌ W0 | ⬜ pending |
| 01-03 | 01 | 0 | BUG-03 | integration | `npm test -- --testPathPattern=bug-fixes` | ❌ W0 | ⬜ pending |
| 01-04 | 01 | 0 | BUG-04 | integration | `npm test -- --testPathPattern=bug-fixes` | ❌ W0 | ⬜ pending |
| 01-05 | 01 | 0 | BUG-05 | unit/SQL | `npm test -- --testPathPattern=bug-fixes` | ❌ W0 | ⬜ pending |
| 01-06 | 01 | 0 | BUG-06 | unit | `npm test -- --testPathPattern=bug-fixes` | ❌ W0 | ⬜ pending |
| 01-07 | 01 | 0 | BUG-07 | integration | `npm test -- --testPathPattern=bug-fixes` | ❌ W0 | ⬜ pending |
| 01-08 | 01 | 0 | BUG-08 | manual-only | N/A | N/A | ⬜ pending |
| 01-09 | 01 | 0 | BUG-09 | manual-only | N/A | N/A | ⬜ pending |
| 01-10 | 01 | 0 | BUG-10 | manual-only | N/A | N/A | ⬜ pending |
| 01-11 | 01 | 0 | BUG-11 | unit/DB | `npm test -- --testPathPattern=bug-fixes` | ❌ W0 | ⬜ pending |
| 01-12 | 01 | 0 | BUG-12 | integration | `npm test -- --testPathPattern=bug-fixes` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/bug-fixes.test.js` — 覆盖 BUG-01 到 BUG-07、BUG-11、BUG-12 的回归测试
- [ ] 测试数据库连接：直接用 `db/postgres.js`（localhost:5432/production_system）
- [ ] 三部门基础 CRUD 测试（用户要求覆盖）

*Existing infrastructure: Jest 已安装，24 tests passing（modules.test.js + calc.test.js）*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 数据锁定部门下拉动态生成 | BUG-08 | 纯前端 Vue template，Jest 无法测试 DOM | 打开数据锁定页面，确认下拉框显示三个部门 |
| 用户管理部门下拉动态生成 | BUG-09 | 纯前端 Vue template，Jest 无法测试 DOM | 打开用户管理页面，新增/编辑用户时确认下拉框动态生成 |
| 编辑框边框使用 CSS 变量 | BUG-10 | 纯前端样式检查 | 打开明细表，进入编辑模式，确认边框使用 CSS 变量颜色 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 2s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
