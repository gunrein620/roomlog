import type { BriefingInput } from "./briefing-input";

export type TodayTaskKind = "overdue" | "urgent_ticket" | "expiring" | "unanswered";

export type TodayTask = {
  id: string;
  kind: TodayTaskKind;
  title: string;
  detail: string;
  href: string;
  priority: number;
};

export type RentStatusChip = "입금완료" | "대기" | "연체" | "확인불가";

export type DashboardSourceKey =
  | "listings"
  | "tradeContracts"
  | "billing"
  | "tickets"
  | "contractDashboard"
  | "messaging";

export const DASHBOARD_SOURCE_LABELS: Record<DashboardSourceKey, string> = {
  listings: "미계약 매물",
  tradeContracts: "계약 중인 집",
  billing: "청구",
  tickets: "하자",
  contractDashboard: "계약 만료",
  messaging: "메시지"
};

export type DashboardBillingRow = {
  billId: string;
  unitId: string;
  tenantName: string;
  billingMonth: string;
  totalAmount: number;
  paidAmount: number;
  status: string;
  dueDate: string;
  badge?: string;
};

export type DashboardTicket = {
  id: string;
  title: string;
  unitId: string;
  status: string;
  statusLabel: string;
  urgency: number;
};

export type DashboardContractExpiryRow = {
  id: string;
  tenantName: string;
  buildingName: string;
  unitId: string;
  daysToExpire: number;
};

export type DashboardThread = {
  id: string;
  unitId: string;
  contextLabel?: string;
  lastMessage: string;
  lastMessageSender?: "tenant" | "manager";
  updatedAt: string;
  unreadCount: number;
};

export type DashboardTradeContract = {
  id: string;
  listingTitle: string;
  location: string;
  tenantName: string;
  priceLabel: string;
  threadId: string;
};

export type DashboardListing = {
  id: string;
  title: string;
  location: string;
  priceLabel: string;
  photoCount: number;
  has3D: boolean;
};

export type ManagerHomeCard = {
  id: string;
  homeName: string;
  tenantName: string;
  rentStatusChip: RentStatusChip;
  openTicketCount: number;
  ticketCountKnown: boolean;
  contractDday: number | null;
  href: string;
  billingHref: string;
  ticketHref: string;
  /** 건물 보드 그룹핑용 — 알 수 없으면 빈 문자열 ("기타" 그룹). */
  buildingName?: string;
  /** 층 추출용 원본 호실 번호 (예: "301"). */
  unitId?: string;
};

export function sortTodayTasks(tasks: TodayTask[]): TodayTask[] {
  return [...tasks].sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title, "ko-KR"));
}

export function isOpenTicket(ticket: Pick<DashboardTicket, "status">): boolean {
  return ticket.status !== "resolved" && ticket.status !== "cancelled";
}

export function isUrgentTicket(ticket: Pick<DashboardTicket, "urgency" | "status">): boolean {
  return isOpenTicket(ticket) && ticket.urgency <= 1;
}

export function isExpiringContract(row: Pick<DashboardContractExpiryRow, "daysToExpire">): boolean {
  return Number.isFinite(row.daysToExpire) && row.daysToExpire <= 30;
}

// 미응답 = 마지막 발신자가 세입자(관리인이 아직 답하지 않음).
// unreadCount는 "세입자가 안 읽은(관리인 발신)" 배지라 정반대 신호이므로 쓰지 않는다.
export function threadNeedsReply(thread: Pick<DashboardThread, "lastMessageSender">): boolean {
  return thread.lastMessageSender === "tenant";
}

// 입금률 = "낸 사람" 비율 — 전액 납부한 청구 건수 / 청구 대상 건수. (금액 비율이 아님 — 사용자 결정)
export function calculateDepositRatePct(
  rows: DashboardBillingRow[] | null,
  referenceMonth = currentBillingMonth()
): number | null {
  const counts = countDepositPayers(rows, referenceMonth);
  if (!counts) return null;

  return Math.round((counts.paid / counts.total) * 100);
}

