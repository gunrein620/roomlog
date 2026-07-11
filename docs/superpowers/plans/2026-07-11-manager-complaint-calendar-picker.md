# Manager Complaint Calendar Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 민원 대시보드 캘린더 아이콘으로 달력을 열고 날짜 선택 시 하루 기준 대시보드와 CSV를 표시한다.

**Architecture:** 날짜 키·42칸 달력 생성·일별 필터링은 순수 모델 함수로 구현한다. `ComplaintDashboard`는 월 조회 상태, 선택 날짜, 팝오버 표시 월과 열림 상태를 소유하며 기존 6개월 추이는 원본 월별 데이터를 유지한다.

**Tech Stack:** React 19, Next.js 16, TypeScript, Node.js test runner, CSS tokens

## Global Constraints

- 외부 달력 라이브러리를 추가하지 않는다.
- 날짜 계산 기준 시간대는 `Asia/Seoul`이다.
- 스타일은 기존 CSS 토큰만 사용하고 raw hex를 추가하지 않는다.
- 월 조회와 기존 좌우 화살표 동작을 유지한다.
- 인프라 파일과 다른 관리자 도메인은 수정하지 않는다.

---

### Task 1: 날짜 필터와 달력 모델

**Files:**
- Modify: `apps/web/src/app/manager/ticket/dash/00/complaint-dashboard-model.ts`
- Test: `apps/web/src/app/manager/ticket/dash/00/complaint-dashboard-model.spec.ts`

**Interfaces:**
- Produces: `buildComplaintCalendar(month: Date): ComplaintCalendarDay[]`
- Produces: `buildComplaintDashboard(rows, month, selectedDate?: Date | null): ComplaintDashboard`
- Produces: `serializeComplaintDashboardCsv(rows, month, selectedDate?: Date | null): string`
- `ComplaintDashboard.monthLabel`은 월 조회에서 `YYYY.MM`, 날짜 조회에서 `YYYY.MM.DD`를 반환한다.

- [ ] **Step 1: Write failing model tests**

```ts
it("builds a six-week calendar and summarizes a selected day", () => {
  const days = buildComplaintCalendar(month);
  assert.equal(days.length, 42);
  assert.equal(days.filter((day) => day.inCurrentMonth).length, 31);

  const selectedDate = new Date("2026-07-28T12:00:00+09:00");
  const dashboard = buildComplaintDashboard(rows, month, selectedDate);
  assert.equal(dashboard.monthLabel, "2026.07.28");
  assert.equal(dashboard.summary.total, 1);
  assert.deepEqual(dashboard.recent.map((row) => row.ticket.id), ["new"]);
  assert.equal(dashboard.comparisonLabel, "전일 대비");
  assert.equal(dashboard.trend.at(-1)?.count, 2);
  assert.match(serializeComplaintDashboardCsv(rows, month, selectedDate), /소음 민원/);
  assert.doesNotMatch(serializeComplaintDashboardCsv(rows, month, selectedDate), /수전 수리 요청/);
});
```

- [ ] **Step 2: Run model tests and verify RED**

Run: `pnpm --filter web exec node --test -r ts-node/register src/app/manager/ticket/dash/00/complaint-dashboard-model.spec.ts`

Expected: FAIL because `buildComplaintCalendar` and day selection support do not exist.

- [ ] **Step 3: Implement model functions**

Add a `ComplaintCalendarDay` type containing `date`, `key`, `label`, and `inCurrentMonth`. Build 42 noon-UTC cells from the Sunday before the first day of the selected month. Filter current rows by a Seoul `YYYY-MM-DD` key when `selectedDate` exists, calculate the comparison from the previous day, retain the original six-month trend, and pass the optional date through CSV serialization.

- [ ] **Step 4: Run model tests and verify GREEN**

Run: `pnpm --filter web exec node --test -r ts-node/register src/app/manager/ticket/dash/00/complaint-dashboard-model.spec.ts`

Expected: all complaint model tests pass.

### Task 2: Interactive calendar popover

**Files:**
- Modify: `apps/web/src/app/manager/ticket/dash/00/ComplaintDashboard.tsx`
- Modify: `apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`
- Modify: `apps/web/src/app/manager/globals.css`

**Interfaces:**
- Consumes: `buildComplaintCalendar`, date-aware `buildComplaintDashboard`, date-aware `serializeComplaintDashboardCsv`
- Produces: `button[aria-label="조회 날짜 선택"]` and `dialog[aria-label="조회 날짜 달력"]`

- [ ] **Step 1: Write failing UI source assertions**

```ts
assert.match(complaintDashboardSource, /aria-label="조회 날짜 선택"/);
assert.match(complaintDashboardSource, /role="dialog"/);
assert.match(complaintDashboardSource, /aria-label="조회 날짜 달력"/);
assert.match(complaintDashboardSource, /buildComplaintCalendar/);
assert.match(complaintDashboardSource, /setSelectedDate\(day\.date\)/);
assert.match(complaintDashboardSource, /event\.key === "Escape"/);
assert.match(cssSource, /manager-complaint-dashboard__calendar-popover/);
```

- [ ] **Step 2: Run dashboard test and verify RED**

Run: `pnpm --filter web exec node --test -r ts-node/register src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`

Expected: FAIL because the calendar trigger and popover are absent.

- [ ] **Step 3: Implement calendar state and markup**

Add `selectedDate`, `calendarMonth`, `calendarOpen`, and a wrapper ref. The calendar button toggles the popover; day buttons set the month and selected date then close. A document effect closes on outside pointer down and Escape. Main month arrows clear `selectedDate`. Render weekday headings `일` through `토`, 42 day buttons, popover month navigation, and `aria-pressed` on the selected day.

- [ ] **Step 4: Add token-only popover styles**

Position the popover below the period control, use a seven-column grid, visually mute out-of-month days, and apply primary selected state plus focus ring using only `var(--...)` values.

- [ ] **Step 5: Run dashboard test and verify GREEN**

Run: `pnpm --filter web exec node --test -r ts-node/register src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`

Expected: PASS.

### Task 3: Verification and delivery

**Files:**
- Verify all files from Tasks 1 and 2.

- [ ] **Step 1: Run repository verification**

Run: `bash scripts/verify.sh`

Expected: types, ui, web, api builds and API smoke pass.

- [ ] **Step 2: Rebuild and verify Docker UI**

Run: `docker compose up -d --build web`

Verify the calendar opens, selecting a day changes the label to `YYYY.MM.DD`, the daily rows update, Escape closes the popover, main month arrows return to `YYYY.MM`, and browser console errors remain empty.

- [ ] **Step 3: Commit and push**

```bash
git add apps/web/src/app/manager/ticket/dash/00/ComplaintDashboard.tsx apps/web/src/app/manager/ticket/dash/00/complaint-dashboard-model.ts apps/web/src/app/manager/ticket/dash/00/complaint-dashboard-model.spec.ts apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts apps/web/src/app/manager/globals.css docs/superpowers/plans/2026-07-11-manager-complaint-calendar-picker.md
git commit -m "feat(ticket): add complaint calendar picker"
git push origin kms-commu
```
