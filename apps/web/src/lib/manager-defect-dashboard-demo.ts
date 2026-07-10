import type { DefectAnalysis, RepairJob, Ticket } from "@roomlog/types";

export type ManagerDefectDashboardDemoRecord = {
  ticket: Ticket;
  analysis: DefectAnalysis;
  repair: RepairJob;
  buildingName: string;
};

type DemoRecordInput = {
  id: string;
  type: Ticket["type"];
  unitId: string;
  title: string;
  status: Ticket["status"];
  buildingName: string;
  stage: RepairJob["stage"];
  vendorName?: string;
  scheduledAt?: string;
  quoteAmount?: number;
};

const DEMO_CREATED_AT = "2026-07-10T09:00:00+09:00";

const demoRecord = (input: DemoRecordInput): ManagerDefectDashboardDemoRecord => ({
  ticket: {
    id: input.id,
    type: input.type,
    unitId: input.unitId,
    title: `더미 · ${input.title}`,
    description: `${input.title} 화면 확인용 더미 데이터`,
    status: input.status,
    urgency: 3,
    createdAt: DEMO_CREATED_AT,
    updatedAt: DEMO_CREATED_AT,
  },
  analysis: {
    id: `analysis-${input.id}`,
    ticketId: input.id,
    problemCandidates: [input.title],
    urgency: 3,
    responsibility: "unclear",
    reasoning: ["화면 확인용 더미 분석"],
    confidence: 0.5,
    safetyRisk: false,
    moveinComparisonAvailable: false,
    createdAt: DEMO_CREATED_AT,
  },
  repair: {
    id: `repair-${input.id}`,
    ticketId: input.id,
    stage: input.stage,
    vendorName: input.vendorName,
    scheduledAt: input.scheduledAt,
    quoteAmount: input.quoteAmount,
    quoteItems: [],
  },
  buildingName: input.buildingName,
});

const ADDITIONAL_DEMO_TITLES = [
  "싱크대 배수 막힘 점검",
  "베란다 창틀 결로 확인",
  "현관 센서등 교체 요청",
  "복도 소화기함 정리",
  "주방 후드 소음 점검",
  "세탁실 수도꼭지 교체",
  "욕실 환풍기 작동 불량",
  "공용 출입문 도어클로저 조정",
  "보일러 배관 압력 점검",
  "침실 벽지 들뜸 확인",
  "주차장 차단기 오작동",
  "계단 난간 흔들림 점검",
  "지하 창고 누수 확인",
  "옥상 배수구 청소 요청",
  "에어컨 실외기 진동 점검",
  "세면대 물빠짐 불량",
  "현관문 경첩 소음 점검",
  "엘리베이터 버튼 표시등 교체",
  "공용 화장실 수도 누수",
  "창문 방충망 보수 요청",
  "복도 비상등 점검",
  "욕실 타일 균열 확인",
  "주방 수전 교체 요청",
  "실내 조명 스위치 불량",
  "베란다 배수 트랩 청소",
  "보일러실 환기구 점검",
  "공용 우편함 잠금장치 수리",
  "주차장 바닥 균열 확인",
  "현관 인터폰 수신 불량",
  "세탁기 배수 호스 점검",
  "욕실 거울장 경첩 조정",
  "창호 실리콘 보수 요청",
  "복도 천장 마감 들뜸",
  "지하주차장 조명 점검",
  "공용 CCTV 위치 조정 요청",
  "에어컨 필터 교체 문의",
  "보일러 온수 온도 불안정",
  "현관 타일 파손 확인",
  "옥상 난간 도장 보수",
  "관리실 출입문 잠금 불량",
] as const;

const ADDITIONAL_DEMO_STATUSES = [
  "received",
  "reviewing",
  "processing",
  "resolved",
  "cancelled",
] as const;

const ADDITIONAL_DEMO_STAGES = [
  "vendor_assigned",
  "quoted",
  "in_progress",
  "completed",
  "vendor_assigned",
] as const;

