import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const dashboardSource = read("src/app/manager/billing/BillingDashboardWorkspace.tsx");
const collectionSource = read("src/app/manager/billing/CollectionWorkspace.tsx");
const dashboardPageSource = read("src/app/manager/billing/page.tsx");
const detailPageSource = read("src/app/manager/billing/[billId]/page.tsx");
const headerSource = read("src/app/manager/billing/BillingWorkspaceHeader.tsx");
const transactionLedgerSource = read(
  "src/app/manager/billing/matching/ManagerTransactionLedger.tsx",
);
const transactionPageSource = read("src/app/manager/billing/matching/page.tsx");
const transactionStyleSource = read(
  "src/app/manager/billing/matching/manager-transaction-ledger.module.css",
);
const styleSource = read("src/app/manager/billing/billing-workspace.module.css");
const tokenSource = read("../../packages/ui/src/tokens.css");

test("dashboard ledger uses one fixed column contract across every building", () => {
  assert.match(dashboardSource, /<colgroup>/);
  assert.match(dashboardSource, /styles\.ledgerAmountColumn/);
  assert.match(styleSource, /\.ledgerTable\s*\{[\s\S]*?table-layout:\s*fixed;/);
  assert.match(styleSource, /\.ledgerRoomColumn\s*\{/);
  assert.match(styleSource, /\.ledgerActionColumn\s*\{/);
  assert.match(
    styleSource,
    /\.table th\.numeric\s*\{[\s\S]*?text-align:\s*right;/,
  );
});

test("dashboard owns bill detail as an inline expandable row", () => {
  assert.match(dashboardSource, /function InlineBillDetail/);
  assert.match(dashboardSource, /aria-expanded=\{isExpanded\}/);
  assert.match(dashboardSource, /loadManagerBillDetailAction/);
  assert.match(dashboardPageSource, /getManagerBill/);
  assert.match(dashboardPageSource, /initialBillId=\{billId\}/);
  assert.match(detailPageSource, /redirect\(/);
  assert.doesNotMatch(detailPageSource, /청구서 상세|<BillingShell/);
});

test("dashboard bill rows toggle from the whole row and distinguish the expanded detail", () => {
  assert.match(
    dashboardSource,
    /className=\{[\s\S]*?styles\.ledgerInteractiveRow[\s\S]*?onClick=\{\(\) => onToggle\(bill\)\}/,
  );
  assert.match(
    dashboardSource,
    /onClick=\{\(event\) => \{[\s\S]*?event\.stopPropagation\(\);[\s\S]*?onToggle\(bill\);/,
  );

  const hoverRule = styleSource.match(/\.ledgerInteractiveRow:hover td\s*\{([^}]*)\}/)?.[1];
  assert.ok(hoverRule, "the whole bill row needs a hover affordance");
  assert.match(hoverRule, /box-shadow:/);
  assert.doesNotMatch(hoverRule, /background:/);
  assert.match(
    styleSource,
    /\.inlineDetailGrid\s*\{[^}]*background:\s*var\(--surface-container-lowest\);/,
  );
});

test("inline bill detail uses four readable vertical information groups", () => {
  assert.match(dashboardSource, /청구 항목/);
  assert.match(dashboardSource, /납부 계좌/);
  assert.match(dashboardSource, /청구 일정/);
  assert.match(dashboardSource, /처리 상태/);
  assert.match(dashboardSource, /styles\.inlineDetailTotal/);
  assert.match(dashboardSource, /청구 생성/);
  assert.match(styleSource, /\.inlineDetailGrid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/);
  assert.match(styleSource, /\.inlineItem\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto;/);
});

test("collection uses only the header scope and renders detailed time analysis", () => {
  assert.match(collectionSource, /data\.scope\.selectedBuilding/);
  assert.match(collectionSource, /최근 3개월 평균/);
  assert.match(collectionSource, /최근 6개월 평균/);
  assert.match(collectionSource, /수납 시점 분석/);
  assert.match(collectionSource, /개월 월별 성과/);
  assert.match(collectionSource, /완납 세대/);
  assert.match(collectionSource, /부분 수납/);
  assert.doesNotMatch(collectionSource, /sortCollectionBuildings/);
  assert.doesNotMatch(collectionSource, /buildingComparisonLink/);
  assert.doesNotMatch(collectionSource, /건물별 수금 비교|분석 보기/);
  assert.doesNotMatch(collectionSource, /연체|독촉|임차인/);
  assert.match(styleSource, /\.timingChart\s*\{/);
  assert.match(styleSource, /\.monthlyPerformanceTable\s*\{/);
});

test("collection history defaults to at most six recorded months with custom range and sorting", () => {
  assert.match(collectionSource, /label: "3개월"/);
  assert.match(collectionSource, /label: "6개월"/);
  assert.match(collectionSource, /label: "12개월"/);
  assert.match(collectionSource, /직접 설정/);
  assert.match(collectionSource, /collectionPerformanceRows/);
  assert.match(collectionSource, /historyFrom/);
  assert.match(collectionSource, /최근순/);
  assert.match(collectionSource, /과거순/);
  assert.match(
    styleSource,
    /\.monthlyPerformanceViewport\s*\{[\s\S]*?max-height:[\s\S]*?overflow-y:\s*auto;/,
  );
  assert.match(
    styleSource,
    /\.monthlyPerformanceTable th\s*\{[\s\S]*?position:\s*sticky;/,
  );
});

test("dashboard uses natural overdue wording", () => {
  assert.match(dashboardSource, /연체 세대/);
  assert.match(dashboardSource, /연체 현황/);
  assert.doesNotMatch(dashboardSource, /활성 연체/);
  assert.match(dashboardSource, /\["long_overdue", "31일 이상"\]/);
  assert.doesNotMatch(dashboardSource, /\["long_overdue", "장기 연체"\]/);
});

test("billing data tables share the transaction ledger row divider", () => {
  assert.match(tokenSource, /--table-row-divider:\s*#edf0f5;/);
  assert.match(
    transactionStyleSource,
    /\.table td\s*\{[\s\S]*?border-bottom:\s*1px solid var\(--table-row-divider\);/,
  );
  assert.doesNotMatch(transactionStyleSource, /border-bottom:\s*1px solid #edf0f5;/);
  assert.match(
    styleSource,
    /\.table td\s*\{[\s\S]*?border-bottom:\s*1px solid var\(--table-row-divider\);/,
  );
  assert.match(
    styleSource,
    /\.monthlyPerformanceTable td\s*\{[\s\S]*?border-bottom:\s*1px solid var\(--table-row-divider\);/,
  );
});

test("billing-only controls expose hover and keyboard focus without animating layout", () => {
  assert.match(styleSource, /\.input:not\(:disabled\):hover/);
  assert.match(styleSource, /\.filterButton:not\(:disabled\):hover/);
  assert.match(styleSource, /\.primaryLink:hover/);
  assert.match(styleSource, /\.secondaryLink:hover/);
  assert.match(styleSource, /\.detailToggle:hover/);
  assert.match(styleSource, /\.caseButton:not\(:disabled\):hover/);
  assert.match(styleSource, /\.primaryLink:focus-visible/);
  assert.match(styleSource, /\.filterButton:focus-visible/);
});

test("transaction ledger consumes truthful API rows and labels demo fallback", () => {
  assert.match(transactionPageSource, /ledgerData=\{data\.ledger\}/);
  assert.match(transactionLedgerSource, /ledgerData\.source === "demo"/);
  assert.doesNotMatch(
    transactionLedgerSource,
    /buildWithdrawalRows|leasePeriods|buildingFor|chargeKindFor|splitAmount|memoFor/,
  );
  assert.doesNotMatch(transactionLedgerSource, /row\.matchedBillId/);
});

test("transaction deposit detail uses one plain-language bill summary and a date-only deadline", () => {
  assert.match(transactionLedgerSource, />입금 정보</);
  assert.match(transactionLedgerSource, />청구 정보</);
  assert.match(transactionLedgerSource, /label="청구월"/);
  assert.match(transactionLedgerSource, /label="청구 내역"/);
  assert.match(transactionLedgerSource, /label="이번 입금"/);
  assert.match(transactionLedgerSource, /label="누적 수납"/);
  assert.match(transactionLedgerSource, /label="미수금"/);
  assert.match(transactionLedgerSource, /formatTransactionDateTime\(row\.occurredAt\)/);
  assert.match(transactionLedgerSource, /transactionLedgerStatusLabel\(row\)/);
  assert.match(transactionLedgerSource, /Math\.max\(0, bill\.totalAmount - bill\.paidAmount\)/);
  assert.doesNotMatch(transactionLedgerSource, />연결 (후보 )?청구</);
  assert.doesNotMatch(transactionLedgerSource, />청구 구성</);
  assert.doesNotMatch(transactionLedgerSource, /label="납부금액"/);
  assert.doesNotMatch(transactionLedgerSource, /\{bill\.dueDate\}/);
  assert.match(transactionLedgerSource, /formatBillingDate\(bill\.dueDate\)/);
  assert.match(transactionLedgerSource, /bill\.items\.map\(formatBillItem\)\.join/);
  assert.match(
    transactionStyleSource,
    /\.detailGroup\s*\{[\s\S]*?display:\s*grid;/,
  );
  assert.match(
    transactionStyleSource,
    /\.detailFields\[data-columns="6"\][\s\S]*?repeat\(6, minmax\(0, 1fr\)\)/,
  );
});

test("transaction withdrawal detail labels credit-funded vendor payouts distinctly", () => {
  assert.match(transactionLedgerSource, /row\.source === "credit_vendor_payout"/);
  assert.match(transactionLedgerSource, /크레딧 원장 · 업체 지급/);
  assert.match(transactionLedgerSource, /label="지급 업체"/);
  assert.match(transactionLedgerSource, /row\.partyName \?\? "업체 정보 없음"/);
});

test("collection timing chart uses factual months, daily ticks, and a visible section divider", () => {
  assert.match(collectionSource, /billingMonthDayCount\(data\.timing\.currentMonth\)/);
  assert.match(collectionSource, /visibleTimingPoints/);
  assert.match(collectionSource, /previousTimingRecorded/);
  assert.match(collectionSource, /monthLabel\(data\.timing\.currentMonth\)/);
  assert.match(collectionSource, /monthLabel\(data\.timing\.previousMonth\)/);
  assert.match(collectionSource, /timingAxisLabel\(point\.day, lastTimingDay\)/);
  assert.match(collectionSource, /수납 기록 없음/);
  assert.match(collectionSource, /tabIndex=\{0\}/);
  assert.match(
    styleSource,
    /\.timingSectionHeader\s*\{[\s\S]*?border-bottom:\s*1px solid var\(--table-row-divider\);/,
  );
  assert.match(styleSource, /\.timingDay::before\s*\{/);
  assert.match(styleSource, /\.timingDayMajor::before\s*\{/);
});

test("collection timing comparison reads from previous month to current month", () => {
  const legendStart = collectionSource.indexOf(
    '<div className={styles.legend} aria-label="누적 수납 그래프 범례">',
  );
  const legendEnd = collectionSource.indexOf("</div>", legendStart);
  const legendSource = collectionSource.slice(legendStart, legendEnd);
  assert.ok(legendStart >= 0 && legendEnd > legendStart);
  assert.ok(
    legendSource.indexOf('data-kind="previous"') < legendSource.indexOf('data-kind="current"'),
  );
  assert.doesNotMatch(legendSource, /왼쪽|오른쪽/);

  const tooltipStart = collectionSource.indexOf("const tooltip = [");
  const tooltipEnd = collectionSource.indexOf('].join(" · ")', tooltipStart);
  const tooltipSource = collectionSource.slice(tooltipStart, tooltipEnd);
  assert.ok(
    tooltipSource.indexOf("data.timing.previousMonth") <
      tooltipSource.indexOf("data.timing.currentMonth"),
  );

  const barsStart = collectionSource.indexOf("<div className={styles.timingBars}>");
  const barsEnd = collectionSource.indexOf("</div>", barsStart);
  const barsSource = collectionSource.slice(barsStart, barsEnd);
  assert.ok(
    barsSource.indexOf("styles.timingPrevious") < barsSource.indexOf("styles.timingCurrent"),
  );
});

test("collection history renders no synthetic month when there are no billing records", () => {
  assert.match(collectionSource, /performanceRows\.length === 0/);
  assert.match(collectionSource, /수금 기록이 없습니다/);
});

test("overdue header aligns its read-only reference date with the building control", () => {
  assert.match(headerSource, /className=\{`\$\{styles\.monthControl\} \$\{styles\.asOfControl\}`\}/);
  assert.match(
    styleSource,
    /\.asOfControl\s*\{[\s\S]*?min-height:\s*calc\(var\(--touch-target\) - var\(--space-sm\)\);/,
  );
});
