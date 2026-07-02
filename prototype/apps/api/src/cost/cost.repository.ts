import { Injectable } from "@nestjs/common";
import type {
  Cost,
  CostAttributionScope,
  CostReviewQueueSummary,
  CostReviewReason,
  CostStatus,
  CostType,
  DisclosureSetting,
  MonthlyCostSummary,
  Receipt,
  ReceiptOcr,
} from "@roomlog/types";

export interface CostListOptions {
  status?: CostStatus;
  type?: CostType;
  scope?: CostAttributionScope;
  unitId?: string;
  reviewReason?: CostReviewReason;
}

export abstract class CostRepository {
  abstract listCosts(options?: CostListOptions): Cost[];
  abstract getCost(id: string): Cost | undefined;
  abstract listReceipts(): Receipt[];
  abstract getReceipt(id: string): Receipt | undefined;
  abstract listReceiptOcrs(): ReceiptOcr[];
  abstract getReceiptOcr(id: string): ReceiptOcr | undefined;
  abstract getReviewQueueSummary(): CostReviewQueueSummary;
  abstract getMonthlySummary(month: string): MonthlyCostSummary | undefined;
  abstract getDisclosureSetting(month: string): DisclosureSetting | undefined;
}

const DEMO_COSTS: Cost[] = [
  {
    id: "cost_0001",
    date: "2026-07-01T00:00:00+09:00",
    item: "복도 형광등 교체",
    amount: 48000,
    type: "common",
    scope: "building",
    status: "draft",
    verified: false,
    reviewReason: "ocr_low_confidence",
    receiptId: "rcpt_0001",
    createdAt: "2026-07-01T18:20:00+09:00",
    updatedAt: "2026-07-01T18:20:00+09:00",
  },
  {
    id: "cost_0002",
    date: "2026-06-30T00:00:00+09:00",
    item: "철물점 잡자재",
    amount: 23500,
    type: "other",
    scope: "building",
    status: "draft",
    verified: false,
    reviewReason: "classification_unclear",
    receiptId: "rcpt_0002",
    createdAt: "2026-06-30T14:05:00+09:00",
    updatedAt: "2026-06-30T14:05:00+09:00",
  },
  {
    id: "cost_0003",
    date: "2026-06-29T00:00:00+09:00",
    item: "누수 긴급 출장",
    amount: 60000,
    type: "repair",
    scope: "unit",
    status: "draft",
    verified: false,
    reviewReason: "unit_unmatched",
    repairPayment: "already_paid",
    receiptId: "rcpt_0003",
    createdAt: "2026-06-29T20:40:00+09:00",
    updatedAt: "2026-06-29T20:40:00+09:00",
  },
  {
    id: "cost_0004",
    date: "2026-06-28T00:00:00+09:00",
    item: "502호 배수관 세척·트랩 교체",
    amount: 120000,
    type: "repair",
    scope: "unit",
    unitId: "502",
    status: "confirmed",
    verified: true,
    repairPayment: "already_paid",
    receiptId: "rcpt_0004",
    createdAt: "2026-06-28T16:00:00+09:00",
    updatedAt: "2026-06-28T16:30:00+09:00",
  },
  {
    id: "cost_0005",
    date: "2026-06-27T00:00:00+09:00",
    item: "804호 욕실 천장 방수",
    amount: 350000,
    type: "repair",
    scope: "unit",
    unitId: "804",
    status: "confirmed",
    verified: true,
    repairPayment: "unpaid",
    paymentRef: "rj_0004",
    receiptId: "rcpt_0005",
    createdAt: "2026-06-27T11:00:00+09:00",
    updatedAt: "2026-06-27T11:10:00+09:00",
  },
  {
    id: "cost_0006",
    date: "2026-06-25T00:00:00+09:00",
    item: "302호 관리비 정산분",
    amount: 82000,
    type: "maintenance",
    scope: "unit",
    unitId: "302",
    status: "confirmed",
    verified: true,
    disclosure: "public",
    receiptId: "rcpt_0006",
    createdAt: "2026-06-25T09:30:00+09:00",
    updatedAt: "2026-06-25T09:35:00+09:00",
  },
  {
    id: "cost_0007",
    date: "2026-06-24T00:00:00+09:00",
    item: "건물 정화조 청소",
    amount: 180000,
    type: "maintenance",
    scope: "building",
    status: "confirmed",
    verified: true,
    disclosure: "private",
    receiptId: "rcpt_0007",
    createdAt: "2026-06-24T13:00:00+09:00",
    updatedAt: "2026-07-01T10:00:00+09:00",
  },
  {
    id: "cost_0008",
    date: "2026-06-23T00:00:00+09:00",
    item: "공용 청소용품",
    amount: 15400,
    type: "common",
    scope: "building",
    status: "confirmed",
    verified: false,
    receiptId: "rcpt_0008",
    createdAt: "2026-06-23T17:20:00+09:00",
    updatedAt: "2026-06-23T17:25:00+09:00",
  },
  {
    id: "cost_0009",
    date: "2026-06-28T00:00:00+09:00",
    item: "502호 배수관 세척·트랩 교체(정정)",
    amount: 130000,
    type: "repair",
    scope: "unit",
    unitId: "502",
    status: "amended",
    verified: true,
    repairPayment: "already_paid",
    receiptId: "rcpt_0004",
    supersedesId: "cost_0004",
    createdAt: "2026-07-01T15:00:00+09:00",
    updatedAt: "2026-07-01T15:00:00+09:00",
  },
  {
    id: "cost_0010",
    date: "2026-06-20T00:00:00+09:00",
    item: "중복 등록된 출장비",
    amount: 30000,
    type: "repair",
    scope: "unit",
    unitId: "502",
    status: "void",
    verified: true,
    repairPayment: "already_paid",
    voidReason: "동일 영수증 중복 등록 — 소급 차감",
    receiptId: "rcpt_0004",
    createdAt: "2026-06-20T10:00:00+09:00",
    updatedAt: "2026-07-01T15:05:00+09:00",
  },
];

