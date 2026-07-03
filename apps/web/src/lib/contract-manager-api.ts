import type { Contract, ContractExtraction, ContractPrivacy, DeletionState } from "@roomlog/types";
import { DEMO_CONTRACT, DEMO_EXTRACTION, DEMO_PRIVACY } from "./demo-contract";
import { serverFetch } from "./server-api";

export type ManagerContractOrigin = "tenant_upload" | "manager_upload" | "manual";

export interface ManagerContractRow {
  contract: Contract;
  tenantName: string;
  buildingName: string;
  origin: ManagerContractOrigin;
  statusLabel: string;
  slaOverdue: boolean;
  needsCheckCount: number;
  daysToExpire: number;
  mobileQuickConfirm: boolean;
}

export interface ManagerContractDashboard {
  counts: {
    pending: number;
    needsCheck: number;
    slaOverdue: number;
    expiringSoon: number;
    unregistered: number;
    deletionRequests: number;
  };
  rows: ManagerContractRow[];
}

export interface ManagerContractDetail {
  row: ManagerContractRow;
  extraction: ContractExtraction;
  privacy: ContractPrivacy;
  tenant: {
    name: string;
    phone: string;
    moveInDate: string;
    residentState: string;
  };
  manualValues: {
    deposit: string;
    rent: string;
    maintenanceFee: string;
    paymentDay: string;
    account: string;
  };
  inventory: string[];
  timeline: ManagerContractTimelineItem[];
  auditLogs: ManagerContractAuditLog[];
  deletionRequests: ManagerDeletionRequest[];
  inviteLinks: ManagerInviteLink[];
  conflictCandidates: ManagerConflictCandidate[];
}

export interface ManagerContractTimelineItem {
  at: string;
  kind: string;
  title: string;
  detail: string;
  href?: string;
}

export interface ManagerContractAuditLog {
  at: string;
  actor: string;
  action: string;
  detail: string;
}

export interface ManagerDeletionRequest {
  id: string;
  contractId: string;
  unitId: string;
  tenantName: string;
  requestedAt: string;
  slaHours: number;
  state: DeletionState;
  retentionNote: string;
}

export interface ManagerInviteLink {
  unitId: string;
  tenantName: string;
  state: "waiting" | "connected" | "disputed";
  link: string;
  audit: string;
}

export interface ManagerConflictCandidate {
  source: "tenant" | "manager";
  uploadedAt: string;
  summary: string;
  decision: string;
}

const demoRows: ManagerContractRow[] = [
  {
    contract: DEMO_CONTRACT,
    tenantName: "Alex Kim",
    buildingName: "연남 스테이",
    origin: "tenant_upload",
    statusLabel: "검토 전 참고본",
    slaOverdue: true,
    needsCheckCount: DEMO_EXTRACTION.items.filter((item) => item.needsCheck).length,
    daysToExpire: 607,
    mobileQuickConfirm: false,
  },
  {
    contract: {
      ...DEMO_CONTRACT,
      id: "ct_0002",
      unitId: "201",
      review: "confirmed",
      valueSource: "confirmed",
      endDate: "2026-07-22T00:00:00+09:00",
      updatedAt: "2026-07-01T11:00:00+09:00",
    },
    tenantName: "김민지",
    buildingName: "연남 스테이",
    origin: "manager_upload",
    statusLabel: "확정됨",
    slaOverdue: false,
    needsCheckCount: 0,
    daysToExpire: 20,
    mobileQuickConfirm: true,
  },
  {
    contract: {
      ...DEMO_CONTRACT,
      id: "ct_0003",
      unitId: "405",
      lifecycle: "unregistered",
      review: "pending",
      valueSource: "manual",
      extractionId: undefined,
      monthlyRent: 720000,
      updatedAt: "2026-06-30T16:00:00+09:00",
    },
    tenantName: "Linh Tran",
    buildingName: "성수 하우스",
    origin: "manual",
    statusLabel: "미등록 호실",
    slaOverdue: false,
    needsCheckCount: 0,
    daysToExpire: 214,
    mobileQuickConfirm: false,
  },
];

