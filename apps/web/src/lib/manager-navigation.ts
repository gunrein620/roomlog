import { MANAGER_BILLING_ROUTES } from "./billing-manager-nav";
import { MANAGER_CONTRACT_ROUTES } from "./contract-manager-nav";
import { MANAGER_COST_ROUTES } from "./cost-nav";
import { MANAGER_CROSS, MHOME_ROUTES } from "./manager-home-nav";
import { MANAGER_MESSAGING_ROUTES } from "./messaging-manager-nav";
import { MANAGER_MOVEOUT_ROUTES } from "./moveout-manager-nav";
import { MANAGER_REPORT_ROUTES } from "./report-nav";
import { MANAGER_TICKET_ROUTES } from "./ticket-manager-nav";
import { MANAGER_VENDOR_MGMT_ROUTES } from "./vendor-mgmt-nav";

export type ManagerNavItemId =
  | "dashboard" | "listing" | "contract" | "billing" | "cost" | "ticket"
  | "messaging" | "moveout" | "vendor" | "report" | "assistant" | "settings";

export type ManagerTicketTypeFilter = "all" | "complaint" | "defect";
export interface ManagerNavChild {
  label: string;
  href: string;
  demo?: true;
  active?: boolean;
  typeFilter?: ManagerTicketTypeFilter;
}
export interface ManagerNavItem {
  id: ManagerNavItemId;
  label: string;
  href: string;
  icon: ManagerNavItemId;
  activePrefixes: readonly string[];
  children: readonly ManagerNavChild[];
  external?: true;
}
export interface ManagerNavGroup { label: string; items: readonly ManagerNavItem[] }
export interface ManagerNavState { activeItemId: ManagerNavItemId | null; activeChildHref: string | null }