const additionalDemoRecords = ADDITIONAL_DEMO_TITLES.map((title, index) => {
  const status = ADDITIONAL_DEMO_STATUSES[index % ADDITIONAL_DEMO_STATUSES.length];

  return demoRecord({
    id: `demo-defect-${String(index + 11).padStart(2, "0")}`,
    type: index % 2 === 0 ? "defect" : "complaint",
    unitId: String(1201 + index),
    title,
    status,
    buildingName: "더미 테스트센터",
    stage: ADDITIONAL_DEMO_STAGES[index % ADDITIONAL_DEMO_STAGES.length],
    vendorName: status === "cancelled" ? undefined : `더미 업체 ${index + 1}`,
    scheduledAt:
      status === "cancelled"
        ? undefined
        : `2026-07-${String(12 + (index % 10)).padStart(2, "0")}T10:00:00+09:00`,
    quoteAmount: status === "cancelled" ? undefined : (index + 1) * 10000,
  });
});

export const MANAGER_DEFECT_DASHBOARD_DEMO_RECORDS = [
  demoRecord({
    id: "demo-defect-01",
    type: "defect",
    unitId: "205",
    title: "에어컨 배수관 점검",
    status: "received",
    buildingName: "세움타워",
    stage: "vendor_assigned",
  }),
  demoRecord({
    id: "demo-defect-02",
    type: "defect",
    unitId: "302",
    title: "욕실 천장 누수 확인",
    status: "reviewing",
    buildingName: "세움타워",
    stage: "quoted",
    vendorName: "빠른누수 설비",
    scheduledAt: "2026-07-11T09:00:00+09:00",
    quoteAmount: 120000,
  }),
  demoRecord({
    id: "demo-defect-03",
    type: "complaint",
    unitId: "B01",
    title: "복도 적치물 정리 요청",
    status: "reopened",
    buildingName: "그린오피스",
    stage: "vendor_assigned",
  }),
  demoRecord({
    id: "demo-defect-04",
    type: "complaint",
    unitId: "공용",
    title: "엘리베이터 환풍기 점검",
    status: "processing",
    buildingName: "센트럴타워",
    stage: "scheduled",
    vendorName: "미래시설관리",
    scheduledAt: "2026-07-11T11:00:00+09:00",
    quoteAmount: 65000,
  }),
  demoRecord({
    id: "demo-defect-05",
    type: "defect",
    unitId: "701",
    title: "현관 도어락 교체",
    status: "processing",
    buildingName: "센트럴타워",
    stage: "in_progress",
    vendorName: "세이프락",
    scheduledAt: "2026-07-11T13:30:00+09:00",
    quoteAmount: 180000,
  }),
  demoRecord({
    id: "demo-defect-06",
    type: "defect",
    unitId: "412",
    title: "세면대 하부 배관 수리",
    status: "processing",
    buildingName: "세움타워",
    stage: "scheduled",
    vendorName: "우주설비",
    scheduledAt: "2026-07-11T15:00:00+09:00",
    quoteAmount: 88000,
  }),
  demoRecord({
    id: "demo-defect-07",
    type: "defect",
    unitId: "906",
    title: "보일러 온도조절기 교체",
    status: "resolved",
    buildingName: "그린오피스",
    stage: "completed",
    vendorName: "온누리보일러",
    scheduledAt: "2026-07-10T10:00:00+09:00",
    quoteAmount: 135000,
  }),
  demoRecord({
    id: "demo-defect-08",
    type: "defect",
    unitId: "508",
    title: "창문 잠금장치 수리 완료",
    status: "resolved",
    buildingName: "세움타워",
    stage: "completed",
    vendorName: "창호케어",
    scheduledAt: "2026-07-10T14:00:00+09:00",
    quoteAmount: 72000,
  }),
  demoRecord({
    id: "demo-defect-09",
    type: "complaint",
    unitId: "공용",
    title: "공용등 교체 완료",
    status: "resolved",
    buildingName: "센트럴타워",
    stage: "completed",
    vendorName: "밝은전기",
    scheduledAt: "2026-07-10T16:00:00+09:00",
    quoteAmount: 45000,
  }),
  demoRecord({
    id: "demo-defect-10",
    type: "complaint",
    unitId: "1102",
    title: "주차 소음 민원 취소",
    status: "cancelled",
    buildingName: "그린오피스",
    stage: "vendor_assigned",
  }),
  ...additionalDemoRecords,
] as const satisfies readonly ManagerDefectDashboardDemoRecord[];

export function managerDefectDashboardDemoRecord(
  id: string,
): ManagerDefectDashboardDemoRecord | undefined {
  return MANAGER_DEFECT_DASHBOARD_DEMO_RECORDS.find(
    (record) => record.ticket.id === id,
  );
}
