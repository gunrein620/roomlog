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

// 룸로그 API 클라이언트 (관리인 비용 M-COST 슬라이스).
// api가 안 떠 있어도 화면이 렌더되도록 데모 데이터로 폴백한다.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function tryFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

export function listCosts(): Promise<Cost[]> {
  return tryFetch("/costs", DEMO_COSTS);
}

export async function getCost(id = DEMO_COST_ID): Promise<Cost> {
  const fallback = DEMO_COSTS.find((cost) => cost.id === id) ?? DEMO_COSTS[0];
  return tryFetch(`/costs/${encodeURIComponent(id)}`, fallback);
}

export function getCostQueueSummary(): Promise<CostReviewQueueSummary> {
  return tryFetch("/costs/review-queue-summary", DEMO_COST_QUEUE_SUMMARY);
}

export function getMonthlyCostSummary(month = DEMO_MONTHLY_SUMMARY.month): Promise<MonthlyCostSummary> {
  return tryFetch(`/costs/monthly-summary?month=${encodeURIComponent(month)}`, DEMO_MONTHLY_SUMMARY);
}

export function listReceipts(): Promise<Receipt[]> {
  return tryFetch("/costs/receipts", DEMO_RECEIPTS);
}

export async function getReceiptOcr(id = DEMO_RECEIPT_OCR_ID): Promise<ReceiptOcr> {
  const fallback = DEMO_RECEIPT_OCR.find((ocr) => ocr.id === id) ?? DEMO_RECEIPT_OCR[0];
  return tryFetch(`/costs/receipt-ocrs/${encodeURIComponent(id)}`, fallback);
}

export function getDisclosureSetting(month = DEMO_DISCLOSURE_SETTING.month): Promise<DisclosureSetting> {
  return tryFetch(`/costs/disclosure-settings?month=${encodeURIComponent(month)}`, DEMO_DISCLOSURE_SETTING);
}
