import type {
  DefectAnalysis,
  ManagerQueueSummary,
  RepairJob,
  Ticket,
} from "@roomlog/types";

export const MANAGER_DEMO_TICKETS: Ticket[] = [
  {
    id: "tk_0001",
    type: "defect",
    category: "냉난방",
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
    disposition: "open",
  },
  {
    id: "tk_0002",
    type: "complaint",
    category: "배관/수전",
    unitId: "1201",
    title: "욕실 천장 누수 의심",
    description: "욕실 조명 주변에 물자국이 번지고 전등이 깜빡입니다.",
    location: "욕실",
    occurredAt: "2026-07-01T21:20:00+09:00",
    status: "received",
    urgency: 1,
    createdAt: "2026-07-02T08:10:00+09:00",
    updatedAt: "2026-07-02T08:10:00+09:00",
    analysisId: "an_0002",
    disposition: "open",
  },
  {
    id: "tk_0003",
    type: "defect",
    category: "창호",
    unitId: "508",
    title: "창문 잠금장치 파손",
    description: "창문 잠금 레버가 헛돌아 외출 시 잠글 수 없습니다.",
    location: "침실",
    occurredAt: "2026-06-30T19:40:00+09:00",
    status: "reviewing",
    urgency: 3,
    createdAt: "2026-07-01T09:30:00+09:00",
    updatedAt: "2026-07-01T13:20:00+09:00",
    analysisId: "an_0003",
    disposition: "on_hold",
    dispositionReason: "입주 전 사진 확인 대기",
  },
  {
    id: "tk_0004",
    type: "defect",
    category: "출입/보안",
    unitId: "701",
    title: "현관 도어락 배터리 누액",
    description: "도어락 내부에서 배터리 누액이 보여 작동이 불안정합니다.",
    location: "현관",
    occurredAt: "2026-07-01T07:10:00+09:00",
    status: "processing",
    urgency: 2,
    createdAt: "2026-07-01T07:40:00+09:00",
    updatedAt: "2026-07-02T09:10:00+09:00",
    analysisId: "an_0004",
    repairJobId: "rj_0004",
    disposition: "open",
  },
  {
    id: "tk_0005",
    type: "defect",
    category: "배관/수전",
    unitId: "412",
    title: "세면대 하부 누수",
    description: "욕실 세면대 아래 배관에서 물방울이 계속 떨어지고 수납장이 젖었습니다.",
    location: "욕실 세면대",
    occurredAt: "2026-07-02T09:20:00+09:00",
    status: "processing",
    urgency: 1,
    createdAt: "2026-07-02T09:30:00+09:00",
    updatedAt: "2026-07-02T10:10:00+09:00",
    analysisId: "an_0005",
    repairJobId: "rj_0005",
    disposition: "open",
  },
];

export const MANAGER_DEMO_ANALYSES: Record<string, DefectAnalysis> = {
  tk_0001: {
    id: "an_0001",
    ticketId: "tk_0001",
    problemCandidates: ["에어컨 배수관 막힘", "실내기 결로"],
    urgency: 2,
    responsibility: "tenant_likely",
    reasoning: ["필터 오염과 배수 호스 막힘 패턴이 사진에서 보임", "입주 전 기록에는 누수 흔적이 없음"],
    confidence: 0.72,
    safetyRisk: false,
    moveinComparisonAvailable: true,
    createdAt: "2026-06-30T09:05:00+09:00",
  },
  tk_0002: {
    id: "an_0002",
    ticketId: "tk_0002",
    problemCandidates: ["상층 배관 누수", "전기 안전 위험"],
    urgency: 1,
    responsibility: "landlord_likely",
    reasoning: ["천장 확산형 물자국은 구조·공용 배관 가능성이 큼", "전등 깜빡임으로 안전 위험 키워드 감지"],
    confidence: 0.86,
    safetyRisk: true,
    moveinComparisonAvailable: false,
    createdAt: "2026-07-02T08:12:00+09:00",
  },
  tk_0003: {
    id: "an_0003",
    ticketId: "tk_0003",
    problemCandidates: ["창호 잠금 하드웨어 마모"],
    urgency: 3,
    responsibility: "unclear",
    reasoning: ["파손 시점이 사진만으로 불명확함", "입주 전 사진 대조가 필요함"],
    confidence: 0.48,
    safetyRisk: false,
    moveinComparisonAvailable: true,
    createdAt: "2026-07-01T09:35:00+09:00",
  },
  tk_0004: {
    id: "an_0004",
    ticketId: "tk_0004",
    problemCandidates: ["도어락 배터리 누액", "잠금장치 부식"],
    urgency: 2,
    responsibility: "landlord_likely",
    reasoning: ["공용 보안 설비 성격의 장치", "업체 점검 후 교체 필요"],
    confidence: 0.79,
    safetyRisk: true,
    moveinComparisonAvailable: false,
    createdAt: "2026-07-01T08:00:00+09:00",
  },
  tk_0005: {
    id: "an_0005",
    ticketId: "tk_0005",
    problemCandidates: ["세면대 배수 트랩 누수", "수전 연결부 패킹 마모"],
    urgency: 1,
    responsibility: "landlord_likely",
    reasoning: ["하부 배관 연결부 누수 가능성이 큼", "설비 마모 가능성이 높아 업체 견적 확인 필요"],
    confidence: 0.88,
    safetyRisk: false,
    moveinComparisonAvailable: false,
    createdAt: "2026-07-02T09:35:00+09:00",
  },
};

