# Manager Defect Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace only the `/manager/ticket/dash/00` body with a live-data defect management dashboard matching the attached Stitch layout.

**Architecture:** Keep `page.tsx` as the Server Component data boundary, combine each `Ticket` with its `RepairJob`, and pass rows to one route-local Client Component. Put deterministic status/count/filter/pagination logic in a route-local pure TypeScript module so it can be tested without rendering React.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Node test runner, Roomlog shared types and CSS tokens.

## Global Constraints

- Do not modify `ManagerSidebar`, `manager-navigation.ts`, any other sidebar item, or another manager page.
- Do not modify Dockerfile, Compose, workflow, deployment, or environment files.
- Use existing Roomlog CSS variables only; do not add raw hex colors.
- Keep `listManagerTickets()`, `getManagerRepair()`, and `ticketDashHref("01", ticket.id)` as the live-data and detail-routing contracts.
- Do not fabricate building names, assignee contacts, periodic inspections, or sample rows.

## File Structure

- Create `apps/web/src/app/manager/ticket/dash/00/ticket-dashboard-model.ts`: pure row filtering, status counting, pagination, and display helpers.
- Create `apps/web/src/app/manager/ticket/dash/00/ticket-dashboard-model.spec.ts`: behavior tests for the pure model.
- Create `apps/web/src/app/manager/ticket/dash/00/ManagerDefectDashboard.tsx`: route-local interactive dashboard body.
- Modify `apps/web/src/app/manager/ticket/dash/00/page.tsx`: server fetch and row composition only.
- Modify `apps/web/src/app/manager/globals.css`: scoped `.manager-defect-dashboard*` presentation rules only.
- Create `apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`: source-contract regression test for required controls, columns, detail route, and sidebar isolation.

---

### Task 1: Pure defect dashboard model

**Files:**
- Create: `apps/web/src/app/manager/ticket/dash/00/ticket-dashboard-model.spec.ts`
- Create: `apps/web/src/app/manager/ticket/dash/00/ticket-dashboard-model.ts`

**Interfaces:**
- Consumes: `Ticket`, `RepairJob`, and `TicketStatus` from `@roomlog/types`.
- Produces: `DefectDashboardRow`, `DefectStatusFilter`, `DEFECT_STATUS_FILTERS`, `countDefectStatuses(rows)`, `filterDefectRows(rows, filters)`, `paginateDefectRows(rows, page, pageSize)`, `ticketStatusGroup(status)`, `formatDefectDate(iso)`, and `formatDefectMoney(amount)`.

- [ ] **Step 1: Write the failing model test**

```ts
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import type { Ticket } from "@roomlog/types";
import {
  countDefectStatuses,
  filterDefectRows,
  paginateDefectRows,
  ticketStatusGroup,
  type DefectDashboardRow,
} from "./ticket-dashboard-model";

const ticket = (id: string, status: Ticket["status"]): Ticket => ({
  id, type: "defect", unitId: "302", title: id, description: id,
  status, urgency: 3, createdAt: "2026-07-10T09:00:00+09:00",
  updatedAt: "2026-07-10T09:00:00+09:00",
});

describe("manager defect dashboard model", () => {
  const rows: DefectDashboardRow[] = [
    { ticket: ticket("waiting", "received") },
    { ticket: ticket("processing", "processing"), repair: { id: "r1", ticketId: "processing", stage: "scheduled", vendorName: "우주설비", scheduledAt: "2026-07-11T10:00:00+09:00" } },
    { ticket: ticket("done", "resolved") },
    { ticket: ticket("cancelled", "cancelled") },
  ];

  it("groups ticket states into the requested status chips", () => {
    assert.equal(ticketStatusGroup("info_requested"), "waiting");
    assert.equal(ticketStatusGroup("processing"), "in_progress");
    assert.equal(ticketStatusGroup("resolved"), "completed");
    assert.equal(ticketStatusGroup("cancelled"), "cancelled");
  });

  it("counts and filters live rows without fabricating periodic rows", () => {
    assert.deepEqual(countDefectStatuses(rows), { all: 4, waiting: 1, in_progress: 1, completed: 1, cancelled: 1, periodic: 0 });
    assert.deepEqual(filterDefectRows(rows, { status: "periodic", worker: "all", building: "all", template: "all" }), []);
    assert.deepEqual(filterDefectRows(rows, { status: "in_progress", worker: "우주설비", building: "all", template: "defect" }).map((row) => row.ticket.id), ["processing"]);
  });

  it("clamps pagination to a valid page", () => {
    assert.deepEqual(paginateDefectRows(rows, 9, 2), { page: 2, totalPages: 2, rows: rows.slice(2) });
  });
});
```

