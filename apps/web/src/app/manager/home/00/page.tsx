import { ManagerAppShell } from "@/app/manager/_components/ManagerAppShell";
import { MANAGER_BILLING_ROUTES } from "@/lib/billing-manager-nav";
import { getUser } from "@/lib/session";
import { serverFetch } from "@/lib/server-api";
import { listManagerTickets } from "@/lib/ticket-manager-api";
import { toManagerDashboard, type TeamDashboardResponse } from "@/lib/billing-manager-mapping";
import { MANAGER_CROSS } from "@/lib/manager-home-nav";
import ManagerDashboardOverview from "./ManagerDashboardOverview";
import type {
  ManagerBillingSummary,
  ManagerContractRow,
  ManagerListingRow,
  ManagerTicketRow,
} from "./ManagerHomeTabs";

// 관리 중인 집 홈 — 실데이터 운영 요약과 기존 상세 4탭을 함께 보여준다.

type TradeListing = {
  id: string;
  ownerId: string;
  title: string;
  location: string;
  detailAddress?: string;
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

function priceLabel(listing: Pick<TradeListing, "tradeType" | "depositManwon" | "monthlyRentManwon">): string {
  const deposit = (listing.depositManwon || 0).toLocaleString("ko-KR");
  if (listing.tradeType === "월세") return `월세 ${deposit}/${listing.monthlyRentManwon || 0}`;
  return `${listing.tradeType} ${deposit}만`;
}

const ticketStatusLabels: Record<string, string> = {
  received: "접수",
  reviewing: "검토중",
  info_requested: "정보 요청",
  processing: "처리 중",
  resolved: "완료",
  reopened: "재요청",
  cancelled: "취소됨"
};

export default async function Page() {
  const user = await getUser();

  let listings: ManagerListingRow[] = [];
  try {
    const all = await serverFetch<TradeListing[]>("/trade/listings");
    listings = all
      .filter((listing) => listing.ownerId === user?.userId && listing.status !== "계약완료")
      .map((listing) => ({
        id: listing.id,
        title: listing.title,
        location: listing.location,
        detailAddress: listing.detailAddress,
        priceLabel: priceLabel(listing),
        photoCount: listing.images?.length ?? 0,
        has3D: Boolean(listing.floorPlan)
      }));
  } catch {
    // 목록 API 일시 오류 — 빈 목록으로 렌더(위조 금지)
  }

  // 체결된 계약 — 채팅에서 제안→수락된 것만 계약중인 집으로 표시한다.
  let contracts: ManagerContractRow[] = [];
  try {
    const allContracts = await serverFetch<TradeContract[]>("/trade/contracts");
    contracts = allContracts
      .filter((contract) => contract.landlordId === user?.userId && contract.status === "accepted")
      .map((contract) => ({
        id: contract.id,
        listingTitle: contract.listingTitle,
        location: contract.location,
        tenantName: contract.tenantName,
        priceLabel: priceLabel(contract),
        acceptedAtLabel: contract.respondedAt
          ? new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(new Date(contract.respondedAt))
          : "",
        // 계약 상세 대시보드의 "세입자 채팅"이 이 문의 스레드로 잠긴다.
        threadId: contract.threadId
      }));
  } catch {
    // 계약 API 일시 오류 — 빈 목록으로 렌더(위조 금지)
  }

  // 청구 요약 — 계약 상세 대시보드의 관리비·청구 카드용.
  // getManagerDashboard()의 데모 폴백을 쓰지 않는다: 실패하면 null로 두고 화면에는 실패 사실만 보여준다(위조 금지).
  let billing: ManagerBillingSummary | null = null;
  try {
    const dashboard = toManagerDashboard(await serverFetch<TeamDashboardResponse>("/manager/bills/dashboard"));
    billing = {
      total: dashboard.summary.total,
      pending: dashboard.summary.pending,
      overdue: dashboard.summary.overdue
    };
  } catch {
    billing = null;
  }

  const tickets: ManagerTicketRow[] = (await listManagerTickets())
    .filter((ticket) => ticket.status !== "resolved" && ticket.status !== "cancelled")
    .map((ticket) => ({
      id: ticket.id,
      title: ticket.title,
      unitId: ticket.unitId,
      statusLabel: ticketStatusLabels[ticket.status] ?? ticket.status,
      urgent: ticket.urgency <= 1
    }));

  const billingOutstanding = billing ? billing.pending + billing.overdue : "—";
  const assistantBriefing = [
    {
      label: "진행 중 티켓",
      value: `${tickets.length}건`,
      href: MANAGER_CROSS.ticketDash,
      tone: tickets.some((ticket) => ticket.urgent) ? "attention" : "default",
    },
    {
      label: "수납 대기·연체",
      value: typeof billingOutstanding === "number" ? `${billingOutstanding}건` : billingOutstanding,
      href: MANAGER_BILLING_ROUTES.overdue,
      tone: billing && billing.pending + billing.overdue > 0 ? "attention" : "default",
    },
    {
      label: "계약중인 집",
      value: `${contracts.length}건`,
      href: MANAGER_CROSS.contract,
    },
  ] as const;

  return (
    <ManagerAppShell
      title="통합 대시보드"
      context="관리 중인 집 · 오늘의 운영 현황"
      managerName={user?.name ?? "관리인"}
      showAssistantRail
      assistantBriefing={assistantBriefing}
    >
      <ManagerDashboardOverview
        listingCount={listings.length}
        contractCount={contracts.length}
        ticketCount={tickets.length}
        billingOutstanding={billingOutstanding}
        listings={listings}
        contracts={contracts}
        tickets={tickets}
        billing={billing}
        ticketHubHref={MANAGER_CROSS.ticketDash}
        billingHref={MANAGER_CROSS.billing}
        realtimeAgentHref={MANAGER_CROSS.realtimeAgent}
      />
    </ManagerAppShell>
  );
}
