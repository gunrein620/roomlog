# Manager Ticket Action Menu Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the manager ticket row action menu outside the horizontally scrolling table so every menu remains visible within the viewport.

**Architecture:** Extract viewport placement into a pure TypeScript function and render the interactive menu through a React DOM Portal. The row component keeps only ticket-specific links while the menu component owns open state, measurement, dismissal, and accessibility.

**Tech Stack:** React 19, Next.js 16, TypeScript, React DOM `createPortal`, Node test runner with `ts-node/register`, CSS design tokens.

## Global Constraints

- Keep all UI colors and spacing on existing CSS variables; no raw hex values.
- Add no new runtime dependency.
- Preserve the existing three ticket action routes and labels.
- Close the menu on outside pointer, Escape, scroll, and resize.
- Do not modify infrastructure files.

---

### Task 1: Viewport-aware menu placement

**Files:**
- Create: `apps/web/src/app/manager/ticket/dash/00/ticket-action-menu-position.ts`
- Create: `apps/web/src/app/manager/ticket/dash/00/ticket-action-menu-position.spec.ts`

**Interfaces:**
- Consumes: trigger rectangle, menu dimensions, viewport dimensions, and edge gap as numbers.
- Produces: `placeTicketActionMenu(input): { top: number; left: number; placement: "top" | "bottom" }`.

- [ ] **Step 1: Write the failing test**

```ts
test("places below when space is available", () => {
  assert.deepEqual(placeTicketActionMenu({ trigger: { top: 100, right: 300, bottom: 144 }, menu: { width: 180, height: 140 }, viewport: { width: 1200, height: 800 }, gap: 8 }), { top: 152, left: 120, placement: "bottom" });
});

test("flips above and clamps to viewport edges", () => {
  assert.deepEqual(placeTicketActionMenu({ trigger: { top: 680, right: 90, bottom: 724 }, menu: { width: 180, height: 140 }, viewport: { width: 800, height: 740 }, gap: 8 }), { top: 532, left: 8, placement: "top" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/ticket/dash/00/ticket-action-menu-position.spec.ts`

Expected: FAIL because `ticket-action-menu-position` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export function placeTicketActionMenu(input: TicketActionMenuPlacementInput) {
  const belowTop = input.trigger.bottom + input.gap;
  const aboveTop = input.trigger.top - input.gap - input.menu.height;
  const fitsBelow = belowTop + input.menu.height <= input.viewport.height - input.gap;
  const placement = fitsBelow || aboveTop < input.gap ? "bottom" : "top";
  const top = placement === "bottom" ? belowTop : aboveTop;
  const left = Math.min(Math.max(input.gap, input.trigger.right - input.menu.width), input.viewport.width - input.gap - input.menu.width);
  return { top: Math.max(input.gap, top), left, placement };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run the Step 2 command.

Expected: 2 passing tests and 0 failures.

### Task 2: Portal action menu component

**Files:**
- Create: `apps/web/src/app/manager/ticket/dash/00/TicketActionMenu.tsx`
- Modify: `apps/web/src/app/manager/ticket/dash/00/ManagerDefectDashboard.tsx:1-123`
- Modify: `apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`
- Modify: `apps/web/src/app/manager/globals.css:2454-2540`

**Interfaces:**
- Consumes: `ticketId`, `ticketTitle`.
- Produces: an accessible trigger and a body-level Portal containing the existing three links.

- [ ] **Step 1: Tighten the source contract before implementation**

Assert that the menu component imports `createPortal` and `placeTicketActionMenu`, exposes `aria-haspopup`, `aria-expanded`, and closes on `Escape`, `pointerdown`, `scroll`, and `resize`. Assert that the dashboard uses `<TicketActionMenu>` and no longer contains `<details>` or the last-three-row CSS selector.

- [ ] **Step 2: Run the targeted dashboard test to verify it fails**

Run: `cd apps/web && TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' node --test -r ts-node/register src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`

Expected: FAIL because the Portal component and new contract do not exist.

- [ ] **Step 3: Implement the minimal Portal component**

Use a button ref and menu ref. On open, render the Portal, measure it in `useLayoutEffect`, call `placeTicketActionMenu`, and apply fixed `top`/`left`. Register document/window dismissal listeners only while open and remove them in cleanup.

- [ ] **Step 4: Replace the row-local details menu**

Replace the `<details>` block with:

```tsx
<TicketActionMenu ticketId={row.ticket.id} ticketTitle={row.ticket.title} />
```

Remove the obsolete absolute positioning and last-three-row flip CSS. Add fixed-position Portal menu styles using the existing token variables and `var(--z-floating)`.

- [ ] **Step 5: Run targeted tests**

Run both Task 1 and Task 2 test commands.

Expected: all targeted tests pass with 0 failures.

### Task 3: Regression and runtime verification

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: completed Portal implementation.
- Produces: test, build, and browser evidence.

- [ ] **Step 1: Run web unit tests**

Run: `pnpm --filter web test:unit`

Expected: all tests pass.

- [ ] **Step 2: Run repository verification**

Run: `bash scripts/verify.sh`

Expected: types, UI, web, API builds and API smoke checks pass.

- [ ] **Step 3: Rebuild the Docker web service and inspect the menu**

Run: `docker compose up -d --build web`

Check the first, middle, and final visible ticket row. For each open menu, verify its bounding rectangle remains inside the viewport and is not intersected by the table scroll wrapper's clipping rectangle.

- [ ] **Step 4: Commit and push**

Stage only the Portal implementation, its tests, CSS, and this plan. Commit as `fix(manager): prevent ticket action menu clipping`, then push `kms-fix-claim`.