- [ ] **Step 2: Run the model test and verify RED**

Run: `pnpm --filter web exec node --test -r ts-node/register src/app/manager/ticket/dash/00/ticket-dashboard-model.spec.ts`

Expected: FAIL because `./ticket-dashboard-model` does not exist.

- [ ] **Step 3: Implement the pure model**

Implement the exported contracts with this complete model:

```ts
import type { RepairJob, Ticket, TicketStatus } from "@roomlog/types";

export type DefectStatusFilter = "all" | "waiting" | "in_progress" | "completed" | "cancelled" | "periodic";
export type DefectDashboardRow = { ticket: Ticket; repair?: RepairJob };
export type DefectDashboardFilters = {
  status: DefectStatusFilter;
  worker: "all" | string;
  building: "all" | "missing";
  template: "all" | Ticket["type"];
};

export const DEFECT_STATUS_FILTERS = [
  ["all", "전체"], ["waiting", "대기"], ["in_progress", "진행중"],
  ["completed", "완료"], ["cancelled", "취소"], ["periodic", "정기점검"],
] as const;

export function ticketStatusGroup(status: TicketStatus): Exclude<DefectStatusFilter, "all" | "periodic"> {
  if (["received", "reviewing", "info_requested", "reopened"].includes(status)) return "waiting";
  if (status === "processing") return "in_progress";
  if (status === "resolved") return "completed";
  return "cancelled";
}

export function countDefectStatuses(rows: readonly DefectDashboardRow[]) {
  const counts = { all: rows.length, waiting: 0, in_progress: 0, completed: 0, cancelled: 0, periodic: 0 };
  for (const row of rows) counts[ticketStatusGroup(row.ticket.status)] += 1;
  return counts;
}

export function filterDefectRows(rows: readonly DefectDashboardRow[], filters: DefectDashboardFilters) {
  if (filters.status === "periodic") return [];
  return rows.filter((row) => {
    const statusMatches = filters.status === "all" || ticketStatusGroup(row.ticket.status) === filters.status;
    const workerMatches = filters.worker === "all" || row.repair?.vendorName === filters.worker;
    const buildingMatches = filters.building === "all" || filters.building === "missing";
    const templateMatches = filters.template === "all" || row.ticket.type === filters.template;
    return statusMatches && workerMatches && buildingMatches && templateMatches;
  });
}

export function paginateDefectRows(rows: readonly DefectDashboardRow[], page: number, pageSize: number) {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(rows.length / safePageSize));
  const safePage = Math.min(totalPages, Math.max(1, Math.floor(page) || 1));
  const start = (safePage - 1) * safePageSize;
  return { page: safePage, totalPages, rows: rows.slice(start, start + safePageSize) };
}

export function formatDefectDate(iso?: string) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" }).format(date);
}

export function formatDefectMoney(amount?: number) {
  return typeof amount === "number" ? new Intl.NumberFormat("ko-KR").format(amount) : "—";
}
```

The implementation returns no rows for `periodic`, matches `repair.vendorName` for worker, treats every current row as missing building data, and matches `ticket.type` for template. Pagination clamps to `1..totalPages`, with `totalPages` at least 1. Formatters return `—` for missing values and use Korean locale for valid dates/money.

