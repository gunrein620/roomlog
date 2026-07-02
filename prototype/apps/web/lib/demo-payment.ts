import type { Bill, MaintenanceFee, PaymentAccount } from "@roomlog/types";

// 납부 슬라이스 데모 시드 — api(인메모리 리포)와 동일한 값으로 맞춘다.
// 화면이 api 없이도 렌더되도록 프론트 폴백으로도 쓰인다.

const ACCOUNT: PaymentAccount = {
  bankName: "국민은행",
  accountNumber: "123456-78-901234",
  accountHolder: "룸로그관리",
};

export const DEMO_BILLS: Bill[] = [
  {
    id: "bl_2607",
    unitId: "302",
    billingMonth: "2026-07",
    status: "sent",
    items: [
      { label: "월세", amount: 500000 },
      { label: "관리비", amount: 50000 },
    ],
    totalAmount: 550000,
    paidAmount: 0,
    dueDate: "2026-07-25T23:59:59+09:00",
    account: ACCOUNT,
    maintenanceFeeId: "mf_2607",
    createdAt: "2026-07-01T09:00:00+09:00",
    updatedAt: "2026-07-01T09:00:00+09:00",
  },
  {
    id: "bl_2606",
    unitId: "302",
    billingMonth: "2026-06",
    status: "paid",
    items: [
      { label: "월세", amount: 500000 },
      { label: "관리비", amount: 50000 },
    ],
    totalAmount: 550000,
    paidAmount: 550000,
    dueDate: "2026-06-25T23:59:59+09:00",
    account: ACCOUNT,
    createdAt: "2026-06-01T09:00:00+09:00",
    updatedAt: "2026-06-24T14:00:00+09:00",
  },
  {
    id: "bl_2605",
    unitId: "302",
    billingMonth: "2026-05",
    status: "paid",
    items: [
      { label: "월세", amount: 500000 },
      { label: "관리비", amount: 50000 },
    ],
    totalAmount: 550000,
    paidAmount: 550000,
    dueDate: "2026-05-25T23:59:59+09:00",
    account: ACCOUNT,
    createdAt: "2026-05-01T09:00:00+09:00",
    updatedAt: "2026-05-23T11:00:00+09:00",
  },
];

/** 이번 달(홈 center) 청구 — 배열 첫 항목 */
export const DEMO_BILL: Bill = DEMO_BILLS[0];

export const DEMO_MAINTENANCE: MaintenanceFee = {
  id: "mf_2607",
  unitId: "302",
  billingMonth: "2026-07",
  items: [
    { label: "공용 전기", amount: 18000, receiptAvailable: true },
    { label: "공용 청소", amount: 12000, receiptAvailable: true },
    { label: "승강기 유지", amount: 8000, receiptAvailable: false },
    { label: "공용 수도", amount: 12000, receiptAvailable: true },
  ],
  totalAmount: 50000,
  available: true,
};
