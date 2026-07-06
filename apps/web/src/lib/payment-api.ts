import "server-only";

import type { Bill, MaintenanceFee, PaymentReport } from "@roomlog/types";
import { DEMO_BILL, DEMO_BILLS, DEMO_MAINTENANCE } from "./demo-payment";
import { serverFetch } from "./server-api";
import {
  toBill,
  toMaintenance,
  toReport,
  type TeamBill,
  type TeamMaintenance,
  type TeamReport,
} from "./payment-mapping";

// 룸로그 납부 슬라이스 API 클라이언트 — 팀 실 백엔드(/tenant/bills)에 쿠키 인증으로 연결.
// 서버 컴포넌트/서버 액션에서만 호출: serverFetch가 httpOnly 쿠키의 토큰을
// Authorization: Bearer 로 Nest에 forward한다.
//
// 데모 폴백: 인증 전/네트워크 오류 시 셸이 깨지지 않도록 데모로 대체하되 경고를 남긴다.
// 단, listBills의 성공 응답이 빈 목록이면 실제 "청구 없음" 상태이므로 []를 그대로 반환한다.

export interface CreatePaymentReportInput {
  amount: number;
  depositorName?: string;
}

async function listTeamBills(): Promise<TeamBill[]> {
  return serverFetch<TeamBill[]>("/tenant/bills");
}

async function activeBill(): Promise<TeamBill | null> {
  try {
    const list = await listTeamBills();
    return list[0] ?? null;
  } catch (error) {
    console.warn("[tenant/payment-api] /tenant/bills 조회 실패:", error);
    return null;
  }
}

async function getTeamBillById(id: string): Promise<TeamBill | null> {
  try {
    return await serverFetch<TeamBill>(`/tenant/bills/${encodeURIComponent(id)}`);
  } catch (error) {
    console.warn(`[tenant/payment-api] /tenant/bills/${id} 조회 실패:`, error);
    return null;
  }
}

// id가 실제 bill id면 그 건을, "active"/미지정이면 목록 첫 활성 건을 해석한다.
// 목록→상세를 ?id=로 스레딩해 복수 청구에서도 같은 청구서를 유지한다.
export async function resolveBill(id?: string): Promise<TeamBill | null> {
  const billId = id?.trim();
  if (billId && billId !== DEMO_BILL_ID) return getTeamBillById(billId);
  return activeBill();
}

export async function listBills(): Promise<Bill[]> {
  try {
    const list = await listTeamBills();
    return list.map(toBill);
  } catch (error) {
    console.warn("[tenant/payment-api] listBills 실패 → 데모 청구 폴백:", error);
    return DEMO_BILLS;
  }
}

export async function getBill(id?: string): Promise<Bill> {
  const bill = await resolveBill(id);
  if (bill) return toBill(bill);
  console.warn("[tenant/payment-api] 실제 청구 없음 → 데모 청구 폴백");
  return DEMO_BILL;
}

export async function getMaintenance(id?: string): Promise<MaintenanceFee> {
  const bill = await resolveBill(id);
  if (!bill) {
    console.warn("[tenant/payment-api] 실제 청구 없음 → 데모 관리비 폴백");
    return DEMO_MAINTENANCE;
  }

  const mappedBill = toBill(bill);
  if (!mappedBill.maintenanceFeeId) return unavailableMaintenance(mappedBill);

  try {
    const maintenance = await serverFetch<TeamMaintenance>(
      `/tenant/bills/${encodeURIComponent(mappedBill.id)}/maintenance`,
    );
    return toMaintenance(maintenance);
  } catch (error) {
    console.warn(
      `[tenant/payment-api] /tenant/bills/${mappedBill.id}/maintenance 조회 실패 → 데모 관리비 폴백:`,
      error,
    );
    return DEMO_MAINTENANCE;
  }
}

export async function createReport(
  billId: string,
  dto: CreatePaymentReportInput,
): Promise<PaymentReport> {
  try {
    const report = await serverFetch<TeamReport>(
      `/tenant/bills/${encodeURIComponent(billId)}/reports`,
      {
        method: "POST",
        body: JSON.stringify(dto),
      },
    );
    return toReport(report);
  } catch (error) {
    console.warn(`[tenant/payment-api] /tenant/bills/${billId}/reports 실패 → 데모 신고 폴백:`, error);
    return demoReport(billId, dto);
  }
}

function unavailableMaintenance(bill: Bill): MaintenanceFee {
  return {
    id: bill.maintenanceFeeId ?? `${bill.id}-maintenance`,
    unitId: bill.unitId,
    billingMonth: bill.billingMonth,
    items: [],
    totalAmount: 0,
    available: false,
  };
}

function demoReport(billId: string, dto: CreatePaymentReportInput): PaymentReport {
  return {
    id: `demo-report-${Date.now()}`,
    billId,
    unitId: DEMO_BILL.unitId,
    amount: dto.amount,
    depositorName: dto.depositorName,
    status: "confirming",
    etaHours: 24,
    reportedAt: new Date().toISOString(),
  };
}

/** 활성 청구 sentinel. 실제 청구 id는 화면 링크에서 ?id=로 전파한다. */
export const DEMO_BILL_ID = "active";