- [ ] **Step 4: Run the model test and verify GREEN**

Run: `pnpm --filter web exec node --test -r ts-node/register src/app/manager/ticket/dash/00/ticket-dashboard-model.spec.ts`

Expected: 3 tests PASS.

- [ ] **Step 5: Commit the model slice**

```bash
git add apps/web/src/app/manager/ticket/dash/00/ticket-dashboard-model.ts apps/web/src/app/manager/ticket/dash/00/ticket-dashboard-model.spec.ts
git commit -m "test(ticket): define defect dashboard model"
```

---

### Task 2: Stitch-aligned live dashboard body

**Files:**
- Create: `apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`
- Create: `apps/web/src/app/manager/ticket/dash/00/ManagerDefectDashboard.tsx`
- Modify: `apps/web/src/app/manager/ticket/dash/00/page.tsx`
- Modify: `apps/web/src/app/manager/globals.css`

**Interfaces:**
- Consumes: `DefectDashboardRow` and all helpers from Task 1, plus `ticketDashHref("01", ticket.id)`.
- Produces: `ManagerDefectDashboard({ rows }: { rows: readonly DefectDashboardRow[] })`.

- [ ] **Step 1: Write the failing source-contract test**

The test must read the route component, page, scoped CSS, sidebar, and navigation source. It must import `createHash` from `node:crypto` and assert:

```ts
for (const label of ["하자 관리", "전체", "대기", "진행중", "완료", "취소", "정기점검", "담당자", "건물", "템플릿"]) {
  assert.match(componentSource, new RegExp(label));
}
for (const column of ["유형", "작업명", "건물", "호실", "작업자", "예정일시", "청구 금액", "상태", "작업"]) {
  assert.match(componentSource, new RegExp(column));
}
assert.match(componentSource, /ticketDashHref\("01",\s*row\.ticket\.id\)/);
assert.match(pageSource, /<ManagerDefectDashboard rows=\{rows\}/);
assert.match(cssSource, /\.manager-defect-dashboard/);
assert.doesNotMatch(sidebarSource, /민원 대시보드|민원 대응|하자 관리/);
const sha256 = (source: string) => createHash("sha256").update(source).digest("hex");
assert.equal(sha256(sidebarSource), "41234fc1e7a78647c95c80805b031994c957f56438e19fe5d994a28097ff31c6");
assert.equal(sha256(navigationSource), "916f5fd9a3711a3c704d319467e0dabc6c8596d234e62cb3f42ac5033bff0458");
```

These digests lock the two excluded sidebar files to their pre-implementation contents so this change cannot silently alter them.

- [ ] **Step 2: Run the UI contract test and verify RED**

Run: `pnpm --filter web exec node --test -r ts-node/register src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`

Expected: FAIL because `ManagerDefectDashboard.tsx` and scoped dashboard styles do not exist.

- [ ] **Step 3: Implement the route-local client component**

Create a client component that:

```tsx
"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, EllipsisVertical } from "lucide-react";
import { useMemo, useState } from "react";
import { ticketDashHref } from "../../_components/ticket-manager-ui";
import {
  DEFECT_STATUS_FILTERS,
  countDefectStatuses,
  filterDefectRows,
  formatDefectDate,
  formatDefectMoney,
  paginateDefectRows,
  ticketStatusGroup,
  type DefectDashboardFilters,
  type DefectDashboardRow,
} from "./ticket-dashboard-model";

const PAGE_SIZE = 10;
const ticketTypeLabel = { defect: "하자 민원", complaint: "일반 민원" } as const;
const ticketStateLabel = {
  received: "대기", reviewing: "대기", info_requested: "대기", reopened: "대기",
  processing: "진행중", resolved: "완료", cancelled: "취소",
} as const;

function DashboardRow({ row }: { row: DefectDashboardRow }) {
  const statusGroup = ticketStatusGroup(row.ticket.status);
  return (
    <tr>
      <td><span className="manager-defect-dashboard__type-badge">{ticketTypeLabel[row.ticket.type]}</span></td>
      <td><Link href={ticketDashHref("01", row.ticket.id)}>{row.ticket.title}</Link></td>
      <td>—</td>
      <td>{row.ticket.unitId || "—"}</td>
      <td>{row.repair?.vendorName ?? "미배정"}</td>
      <td>{formatDefectDate(row.repair?.scheduledAt)}</td>
      <td>{formatDefectMoney(row.repair?.quoteAmount)}</td>
      <td><span className="manager-defect-dashboard__status-badge" data-status={statusGroup}>{ticketStateLabel[row.ticket.status]}</span></td>
      <td><div className="manager-defect-dashboard__action"><Link href={ticketDashHref("01", row.ticket.id)}>정보입력</Link><button type="button" aria-label={`${row.ticket.title} 추가 작업`}><EllipsisVertical aria-hidden="true" /></button></div></td>
    </tr>
  );
}

export function ManagerDefectDashboard({ rows }: { rows: readonly DefectDashboardRow[] }) {
  const [filters, setFilters] = useState<DefectDashboardFilters>({ status: "all", worker: "all", building: "all", template: "all" });
  const [page, setPage] = useState(1);
  const counts = useMemo(() => countDefectStatuses(rows), [rows]);
  const workers = useMemo(() => Array.from(new Set(rows.flatMap((row) => row.repair?.vendorName ? [row.repair.vendorName] : []))).sort(), [rows]);
  const filteredRows = useMemo(() => filterDefectRows(rows, filters), [rows, filters]);
  const pageResult = paginateDefectRows(filteredRows, page, 10);
  const firstResult = filteredRows.length === 0 ? 0 : (pageResult.page - 1) * PAGE_SIZE + 1;
  const lastResult = Math.min(pageResult.page * PAGE_SIZE, filteredRows.length);
  const resultLabel = `Showing ${firstResult} to ${lastResult} of ${filteredRows.length} entries`;
  const pageButtons = (
    <>
      <button type="button" aria-label="이전 페이지" disabled={pageResult.page === 1} onClick={() => setPage(pageResult.page - 1)}><ChevronLeft aria-hidden="true" /></button>
      {Array.from({ length: pageResult.totalPages }, (_, index) => index + 1).map((pageNumber) => <button key={pageNumber} type="button" aria-label={`${pageNumber} 페이지`} aria-current={pageResult.page === pageNumber ? "page" : undefined} onClick={() => setPage(pageNumber)}>{pageNumber}</button>)}
      <button type="button" aria-label="다음 페이지" disabled={pageResult.page === pageResult.totalPages} onClick={() => setPage(pageResult.page + 1)}><ChevronRight aria-hidden="true" /></button>
    </>
  );

  return (
    <section className="manager-defect-dashboard" aria-labelledby="manager-defect-title">
      <h2 id="manager-defect-title">하자 관리</h2>
      <div className="manager-defect-dashboard__status-filters" aria-label="하자 상태 필터">
        {DEFECT_STATUS_FILTERS.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={filters.status === value}
            onClick={() => { setFilters((current) => ({ ...current, status: value })); setPage(1); }}>
            {label}{value === "periodic" ? "" : ` ${counts[value]}`}
          </button>
        ))}
      </div>
      <div className="manager-defect-dashboard__filter-panel">
        <label>담당자<select value={filters.worker} onChange={(event) => { setFilters((current) => ({ ...current, worker: event.target.value })); setPage(1); }}><option value="all">전체</option>{workers.map((worker) => <option key={worker}>{worker}</option>)}</select></label>
        <label>건물<select value={filters.building} onChange={(event) => { setFilters((current) => ({ ...current, building: event.target.value as DefectDashboardFilters["building"] })); setPage(1); }}><option value="all">전체</option><option value="missing">정보 없음</option></select></label>
        <label>템플릿<select value={filters.template} onChange={(event) => { setFilters((current) => ({ ...current, template: event.target.value as DefectDashboardFilters["template"] })); setPage(1); }}><option value="all">전체</option><option value="defect">하자 민원</option><option value="complaint">일반 민원</option></select></label>
      </div>
      <div className="manager-defect-dashboard__table-scroll">
        <table className="manager-defect-dashboard__table">
          <thead><tr>{["유형", "작업명", "건물", "호실", "작업자", "예정일시", "청구 금액", "상태", "작업"].map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
          <tbody>
            {pageResult.rows.map((row) => <DashboardRow key={row.ticket.id} row={row} />)}
            {pageResult.rows.length === 0 ? <tr><td colSpan={9}>조건에 맞는 하자·민원 티켓이 없습니다.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <footer className="manager-defect-dashboard__pagination">
        <span>{resultLabel}</span>
        <nav aria-label="하자 목록 페이지">{pageButtons}</nav>
      </footer>
    </section>
  );
}
```

