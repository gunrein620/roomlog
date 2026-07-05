import type {
  CreateMoveoutDisputeDto,
  CreateMoveoutInquiryDto,
  EscalateMoveoutDisputeDto,
  MoveoutChecklistItem,
  Dispute,
  MoveoutRecordItem,
  MoveoutSummary,
  SettlementEstimate,
  Thread,
  UpdateTenantMoveoutDisputeDto,
  UpdateMoveoutChecklistDto,
} from "@roomlog/types";
import {
  DEMO_MOVEOUT,
  DEMO_MOVEOUT_CHECKLIST,
  DEMO_MOVEOUT_DISPUTES,
  DEMO_MOVEOUT_ID,
  DEMO_MOVEOUT_RECORDS,
  DEMO_MOVEOUT_SETTLEMENT,
} from "./demo-moveout";
import { serverFetch } from "./server-api";

// 룸로그 API 클라이언트 (퇴실 T-OUT 슬라이스).
// api가 안 떠 있어도 화면이 렌더되도록 데모 데이터로 폴백 → 빌드/프리렌더 안 막힘.
export const tenantMoveoutPaths = {
  moveouts: () => "/moveouts",
  moveout: (id: string) => `/moveouts/${encodeURIComponent(id)}`,
  records: (id: string) => `/moveouts/${encodeURIComponent(id)}/records`,
  checklist: (id: string) => `/moveouts/${encodeURIComponent(id)}/checklist`,
  updateChecklist: (id: string) => `/moveouts/${encodeURIComponent(id)}/checklist`,
  settlement: (id: string) => `/moveouts/${encodeURIComponent(id)}/settlement`,
  disputes: (id: string) => `/moveouts/${encodeURIComponent(id)}/disputes`,
  disputeAction: (id: string) => `/moveouts/${encodeURIComponent(id)}/disputes/action`,
  disputeEscalation: (id: string) => `/moveouts/${encodeURIComponent(id)}/disputes/escalate`,
  inquiries: (id: string) => `/moveouts/${encodeURIComponent(id)}/inquiries`,
};

export type MoveoutInquiryResult = {
  moveout: MoveoutSummary;
  thread: Thread;
};

async function tryFetch<T>(path: string, fallback: T, label: string): Promise<T> {
  try {
    return await serverFetch<T>(path);
  } catch (error) {
    console.warn(`[moveout/api] ${label} 실패 → 데모 폴백`, error);
    return fallback;
  }
}

export function getMoveout(id: string): Promise<MoveoutSummary> {
  return tryFetch(tenantMoveoutPaths.moveout(id), DEMO_MOVEOUT, "임차인 퇴실 요약 조회");
}

export function listMoveouts(): Promise<MoveoutSummary[]> {
  return tryFetch(tenantMoveoutPaths.moveouts(), [DEMO_MOVEOUT], "임차인 퇴실 목록 조회");
}

export function getRecords(id: string): Promise<MoveoutRecordItem[]> {
  return tryFetch(tenantMoveoutPaths.records(id), DEMO_MOVEOUT_RECORDS, "임차인 퇴실 기록 조회");
}

export function getChecklist(id: string): Promise<MoveoutChecklistItem[]> {
  return tryFetch(tenantMoveoutPaths.checklist(id), DEMO_MOVEOUT_CHECKLIST, "임차인 퇴실 체크리스트 조회");
}

export function updateMoveoutChecklist(
  id: string,
  input: UpdateMoveoutChecklistDto,
): Promise<MoveoutChecklistItem[]> {
  return serverFetch<MoveoutChecklistItem[]>(tenantMoveoutPaths.updateChecklist(id), {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function getSettlement(id: string): Promise<SettlementEstimate> {
  return tryFetch(tenantMoveoutPaths.settlement(id), DEMO_MOVEOUT_SETTLEMENT, "임차인 퇴실 정산 조회");
}

export function getDisputes(id: string): Promise<Dispute[]> {
  return tryFetch(tenantMoveoutPaths.disputes(id), DEMO_MOVEOUT_DISPUTES, "임차인 퇴실 이의 조회");
}

export function createMoveoutDispute(id: string, input: CreateMoveoutDisputeDto): Promise<Dispute> {
  return serverFetch<Dispute>(tenantMoveoutPaths.disputes(id), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateTenantMoveoutDispute(
  id: string,
  input: UpdateTenantMoveoutDisputeDto,
): Promise<Dispute> {
  return serverFetch<Dispute>(tenantMoveoutPaths.disputeAction(id), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function escalateMoveoutDispute(
  id: string,
  input: EscalateMoveoutDisputeDto,
): Promise<Dispute> {
  return serverFetch<Dispute>(tenantMoveoutPaths.disputeEscalation(id), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createMoveoutInquiry(
  id: string,
  input: CreateMoveoutInquiryDto,
): Promise<MoveoutInquiryResult> {
  return serverFetch<MoveoutInquiryResult>(tenantMoveoutPaths.inquiries(id), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export { DEMO_MOVEOUT_ID };
