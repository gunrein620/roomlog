import type { Thread, Ticket } from "@roomlog/types";
import { toManagerDashboard, type TeamDashboardResponse } from "@/lib/billing-manager-mapping";
import { getManagerContractDashboard } from "@/lib/contract-manager-api";
import { MANAGER_CROSS } from "@/lib/manager-home-nav";
import { toManagerTicket, type TeamManagerTicket } from "@/lib/manager-mapping";
import { serverFetch } from "@/lib/server-api";
import type { SessionUser } from "@/lib/session";
import {
  buildBriefingInput,
  buildHomeCards,
  buildTodayTasks,
  calculateDepositRatePct,
  countDepositPayers,
  countOverdueBills,
  countTicketProgress,
  depositRateMonthLabel,
  sumDepositAmounts,
  sumPortfolioAmounts,
  type DashboardBillingRow,
  type DashboardContractExpiryRow,
  type DashboardListing,
  type DashboardSourceKey,
  type DashboardThread,
  type DashboardTicket,
  type DashboardTradeContract,
  type ManagerHomeCard,
  type TodayTask
} from "./dashboard-calculations";
import type { BriefingInput } from "./briefing-input";

export type ManagerDashboardData = {
  todayTasks: TodayTask[];
  depositRatePct: number | null;
  depositRateMonthLabel: string;
  depositPayerCounts: { paid: number; total: number } | null;
  depositAmounts: { collected: number; billed: number } | null;
  ticketProgress: { open: number; resolved: number; total: number } | null;
  portfolioAmounts: { depositManwon: number; monthlyRentManwon: number; contractCount: number } | null;
  homeCards: ManagerHomeCard[];
  uncontractedListings: DashboardListing[];
  sourceFailures: DashboardSourceKey[];
  briefingInput: BriefingInput;
};

type TradeListing = {
  id: string;
  ownerId: string;
  title: string;
  location: string;
  tradeType: "월세" | "전세" | "매매";
  depositManwon: number;
  monthlyRentManwon: number;
  status?: "노출중" | "계약완료";
  images?: string[];
  floorPlan?: unknown;
};

type TradeContract = {
  id: string;
  listingTitle: string;
  threadId: string;
  landlordId: string;
  tenantId: string;
  tenantName: string;
  status: "proposed" | "accepted" | "declined" | "cancelled";
  tradeType: "월세" | "전세" | "매매";
  depositManwon: number;
  monthlyRentManwon: number;
  location: string;
  respondedAt?: string;
};

type SourceResult<T> =
  | { data: T; failed: false }
  | { data: T; failed: true };

const ticketStatusLabels: Record<string, string> = {
  received: "접수",
  reviewing: "검토중",
  info_requested: "정보 요청",
  processing: "처리 중",
  resolved: "완료",
  reopened: "재요청",
  cancelled: "취소됨"
};

export async function assembleManagerDashboard(user: SessionUser | null): Promise<ManagerDashboardData> {
  const [listings, tradeContracts, billing, tickets, contractDashboard, threads] = await Promise.all([
    loadListings(user),
    loadTradeContracts(user),
    loadBillingRows(),
    loadTickets(),
    loadContractExpiryRows(),
    loadThreads()
  ]);

  const sourceFailures: DashboardSourceKey[] = [
    listings.failed ? "listings" : null,
    tradeContracts.failed ? "tradeContracts" : null,
    billing.failed ? "billing" : null,
    tickets.failed ? "tickets" : null,
    contractDashboard.failed ? "contractDashboard" : null,
    threads.failed ? "messaging" : null
  ].filter((key): key is DashboardSourceKey => Boolean(key));

  const billingRows = billing.failed ? null : billing.data.rows;
  // /manager/bills/dashboard는 관리인 전체 청구 행을 반환할 수 있다.
  // 입금률은 당월 billingMonth 행(없으면 최신 청구월)의 paidAmount 합계를 totalAmount 합계로 나눈 금액 기준이다.
  // 행별 금액이 없으면 건수로 추정하지 않고 null로 둔다.
  const depositRatePct = calculateDepositRatePct(billingRows);
  const overdueCount = billing.failed ? 0 : countOverdueBills(billing.data.rows, billing.data.summaryOverdue);
  const contractRows = contractDashboard.data;
  const ticketRows = tickets.data;
  const threadRows = threads.data;

  const todayTasks = buildTodayTasks({
    billingRows,
    overdueCount,
    tickets: ticketRows,
    contractRows,
    threads: threadRows,
    hrefs: {
      billing: MANAGER_CROSS.billing,
      ticket: MANAGER_CROSS.ticketDash,
      contract: MANAGER_CROSS.contract,
      messaging: MANAGER_CROSS.messaging
    }
  });

  const homeCards = buildHomeCards({
    contracts: tradeContracts.data,
    billingRows,
    tickets: ticketRows,
    ticketsAvailable: !tickets.failed,
    contractRows,
    hrefForContract: (contract) => managerThreadHref(contract.threadId),
    hrefForContractRow: (rowId) => `/manager/contract/01?id=${encodeURIComponent(rowId)}`,
    billingHref: MANAGER_CROSS.billing,
    ticketHref: MANAGER_CROSS.ticketDash
  });

  const briefingInput = buildBriefingInput({
    managerName: user?.name ?? "관리인",
    homeCount: homeCards.length,
    depositRatePct,
    overdueCount,
    tickets: ticketRows,
    contractRows,
    threads: threadRows
  });

  return {
    todayTasks,
    depositRatePct,
    depositRateMonthLabel: depositRateMonthLabel(billingRows),
    depositPayerCounts: countDepositPayers(billingRows),
    depositAmounts: sumDepositAmounts(billingRows),
    ticketProgress: countTicketProgress(ticketRows),
    portfolioAmounts: sumPortfolioAmounts(tradeContracts.data),
    homeCards,
    uncontractedListings: listings.data,
    sourceFailures,
    briefingInput
  };
}

