# Manager Unified Ticket Dashboard Linkage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the manager dashboard summarize both defect and complaint tickets, carry an explicit API ticket kind into the shared web model, and show API failures separately from a real empty state.

**Architecture:** Keep `GET /manager/tickets` as the single data source and reuse the existing ticket rows and refresh component. The API computes an explicit `kind` at its response boundary from the persisted category, the web mapper prefers that field with a legacy fallback, and the dashboard aggregates all selected-month rows while using `Ticket.type` only for display categories and legacy list filters.

**Tech Stack:** Next.js 16 App Router, React, NestJS, TypeScript, Node test runner, pnpm monorepo.

## Global Constraints

- Work only on `kms-fix-claim` and push each passing feature slice to `origin/kms-fix-claim`.
- Read and obey `.local-agents/local-infra-guard.prompt.md`; do not edit Docker, workflow, deployment, AWS, network, secret, or protected `app` branch files.
- Update `packages/types` contracts before API and web consumers and rebuild `@roomlog/types` after edits.
- Use only existing CSS tokens; do not add raw hex values.
- Preserve legacy `?type=complaint` and `?type=defect` manager list behavior.
- Do not stage unrelated existing `docs/superpowers/**` files.
- Use a failing targeted test before production code in every task.

---

## File Structure

- `apps/web/src/app/manager/ticket/dash/00/complaint-dashboard-model.ts`: pure selected-month aggregation, status counts, trend, display categories, recent rows, and CSV serialization.
- `apps/web/src/app/manager/ticket/dash/00/ComplaintDashboard.tsx`: existing visual shell, updated to present unified 민원/하자 copy and data.
- `apps/web/src/app/manager/ticket/dash/00/page.tsx`: route composition and auto-refresh placement.
- `packages/types/src/ticket.ts`: shared `TicketType` contract already used by the web `Ticket.type` field.
- `apps/api/src/roomlog/roomlog.service.ts`: API response-boundary ticket kind derivation.
- `apps/web/src/lib/defect-mapping.ts`: API `kind` to shared `Ticket.type` mapping with category fallback.
- `apps/web/src/lib/ticket-manager-api.ts`: manager ticket row loading and error propagation.
- `apps/web/src/app/manager/ticket/dash/error.tsx`: route-level retryable failure state.

### Task 1: Aggregate and refresh the unified dashboard

**Files:**
- Modify: `apps/web/src/app/manager/ticket/dash/00/complaint-dashboard-model.spec.ts`
- Modify: `apps/web/src/app/manager/ticket/dash/00/complaint-dashboard-model.ts`
- Modify: `apps/web/src/app/manager/ticket/dash/00/ComplaintDashboard.tsx`
- Modify: `apps/web/src/app/manager/ticket/dash/00/page.tsx`
- Modify: `apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`

**Interfaces:**
- Consumes: `DefectDashboardRow`, `ticketStatusGroup`, and `TicketDashboardAutoRefresh`.
- Produces: `buildComplaintDashboard(rows, month)` whose summary, trend, recent rows, and CSV include both `Ticket.type` values.

- [ ] **Step 1: Write the failing aggregate tests**

Change the existing test fixture so July contains one `complaint` and one `defect`, then require both in the summary, recent list, trend, and CSV:

```ts
it("summarizes defect and complaint rows for the selected month", () => {
  const dashboard = buildComplaintDashboard(rows, month);
  assert.equal(dashboard.summary.total, 2);
  assert.deepEqual(dashboard.recent.map((row) => row.ticket.id), ["new", "defect"]);
});

it("includes defect rows in the trend and CSV", () => {
  const dashboard = buildComplaintDashboard(rows, month);
  assert.deepEqual(dashboard.trend.at(-1), { label: "7월", count: 2, current: true });
  assert.match(serializeComplaintDashboardCsv(rows, month), /누수 하자/);
});
```

- [ ] **Step 2: Run the targeted model test and verify RED**

Run:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/manager/ticket/dash/00/complaint-dashboard-model.spec.ts
```

Expected: FAIL because `rowsForMonth`, trend, recent, and CSV exclude `type === "defect"`.

- [ ] **Step 3: Implement unified aggregation**

Use month only for the aggregate scope:

```ts
function rowsForMonth(rows: readonly DefectDashboardRow[], month: Date) {
  const key = monthKey(month);
  return rows.filter((row) => ticketMonthKey(row.ticket) === key);
}
```

Remove the `ticket.type === "complaint"` condition from the six-month trend and make the latest dashboard month consider every ticket. Update CSV type labels so defect rows are emitted as `하자` and complaint rows keep their complaint category label.

- [ ] **Step 4: Update unified UI copy and refresh composition**

Change visible copy to:

```tsx
<h2 id="manager-complaint-title">민원/하자 대시보드</h2>
<p>민원과 하자 현황을 한눈에 확인하고 관리하세요.</p>
```

Use `전체 접수`, `민원/하자 접수 현황`, `유형별 비율`, and `최근 민원/하자 접수 내역`. Mount `TicketDashboardAutoRefresh` for the dashboard branch as well as management:

```tsx
if (dashboardView === "dashboard") {
  return (
    <>
      <TicketDashboardAutoRefresh intervalMs={3000} />
      <ComplaintDashboard rows={rows} />
    </>
  );
}
```

- [ ] **Step 5: Run targeted tests and verify GREEN**

Run:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/manager/ticket/dash/00/complaint-dashboard-model.spec.ts src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts
```