const demoDetail: ManagerContractDetail = {
  row: demoRows[0],
  extraction: DEMO_EXTRACTION,
  privacy: { ...DEMO_PRIVACY, deletion: "requested", deletionSlaHours: 72 },
  tenant: {
    name: "Alex Kim",
    phone: "010-****-7821",
    moveInDate: "2026-03-01",
    residentState: "거주 중",
  },
  manualValues: {
    deposit: "10,000,000원",
    rent: "650,000원",
    maintenanceFee: "70,000원",
    paymentDay: "매월 25일",
    account: "관리자 수동값 없음",
  },
  inventory: ["에어컨", "세탁기", "냉장고", "인덕션", "블라인드"],
  timeline: [
    {
      at: "2026-07-02T09:20:00+09:00",
      kind: "채팅",
      title: "계약 조항 문의",
      detail: "자동연장 특약 확인 요청",
      href: "/manager/messaging/00",
    },
    {
      at: "2026-06-28T09:10:00+09:00",
      kind: "계약서",
      title: "임차인 업로드 OCR 완료",
      detail: "확인 필요 3개, 관리자 확정 대기",
    },
    {
      at: "2026-03-01T11:30:00+09:00",
      kind: "입주전 사진",
      title: "옵션 상태 기록",
      detail: "퇴실 체크리스트 원천으로 보관",
    },
    {
      at: "2026-03-01T10:00:00+09:00",
      kind: "납부",
      title: "보증금 입금 확인",
      detail: "계약값은 확정 전 참고값으로 표시",
    },
  ],
  auditLogs: [
    {
      at: "2026-07-02T10:00:00+09:00",
      actor: "관리자 박매니저",
      action: "OCR 항목 열람",
      detail: "원문 대조 정밀 검토 모드",
    },
    {
      at: "2026-06-28T09:11:00+09:00",
      actor: "AI OCR",
      action: "확인 필요 표시",
      detail: "관리비, 자동연장, 수선 책임",
    },
    {
      at: "2026-06-28T09:10:00+09:00",
      actor: "Alex Kim",
      action: "계약서 업로드",
      detail: "OCR 분석 및 DB 저장 동의",
    },
  ],
  deletionRequests: [
    {
      id: "del_302",
      contractId: "ct_0001",
      unitId: "302",
      tenantName: "Alex Kim",
      requestedAt: "2026-07-01T09:00:00+09:00",
      slaHours: 72,
      state: "requested",
      retentionNote: "계약 유효 중이라 정산·분쟁 예외 항목을 먼저 확인해야 합니다.",
    },
    {
      id: "del_201",
      contractId: "ct_0002",
      unitId: "201",
      tenantName: "김민지",
      requestedAt: "2026-06-30T12:00:00+09:00",
      slaHours: 72,
      state: "limited",
      retentionNote: "정산 이력과 삭제 요청 감사로그는 제한 보관 중입니다.",
    },
  ],
  inviteLinks: [
    {
      unitId: "302",
      tenantName: "Alex Kim",
      state: "connected",
      link: "roomlog.app/invite/302-a1",
      audit: "2026-03-01 임차인 확인 완료",
    },
    {
      unitId: "405",
      tenantName: "Linh Tran",
      state: "waiting",
      link: "roomlog.app/invite/405-v2",
      audit: "초대 발송 대기",
    },
    {
      unitId: "501",
      tenantName: "王伟",
      state: "disputed",
      link: "roomlog.app/invite/501-z9",
      audit: "기존 기록 연결 이의 접수, 보류",
    },
  ],
  conflictCandidates: [
    {
      source: "tenant",
      uploadedAt: "2026-06-28T09:00:00+09:00",
      summary: "임차인 업로드본 · 관리비 확인 필요",
      decision: "원본 보존, 관리자 검토 필요",
    },
    {
      source: "manager",
      uploadedAt: "2026-07-02T10:00:00+09:00",
      summary: "관리자 보관본 · 계좌 전문 포함",
      decision: "채택 시 사유와 임차인 알림 기록",
    },
  ],
};

async function tryFetch<T>(path: string, fallback: T, init: RequestInit = {}): Promise<T> {
  try {
    return await serverFetch<T>(path, init);
  } catch (error) {
    console.warn(`[contract/manager-api] ${path} 실패 → 데모 폴백`, error);
    return fallback;
  }
}

export const DEMO_MANAGER_CONTRACT_ID = DEMO_CONTRACT.id;

export function getManagerContractDashboard(): Promise<ManagerContractDashboard> {
  const counts = {
    pending: demoRows.filter((row) => row.contract.review === "pending").length,
    needsCheck: demoRows.reduce((sum, row) => sum + row.needsCheckCount, 0),
    slaOverdue: demoRows.filter((row) => row.slaOverdue).length,
    expiringSoon: demoRows.filter((row) => row.daysToExpire <= 30).length,
    unregistered: demoRows.filter((row) => row.contract.lifecycle === "unregistered").length,
    deletionRequests: demoDetail.deletionRequests.filter((request) => request.state === "requested").length,
  };
  return tryFetch("/contracts/manager", { counts, rows: demoRows });
}

export function getManagerContractDetail(
  id: string = DEMO_MANAGER_CONTRACT_ID,
): Promise<ManagerContractDetail> {
  const row = demoRows.find((item) => item.contract.id === id || item.contract.unitId === id) ?? demoRows[0];
  return tryFetch(`/contracts/manager/${encodeURIComponent(id)}`, {
    ...demoDetail,
    row,
    extraction: { ...DEMO_EXTRACTION, contractId: row.contract.id },
    privacy: { ...demoDetail.privacy, contractId: row.contract.id },
  });
}

export function confirmManagerContract(id = DEMO_MANAGER_CONTRACT_ID): Promise<ManagerContractDetail> {
  return serverFetch<ManagerContractDetail>(`/contracts/manager/${encodeURIComponent(id)}/confirm`, {
    method: "POST",
    body: JSON.stringify({ confirmNeedsCheck: true }),
  });
}

export function requestManagerContractInfo(id = DEMO_MANAGER_CONTRACT_ID): Promise<ManagerContractDetail> {
  return serverFetch<ManagerContractDetail>(`/contracts/manager/${encodeURIComponent(id)}/request-info`, {
    method: "POST",
  });
}

export function decideManagerContractDeletion(
  id: string,
  state: Extract<DeletionState, "completed" | "limited" | "denied">,
  retentionNote?: string,
): Promise<ManagerContractDetail> {
  return serverFetch<ManagerContractDetail>(`/contracts/manager/${encodeURIComponent(id)}/deletion-decision`, {
    method: "POST",
    body: JSON.stringify({ state, retentionNote }),
  });
}