const DEMO_RECEIPTS: Receipt[] = [
  {
    id: "rcpt_0001",
    source: "camera",
    imageUrl: "/demo/receipt-fluorescent.jpg",
    hasEvidence: true,
    uploadedAt: "2026-07-01T18:18:00+09:00",
  },
  {
    id: "rcpt_0002",
    source: "file",
    imageUrl: "/demo/receipt-hardware.pdf",
    hasEvidence: true,
    uploadedAt: "2026-06-30T14:00:00+09:00",
  },
  {
    id: "rcpt_0003",
    source: "camera",
    imageUrl: "/demo/receipt-leak.jpg",
    hasEvidence: true,
    uploadedAt: "2026-06-29T20:35:00+09:00",
  },
  {
    id: "rcpt_0004",
    source: "online",
    imageUrl: "/demo/receipt-plumbing.png",
    hasEvidence: true,
    uploadedAt: "2026-06-28T15:50:00+09:00",
  },
  {
    id: "rcpt_0008",
    source: "manual",
    hasEvidence: false,
    uploadedAt: "2026-06-23T17:20:00+09:00",
  },
];

const DEMO_RECEIPT_OCRS: ReceiptOcr[] = [
  {
    id: "ocr_0001",
    receiptId: "rcpt_0001",
    costId: "cost_0001",
    fields: {
      item: { value: "복도 형광등 교체", confidence: 0.62, needsReview: true },
      date: { value: "2026-07-01", confidence: 0.94, needsReview: false },
      amount: { value: 48000, confidence: 0.55, needsReview: true },
    },
    suggestedType: "common",
    typeConfidence: 0.88,
    lineItems: [{ label: "복도 형광등 교체", amount: 48000, suggestedType: "common" }],
    createdAt: "2026-07-01T18:20:00+09:00",
  },
  {
    id: "ocr_0002",
    receiptId: "rcpt_0002",
    costId: "cost_0002",
    fields: {
      item: { value: "철물점 잡자재", confidence: 0.9, needsReview: false },
      date: { value: "2026-06-30", confidence: 0.96, needsReview: false },
      amount: { value: 23500, confidence: 0.93, needsReview: false },
    },
    suggestedType: "other",
    typeConfidence: 0.41,
    lineItems: [
      { label: "경첩·나사 세트", amount: 8500, suggestedType: "other" },
      { label: "실리콘·방수 테이프", amount: 15000, suggestedType: "repair" },
    ],
    createdAt: "2026-06-30T14:05:00+09:00",
  },
];