Expected: PASS with no failures. If the sidebar hash assertion is stale, verify the sidebar diff is unrelated and update only the expected hash to the current committed source hash.

- [ ] **Step 6: Commit and push Task 1**

```bash
git add apps/web/src/app/manager/ticket/dash/00/complaint-dashboard-model.spec.ts \
  apps/web/src/app/manager/ticket/dash/00/complaint-dashboard-model.ts \
  apps/web/src/app/manager/ticket/dash/00/ComplaintDashboard.tsx \
  apps/web/src/app/manager/ticket/dash/00/page.tsx \
  apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts \
  docs/superpowers/plans/2026-07-14-manager-unified-ticket-dashboard-linkage.md
git commit -m "fix(manager): unify complaint and defect dashboard data"
git push origin kms-fix-claim
```

### Task 2: Carry explicit ticket kind from API to web

**Files:**
- Modify: `apps/api/src/roomlog/roomlog.service.spec.ts`
- Modify: `apps/api/src/roomlog/roomlog.service.ts`
- Modify: `apps/web/src/lib/defect-mapping.ts`
- Create: `apps/web/src/lib/defect-mapping.spec.ts`
- Modify: `apps/web/src/lib/manager-mapping.ts`

**Interfaces:**
- Consumes: shared `TicketType = "defect" | "complaint"` from `@roomlog/types`.
- Produces: manager API ticket response field `kind: TicketType`; `TeamManagerTicket.kind?: TicketType`; `toManagerTicket(...).type` that prefers `kind` and falls back to category classification.

- [ ] **Step 1: Write failing API response tests**

Add a focused service test that creates a general complaint and verifies its manager response kind, then compare an existing defect ticket:

```ts
it("exposes an explicit ticket kind to manager clients", () => {
  const service = new RoomlogService();
  const created = service.createComplaint("tenant-demo", {
    roomId: "room-301",
    title: "관리비 납부 문의",
    description: "이번 달 관리비 결제 금액을 확인해주세요.",
    location: "301호",
  });
  const tickets = service.listTicketsForManager("manager-demo");
  assert.equal(tickets.find((item) => item.id === created.ticket.id)?.kind, "complaint");
  assert.equal(tickets.find((item) => item.category === "누수")?.kind, "defect");
});
```

- [ ] **Step 2: Run the targeted API test and verify RED**

Run:

```bash
pnpm --filter api test -- --test-name-pattern="explicit ticket kind"
```

Expected: FAIL because `presentTicket` does not return `kind`.

- [ ] **Step 3: Add the API response-boundary classifier**

Import `TicketType` from `@roomlog/types` and add one helper near ticket presentation:

```ts
private ticketKindFromCategory(category: string): TicketType {
  return ["소음", "납부", "계약", "공용공간", "기타", "주차", "민원"].includes(category)
    ? "complaint"
    : "defect";
}
```

Return it from `presentTicket`:

```ts
return {
  ...ticket,
  kind: this.ticketKindFromCategory(ticket.category),
  complaint,
  // existing relations
};
```

This derives the stable API contract from the persisted category without a schema migration.

- [ ] **Step 4: Write failing web mapping tests**

Create `defect-mapping.spec.ts` with a minimal `TeamComplaint` fixture and assert the explicit field wins over the legacy category:

```ts
assert.equal(toTicket(teamComplaint({ kind: "complaint", category: "설비" })).type, "complaint");
assert.equal(toTicket(teamComplaint({ category: "소음" })).type, "complaint");
assert.equal(toTicket(teamComplaint({ category: "누수" })).type, "defect");
```

- [ ] **Step 5: Run the targeted web mapping test and verify RED**

Run:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/lib/defect-mapping.spec.ts
```

Expected: FAIL because `TeamTicket` and `toTicket` do not consume `kind`.

- [ ] **Step 6: Implement the web mapping contract**

Add `kind?: TicketType` to `TeamTicket` and `TeamManagerTicket`, pass it through `asComplaint`, and prefer it in `toTicket`:

```ts
type: c.ticket.kind ?? ticketTypeFromCategory(c.ticket.category ?? c.ticket.analysis?.category),
```

- [ ] **Step 7: Build shared types and verify Task 2**

Run:

```bash
pnpm --filter @roomlog/types build
pnpm --filter api test
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/lib/defect-mapping.spec.ts src/lib/ticket-manager-api.spec.ts
```

Expected: all commands exit 0 with no test failures.

- [ ] **Step 8: Commit and push Task 2**

```bash
git add apps/api/src/roomlog/roomlog.service.spec.ts \
  apps/api/src/roomlog/roomlog.service.ts \
  apps/web/src/lib/defect-mapping.ts \
  apps/web/src/lib/defect-mapping.spec.ts \
  apps/web/src/lib/manager-mapping.ts
