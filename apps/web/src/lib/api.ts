import type { Ticket, DefectAnalysis, RepairJob } from "@roomlog/types";
import { DEMO_TICKET, DEMO_ANALYSIS, DEMO_REPAIR } from "./demo-ticket";
import { serverFetch } from "./server-api";
import { toTicket, toAnalysis, toRepair, type TeamComplaint } from "./defect-mapping";

// 룸로그 하자 슬라이스 API 클라이언트 — 팀 실 백엔드(/tenant/complaints)에 쿠키 인증으로 연결.
// [레퍼런스 패턴] 서버 컴포넌트에서만 호출: serverFetch가 httpOnly 쿠키의 토큰을
// Authorization: Bearer 로 Nest에 forward (팀 백엔드 불변). 나머지 도메인이 이 패턴을 복제한다.
//
// GET /tenant/complaints 는 presentComplaint[] 를 반환하며 각 항목이 ticket(analysis·repairs 포함)을
// 품고 있어 단일 fetch로 하자 화면 데이터가 모두 나온다. 셸 슬라이스는 단일 활성 하자 흐름이므로
// 상세 화면은 목록의 첫 활성 건을 사용한다.
//
// 데모 폴백: 인증 전/데이터 없음/네트워크 오류 시 셸이 깨지지 않도록 데모로 대체.
// (실인증 상태에서 실데이터가 있으면 항상 실데이터가 우선한다.)

async function listComplaints(): Promise<TeamComplaint[]> {
  return serverFetch<TeamComplaint[]>("/tenant/complaints");
}

async function activeComplaint(): Promise<TeamComplaint | null> {
  try {
    const list = await listComplaints();
    return list[0] ?? null;
  } catch {
    return null;
  }
}

export async function listTickets(): Promise<Ticket[]> {
  try {
    const list = await listComplaints();
    return list.length ? list.map(toTicket) : [DEMO_TICKET];
  } catch {
    return [DEMO_TICKET];
  }
}

export async function getTicket(_id?: string): Promise<Ticket> {
  const c = await activeComplaint();
  return c ? toTicket(c) : DEMO_TICKET;
}

export async function getAnalysis(_id?: string): Promise<DefectAnalysis> {
  const c = await activeComplaint();
  return (c && toAnalysis(c)) || DEMO_ANALYSIS;
}

export async function getRepair(_id?: string): Promise<RepairJob> {
  const c = await activeComplaint();
  return (c && toRepair(c)) || DEMO_REPAIR;
}

/** 상세 화면들이 참조하는 활성 하자 sentinel (단일 활성 흐름 — 실제 id는 서버에서 해석). */
export const DEMO_TICKET_ID = "active";