const DEMO_COST_QUEUE_SUMMARY: CostReviewQueueSummary = {
  ocrLowConfidence: 1,
  classificationUnclear: 1,
  unitUnmatched: 1,
  unverifiedConfirmed: 1,
  total: 3,
};

const DEMO_MONTHLY_SUMMARY: MonthlyCostSummary = {
  month: "2026-07",
  totalAmount: 757400,
  byType: {
    repair: 480000,
    maintenance: 262000,
    common: 15400,
    other: 0,
  },
  confirmedCount: 5,
};

const DEMO_DISCLOSURE_SETTING: DisclosureSetting = {
  month: "2026-06",
  scope: "building",
  entries: [
    { costId: "cost_0006", item: "302호 관리비 정산분", amount: 82000, disclosure: "public" },
    {
      costId: "cost_0007",
      item: "건물 정화조 청소",
      amount: 180000,
      disclosure: "private",
      privateReason: "계약상 단가 비공개 항목",
    },
  ],
  hiddenCount: 1,
  updatedAt: "2026-07-01T10:00:00+09:00",
};

@Injectable()
export class InMemoryCostRepository implements CostRepository {
  private readonly costs = new Map<string, Cost>();
  private readonly receipts = new Map<string, Receipt>();
  private readonly receiptOcrs = new Map<string, ReceiptOcr>();
  private readonly monthlySummaries = new Map<string, MonthlyCostSummary>();
  private readonly disclosureSettings = new Map<string, DisclosureSetting>();

  constructor() {
    for (const cost of DEMO_COSTS) {
      this.costs.set(cost.id, cost);
    }
    for (const receipt of DEMO_RECEIPTS) {
      this.receipts.set(receipt.id, receipt);
    }
    for (const receiptOcr of DEMO_RECEIPT_OCRS) {
      this.receiptOcrs.set(receiptOcr.id, receiptOcr);
    }
    this.monthlySummaries.set(DEMO_MONTHLY_SUMMARY.month, DEMO_MONTHLY_SUMMARY);
    this.disclosureSettings.set(DEMO_DISCLOSURE_SETTING.month, DEMO_DISCLOSURE_SETTING);
  }

  listCosts(options: CostListOptions = {}): Cost[] {
    return Array.from(this.costs.values()).filter(
      (cost) =>
        (!options.status || cost.status === options.status) &&
        (!options.type || cost.type === options.type) &&
        (!options.scope || cost.scope === options.scope) &&
        (!options.unitId || cost.unitId === options.unitId) &&
        (!options.reviewReason || cost.reviewReason === options.reviewReason),
    );
  }

  getCost(id: string): Cost | undefined {
    return this.costs.get(id);
  }

  listReceipts(): Receipt[] {
    return Array.from(this.receipts.values());
  }

  getReceipt(id: string): Receipt | undefined {
    return this.receipts.get(id);
  }

  listReceiptOcrs(): ReceiptOcr[] {
    return Array.from(this.receiptOcrs.values());
  }

  getReceiptOcr(id: string): ReceiptOcr | undefined {
    return this.receiptOcrs.get(id);
  }

  getReviewQueueSummary(): CostReviewQueueSummary {
    return DEMO_COST_QUEUE_SUMMARY;
  }

  getMonthlySummary(month: string): MonthlyCostSummary | undefined {
    return this.monthlySummaries.get(month);
  }

  getDisclosureSetting(month: string): DisclosureSetting | undefined {
    return this.disclosureSettings.get(month);
  }
}
