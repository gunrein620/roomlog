import type { Contract, ContractExtraction, ContractPrivacy } from "@roomlog/types";
import { DEMO_CONTRACT, DEMO_EXTRACTION, DEMO_PRIVACY } from "./demo-contract";

// 룸로그 API 클라이언트 (계약 T-DOC 슬라이스) — lib/api.ts(하자)와 동일한 레시피의 계약 확장.
// api가 안 떠 있어도 화면이 렌더되도록 데모 데이터로 폴백 → 빌드/프리렌더 안 막힘.
// 실제 walking skeleton 검증은 api 기동 상태에서 live fetch로 확인한다.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function tryFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback; // api 미기동 시 데모 폴백
  }
}

export function getContract(id: string): Promise<Contract> {
  return tryFetch(`/contracts/${id}`, DEMO_CONTRACT);
}
export function getExtraction(contractId: string): Promise<ContractExtraction> {
  return tryFetch(`/contracts/${contractId}/extraction`, DEMO_EXTRACTION);
}
export function getPrivacy(contractId: string): Promise<ContractPrivacy> {
  return tryFetch(`/contracts/${contractId}/privacy`, DEMO_PRIVACY);
}
export function listContracts(): Promise<Contract[]> {
  return tryFetch(`/contracts`, [DEMO_CONTRACT]);
}

/** 현재 데모 계약 id (셸 슬라이스는 단일 계약 흐름) */
export const DEMO_CONTRACT_ID = DEMO_CONTRACT.id;
