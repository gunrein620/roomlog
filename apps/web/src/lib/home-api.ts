import type { Ticket, Bill } from "@roomlog/types";
import { listTickets } from "./defect-api";
import { getUser } from "./session";
import { CROSS_ROUTES } from "./home-nav";

// 임차인 통합 홈 집계 — 하자(티켓)·호실은 팀 실 백엔드(serverFetch)로 연결(레퍼런스 패턴).
// 납부·대화·공지는 아직 팀 백엔드가 없다 → 데모를 실데이터처럼 노출하지 않는다(빈/0).
// 근거: 공백 ≠ 책임/사실 추정(D27)·fabrication 회피. getHomeSummary는 서버 컴포넌트 전용(쿠키).

/** '오늘 할 일' 1건 — D19 임차인 멘탈모델 우선순위(안전 > 내 하자). 실 데이터에서만 도출. */
export type TodoItem = { frame: string; label: string; href: string } | null;

export interface HomeSummary {
  unitId: string;
  activeTickets: Ticket[]; // 진행 중 하자 (실데이터, 최대 2)
  billsDue: Bill[]; // 납부 백엔드 부재 → 빈(stage-3)
  unreadThreads: number; // 대화 백엔드 부재 → 0
  unreadAnnouncements: number; // 공지 백엔드 부재 → 0
  todo: TodoItem;
}

const isActiveTicket = (t: Ticket) => t.status !== "resolved";
const stripHo = (s?: string) => (s ?? "").replace(/\s*호\s*$/, "");

export async function getHomeSummary(): Promise<HomeSummary> {
  const [user, tickets] = await Promise.all([getUser(), listTickets()]);
  const active = tickets.filter(isActiveTicket);

  // 오늘 할 일: 실제 진행 하자에서만 도출(데모 미납 청구를 실제 업무처럼 제시하지 않는다).
  let todo: TodoItem = null;
  const urgent = active.find((t) => t.urgency <= 1);
  if (urgent) todo = { frame: "빠른 조치 필요", label: urgent.title, href: CROSS_ROUTES.defectStatus };
  else if (active[0]) todo = { frame: "내 신고 진행", label: active[0].title, href: CROSS_ROUTES.defectStatus };

  return {
    // 호실은 인증된 사용자의 실제 room 우선(없으면 티켓, 그것도 없으면 미연결 "—").
    unitId: stripHo(user?.room?.roomNo) || tickets[0]?.unitId || "—",
    activeTickets: active.slice(0, 2),
    billsDue: [],
    unreadThreads: 0,
    unreadAnnouncements: 0,
    todo
  };
}