// 게이지 설명("N명 중 M명 납부")용 카운트. 청구 금액이 0인 행은 대상에서 제외한다.
export function countDepositPayers(
  rows: DashboardBillingRow[] | null,
  referenceMonth = currentBillingMonth()
): { paid: number; total: number } | null {
  if (!rows) return null;

  const scopedRows = billingRowsForDepositRate(rows, referenceMonth).filter(
    (row) => positiveNumber(row.totalAmount) > 0
  );
  if (scopedRows.length === 0) return null;

  const paid = scopedRows.filter(
    (row) => positiveNumber(row.paidAmount) >= positiveNumber(row.totalAmount)
  ).length;

  return { paid, total: scopedRows.length };
}

export function billingRowsForDepositRate(
  rows: DashboardBillingRow[],
  referenceMonth = currentBillingMonth()
): DashboardBillingRow[] {
  const month = depositRateBillingMonth(rows, referenceMonth);

  return month ? rows.filter((row) => row.billingMonth === month) : rows;
}

// 입금률 계산에 실제로 쓰인 청구월 — 당월 행이 있으면 당월, 없으면 최신 청구월, 그것도 없으면 null.
export function depositRateBillingMonth(
  rows: DashboardBillingRow[],
  referenceMonth = currentBillingMonth()
): string | null {
  if (rows.length === 0) return null;
  if (rows.some((row) => row.billingMonth === referenceMonth)) return referenceMonth;

  return (
    rows
      .map((row) => row.billingMonth)
      .filter(isBillingMonth)
      .sort()
      .at(-1) ?? null
  );
}

// 게이지 라벨 — 당월 청구가 없어 이전 달로 폴백했으면 그 사실을 라벨에 드러낸다(위조 금지).
export function depositRateMonthLabel(
  rows: DashboardBillingRow[] | null,
  referenceMonth = currentBillingMonth()
): string {
  const month = rows ? depositRateBillingMonth(rows, referenceMonth) : null;
  if (!month || month === referenceMonth) return "이번 달";

  return `${Number(month.slice(5, 7))}월(최근 청구월)`;
}

export function countOverdueBills(rows: DashboardBillingRow[], summaryOverdue: number): number {
  const rowCount = rows.filter(isOverdueBill).length;
  return rows.length > 0 ? rowCount : positiveNumber(summaryOverdue);
}

export function rentStatusChipForContract(
  contract: Pick<DashboardTradeContract, "listingTitle" | "location" | "tenantName"> & { unitId?: string | null },
  billingRows: DashboardBillingRow[] | null
): RentStatusChip {
  if (!billingRows) return "확인불가";

  const matchingRows = billingRows.filter((row) => billingRowMatchesContract(row, contract));
  if (matchingRows.length === 0) return "확인불가";
  if (matchingRows.some(isOverdueBill)) return "연체";
  if (matchingRows.every(isPaidBill)) return "입금완료";
  return "대기";
}

export function buildTodayTasks({
  billingRows,
  overdueCount,
  tickets,
  contractRows,
  threads,
  hrefs
}: {
  billingRows: DashboardBillingRow[] | null;
  overdueCount: number;
  tickets: DashboardTicket[];
  contractRows: DashboardContractExpiryRow[];
  threads: DashboardThread[];
  hrefs: {
    billing: string;
    ticket: string;
    contract: string;
    messaging: string;
  };
}): TodayTask[] {
  const overdueTasks: TodayTask[] = [];
  const overdueRows = billingRows?.filter(isOverdueBill) ?? [];

  if (overdueRows.length > 0) {
    overdueTasks.push(
      ...overdueRows.map((row) => ({
        id: `overdue:${row.billId}`,
        kind: "overdue" as const,
        title: `${row.tenantName}님 청구 연체`,
        detail: `${row.unitId}호 · ${wonLabel(positiveNumber(row.totalAmount) - positiveNumber(row.paidAmount))} 미납`,
        href: hrefs.billing,
        priority: 1
      }))
    );
  } else if (overdueCount > 0 && billingRows && billingRows.length === 0) {
    overdueTasks.push({
      id: "overdue:summary",
      kind: "overdue",
      title: `연체 청구 ${overdueCount}건 확인`,
      detail: "청구 화면에서 미납 내역을 확인하세요.",
      href: hrefs.billing,
      priority: 1
    });
  }

  const urgentTicketTasks = tickets.filter(isUrgentTicket).map((ticket) => ({
    id: `urgent_ticket:${ticket.id}`,
    kind: "urgent_ticket" as const,
    title: ticket.title,
    detail: `${ticket.unitId}호 · ${ticket.statusLabel}`,
    href: hrefs.ticket,
    priority: 2
  }));

  const expiringTasks = contractRows.filter(isExpiringContract).map((row) => ({
    id: `expiring:${row.id}`,
    kind: "expiring" as const,
    title: `${row.tenantName}님 계약 만료 확인`,
    detail: `${row.buildingName} ${row.unitId}호 · ${ddayLabel(row.daysToExpire)}`,
    href: hrefs.contract,
    priority: 3
  }));

  const unansweredTasks = threads
    .filter(threadNeedsReply)
    .map((thread) => ({
      id: `unanswered:${thread.id}`,
      kind: "unanswered" as const,
      title: `${thread.unitId}호 답장 필요`,
      detail: thread.contextLabel || thread.lastMessage,
      href: hrefs.messaging,
      priority: 4
    }));

  return sortTodayTasks([...overdueTasks, ...urgentTicketTasks, ...expiringTasks, ...unansweredTasks]);
}

