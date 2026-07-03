import type { Contract, ContractExtraction, ContractPrivacy } from "@roomlog/types";
import { DEMO_CONTRACT, DEMO_EXTRACTION, DEMO_PRIVACY } from "./demo-contract";
import { serverFetch } from "./server-api";

// 룸로그 API 클라이언트 (계약 T-DOC 슬라이스) — lib/api.ts(하자)와 동일한 레시피의 계약 확장.
// api가 안 떠 있어도 화면이 렌더되도록 데모 데이터로 폴백 → 빌드/프리렌더 안 막힘.
// 실제 walking skeleton 검증은 api 기동 상태에서 live fetch로 확인한다.

async function tryFetch<T>(path: string, fallback: T, label: string): Promise<T> {
  try {
    return await serverFetch<T>(path);
  } catch (error) {
    console.warn(`[contract/api] ${label} 실패 → 데모 폴백`, error);
    return fallback; // api 미기동 시 데모 폴백
  }
}

export function getContract(id: string): Promise<Contract> {
  return tryFetch(`/contracts/${encodeURIComponent(id)}`, DEMO_CONTRACT, "계약 상세 조회");
}
export function getExtraction(contractId: string): Promise<ContractExtraction> {
  return tryFetch(
    `/contracts/${encodeURIComponent(contractId)}/extraction`,
    DEMO_EXTRACTION,
    "계약 OCR 조회"
  );
}
export function getPrivacy(contractId: string): Promise<ContractPrivacy> {
  return tryFetch(
    `/contracts/${encodeURIComponent(contractId)}/privacy`,
    DEMO_PRIVACY,
    "계약 개인정보 조회"
  );
}
export function listContracts(): Promise<Contract[]> {
  return tryFetch("/contracts", [DEMO_CONTRACT], "계약 목록 조회");
}
export function requestContractDeletion(contractId: string): Promise<ContractPrivacy> {
  return serverFetch<ContractPrivacy>(`/contracts/${encodeURIComponent(contractId)}/deletion-request`, {
    method: "POST",
  });
}

/** 현재 데모 계약 id (셸 슬라이스는 단일 계약 흐름) */
export const DEMO_CONTRACT_ID = DEMO_CONTRACT.id;
