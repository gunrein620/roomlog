# Manager Complaint Year-Month Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 민원 대시보드의 일자 달력을 연도와 12개월만 표시하는 월 선택기로 교체한다.

**Architecture:** `ComplaintDashboard`는 조회 월, 팝오버 표시 연도, 열림 상태만 관리한다. 날짜 셀 생성과 일별 필터 모델은 제거하고 기존 월별 대시보드·추이·CSV 계약으로 복원한다.

**Tech Stack:** React 19, Next.js 16, TypeScript, Node.js test runner, CSS tokens

## Global Constraints

- 외부 달력 라이브러리를 추가하지 않는다.
- 팝오버는 연도와 `1월`부터 `12월`만 표시한다.
- 통계·목록·CSV는 선택 월 전체를 기준으로 한다.
- 바깥 클릭과 Escape 닫기, 상단 이전 달·다음 달 기능은 유지한다.
- 스타일은 기존 CSS 토큰만 사용하고 raw hex를 추가하지 않는다.
- 인프라 파일과 다른 관리자 도메인은 수정하지 않는다.

---

### Task 1: 연·월 선택기 UI

**Files:**
- Modify: `apps/web/src/app/manager/ticket/dash/00/ComplaintDashboard.tsx`
- Modify: `apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`
- Modify: `apps/web/src/app/manager/globals.css`

**Interfaces:**
- Produces: `button[aria-label="조회 월 선택"]`
- Produces: `dialog[aria-label="조회 연월 선택"]`
- Produces: 12개의 `${monthNumber}월 선택` 버튼

- [ ] **Step 1: Write failing UI assertions**

```ts
assert.match(complaintDashboardSource, /aria-label="조회 월 선택"/);
assert.match(complaintDashboardSource, /aria-label="조회 연월 선택"/);
assert.match(complaintDashboardSource, /Array\.from\(\{ length: 12 \}/);
assert.match(complaintDashboardSource, /setPickerYear\(\(year\) => year - 1\)/);
assert.match(complaintDashboardSource, /setPickerYear\(\(year\) => year \+ 1\)/);
assert.match(complaintDashboardSource, /setMonth\(new Date\(Date\.UTC\(pickerYear, monthIndex, 1, 12\)\)\)/);
assert.doesNotMatch(complaintDashboardSource, /calendar-weekdays|calendar-days|setSelectedDate/);
```

- [ ] **Step 2: Run dashboard test and verify RED**

Run: `TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`

Expected: FAIL because the current UI exposes a day picker.

- [ ] **Step 3: Implement the year-month picker**

Replace `selectedDate` and `calendarMonth` with `pickerYear`. Render year navigation and a 3×4 grid of 12 month buttons. Selecting a month sets `month` to the first day at noon UTC and closes the popover. Keep outside pointer and Escape handlers and keep the existing top-level previous/next month buttons.

- [ ] **Step 4: Replace calendar-day CSS with month-grid CSS**

Remove weekday/day grid rules and add a three-column `.manager-complaint-dashboard__calendar-months` grid with token-based hover, selected, and focus states.

- [ ] **Step 5: Run dashboard test and verify GREEN**

Run: `TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts`

Expected: PASS.

### Task 2: Remove day-only model APIs

**Files:**
- Modify: `apps/web/src/app/manager/ticket/dash/00/complaint-dashboard-model.ts`
- Modify: `apps/web/src/app/manager/ticket/dash/00/complaint-dashboard-model.spec.ts`

**Interfaces:**
- Restores: `buildComplaintDashboard(rows, month): ComplaintDashboard`
- Restores: `serializeComplaintDashboardCsv(rows, month): string`
- Removes: `ComplaintCalendarDay`, `buildComplaintCalendar`, date-only filtering and `comparisonLabel`

- [ ] **Step 1: Remove the day-only test case and API implementation**

Delete the 42-cell/day-filter test and remove the date-only model types, helpers, optional arguments, and comparison label. Keep the existing two monthly model tests unchanged.

- [ ] **Step 2: Run model tests**

Run: `TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}' pnpm --filter web exec node --test -r ts-node/register src/app/manager/ticket/dash/00/complaint-dashboard-model.spec.ts`

Expected: 2 tests pass.

### Task 3: Verification and delivery

**Files:**
- Verify all files from Tasks 1 and 2.

- [ ] **Step 1: Run repository verification**

Run: `pnpm --filter web test:unit`

Run: `bash scripts/verify.sh`

Expected: unit tests, builds, and API smoke pass.

- [ ] **Step 2: Rebuild and verify Docker UI**

Run: `docker compose up -d --build web`

Verify the popover contains one year and 12 month buttons, year navigation works, selecting a month changes the label to `YYYY.MM`, Escape closes it, and browser console errors remain empty.

- [ ] **Step 3: Commit and push**

```bash
git add apps/web/src/app/manager/ticket/dash/00/ComplaintDashboard.tsx apps/web/src/app/manager/ticket/dash/00/complaint-dashboard-model.ts apps/web/src/app/manager/ticket/dash/00/complaint-dashboard-model.spec.ts apps/web/src/app/manager/ticket/dash/00/manager-defect-dashboard.spec.ts apps/web/src/app/manager/globals.css docs/superpowers/plans/2026-07-11-manager-complaint-calendar-picker.md
git commit -m "fix(ticket): use year-month complaint picker"
git push origin kms-commu
```
