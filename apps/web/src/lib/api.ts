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
  } catch (error) {
    console.error("[tenant/api] /tenant/complaints 조회 실패:", error);
    return null;
  }
}

// listTickets는 실제 목록을 반환한다. 빈 목록이면 빈 배열([]) — 화면 00은 빈 상태 UI가 있다.
// (데모로 채우면 실제 "데이터 없음"과 API 오류를 은폐하므로 금지 — 적대검토 지적.)
export async function listTickets(): Promise<Ticket[]> {
  try {
    const list = await listComplaints();
    return list.map(toTicket);
  } catch (error) {
    console.error("[tenant/api] listTickets 실패 → 빈 목록:", error);
    return [];
  }
}

// 상세 getter는 활성 하자를 매핑해 반환한다. 실제 데이터가 없을 때만 데모로 폴백하되,
// 조용히 넘어가지 않도록 경고를 남긴다(관측성). 미배정 등으로 analysis/repair가 없으면
// 데모 대신 진짜 상태를 보여주도록 개선하는 것은 화면 빈 상태 작업과 함께 후속(KNOWN-GAPS).
export async function getTicket(_id?: string): Promise<Ticket> {
  const c = await activeComplaint();
  if (c) return toTicket(c);
  console.warn("[tenant/api] 활성 하자 없음 → 데모 티켓 폴백");
  return DEMO_TICKET;
}

export async function getAnalysis(_id?: string): Promise<DefectAnalysis> {
  const c = await activeComplaint();
  const mapped = c && toAnalysis(c);
  if (mapped) return mapped;
  console.warn("[tenant/api] 실제 분석 없음 → 데모 분석 폴백");
  return DEMO_ANALYSIS;
}

export async function getRepair(_id?: string): Promise<RepairJob> {
  const c = await activeComplaint();
  const mapped = c && toRepair(c);
  if (mapped) return mapped;
  console.warn("[tenant/api] 실제 수리 없음(미배정/취소) → 데모 수리 폴백");
  return DEMO_REPAIR;
}

/** 상세 화면들이 참조하는 활성 하자 sentinel (단일 활성 흐름 — 실제 id는 서버에서 해석). */
export const DEMO_TICKET_ID = "active";
