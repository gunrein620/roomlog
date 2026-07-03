import type {
  Cost,
  CostReviewQueueSummary,
  DisclosureSetting,
  MonthlyCostSummary,
  Receipt,
  ReceiptOcr,
} from "@roomlog/types";
import {
  DEMO_COST_ID,
  DEMO_COST_QUEUE_SUMMARY,
  DEMO_COSTS,
  DEMO_DISCLOSURE_SETTING,
  DEMO_MONTHLY_SUMMARY,
  DEMO_RECEIPT_OCR,
  DEMO_RECEIPT_OCR_ID,
  DEMO_RECEIPTS,
} from "./demo-cost";
import { serverFetch } from "./server-api";

// 룸로그 API 클라이언트 (관리인 비용 M-COST 슬라이스).
// 서버 컴포넌트 전용: httpOnly 쿠키 토큰을 Nest /manager/costs API로 forward한다.
// api가 안 떠 있거나 인증 전이면 경고 로그 후 데모 데이터로 폴백한다.

async function tryFetch<T>(path: string, fallback: T, label: string): Promise<T> {
  try {
    return await serverFetch<T>(path);
  } catch (error) {
    console.warn(`[cost/api] ${label} 실패 → 데모 폴백`, error);
    return fallback;
  }
}

export function listCosts(): Promise<Cost[]> {
  return tryFetch("/manager/costs", DEMO_COSTS, "비용 목록 조회");
}

export async function getCost(id = DEMO_COST_ID): Promise<Cost> {
  const fallback = DEMO_COSTS.find((cost) => cost.id === id) ?? DEMO_COSTS[0];
  return tryFetch(`/manager/costs/${encodeURIComponent(id)}`, fallback, "비용 상세 조회");
}

export function getCostQueueSummary(): Promise<CostReviewQueueSummary> {
  return tryFetch(
    "/manager/costs/review-queue-summary",
    DEMO_COST_QUEUE_SUMMARY,
    "비용 검토 큐 조회"
  );
}

export function getMonthlyCostSummary(month = DEMO_MONTHLY_SUMMARY.month): Promise<MonthlyCostSummary> {
  return tryFetch(
    `/manager/costs/monthly-summary?month=${encodeURIComponent(month)}`,
    DEMO_MONTHLY_SUMMARY,
    "월 비용 요약 조회"
  );
}

export function listReceipts(): Promise<Receipt[]> {
  return tryFetch("/manager/costs/receipts", DEMO_RECEIPTS, "영수증 목록 조회");
}

export async function getReceiptOcr(id = DEMO_RECEIPT_OCR_ID): Promise<ReceiptOcr> {
  const fallback = DEMO_RECEIPT_OCR.find((ocr) => ocr.id === id) ?? DEMO_RECEIPT_OCR[0];
  return tryFetch(
    `/manager/costs/receipt-ocrs/${encodeURIComponent(id)}`,
    fallback,
    "영수증 OCR 조회"
  );
}

export function getDisclosureSetting(month = DEMO_DISCLOSURE_SETTING.month): Promise<DisclosureSetting> {
  return tryFetch(
    `/manager/costs/disclosure-settings?month=${encodeURIComponent(month)}`,
    DEMO_DISCLOSURE_SETTING,
    "관리비 공개 설정 조회"
  );
}
