import type { Ticket } from "@roomlog/types";
import { MANAGER_CROSS } from "./manager-home-nav";
import { listManagerTickets } from "./ticket-manager-api";
import { getUser, type SessionUser } from "./session";

// 관리인 홈 집계 — 인증된 관리인 세션의 실제 티켓 API만 원천으로 삼는다.
// 비용/수납 KPI는 아직 권한 포함 집계 API가 없으므로 데모 값을 섞지 않고 빈 값으로 둔다.

export interface QueueItem {
  type: string;
  label: string;
  count: number;
  href: string;
}

export interface ManagerHomeSummary {
  managerName: string;
  managedRoomCount: number;
  todoCount: number; // 오늘 할 일 총합 (홈 primary = 숫자 1 + CTA)
  queues: QueueItem[]; // 미처리 허브 분해 (M-HOME-01)
  kpi: {
    occupancyRate: number | null; // 입주율
    collectionRate: number | null; // 수납률 (M-BILL 원천 가정)
    overdueAmount: number; // 미납 금액
    urgentTickets: number; // 긴급민원 수
  };
}

const pendingTicket = (t: Ticket) =>
  t.status === "received" || t.status === "reviewing" || t.status === "info_requested";

export async function getManagerHomeSummary(sessionUser?: SessionUser): Promise<ManagerHomeSummary> {
  const [user, tickets] = await Promise.all([
    sessionUser ? Promise.resolve(sessionUser) : getUser(),
    listManagerTickets()
  ]);
  const pending = tickets.filter(pendingTicket);
  const urgent = tickets.filter((t) => t.urgency <= 1 && t.status !== "resolved");

  const queues: QueueItem[] = [
    { type: "ticket", label: "처리할 티켓", count: pending.length, href: MANAGER_CROSS.ticketDash },
  ].filter((q) => q.count > 0);

  return {
    managerName: user?.name ?? "관리인",
    managedRoomCount: user?.managedRooms?.length ?? 0,
    todoCount: queues.reduce((n, q) => n + q.count, 0),
    queues,
    kpi: {
      occupancyRate: null, // 호실 데이터 미구축 — 셸에선 null(거짓 0% 금지)
      collectionRate: null, // M-BILL 집계 원천 붙기 전 null
      overdueAmount: 0,
      urgentTickets: urgent.length,
    },
  };
}
