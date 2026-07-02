import type { DefectAnalysis, RepairJob, Ticket } from "@roomlog/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function tryFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

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

export function listVendorJobs(): Promise<RepairJob[]> {
  return tryFetch("/tickets/vendor/jobs", [VENDOR_DEMO_REPAIR]);
}

export function getVendorRepair(ticketId: string): Promise<RepairJob> {
  return tryFetch(`/tickets/${ticketId}/repair`, VENDOR_DEMO_REPAIR);
}

export function getVendorAnalysis(ticketId: string): Promise<DefectAnalysis> {
  return tryFetch(`/tickets/${ticketId}/analysis`, VENDOR_DEMO_ANALYSIS);
}

export function getVendorTicket(ticketId: string): Promise<Ticket> {
  return tryFetch(`/tickets/${ticketId}`, VENDOR_DEMO_TICKET);
}
