import type { Bill, BillLineItemKind, BillLineItemStatus } from "@roomlog/types";
import { DEMO_BILL, DEMO_BILLS } from "./demo-payment";

import type { BillPaymentOrder, CreateBillPaymentOrderInput } from "./payment-api";

const PAYMENT_ITEM_KIND_ORDER: BillLineItemKind[] = ["rent", "maintenance", "other"];
const PAYMENT_ITEM_KIND_LABEL: Record<BillLineItemKind, string> = {
  rent: "월세",
  maintenance: "관리비",
  other: "기타",
};

export function isDemoBillId(billId: string): boolean {
  return billId === "active" || DEMO_BILLS.some((bill) => bill.id === billId);
}

export function buildDemoBillPaymentOrder(
  billId: string,
  dto: CreateBillPaymentOrderInput,
): BillPaymentOrder {
  const bill = demoBillForPayment(billId);
  const itemKinds = normalizeItemKinds(dto.itemKinds);
  const amount = itemKinds.reduce((sum, kind) => sum + unpaidAmountForKind(bill, kind), 0);
  const selectedLabels = itemKinds.map((kind) => PAYMENT_ITEM_KIND_LABEL[kind]);

  return {
    billId: bill.id,
    orderId: `roomlog_demo_${bill.id}_${itemKinds.join("_")}_${Date.now()}`,
    orderName: `${bill.billingMonth} ${bill.unitId}호 ${selectedLabels.join("·")}`,
    amount,
    itemKinds,
    customerKey: `roomlog-demo-${bill.unitId}`,
    clientKey: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY,
  };
}

export function buildDemoConfirmedBill(billId: string, orderId: string, amount: number): Bill {
  const bill = demoBillForPayment(billId);
  const paidKinds = parseDemoOrderKinds(orderId);
  let remaining = Math.max(0, Math.round(amount));

  const items = bill.items.map((item, index) => {
    const kind = item.kind ?? inferDemoLineItemKind(item.label, index);
    const currentPaid = clampPaidAmount(item.paidAmount ?? 0, item.amount);

    if (!paidKinds.includes(kind)) {
      return {
        ...item,
        kind,
        paidAmount: currentPaid,
        status: item.status ?? statusForLineItem(item.amount, currentPaid),
      };
    }

    const addition = Math.min(Math.max(0, item.amount - currentPaid), remaining);
    remaining -= addition;
    const paidAmount = currentPaid + addition;

    return {
      ...item,
      kind,
      paidAmount,
      status: statusForLineItem(item.amount, paidAmount),
    };
  });

  const paidAmount = Math.min(
    bill.totalAmount,
    items.reduce((sum, item) => sum + clampPaidAmount(item.paidAmount ?? 0, item.amount), 0),
  );

  return {
    ...bill,
    items,
    paidAmount,
    status: paidAmount >= bill.totalAmount ? "paid" : paidAmount > 0 ? "partially_paid" : bill.status,
    updatedAt: new Date().toISOString(),
  };
}

function demoBillForPayment(billId: string): Bill {
  return DEMO_BILLS.find((bill) => bill.id === billId) ?? DEMO_BILL;
}

function normalizeItemKinds(itemKinds: BillLineItemKind[]): BillLineItemKind[] {
  const selected = itemKinds.length > 0 ? itemKinds : ["rent", "maintenance"];
  return PAYMENT_ITEM_KIND_ORDER.filter((kind) => selected.includes(kind));
}

function unpaidAmountForKind(bill: Bill, kind: BillLineItemKind): number {
  return bill.items
    .filter((item, index) => (item.kind ?? inferDemoLineItemKind(item.label, index)) === kind)
    .reduce((sum, item) => sum + Math.max(0, item.amount - clampPaidAmount(item.paidAmount ?? 0, item.amount)), 0);
}

function parseDemoOrderKinds(orderId: string): BillLineItemKind[] {
  const kinds = PAYMENT_ITEM_KIND_ORDER.filter((kind) => new RegExp(`(^|_)${kind}(_|$)`).test(orderId));
  return kinds.length > 0 ? kinds : ["rent", "maintenance"];
}

function inferDemoLineItemKind(label: string, index: number): BillLineItemKind {
  if (/월세|임대료|rent/i.test(label)) return "rent";
  if (/관리비|maintenance/i.test(label)) return "maintenance";
  return index === 0 ? "rent" : "other";
}

function clampPaidAmount(paidAmount: number, amount: number): number {
  return Math.min(amount, Math.max(0, paidAmount));
}

function statusForLineItem(amount: number, paidAmount: number): BillLineItemStatus {
  if (paidAmount >= amount) return "paid";
  if (paidAmount > 0) return "partial";
  return "unpaid";
}