export function buildHomeCards({
  contracts,
  billingRows,
  tickets,
  ticketsAvailable,
  contractRows,
  hrefForContract,
  hrefForContractRow,
  billingHref,
  ticketHref
}: {
  contracts: DashboardTradeContract[];
  billingRows: DashboardBillingRow[] | null;
  tickets: DashboardTicket[];
  ticketsAvailable: boolean;
  contractRows: DashboardContractExpiryRow[];
  hrefForContract: (contract: DashboardTradeContract) => string;
  hrefForContractRow: (rowId: string) => string;
  billingHref: string;
  ticketHref: string;
}): ManagerHomeCard[] {
  // 1순위: 계약서 관리(/contracts/manager) 기준의 실제 계약들 — 매물 채팅 없이 체결된 집도 여기서 보인다.
  const contractRowCards: ManagerHomeCard[] = contractRows.map((row) => {
    const activeTicketCount = tickets.filter(
      (ticket) => isOpenTicket(ticket) && sameUnit(ticket.unitId, row.unitId)
    ).length;

    return {
      id: `contract:${row.id}`,
      homeName: [row.buildingName, unitLabel(row.unitId)].filter(Boolean).join(" "),
      buildingName: row.buildingName,
      unitId: row.unitId,
      tenantName: row.tenantName,
      rentStatusChip: rentStatusChipForContract(
        {
          listingTitle: row.buildingName,
          location: row.buildingName,
          tenantName: row.tenantName,
          unitId: row.unitId
        },
        billingRows
      ),
      openTicketCount: activeTicketCount,
      ticketCountKnown: ticketsAvailable && Boolean(row.unitId),
      contractDday: row.daysToExpire,
      href: hrefForContractRow(row.id),
      billingHref,
      ticketHref
    };
  });

  // 2순위: 매물 문의 채팅에서 수락된 계약(있을 때만) — 같은 호실이 이미 위에 있으면 중복 방지.
  const coveredUnits = new Set(
    contractRows.map((row) => normalizeUnit(row.unitId)).filter(Boolean)
  );

  const tradeCards = contracts.map((contract) => {
    const expiryRow = findContractExpiryRow(contract, contractRows);
    const unitId = expiryRow?.unitId || extractUnitId(contract.listingTitle) || extractUnitId(contract.location);
    const activeTicketCount = unitId
      ? tickets.filter((ticket) => isOpenTicket(ticket) && sameUnit(ticket.unitId, unitId)).length
      : 0;

    return {
      id: contract.id,
      homeName: contract.listingTitle,
      buildingName: stripUnitSuffix(contract.listingTitle),
      unitId: unitId ?? "",
      tenantName: contract.tenantName,
      rentStatusChip: rentStatusChipForContract(
        {
          listingTitle: contract.listingTitle,
          location: contract.location,
          tenantName: contract.tenantName,
          unitId
        },
        billingRows
      ),
      openTicketCount: activeTicketCount,
      ticketCountKnown: ticketsAvailable && Boolean(unitId),
      contractDday: expiryRow ? expiryRow.daysToExpire : null,
      href: hrefForContract(contract),
      billingHref,
      ticketHref,
      unitIdForDedupe: unitId
    };
  });

  const uncoveredTradeCards = tradeCards
    .filter((card) => !card.unitIdForDedupe || !coveredUnits.has(normalizeUnit(card.unitIdForDedupe)))
    .map(({ unitIdForDedupe: _unitIdForDedupe, ...card }) => card);

  return [...contractRowCards, ...uncoveredTradeCards];
}