The code renders all nine cells, maps `defect` to `하자 민원` and `complaint` to `일반 민원`, preserves the detail route, and retains honest missing-data labels.

- [ ] **Step 4: Replace the server page body with row composition**

```tsx
export default async function Page() {
  const tickets = await listManagerTickets();
  const repairs = await Promise.all(tickets.map((ticket) => getManagerRepair(ticket.id)));
  const rows = tickets.map((ticket, index) => ({ ticket, repair: repairs[index] }));
  return <ManagerDefectDashboard rows={rows} />;
}
```

- [ ] **Step 5: Add only scoped token-based CSS**

Add this complete scoped rule set and extend only if the rendered browser check exposes an accessibility or overflow defect:

```css
/* manager-defect-dashboard:start */
.manager-defect-dashboard { display: grid; gap: var(--space-xl); }
.manager-defect-dashboard h2 { margin: 0; font-size: var(--fs-title); line-height: var(--lh-title); }
.manager-defect-dashboard__status-filters { display: flex; flex-wrap: wrap; gap: var(--space-sm); }
.manager-defect-dashboard__status-filters button { min-height: var(--touch-target); padding: 0 var(--space-lg); border: 1px solid var(--border); border-radius: var(--radius-full); color: var(--on-surface-variant); background: var(--surface-container-lowest); font: inherit; font-weight: var(--fw-subtitle); }
.manager-defect-dashboard__status-filters button[aria-pressed="true"] { border-color: var(--primary); color: var(--on-primary); background: var(--primary); }
.manager-defect-dashboard__filter-panel { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-lg); padding: var(--space-lg); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-container-lowest); box-shadow: var(--shadow); }
.manager-defect-dashboard__filter-panel label { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: var(--space-sm); color: var(--on-surface-variant); font-size: var(--fs-caption); font-weight: var(--fw-subtitle); }
.manager-defect-dashboard__filter-panel select { min-height: var(--touch-target); border: 0; border-radius: var(--radius); padding: 0 var(--space-md); color: var(--input-text); background: var(--surface-container-low); font: inherit; }
.manager-defect-dashboard__table-scroll { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-container-lowest); box-shadow: var(--shadow); }
.manager-defect-dashboard__table { width: 100%; min-width: 1120px; border-collapse: collapse; }
.manager-defect-dashboard__table th, .manager-defect-dashboard__table td { padding: var(--space-lg); border-bottom: 1px solid var(--border); text-align: left; vertical-align: middle; }
.manager-defect-dashboard__table th { color: var(--on-surface-variant); background: var(--surface-container-low); font-size: var(--fs-caption); }
.manager-defect-dashboard__table tr:last-child td { border-bottom: 0; }
.manager-defect-dashboard__type-badge, .manager-defect-dashboard__status-badge { display: inline-flex; padding: var(--space-xs) var(--space-sm); border-radius: var(--radius-full); white-space: nowrap; font-size: var(--fs-caption); font-weight: var(--fw-subtitle); }
.manager-defect-dashboard__type-badge { color: var(--on-warning-container); background: var(--warning-container); }
.manager-defect-dashboard__status-badge { color: var(--on-primary-container); background: var(--primary-container); }
.manager-defect-dashboard__action { min-height: var(--touch-target); display: inline-flex; align-items: center; gap: var(--space-sm); }
.manager-defect-dashboard__action a { padding: var(--space-sm) var(--space-md); border-radius: var(--radius); color: var(--on-primary); background: var(--primary); text-decoration: none; font-size: var(--fs-caption); font-weight: var(--fw-subtitle); }
.manager-defect-dashboard__action button { width: var(--touch-target); height: var(--touch-target); border: 0; color: var(--on-surface-variant); background: transparent; }
.manager-defect-dashboard__pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-md); color: var(--on-surface-variant); }
.manager-defect-dashboard__pagination nav { display: flex; gap: var(--space-xs); }
.manager-defect-dashboard__pagination button { min-width: var(--touch-target); min-height: var(--touch-target); border: 0; border-radius: var(--radius); color: var(--on-surface-variant); background: transparent; }
.manager-defect-dashboard__pagination button[aria-current="page"] { color: var(--on-primary); background: var(--primary); }
@media (max-width: 860px) { .manager-defect-dashboard__filter-panel { grid-template-columns: 1fr; } }
/* manager-defect-dashboard:end */
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
pnpm --filter web exec node --test -r ts-node/register \
  src/app/manager/ticket/dash/00/ticket-dashboard-model.spec.ts \
  src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts
```

