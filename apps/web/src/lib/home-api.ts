import type { Ticket, Bill, Thread, Announcement } from "@roomlog/types";
import { listTickets } from "./api";
import { listBills } from "./payment-api";
import { listThreads, listAnnouncements } from "./messaging-api";
import { CROSS_ROUTES } from "./home-nav";

// 임차인 통합 홈 집계 — 새 백엔드 없이 기존 도메인 엔드포인트를 조합한다.
// (api 미기동 시 각 클라이언트가 데모로 폴백하므로 홈도 안 막힘)

/** '오늘 할 일' 1건 — D19 임차인 멘탈모델 우선순위(안전>내 하자>납부 중립>계약).
 *  미납은 빚 독촉 프레임 금지 → 중립 문구. */
export type TodoItem = { frame: string; label: string; href: string } | null;

export interface HomeSummary {
  unitId: string;
  activeTickets: Ticket[]; // 진행 중 하자 (라이브 배지 최대 2)
  billsDue: Bill[]; // 납부 안내(중립)
  unreadThreads: number; // 미읽음 대화 (단일 소스 = messaging)
  unreadAnnouncements: number;
  todo: TodoItem; // 우선순위 1건
}

const isActiveTicket = (t: Ticket) => t.status !== "resolved";
const isBillDue = (b: Bill) => b.status !== "paid";

export async function getHomeSummary(): Promise<HomeSummary> {
  const [tickets, bills, threads, anns] = await Promise.all([
    listTickets(),
    listBills(),
    listThreads(),
    listAnnouncements(),
  ]);
  const active = tickets.filter(isActiveTicket);
  const due = bills.filter(isBillDue);

  // 우선순위: 1) 긴급(urgency<=1) 진행 하자 2) 진행 하자 3) 납부(중립) 4) 계약
  let todo: TodoItem = null;
  const urgent = active.find((t) => t.urgency <= 1);
  if (urgent) todo = { frame: "빠른 조치 필요", label: urgent.title, href: CROSS_ROUTES.defectStatus };
  else if (active[0]) todo = { frame: "내 신고 진행", label: active[0].title, href: CROSS_ROUTES.defectStatus };
  else if (due[0]) todo = { frame: "납부 도와드릴게요", label: `${due[0].billingMonth} 청구`, href: CROSS_ROUTES.payment };

  return {
    unitId: tickets[0]?.unitId ?? bills[0]?.unitId ?? "—",
    activeTickets: active.slice(0, 2),
    billsDue: due,
    unreadThreads: threads.reduce((n, t: Thread) => n + (t.unreadCount ?? 0), 0),
    unreadAnnouncements: anns.filter((a: Announcement) => a.state === "unread").length,
    todo,
  };
}
