# Roomlog Floor Plan Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static `/floor-plan-3d` blueprint preview with a working Roomlog floor-plan editor core.

**Architecture:** Keep the 123123 integration boundary explicit but avoid copying the full external dependency stack in one commit. Add a small pure model module for wall snapping, selection, deletion, and summary calculations, then add a focused client component that uses SVG pointer events to draw and edit walls.

**Tech Stack:** Next.js App Router, React client component, SVG, Node test runner, plain ESM model module.

---

### Task 1: Editor Model And Client Shell

**Files:**
- Modify: `apps/web/property-shell.spec.mjs`
- Create: `apps/web/src/app/floor-plan-3d/floor-plan-editor-model.mjs`
- Create: `apps/web/src/app/floor-plan-3d/floor-plan-editor-model.d.ts`
- Create: `apps/web/src/app/floor-plan-3d/RoomlogFloorPlanEditor.tsx`
- Modify: `apps/web/src/app/floor-plan-3d/page.tsx`
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Write the failing test**

Add tests that import `floor-plan-editor-model.mjs` and assert:
- `createWall({x: 0, y: 0}, {x: 130, y: 40}, "w1")` creates a horizontal snapped wall ending at `{x: 120, y: 0}`.
- `findNearestWall` can select that wall near `{x: 48, y: 5}`.
- `removeWall` removes the wall by id.
- `/floor-plan-3d/page.tsx` renders `RoomlogFloorPlanEditor`.
- `RoomlogFloorPlanEditor.tsx` is a client component with pointer drawing handlers.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test`

Expected: FAIL because the model and client editor component do not exist yet.

- [ ] **Step 3: Add the model**

Create `floor-plan-editor-model.mjs` with exported functions:
- `snapToGrid(point, gridSize)`
- `snapToOrthogonal(start, end)`
- `createWall(start, end, id)`
- `distanceToWall(point, wall)`
- `findNearestWall(walls, point, maxDistance)`
- `removeWall(walls, wallId)`
- `summarizeWalls(walls)`
- `createStarterWalls()`

- [ ] **Step 4: Add the client editor**

Create `RoomlogFloorPlanEditor.tsx` as a `'use client'` component that:
- keeps `tool`, `walls`, `draftWall`, and `selectedWallId` in React state
- draws walls through an SVG workspace
- supports wall drawing through pointer down/move/up
- supports selection and eraser through nearest-wall lookup
- supports clear and sample restore actions

- [ ] **Step 5: Connect the route**

Update `/floor-plan-3d/page.tsx` so the static blueprint workspace is replaced by `<RoomlogFloorPlanEditor />`.

- [ ] **Step 6: Run verification**

Run:

```bash
pnpm --filter web test
pnpm --filter web build
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:3001/floor-plan-3d
```

Expected: tests and build exit 0, HTTP returns `200`.

- [ ] **Step 7: Commit and push**

Run:

```bash
git add docs/superpowers/plans/2026-07-01-roomlog-floor-plan-editor.md apps/web/property-shell.spec.mjs apps/web/src/app/floor-plan-3d/floor-plan-editor-model.mjs apps/web/src/app/floor-plan-3d/floor-plan-editor-model.d.ts apps/web/src/app/floor-plan-3d/RoomlogFloorPlanEditor.tsx apps/web/src/app/floor-plan-3d/page.tsx apps/web/src/app/globals.css
git commit -m "feat: add roomlog floor plan editor core"
git push origin kms
```