async function loadListings(user: SessionUser | null): Promise<SourceResult<DashboardListing[]>> {
  try {
    const all = await serverFetch<TradeListing[]>("/trade/listings?mine=1");
    const listings = all
      .filter((listing) => listing.ownerId === user?.userId && listing.status !== "계약완료")
      .map((listing) => ({
        id: listing.id,
        title: listing.title,
        location: listing.location,
        priceLabel: priceLabel(listing),
        photoCount: listing.images?.length ?? 0,
        has3D: Boolean(listing.floorPlan)
      }));

    return { data: listings, failed: false };
  } catch {
    return { data: [], failed: true };
  }
}

async function loadTradeContracts(user: SessionUser | null): Promise<SourceResult<DashboardTradeContract[]>> {
  try {
    const all = await serverFetch<TradeContract[]>("/trade/contracts");
    const contracts = all
      .filter((contract) => contract.landlordId === user?.userId && contract.status === "accepted")
      .map((contract) => ({
        id: contract.id,
        listingTitle: contract.listingTitle,
        location: contract.location,
        tenantName: contract.tenantName,
        priceLabel: priceLabel(contract),
        threadId: contract.threadId,
        depositManwon: contract.depositManwon,
        monthlyRentManwon: contract.monthlyRentManwon
      }));

    return { data: contracts, failed: false };
  } catch {
    return { data: [], failed: true };
  }
}

async function loadBillingRows(): Promise<SourceResult<{ rows: DashboardBillingRow[]; summaryOverdue: number }>> {
  try {
    const dashboard = toManagerDashboard(await serverFetch<TeamDashboardResponse>("/manager/bills/dashboard"));
    return {
      data: {
        rows: dashboard.bills.map((row) => ({
          billId: row.billId,
          unitId: row.unitId,
          tenantName: row.tenantName,
          billingMonth: row.billingMonth,
          totalAmount: row.totalAmount,
          paidAmount: row.paidAmount,
          status: row.status,
          dueDate: row.dueDate,
          badge: row.badge
        })),
        summaryOverdue: dashboard.summary.overdue
      },
      failed: false
    };
  } catch {
    return { data: { rows: [], summaryOverdue: 0 }, failed: true };
  }
}

async function loadTickets(): Promise<SourceResult<DashboardTicket[]>> {
  try {
    const tickets = (await serverFetch<TeamManagerTicket[]>("/manager/tickets")).map(toManagerTicket).map(toDashboardTicket);
    return { data: tickets, failed: false };
  } catch {
    return { data: [], failed: true };
  }
}

async function loadContractExpiryRows(): Promise<SourceResult<DashboardContractExpiryRow[]>> {
  try {
    const dashboard = await getManagerContractDashboard();
    return {
      data: dashboard.rows.map((row) => ({
        id: row.contract.id,
        tenantName: row.tenantName,
        buildingName: row.buildingName,
        unitId: row.contract.unitId,
        daysToExpire: row.daysToExpire
      })),
      failed: false
    };
  } catch {
    return { data: [], failed: true };
  }
}

async function loadThreads(): Promise<SourceResult<DashboardThread[]>> {
  try {
    const threads = await serverFetch<Thread[]>("/manager/messaging/threads");
    return {
      data: threads.map((thread) => ({
        id: thread.id,
        unitId: thread.unitId,
        contextLabel: thread.contextLabel,
        lastMessage: thread.lastMessage,
        lastMessageSender: thread.lastMessageSender,
        updatedAt: thread.updatedAt,
        unreadCount: thread.unreadCount
      })),
      failed: false
    };
  } catch {
    return { data: [], failed: true };
  }
}

function toDashboardTicket(ticket: Ticket): DashboardTicket {
  return {
    id: ticket.id,
    title: ticket.title,
    unitId: ticket.unitId,
    status: ticket.status,
    statusLabel: ticketStatusLabels[ticket.status] ?? ticket.status,
    urgency: ticket.urgency
  };
}

function priceLabel(listing: Pick<TradeListing, "tradeType" | "depositManwon" | "monthlyRentManwon">): string {
  const deposit = (listing.depositManwon || 0).toLocaleString("ko-KR");
  if (listing.tradeType === "월세") return `월세 ${deposit}/${listing.monthlyRentManwon || 0}`;
  return `${listing.tradeType} ${deposit}만`;
}

function managerThreadHref(threadId: string): string {
  if (!threadId) return MANAGER_CROSS.messaging;
  return `/manager/messaging/04?id=${encodeURIComponent(threadId)}`;
}
