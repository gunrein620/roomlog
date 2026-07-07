import type { Bill, CollectionSummary, Deposit, DunningDraft } from "@roomlog/types";
import { serverFetch } from "./server-api";
import {
  DEMO_COLLECTION,
  DEMO_DASHBOARD,
  DEMO_DEPOSITS_DATA,
  DEMO_DUNNING,
  DEMO_MANAGER_BILL_ID,
  DEMO_NEW_BILL,
  DEMO_OVERDUE,
  demoBillFallback,
  type ManagerDashboardData,
  type ManagerDepositsData,
  type ManagerOverdueData,
} from "./billing-manager-demo";
import {
  toBill,
  toCollectionSummary,
  toDeposit,
  toDunningDraft,
  toManagerDashboard,
  toManagerDepositsData,
  toOverdueCase,
  type TeamBill,
  type TeamCollection,
  type TeamDashboardResponse,
  type TeamDeposit,
  type TeamDepositsResponse,
  type TeamDunning,
  type TeamOverdue,
} from "./billing-manager-mapping";

export type { ManagerDashboardData, ManagerDepositsData, ManagerOverdueData } from "./billing-manager-demo";

interface TeamOverdueResponse {
  activeCases?: TeamOverdue[];
  waitingCases?: TeamOverdue[];
}

export interface SendDunningInput {
  text: string;
  channel: string;
}

async function getTeamBillById(billId: string): Promise<TeamBill | null> {
  try {
    return await serverFetch<TeamBill>(`/manager/bills/${encodeURIComponent(billId)}`);
  } catch (error) {
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
    console.error("[manager/billing-api] 활성 청구서 조회 실패:", error);
    return null;
  }
}

export async function getManagerDashboard(): Promise<ManagerDashboardData> {
  try {
    return toManagerDashboard(await serverFetch<TeamDashboardResponse>("/manager/bills/dashboard"));
  } catch (error) {
    console.error("[manager/billing-api] 대시보드 조회 실패 → 데모 폴백:", error);
    return DEMO_DASHBOARD;
  }
}

export async function getManagerBill(billId?: string): Promise<Bill> {
  if (billId === "new") return DEMO_NEW_BILL;

  const teamBill = await resolveTeamBill(billId);
  if (teamBill) return toBill(teamBill);

  console.warn("[manager/billing-api] 실제 청구서 없음 → 데모 청구서 폴백");
  return demoBillFallback(billId);
}

export async function getManagerCollection(): Promise<CollectionSummary> {
  try {
    return toCollectionSummary(await serverFetch<TeamCollection>("/manager/bills/collection"));
  } catch (error) {
    console.error("[manager/billing-api] 수금 현황 조회 실패 → 데모 폴백:", error);
    return DEMO_COLLECTION;
  }
}

export async function getManagerDeposits(): Promise<ManagerDepositsData> {
  try {
    return toManagerDepositsData(await serverFetch<TeamDepositsResponse>("/manager/bills/deposits"));
  } catch (error) {
    console.error("[manager/billing-api] 입금 매칭 조회 실패 → 데모 폴백:", error);
    return DEMO_DEPOSITS_DATA;
  }
}

export async function getManagerOverdue(): Promise<ManagerOverdueData> {
  try {
    const data = await serverFetch<TeamOverdueResponse>("/manager/bills/overdue");
    return {
      activeCases: (data.activeCases ?? []).map(toOverdueCase),
      waitingCases: (data.waitingCases ?? []).map(toOverdueCase),
    };
  } catch (error) {
    console.error("[manager/billing-api] 연체 목록 조회 실패 → 데모 폴백:", error);
    return DEMO_OVERDUE;
  }
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