export const MANAGER_DEMO_REPAIRS: Record<string, RepairJob> = {
  tk_0001: {
    id: "rj_0001",
    ticketId: "tk_0001",
    stage: "in_progress",
    vendorName: "한강냉난방",
    quoteAmount: 80000,
    quoteItems: [
      { label: "출장·점검", amount: 30000 },
      { label: "배수관 보수", amount: 50000 },
    ],
    scheduledAt: "2026-07-02T11:00:00+09:00",
  },
  tk_0002: {
    id: "rj_0002",
    ticketId: "tk_0002",
    stage: "vendor_assigned",
    vendorName: "빠른누수 설비",
    quoteAmount: 0,
    quoteItems: [],
    scheduledAt: "2026-07-02T18:00:00+09:00",
  },
  tk_0003: {
    id: "rj_0003",
    ticketId: "tk_0003",
    stage: "vendor_assigned",
    vendorName: "창호케어",
    quoteAmount: 52000,
    quoteItems: [
      { label: "출장·창문 잠금장치 점검", amount: 30000 },
      { label: "레버 부품 확인", amount: 22000 },
    ],
    scheduledAt: "2026-07-03T10:00:00+09:00",
  },
  tk_0004: {
    id: "rj_0004",
    ticketId: "tk_0004",
    stage: "completed",
    vendorName: "세이프락",
    quoteAmount: 132000,
    quoteItems: [
      { label: "도어락 내부 세척", amount: 42000 },
      { label: "배터리 단자 교체", amount: 90000 },
    ],
    scheduledAt: "2026-07-02T09:30:00+09:00",
  },
  tk_0005: {
    id: "rj_0005",
    ticketId: "tk_0005",
    stage: "quoted",
    vendorName: "빠른누수 설비",
    quoteAmount: 66000,
    quoteItems: [
      { label: "출장·누수 점검", amount: 30000 },
      { label: "배수 트랩 패킹 교체", amount: 36000 },
    ],
    scheduledAt: "2026-07-02T16:00:00+09:00",
  },
};

export const MANAGER_DEMO_TICKET_ID = MANAGER_DEMO_TICKETS[0].id;

export function managerDemoSummary(): ManagerQueueSummary {
  const awaitingReview = MANAGER_DEMO_TICKETS.filter((ticket) =>
    ["received", "reviewing", "reopened"].includes(ticket.status),
  ).length;
  const awaitingPayment = Object.values(MANAGER_DEMO_REPAIRS).filter(
    (repair) => repair.stage === "completed",
  ).length;

  return {
    today: MANAGER_DEMO_TICKETS.length,
    urgent: MANAGER_DEMO_TICKETS.filter((ticket) => ticket.urgency === 1).length,
    awaitingReview,
    awaitingPayment,
    onHold: MANAGER_DEMO_TICKETS.filter((ticket) => ticket.disposition === "on_hold").length,
    total: MANAGER_DEMO_TICKETS.length,
  };
}

export function managerDemoTicket(id: string): Ticket {
  return MANAGER_DEMO_TICKETS.find((ticket) => ticket.id === id) ?? MANAGER_DEMO_TICKETS[0];
}

export function managerDemoAnalysis(ticketId: string): DefectAnalysis {
  return MANAGER_DEMO_ANALYSES[ticketId] ?? MANAGER_DEMO_ANALYSES[MANAGER_DEMO_TICKET_ID];
}

export function managerDemoRepair(ticketId: string): RepairJob {
  return (
    MANAGER_DEMO_REPAIRS[ticketId] ?? {
      id: `rj_${ticketId}`,
      ticketId,
      stage: "vendor_assigned",
      vendorName: "배정 전",
      quoteAmount: 0,
      quoteItems: [],
    }
  );
}
