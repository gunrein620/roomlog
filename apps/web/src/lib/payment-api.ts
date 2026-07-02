import type { Bill, MaintenanceFee, PaymentReport } from "@roomlog/types";
import { DEMO_BILL, DEMO_BILLS, DEMO_MAINTENANCE } from "./demo-payment";

// 룸로그 API 클라이언트 (납부 슬라이스).
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

export function listBills(): Promise<Bill[]> {
  return tryFetch(`/bills`, DEMO_BILLS);
}
export function getBill(id: string): Promise<Bill> {
  return tryFetch(`/bills/${id}`, DEMO_BILL);
}
export function getMaintenance(billId: string): Promise<MaintenanceFee> {
  return tryFetch(`/bills/${billId}/maintenance`, DEMO_MAINTENANCE);
}

export interface CreatePaymentReportInput {
  amount: number;
  depositorName?: string;
}

export async function createReport(
  billId: string,
  dto: CreatePaymentReportInput,
): Promise<PaymentReport | undefined> {
  try {
    const res = await fetch(`${BASE}/bills/${billId}/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dto),
      cache: "no-store",
    });
    if (!res.ok) return undefined;
    return (await res.json()) as PaymentReport;
  } catch {
    return undefined; // 셸 단계: api 미기동/실패는 조용히 무시
  }
}

/** 현재 데모 청구 id (셸 슬라이스는 단일 청구 흐름) */
export const DEMO_BILL_ID = DEMO_BILL.id;
