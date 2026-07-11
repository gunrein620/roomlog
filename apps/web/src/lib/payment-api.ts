import "server-only";

import type {
  Bill,
  BillLineItemKind,
  BillPaymentOrder as SharedBillPaymentOrder,
  PaymentReport,
  TenantBillSummary,
  TenantBillingOverview,
  TenantPaymentHistory,
} from "@roomlog/types";
import {
  DEMO_BILL,
  DEMO_BILLS,
  demoTenantBillingOverview,
  demoTenantPaymentHistory,
} from "./demo-payment";
import { buildDemoBillPaymentOrder, isDemoBillId } from "./payment-demo-fallback";
import { ApiError, serverFetch } from "./server-api";
import {
  toBill,
  toReport,
  toTenantBillingOverview,
  toTenantPaymentHistory,
  type TeamBill,
  type TeamReport,
  type TeamTenantBillingOverview,
  type TeamTenantPaymentHistory,
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

export type BillPaymentOrder = SharedBillPaymentOrder;

export interface CreateBillPaymentOrderInput {
  itemKinds: BillLineItemKind[];
}

export interface ConfirmBillPaymentInput {
  orderId: string;
  paymentKey: string;
  amount: number;
}

interface TeamBillPaymentOrder {
  billId: string;
  orderId: string;
  orderName: string;
  amount: number;
  itemKinds: string[];
  customerKey: string;
  clientKey?: string;
}

const TEAM_ITEM_KIND: Record<BillLineItemKind, string> = {
  rent: "RENT",
  maintenance: "MAINTENANCE",
  other: "OTHER",
};

const ITEM_KIND: Record<string, BillLineItemKind> = {
  RENT: "rent",
  MAINTENANCE: "maintenance",
  OTHER: "other",
};

function canUseReadOnlyDemoFallback(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status >= 500;
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
    if (!canUseReadOnlyDemoFallback(error)) throw error;
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
    if (!canUseReadOnlyDemoFallback(error)) throw error;
    console.warn("[tenant/payment-api] listBills 실패 → 데모 청구 폴백:", error);
    return DEMO_BILLS;
  }
}

export async function getTenantBillingOverview(): Promise<TenantBillingOverview> {
  let overview: TeamTenantBillingOverview;
  try {
    overview = await serverFetch<TeamTenantBillingOverview>("/tenant/bills/overview");
  } catch (error) {
    if (!canUseReadOnlyDemoFallback(error)) throw error;
    console.warn("[tenant/payment-api] overview 실패 → 읽기 전용 데모:", error);
    return demoTenantBillingOverview();
  }
  return toTenantBillingOverview(overview);
}

export async function getTenantPaymentHistory(
  range: { from: string; to: string },
): Promise<TenantPaymentHistory> {
  const params = new URLSearchParams(range);
  let history: TeamTenantPaymentHistory;
  try {
    history = await serverFetch<TeamTenantPaymentHistory>(
      `/tenant/bills/history?${params.toString()}`,
    );
  } catch (error) {
    if (!canUseReadOnlyDemoFallback(error)) throw error;
    console.warn("[tenant/payment-api] history 실패 → 읽기 전용 데모:", error);
    return demoTenantPaymentHistory(range);
  }
  return toTenantPaymentHistory(history);
}

export async function getBill(id?: string): Promise<Bill> {
  const bill = await resolveBill(id);
  if (bill) return toBill(bill);
  console.warn("[tenant/payment-api] 실제 청구 없음 → 데모 청구 폴백");
  return DEMO_BILL;
}

export async function getBillForMutation(id?: string): Promise<Bill> {
  const billId = id?.trim() || DEMO_BILL_ID;

  if (isDemoBillId(billId)) {
    return getBill(billId);
  }

  const bill = await serverFetch<TeamBill>(`/tenant/bills/${encodeURIComponent(billId)}`);
  return toBill(bill);
}

export function tenantBillSummaryForId(
  overview: TenantBillingOverview,
  billId: string,
): TenantBillSummary | null {
  const summaries = [overview.current, overview.upcoming, ...overview.previousUnpaid];
  return summaries.find((summary) => summary?.bill.id === billId) ?? null;
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
    if (isDemoBillId(billId)) {
      console.warn(`[tenant/payment-api] /tenant/bills/${billId}/reports 실패 → 데모 신고:`, error);
      return demoReport(billId, dto);
    }
    throw error;
  }
}

export async function createBillPaymentOrder(
  billId: string,
  dto: CreateBillPaymentOrderInput,
): Promise<BillPaymentOrder> {
  try {
    const order = await serverFetch<TeamBillPaymentOrder>(
      `/tenant/bills/${encodeURIComponent(billId)}/payment-orders`,
      {
        method: "POST",
        body: JSON.stringify({
          itemKinds: dto.itemKinds.map((kind) => TEAM_ITEM_KIND[kind]),
        }),
      },
    );

    return {
      ...order,
      itemKinds: order.itemKinds
        .map((kind) => ITEM_KIND[kind.trim().toUpperCase()])
        .filter((kind): kind is BillLineItemKind => Boolean(kind)),
    };
  } catch (error) {
    if (isDemoBillId(billId)) {
      console.warn(`[tenant/payment-api] /tenant/bills/${billId}/payment-orders 실패 → 데모 주문:`, error);
      return buildDemoBillPaymentOrder(billId, dto);
    }
    throw error;
  }
}

export async function confirmBillPayment(
  billId: string,
  dto: ConfirmBillPaymentInput,
): Promise<Bill> {
  const bill = await serverFetch<TeamBill>(
    `/tenant/bills/${encodeURIComponent(billId)}/payment-orders/confirm`,
    {
      method: "POST",
      body: JSON.stringify(dto),
    },
  );
  return toBill(bill);
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