git commit -m "feat(ticket): expose explicit manager ticket kind"
git push origin kms-fix-claim
```

### Task 3: Separate API failure from empty dashboard data

**Files:**
- Modify: `apps/web/src/lib/ticket-manager-api.spec.ts`
- Modify: `apps/web/src/lib/ticket-manager-api.ts`
- Create: `apps/web/src/app/manager/ticket/dash/error.tsx`
- Create: `apps/web/src/app/manager/ticket/dash/ticket-dashboard-error.spec.ts`
- Optional modify: `apps/web/src/app/manager/globals.css`

**Interfaces:**
- Consumes: `TeamManagerTicket[]` loader and Next.js route error-boundary `reset()` callback.
- Produces: `listManagerTicketRows(loadTickets?)` that resolves mapped rows for success, resolves `[]` only for an actual empty response, and rejects unchanged on API failure.

- [ ] **Step 1: Write the failing loader error test**

Add an injected loader test:

```ts
it("propagates manager ticket API failures instead of returning an empty dashboard", async () => {
  const failure = new Error("manager tickets unavailable");
  await assert.rejects(
    () => listManagerTicketRows(async () => { throw failure; }),
    (error) => error === failure,
  );
});
```

Also assert a real empty response remains empty:

```ts
assert.deepEqual(await listManagerTicketRows(async () => []), []);
```

- [ ] **Step 2: Run the targeted API client test and verify RED**

Run:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/lib/ticket-manager-api.spec.ts
```

Expected: FAIL because `listManagerTicketRows` does not accept a loader and catches errors as `[]`.

- [ ] **Step 3: Implement error propagation**

Change the loader signature and remove the catch:

```ts
export async function listManagerTicketRows(
  loadTickets: () => Promise<TeamManagerTicket[]> = listTeamTickets,
): Promise<{ ticket: Ticket; repair?: RepairJob; attachmentUrls: string[] }[]> {
  return (await loadTickets()).map((teamTicket) => ({
    ticket: toManagerTicket(teamTicket),
    repair: toManagerRepair(teamTicket) ?? undefined,
    attachmentUrls: managerTicketAttachmentUrls(teamTicket),
  }));
}
```

- [ ] **Step 4: Write the failing route error contract test**

Create a source contract requiring the route boundary to be client-side, display a clear message, and call `reset()`:

```ts
assert.match(source, /^"use client";/);
assert.match(source, /민원\/하자 데이터를 불러오지 못했습니다/);
assert.match(source, /onClick=\{reset\}/);
assert.match(source, /다시 시도/);
```

- [ ] **Step 5: Run the route error test and verify RED**

Run:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/manager/ticket/dash/ticket-dashboard-error.spec.ts
```

Expected: FAIL because `error.tsx` does not exist.

- [ ] **Step 6: Implement the retryable route boundary**

Create `error.tsx` using the existing `Card` and `Button` UI components:

```tsx
"use client";

import { Button, Card } from "@roomlog/ui";

export default function TicketDashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Card role="alert">
      <h2>민원/하자 데이터를 불러오지 못했습니다</h2>
      <p>잠시 후 다시 시도해주세요.</p>
      <Button type="button" onClick={reset}>다시 시도</Button>
    </Card>
  );
}
```

- [ ] **Step 7: Run targeted and full verification**

Run:

```bash
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/lib/ticket-manager-api.spec.ts src/app/manager/ticket/dash/ticket-dashboard-error.spec.ts
pnpm test:web
bash scripts/verify.sh
```

Expected: every command exits 0. The dashboard model, mapping, route contracts, packages, web, and API builds/tests pass.

- [ ] **Step 8: Commit and push Task 3**

```bash
git add apps/web/src/lib/ticket-manager-api.spec.ts \
  apps/web/src/lib/ticket-manager-api.ts \
  apps/web/src/app/manager/ticket/dash/error.tsx \
  apps/web/src/app/manager/ticket/dash/ticket-dashboard-error.spec.ts
git commit -m "fix(manager): distinguish ticket loading failures"
git push origin kms-fix-claim
```

### Task 4: Docker-backed behavior verification

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: the three pushed feature slices.
- Produces: runtime evidence that authenticated API data and the manager dashboard agree.

- [ ] **Step 1: Confirm Docker availability without modifying infra**

```bash
docker info >/dev/null
docker compose ps
```

Expected: Docker is available and postgres is healthy.

- [ ] **Step 2: Rebuild only existing app services**

```bash
docker compose up -d --build api web
```

Expected: existing compose configuration builds and starts without file edits.

- [ ] **Step 3: Verify API and dashboard data**

Login with the documented manager demo account, call `GET /api/manager/tickets`, and compare the returned selected-month total with the dashboard at `http://localhost:3000/manager/ticket/dash/00`. Confirm the current July data shows the existing defect tickets instead of 0.

- [ ] **Step 4: Confirm final repository state**

```bash
git status --short --branch
git rev-list --left-right --count origin/kms-fix-claim...kms-fix-claim
```

Expected: only pre-existing unrelated untracked docs remain and branch counts are `0 0`.