// "301" → "301호" (이미 호/동 표기가 있으면 그대로).
function unitLabel(unitId: string): string {
  if (!unitId) return "";
  return /^\d+$/.test(unitId) ? `${unitId}호` : unitId;
}

// "정글빌라 301호" → "정글빌라" (건물 보드 그룹핑용).
function stripUnitSuffix(title: string): string {
  const stripped = title.replace(/\s*\d{1,4}\s*호\s*$/, "").trim();
  return stripped || title;
}

export function buildBriefingInput({
  managerName,
  homeCount,
  depositRatePct,
  overdueCount,
  tickets,
  contractRows,
  threads
}: {
  managerName: string;
  homeCount: number;
  depositRatePct: number | null;
  overdueCount: number;
  tickets: DashboardTicket[];
  contractRows: DashboardContractExpiryRow[];
  threads: DashboardThread[];
}): BriefingInput {
  const openTickets = tickets.filter(isOpenTicket);

  return {
    managerName,
    homeCount,
    depositRatePct,
    overdueCount,
    urgentTicketCount: openTickets.filter(isUrgentTicket).length,
    openTicketCount: openTickets.length,
    expiringContractCount: contractRows.filter(isExpiringContract).length,
    unansweredThreadCount: threads.filter(threadNeedsReply).length
  };
}

function isOverdueBill(row: DashboardBillingRow): boolean {
  return normalize(row.status) === "overdue" || normalize(row.badge) === "overdue";
}

function isPaidBill(row: DashboardBillingRow): boolean {
  return normalize(row.status) === "paid" || positiveNumber(row.paidAmount) >= positiveNumber(row.totalAmount);
}

function billingRowMatchesContract(
  row: DashboardBillingRow,
  contract: Pick<DashboardTradeContract, "listingTitle" | "location" | "tenantName"> & { unitId?: string | null }
): boolean {
  if (row.tenantName && row.tenantName === contract.tenantName) return true;
  if (contract.unitId && sameUnit(row.unitId, contract.unitId)) return true;

  const rowUnit = normalizeUnit(row.unitId);
  if (!rowUnit) return false;

  return unitAppearsInText(rowUnit, contract.listingTitle) || unitAppearsInText(rowUnit, contract.location);
}

function findContractExpiryRow(
  contract: Pick<DashboardTradeContract, "listingTitle" | "location" | "tenantName">,
  rows: DashboardContractExpiryRow[]
): DashboardContractExpiryRow | null {
  const tenantRows = rows.filter((row) => row.tenantName === contract.tenantName);
  const contextualMatch = tenantRows.find((row) => {
    const unit = normalizeUnit(row.unitId);
    return (
      normalize(row.buildingName) && [contract.listingTitle, contract.location].some((text) => normalize(text).includes(normalize(row.buildingName))) ||
      Boolean(unit && [contract.listingTitle, contract.location].some((text) => unitAppearsInText(unit, text)))
    );
  });

  if (contextualMatch) return contextualMatch;
  return tenantRows.length === 1 ? tenantRows[0] : null;
}

function extractUnitId(text: string): string | null {
  return text.match(/(\d{1,4})\s*호/)?.[1] ?? null;
}

function sameUnit(a: string, b: string): boolean {
  return normalizeUnit(a) === normalizeUnit(b);
}

function normalizeUnit(value: string): string {
  return value.replace(/\s*호\s*$/, "").trim();
}

function unitAppearsInText(unit: string, text: string): boolean {
  if (!unit) return false;
  return new RegExp(`(^|[^0-9])${escapeRegExp(unit)}\\s*호?([^0-9]|$)`).test(text);
}

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function currentBillingMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function isBillingMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value);
}

function positiveNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function wonLabel(amount: number): string {
  return `${Math.max(0, amount).toLocaleString("ko-KR")}원`;
}

function ddayLabel(days: number): string {
  if (days < 0) return `만료 ${Math.abs(days)}일 지남`;
  if (days === 0) return "오늘 만료";
  return `D-${days}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
