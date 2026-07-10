import type { RepairJob, Ticket } from "@roomlog/types";
import type { DefectDashboardRow } from "./ticket-dashboard-model";

type DemoRowInput = {
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

const demoRow = (input: DemoRowInput): DefectDashboardRow => ({
  ticket: {
    id: input.id,
    type: input.type,
    unitId: input.unitId,
    title: `더미 · ${input.title}`,
    description: `${input.title} 화면 확인용 더미 데이터`,
    status: input.status,
    urgency: 3,
    createdAt: "2026-07-10T09:00:00+09:00",
    updatedAt: "2026-07-10T09:00:00+09:00",
  },
  repair: {
    id: `repair-${input.id}`,
    ticketId: input.id,
    stage: input.stage,
    vendorName: input.vendorName,
    scheduledAt: input.scheduledAt,
    quoteAmount: input.quoteAmount,
  },
  buildingName: input.buildingName,
  isDemo: true,
});

export const MANAGER_DEFECT_DASHBOARD_DEMO_ROWS = [
  demoRow({
    id: "demo-defect-01",
    type: "defect",
    unitId: "205",
    title: "에어컨 배수관 점검",
    status: "received",
    buildingName: "세움타워",
    stage: "vendor_assigned",
  }),
  demoRow({
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
  demoRow({
    id: "demo-defect-03",
    type: "complaint",
    unitId: "B01",
    title: "복도 적치물 정리 요청",
    status: "reopened",
    buildingName: "그린오피스",
    stage: "vendor_assigned",
  }),
  demoRow({
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
  demoRow({
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
  demoRow({
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
  demoRow({
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
  demoRow({
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
  demoRow({
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
  demoRow({
    id: "demo-defect-10",
    type: "complaint",
    unitId: "1102",
    title: "주차 소음 민원 취소",
    status: "cancelled",
    buildingName: "그린오피스",
    stage: "vendor_assigned",
  }),
] as const satisfies readonly DefectDashboardRow[];