Expected: all focused tests PASS.

- [ ] **Step 7: Commit the UI slice**

```bash
git add apps/web/src/app/manager/ticket/dash/00/page.tsx \
  apps/web/src/app/manager/ticket/dash/00/ManagerDefectDashboard.tsx \
  apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts \
  apps/web/src/app/manager/globals.css
git commit -m "feat(ticket): redesign manager defect dashboard"
```

---

### Task 3: Full verification and local visual check

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: completed Task 1 and Task 2 implementation.
- Produces: test, build, container, and browser evidence for `/manager/ticket/dash/00`.

- [ ] **Step 1: Run the full web test suite**

Run: `pnpm test:web`

Expected: property-shell and TypeScript unit suites PASS with no failures.

- [ ] **Step 2: Run the web production build**

Run: `pnpm --filter web build`

Expected: Next.js production build exits 0 and lists `/manager/ticket/dash/00` as a dynamic route.

- [ ] **Step 3: Confirm the change boundary**

Run:

```bash
git diff --name-only bc95c62..HEAD
git status --short
```

Expected: only the approved design/plan, route-local dashboard files, and scoped manager CSS are new or modified; the pre-existing untracked `docs/superpowers/plans/2026-07-09-home-recommended-listings-public-feed.md` remains untouched.

- [ ] **Step 4: Rebuild and restart only the web service**

Run: `docker compose up -d --build web`

Expected: `roomlog-web` is recreated and listening on port 3000. If Docker dependency verification repeats the known registry timeout, report it without editing tracked infrastructure files.

- [ ] **Step 5: Verify the page in a desktop browser**

Open `http://localhost:3000/manager/ticket/dash/00` at approximately 1920×1080. Confirm the title, six chips, three filters, nine table columns, horizontal overflow behavior, empty state, action link, and that the existing sidebar labels are unchanged. Capture a screenshot for evidence.

- [ ] **Step 6: Commit the implementation plan and any verification-only test adjustments**

```bash
git add docs/superpowers/plans/2026-07-10-manager-defect-dashboard.md
git commit -m "docs(ticket): add defect dashboard implementation plan"
```
