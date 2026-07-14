# Manager Sidebar Parent Hover Color Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the active `민원·하자` parent hover use the same foreground and background colors as `소통·공지`.

**Architecture:** Keep both collapsible parents on the shared `manager-sidebar__parent-toggle` selector. Extend the existing hover rule with the shared foreground token so active state color cannot leak into hover state.

**Tech Stack:** CSS design tokens, Node test runner, Next.js web package.

## Global Constraints

- Use only existing CSS variables.
- Do not add domain-specific selectors.
- Do not modify infrastructure files.

---

### Task 1: Shared parent hover color contract

**Files:**
- Modify: `apps/web/src/app/manager/manager-workspace-shell.spec.ts`
- Modify: `apps/web/src/app/manager/globals.css`

**Interfaces:**
- Consumes: `.manager-sidebar__parent-toggle:hover`.
- Produces: `color: var(--on-surface)` and `background: var(--surface-container-high)` in the same rule.

- [ ] Add a failing source contract assertion for both declarations in the hover rule.
- [ ] Run the targeted spec and confirm it fails because the color declaration is missing.
- [ ] Add the existing `--on-surface` token to the hover rule.
- [ ] Run the targeted spec and confirm it passes.
- [ ] Run `pnpm --filter web test:unit` and `bash scripts/verify.sh`.
- [ ] Commit only the intended CSS, test, spec, and plan files and push `kms-fix-claim`.