export const MANAGER_NAV_GROUPS: readonly ManagerNavGroup[] = [
  {
    label: "워크스페이스",
    items: [
      {
        id: "dashboard",
        label: "통합 대시보드",
        href: MHOME_ROUTES["M-HOME-00"],
        icon: "dashboard",
        activePrefixes: [
          MHOME_ROUTES["M-HOME-00"],
          MHOME_ROUTES["M-HOME-01"],
          MHOME_ROUTES["M-HOME-02"],
          MHOME_ROUTES["M-HOME-03"],
          MHOME_ROUTES["M-HOME-04"],
          MHOME_ROUTES["M-HOME-05"],
        ],
        children: [
          { label: "자산현황", href: MHOME_ROUTES["M-HOME-00"] },
          { label: "미처리 업무", href: MHOME_ROUTES["M-HOME-01"] },
          { label: "임대 현황 리포트", href: MHOME_ROUTES["M-HOME-02"], demo: true },
          { label: "전체 건물 관리", href: MHOME_ROUTES["M-HOME-03"], demo: true },
          { label: "건물·호실 등록", href: MHOME_ROUTES["M-HOME-05"], demo: true },
        ],
      },
    ],
  },
  {
    label: "임대 운영",
    items: [
      {
        id: "listing",
        label: "매물 관리",
        href: "/sell",
        icon: "listing",
        activePrefixes: ["/sell"],
        children: [],
        external: true,
      },
      {
        id: "contract",
        label: "계약 관리",
        href: MANAGER_CONTRACT_ROUTES["M-DOC-00"],
        icon: "contract",
        activePrefixes: ["/manager/contract"],
        children: [
          { label: "검토 대시보드", href: MANAGER_CONTRACT_ROUTES["M-DOC-00"] },
          { label: "계약서 등록", href: MANAGER_CONTRACT_ROUTES["M-DOC-02"] },
        ],
      },
      {
        id: "billing",
        label: "청구·수납",
        href: MANAGER_BILLING_ROUTES.dashboard,
        icon: "billing",
        activePrefixes: ["/manager/billing"],
        children: [
          { label: "대시보드", href: MANAGER_BILLING_ROUTES.dashboard },
          { label: "수금 현황", href: MANAGER_BILLING_ROUTES.collection },
          { label: "입출금 내역", href: MANAGER_BILLING_ROUTES.matching },
          { label: "연체 관리", href: MANAGER_BILLING_ROUTES.overdue },
        ],
      },
      {
        id: "cost",
        label: "비용 원장",
        href: MANAGER_COST_ROUTES["M-COST-00"],
        icon: "cost",
        activePrefixes: ["/manager/cost"],
        children: [
          { label: "원장·검토 큐", href: MANAGER_COST_ROUTES["M-COST-00"] },
          { label: "영수증 첨부", href: MANAGER_COST_ROUTES["M-COST-01"] },
          { label: "공개 관리", href: MANAGER_COST_ROUTES["M-COST-04"] },
        ],
      },
    ],
  },
  {
    label: "운영 지원",
    items: [
      {
        id: "ticket",
        label: "민원·하자",
        href: `${MANAGER_TICKET_ROUTES["M-DASH-00"]}?type=defect`,
        icon: "ticket",
        activePrefixes: ["/manager/ticket/dash"],
        children: [
          { label: "민원 대시보드", href: MANAGER_TICKET_ROUTES["M-DASH-00"], typeFilter: "all" },
          { label: "민원 대응", href: `${MANAGER_TICKET_ROUTES["M-DASH-00"]}?type=complaint`, typeFilter: "complaint" },
          { label: "하자 관리", href: `${MANAGER_TICKET_ROUTES["M-DASH-00"]}?type=defect`, typeFilter: "defect" },
        ],
      },
      {
        id: "messaging",
        label: "소통·공지",
        href: MANAGER_MESSAGING_ROUTES["M-MSG-00"],
        icon: "messaging",
        activePrefixes: ["/manager/messaging"],
        children: [
          { label: "소통 허브", href: MANAGER_MESSAGING_ROUTES["M-MSG-00"] },
          { label: "공지 작성", href: MANAGER_MESSAGING_ROUTES["M-MSG-01"] },
        ],
      },
      {
        id: "moveout",
        label: "퇴실·정산",
        href: MANAGER_MOVEOUT_ROUTES["M-OUT-00"],
        icon: "moveout",
        activePrefixes: ["/manager/moveout"],
        children: [
          { label: "검토 대시보드", href: MANAGER_MOVEOUT_ROUTES["M-OUT-00"] },
        ],
      },
      {
        id: "vendor",
        label: "업체 관리",
        href: MANAGER_VENDOR_MGMT_ROUTES["M-VEND-00"],
        icon: "vendor",
        activePrefixes: ["/manager/vendor-mgmt"],
        children: [
          { label: "업체 주소록", href: MANAGER_VENDOR_MGMT_ROUTES["M-VEND-00"] },
          { label: "등록·편집", href: MANAGER_VENDOR_MGMT_ROUTES["M-VEND-03"] },
        ],
      },
    ],
  },
  {
    label: "인사이트",
    items: [
      {
        id: "report",
        label: "운영 리포트",
        href: MANAGER_REPORT_ROUTES["M-RPT-00"],
        icon: "report",
        activePrefixes: ["/manager/report"],
        children: [
          { label: "리포트 허브", href: MANAGER_REPORT_ROUTES["M-RPT-00"] },
          { label: "새 리포트 생성", href: MANAGER_REPORT_ROUTES["M-RPT-01"] },
          { label: "빠른 조회", href: MANAGER_REPORT_ROUTES["M-RPT-05"] },
        ],
      },
      {
        id: "assistant",
        label: "AI 비서",
        href: MANAGER_CROSS.realtimeAgent,
        icon: "assistant",
        activePrefixes: ["/manager/agent"],
        children: [],
      },
    ],
  },
  {
    label: "계정",
    items: [
      {
        id: "settings",
        label: "설정",
        href: MHOME_ROUTES["M-HOME-06"],
        icon: "settings",
        activePrefixes: [MHOME_ROUTES["M-HOME-06"]],
        children: [],
      },
    ],
  },
];

function cleanPathname(pathname: string): string {
  const path = pathname.split("?")[0]?.split("#")[0] || "/";
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function childMatches(pathname: string, candidate: string): boolean {
  const [path, query = ""] = pathname.split("?", 2);
  const [candidatePath, candidateQuery = ""] = candidate.split("?", 2);
  return cleanPathname(path) === cleanPathname(candidatePath) && query === candidateQuery;
}

function currentChild(item: ManagerNavItem, pathname: string): ManagerNavChild | undefined {
  return item.children.find((candidate) => childMatches(pathname, candidate.href))
    ?? item.children.find((candidate) => cleanPathname(candidate.href) === cleanPathname(pathname));
}

function pathMatches(pathname: string, candidate: string): boolean {
  return pathname === candidate || pathname.startsWith(`${candidate}/`);
}

export function getManagerNavState(pathname: string): ManagerNavState {
  const path = cleanPathname(pathname);
  const items = MANAGER_NAV_GROUPS.flatMap((group) => group.items);
  const item = items.find((candidate) =>
    candidate.activePrefixes.some((prefix) => pathMatches(path, prefix)),
  );
  if (!item) return { activeItemId: null, activeChildHref: null };
  const child = currentChild(item, pathname);
  return { activeItemId: item.id, activeChildHref: child?.href ?? null };
}

export function getManagerCurrentHref(pathname: string): string | null {
  const path = cleanPathname(pathname);
  const items = MANAGER_NAV_GROUPS.flatMap((group) => group.items);

  for (const item of items) {
    const child = currentChild(item, pathname);
    if (child) return child.href;
    if (cleanPathname(item.href) === path) return item.href;
  }

  return null;
}
