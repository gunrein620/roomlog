import type { Ticket, Bill } from "@roomlog/types";
import { listDemoTickets } from "./demo-ticket";
import { listBills } from "./payment-api";
import { MANAGER_CROSS } from "./manager-home-nav";

// 관리인 홈 집계 — 셸이므로 새 백엔드 없이 기존 도메인 엔드포인트 조합.
// KPI 단일 산식은 원칙상 M-BILL 집계 API가 원천이나, 셸 단계에선 근사 집계.

export interface QueueItem {
  type: string;
  label: string;
  count: number;
  href: string;
}

export interface ManagerHomeSummary {
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
const unpaidBill = (b: Bill) => b.status !== "paid";

export async function getManagerHomeSummary(): Promise<ManagerHomeSummary> {
  const [tickets, bills] = await Promise.all([listDemoTickets(), listBills()]);
  const pending = tickets.filter(pendingTicket);
  const unpaid = bills.filter(unpaidBill);
  const urgent = tickets.filter((t) => t.urgency <= 1 && t.status !== "resolved");

  const queues: QueueItem[] = [
    { type: "ticket", label: "처리할 티켓", count: pending.length, href: MANAGER_CROSS.ticketDash },
    { type: "bill", label: "청구·입금 확인", count: unpaid.length, href: MANAGER_CROSS.billing },
  ].filter((q) => q.count > 0);

  const overdueAmount = unpaid.reduce(
    (sum, b) => sum + (b.items?.reduce((s, i) => s + i.amount, 0) ?? 0),
    0,
  );

  return {
    todoCount: queues.reduce((n, q) => n + q.count, 0),
    queues,
    kpi: {
      occupancyRate: null, // 호실 데이터 미구축 — 셸에선 null(거짓 0% 금지)
      collectionRate: null, // M-BILL 집계 원천 붙기 전 null
      overdueAmount,
      urgentTickets: urgent.length,
    },
  };
}
