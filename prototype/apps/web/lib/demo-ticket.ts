import type { Ticket, DefectAnalysis, RepairJob } from "@roomlog/types";

// 하자 슬라이스 데모 시드 — api(인메모리 리포)와 동일한 값으로 맞춘다.
// 화면이 api 없이도 렌더되도록 프론트 폴백으로도 쓰인다.
export const DEMO_TICKET: Ticket = {
  id: "tk_0001",
  type: "defect",
  unitId: "302",
  title: "에어컨 물샘",
  description: "거실 에어컨에서 물이 새요. 어제 저녁부터 바닥에 물이 고입니다.",
  location: "거실",
  occurredAt: "2026-06-29T20:00:00+09:00",
  status: "processing",
  urgency: 2,
  createdAt: "2026-06-30T09:00:00+09:00",
  updatedAt: "2026-06-30T10:00:00+09:00",
  analysisId: "an_0001",
  repairJobId: "rj_0001",
};

export const DEMO_ANALYSIS: DefectAnalysis = {
  id: "an_0001",
  ticketId: "tk_0001",
  problemCandidates: ["에어컨 배수관 막힘/누수"],
  urgency: 2,
  responsibility: "tenant_likely",
  reasoning: [
    "배수 호스 연결부 결로/누수 패턴과 유사",
    "필터 청소 미흡 시 발생하는 전형적 증상",
  ],
  confidence: 0.71,
  safetyRisk: false,
  moveinComparisonAvailable: false,
  createdAt: "2026-06-30T09:05:00+09:00",
};

export const DEMO_REPAIR: RepairJob = {
  id: "rj_0001",
  ticketId: "tk_0001",
  stage: "in_progress",
  vendorName: "○○냉난방",
  quoteAmount: 80000,
  quoteItems: [
    { label: "출장·점검", amount: 30000 },
    { label: "배수관 보수", amount: 50000 },
  ],
  scheduledAt: "2026-06-30T10:00:00+09:00",
};
