import type {
  Bill,
  CreateManagerBillsInput,
  CreateManagerBillsResult,
  Deposit,
  DunningDraft,
  ManagerBillCreationData,
  ManagerCollectionAnalytics,
} from "@roomlog/types";
import { ApiError, serverFetch } from "./server-api";
import {
  DEMO_DEPOSITS_DATA,
  DEMO_DUNNING,
  DEMO_NEW_BILL,
  demoManagerBillCreation,
  demoManagerCollection,
  demoManagerDashboard,
  demoManagerOverdue,
  demoBillFallback,
  type ManagerBillingDemoQuery,
  type ManagerDashboardData,
  type ManagerDepositsData,
  type ManagerOverdueData,
} from "./billing-manager-demo";
import {
  toBill,
  toDeposit,
  toDunningDraft,
  toManagerDashboard,
  toManagerBillCreationData,
  toManagerCollection,
  toManagerDepositsData,
  toManagerOverdue,
  type TeamBill,
  type TeamCollection,
  type TeamBillCreationData,
  type TeamDashboardResponse,
  type TeamDeposit,
  type TeamDepositsResponse,
  type TeamDunning,
  type TeamOverdueResponse,
} from "./billing-manager-mapping";

export type { ManagerDashboardData, ManagerDepositsData, ManagerOverdueData } from "./billing-manager-demo";

export interface SendDunningInput {
  text: string;
  channel: string;
}

function billingPath(path: string, query: ManagerBillingDemoQuery = {}) {
  const params = new URLSearchParams();
  if (query.building) params.set("building", query.building);
  if (query.month) params.set("month", query.month);
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

async function getTeamBillById(billId: string): Promise<TeamBill | null> {
  try {
    return await serverFetch<TeamBill>(`/manager/bills/${encodeURIComponent(billId)}`);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error(`[manager/billing-api] /manager/bills/${billId} 조회 실패:`, error);
    return null;
  }
}

async function resolveTeamBill(billId?: string): Promise<TeamBill | null> {
  if (billId && billId !== "active" && billId !== "new") return getTeamBillById(billId);

  try {
    const data = await serverFetch<TeamDashboardResponse>("/manager/bills/dashboard");
    const firstBillId = data.bills?.[0]?.billId ?? data.bills?.[0]?.id;
    return firstBillId ? getTeamBillById(firstBillId) : null;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error("[manager/billing-api] 활성 청구서 조회 실패:", error);
    return null;
  }
}

export async function getManagerDashboard(
  query?: ManagerBillingDemoQuery,
): Promise<ManagerDashboardData> {
  try {
    return toManagerDashboard(
      await serverFetch<TeamDashboardResponse>(
        query
          ? billingPath("/manager/bills/dashboard", query)
          : "/manager/bills/dashboard?allMonths=true",
      ),
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error("[manager/billing-api] 대시보드 조회 실패 → 데모 폴백:", error);
    return demoManagerDashboard(query ?? {});
  }
}

export async function getManagerBill(billId?: string): Promise<Bill> {
  if (billId === "new") return DEMO_NEW_BILL;

  const teamBill = await resolveTeamBill(billId);
  if (teamBill) return toBill(teamBill);

  console.warn("[manager/billing-api] 실제 청구서 없음 → 데모 청구서 폴백");
  return demoBillFallback(billId);
}

export async function publishManagerBill(billId: string): Promise<Bill> {
  return toBill(
    await serverFetch<TeamBill>(
      `/manager/bills/${encodeURIComponent(billId)}/publish`,
      { method: "POST" },
    ),
  );
}

export async function getManagerCollection(
  query: ManagerBillingDemoQuery = {},
): Promise<ManagerCollectionAnalytics> {
  try {
    return toManagerCollection(
      await serverFetch<TeamCollection>(billingPath("/manager/bills/collection", query)),
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error("[manager/billing-api] 수금 현황 조회 실패 → 데모 폴백:", error);
    return demoManagerCollection(query);
  }
}

export async function getManagerDeposits(): Promise<ManagerDepositsData> {
  try {
    return toManagerDepositsData(await serverFetch<TeamDepositsResponse>("/manager/bills/deposits"));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error("[manager/billing-api] 입금 매칭 조회 실패 → 데모 폴백:", error);
    return DEMO_DEPOSITS_DATA;
  }
}

export async function getManagerOverdue(building?: string): Promise<ManagerOverdueData> {
  try {
    const data = await serverFetch<TeamOverdueResponse>(
      billingPath("/manager/bills/overdue", { building }),
    );
    return toManagerOverdue(data);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error("[manager/billing-api] 연체 목록 조회 실패 → 데모 폴백:", error);
    return demoManagerOverdue(building);
  }
}

export async function getManagerBillCreationOptions(
  query: ManagerBillingDemoQuery = {},
): Promise<ManagerBillCreationData> {
  try {
    return toManagerBillCreationData(
      await serverFetch<TeamBillCreationData>(
        billingPath("/manager/bills/creation-options", query),
      ),
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error("[manager/billing-api] 청구 생성 옵션 조회 실패 → 데모 폴백:", error);
    return demoManagerBillCreation(query);
  }
}

export async function createManagerBills(
  input: CreateManagerBillsInput,
): Promise<CreateManagerBillsResult> {
  return serverFetch<CreateManagerBillsResult>("/manager/bills", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getManagerDunning(billId: string): Promise<DunningDraft> {
  const fallback =
    billId.includes("302") || billId.includes("orphan")
      ? {
          ...DEMO_DUNNING,
          billId,
          unitId: billId.includes("302") ? "302" : "401",
          tenantName: billId.includes("302") ? "김하윤" : "이준서",
          guard: {
            blocked: true,
            hasConfirming: billId.includes("302"),
            hasOrphan: !billId.includes("302"),
          },
        }
      : { ...DEMO_DUNNING, billId };

  try {
    return toDunningDraft(await serverFetch<TeamDunning>(`/manager/bills/${encodeURIComponent(billId)}/dunning`));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error(`[manager/billing-api] /manager/bills/${billId}/dunning 조회 실패 → 데모 폴백:`, error);
    return fallback;
  }
}

export async function matchManagerDeposit(
  depositId: string,
  billId: string
): Promise<Deposit | undefined> {
  try {
    return toDeposit(
      await serverFetch<TeamDeposit>(`/manager/bills/deposits/${encodeURIComponent(depositId)}/match`, {
        method: "POST",
        body: JSON.stringify({ billId }),
      })
    );
  } catch (error) {
    console.error(`[manager/billing-api] 입금 매칭 실패 deposit=${depositId} bill=${billId}:`, error);
    return undefined;
  }
}

export async function confirmManagerPaymentReport(
  billId: string,
  reportId: string
): Promise<Bill | undefined> {
  try {
    return toBill(
      await serverFetch<TeamBill>(
        `/manager/bills/${encodeURIComponent(billId)}/reports/${encodeURIComponent(reportId)}/confirm`,
        { method: "POST" }
      )
    );
  } catch (error) {
    console.error(`[manager/billing-api] 납부 신고 확정 실패 bill=${billId} report=${reportId}:`, error);
    return undefined;
  }
}

export async function sendManagerDunning(
  billId: string,
  input: SendDunningInput
): Promise<boolean> {
  try {
    const result = await serverFetch<{ ok: true }>(
      `/manager/bills/${encodeURIComponent(billId)}/dunning/send`,
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    );
    return result.ok === true;
  } catch (error) {
    console.error(`[manager/billing-api] 독촉 발송 실패 bill=${billId}:`, error);
    return false;
  }
}
