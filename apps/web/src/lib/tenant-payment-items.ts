import type { BillLineItem, BillLineItemKind, BillLineItemStatus } from "@roomlog/types";

export interface PayablePaymentItem {
  label: string;
  kind: BillLineItemKind;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  status: BillLineItemStatus;
}

export interface PayableItemSelection {
  items: PayablePaymentItem[];
  selectedKinds: BillLineItemKind[];
  selectedAmount: number;
}

export function selectPayableItems(items: BillLineItem[]): PayableItemSelection {
  const payable = items
    .map((item, index) => normalizeItem(item, index))
    .filter((item) => item.remainingAmount > 0);
  const selectedKinds = payable.map((item) => item.kind);

  return selectionWithKinds(payable, selectedKinds);
}

export function togglePayableItem(
  selection: PayableItemSelection,
  kind: BillLineItemKind,
): PayableItemSelection {
  if (!selection.items.some((item) => item.kind === kind)) return selection;
  if (selection.items.length === 1) return selection;

  const selectedKinds = selection.selectedKinds.includes(kind)
    ? selection.selectedKinds.filter((item) => item !== kind)
    : selection.items
        .filter((item) => selection.selectedKinds.includes(item.kind) || item.kind === kind)
        .map((item) => item.kind);

  return selectionWithKinds(selection.items, selectedKinds);
}

function selectionWithKinds(
  items: PayablePaymentItem[],
  selectedKinds: BillLineItemKind[],
): PayableItemSelection {
  return {
    items,
    selectedKinds,
    selectedAmount: items
      .filter((item) => selectedKinds.includes(item.kind))
      .reduce((sum, item) => sum + item.remainingAmount, 0),
  };
}

function normalizeItem(item: BillLineItem, index: number): PayablePaymentItem {
  const amount = Math.max(0, Math.round(Number(item.amount) || 0));
  const paidAmount = Math.min(amount, Math.max(0, Math.round(Number(item.paidAmount) || 0)));
  const kind = item.kind ?? inferKind(item.label, index);

  return {
    label: item.label,
    kind,
    amount,
    paidAmount,
    remainingAmount: Math.max(0, amount - paidAmount),
    status: item.status ?? statusFor(amount, paidAmount),
  };
}

function inferKind(label: string, index: number): BillLineItemKind {
  if (/월세|임대료|rent/i.test(label)) return "rent";
  if (/관리비|maintenance/i.test(label)) return "maintenance";
  return index === 0 ? "rent" : "other";
}

function statusFor(amount: number, paidAmount: number): BillLineItemStatus {
  if (amount > 0 && paidAmount >= amount) return "paid";
  if (paidAmount > 0) return "partial";
  return "unpaid";
}
