import type { DefectAnalysis, RepairJob, Ticket } from "@roomlog/types";
import { serverFetch } from "./server-api";
import { mapRepair, type TeamRepair } from "./defect-mapping";
import { toManagerTicket, toManagerAnalysis, type TeamManagerTicket } from "./manager-mapping";

export const VENDOR_DEMO_TICKET: Ticket = {
  id: "tk_0001",
  type: "defect",
  unitId: "302",
  title: "거실 에어컨 물샘",
  description: "거실 에어컨에서 물이 새요. 어제 저녁부터 바닥에 물이 고입니다.",
  location: "성동구 성수동",
  occurredAt: "2026-06-29T20:00:00+09:00",
  status: "processing",
  urgency: 2,
  createdAt: "2026-06-30T09:00:00+09:00",
  updatedAt: "2026-06-30T10:00:00+09:00",
  analysisId: "an_0001",
  repairJobId: "rj_0001",
};

export const VENDOR_DEMO_ANALYSIS: DefectAnalysis = {
  id: "an_0001",
  ticketId: VENDOR_DEMO_TICKET.id,
  problemCandidates: ["에어컨 배수관 막힘/누수"],
  urgency: 2,
  responsibility: "tenant_likely",
  reasoning: ["배수 호스 연결부 누수 패턴", "바닥 고임이 반복됨"],
  confidence: 0.71,
  safetyRisk: false,
  moveinComparisonAvailable: false,
  createdAt: "2026-06-30T09:05:00+09:00",
};

export const VENDOR_DEMO_REPAIR: RepairJob = {
  id: "rj_0001",
  ticketId: VENDOR_DEMO_TICKET.id,
  stage: "scheduled",
  vendorName: "○○냉난방",
  quoteType: "visit",
  quoteAmount: 70000,
  quoteNote: "현장 배수관 상태 확인 후 확정가 산정 필요",
  quoteItems: [
    { label: "출장·점검", amount: 30000 },
    { label: "예상 배수관 보수", amount: 40000 },
  ],
  scheduledAt: "2026-07-03T10:00:00+09:00",
  onsiteQuoteAmount: 95000,
  onsiteApproval: "pending",
  completionNote: "배수관 연결부 재고정 및 누수 테스트 완료",
  finalAmount: 95000,
};

export const VENDOR_DEMO_TICKET_ID = VENDOR_DEMO_TICKET.id;

// 수리업체 API 클라이언트 — 팀 GET /vendor/repairs 에 쿠키 인증으로 연결(레퍼런스 패턴 복제).
// 서버 컴포넌트 전용. 응답 presentRepair = {...repair, ticket: presentTicket} 이므로
// 중첩 ticket을 manager 매퍼로 재사용(단일방향 매핑·교정 공유). 배정된 수리만 반환된다.
// NOTE: 업체는 최소 정보만 봐야 함(호실 라벨·증상·사진·메모) — 필드 제한은 백엔드 projection 책임.

// /vendor/repairs 응답 = presentRepair(=RepairRequest + 중첩 ticket). 각 row의 top-level repair를
// 그 row의 것으로 매핑한다(ticket.repairs[0] 고정 선택 금지 — 복수 수리 시 오매핑 방지).
interface TeamVendorRepair extends TeamRepair {
  ticket: TeamManagerTicket;
}

function repairOf(r: TeamVendorRepair): RepairJob | null {
  return mapRepair(r, r.ticket.id, r.ticket.assignedVendor?.businessName);
}

async function listTeamVendorRepairs(): Promise<TeamVendorRepair[]> {
  return serverFetch<TeamVendorRepair[]>("/vendor/repairs");
}

async function activeVendorRepair(): Promise<TeamVendorRepair | null> {
  try {
    const list = await listTeamVendorRepairs();
    return list[0] ?? null;
  } catch (error) {
    console.error("[vendor/api] /vendor/repairs 조회 실패:", error);
    return null;
  }
}

async function getVendorRepairById(id: string): Promise<TeamVendorRepair | null> {
  try {
    return await serverFetch<TeamVendorRepair>(`/vendor/repairs/${id}`);
  } catch (error) {
    console.error(`[vendor/api] /vendor/repairs/${id} 조회 실패:`, error);
    return null;
  }
}

// 실제 수리 id면 그 건을, "active"/데모 sentinel/미지정이면 첫 배정 건을 해석.
async function resolveVendorRepair(id?: string): Promise<TeamVendorRepair | null> {
  if (id && id !== VENDOR_DEMO_TICKET_ID) return getVendorRepairById(id);
  return activeVendorRepair();
}

export async function listVendorJobs(): Promise<RepairJob[]> {
  try {
    const list = await listTeamVendorRepairs();
    return list.map(repairOf).filter((r): r is RepairJob => r !== null);
  } catch (error) {
    console.error("[vendor/api] listVendorJobs 실패 → 빈 목록:", error);
    return [];
  }
}

export async function getVendorRepair(id?: string): Promise<RepairJob> {
  const r = await resolveVendorRepair(id);
  const mapped = r && repairOf(r);
  if (mapped) return mapped;
  console.warn("[vendor/api] 배정된 수리 없음 → 데모 폴백");
  return VENDOR_DEMO_REPAIR;
}

export async function getVendorAnalysis(id?: string): Promise<DefectAnalysis> {
  const r = await resolveVendorRepair(id);
  const mapped = r && toManagerAnalysis(r.ticket);
  if (mapped) return mapped;
  console.warn("[vendor/api] 배정된 수리 분석 없음 → 데모 폴백");
  return VENDOR_DEMO_ANALYSIS;
}

export async function getVendorTicket(id?: string): Promise<Ticket> {
  const r = await resolveVendorRepair(id);
  if (r) return toManagerTicket(r.ticket);
  console.warn("[vendor/api] 배정된 수리 티켓 없음 → 데모 폴백");
  return VENDOR_DEMO_TICKET;
}
