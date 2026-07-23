import { strict as assert } from "node:assert";
import test from "node:test";
import type { TenantPaymentHistory } from "@roomlog/types";
import { confirmedPaymentLogs } from "./tenant-confirmed-payment-history";

const history: TenantPaymentHistory = {
  range: { from: "2026-01-01", to: "2026-07-23" },
  bounds: { min: "2025-08-01", max: "2026-07-23", maxDays: 366 },
  records: [
    {
      billId: "bill-july",
      billingMonth: "2026-07",
      activityDate: "2026-07-08T03:00:00.000Z",
      status: "partially_paid",
      totalAmount: 900000,
      paidAmount: 500000,
      payments: [
        {
          id: "confirmed-deposit",
          type: "deposit",
          activityDate: "2026-07-08T03:00:00.000Z",
          amount: 500000,
          status: "confirmed",
          receiptAvailable: true,
        },
        {
          id: "confirming-report",
          type: "report",
          activityDate: "2026-07-09T03:00:00.000Z",
          amount: 400000,
          status: "confirming",
          receiptAvailable: false,
        },
      ],
    },
    {
      billId: "bill-june",
      billingMonth: "2026-06",
      activityDate: "2026-06-05T03:00:00.000Z",
      status: "paid",
      totalAmount: 900000,
      paidAmount: 900000,
      payments: [
        {
          id: "confirmed-toss",
          type: "toss",
          activityDate: "2026-06-05T03:00:00.000Z",
          amount: 900000,
          status: "confirmed",
          receiptAvailable: true,
        },
      ],
    },
  ],
};

test("keeps only confirmed payment events in newest-first order", () => {
  assert.deepEqual(confirmedPaymentLogs(history), [
    {
      id: "bill-july:confirmed-deposit",
      billId: "bill-july",
      billingMonth: "2026-07",
      activityDate: "2026-07-08T03:00:00.000Z",
      amount: 500000,
      methodLabel: "계좌 입금",
    },
    {
      id: "bill-june:confirmed-toss",
      billId: "bill-june",
      billingMonth: "2026-06",
      activityDate: "2026-06-05T03:00:00.000Z",
      amount: 900000,
      methodLabel: "Toss 결제",
    },
  ]);
});

test("returns an empty list when no payment is confirmed", () => {
  const unconfirmed: TenantPaymentHistory = {
    ...history,
    records: history.records.map((record) => ({
      ...record,
      payments: record.payments.filter((payment) => payment.status !== "confirmed"),
    })),
  };

  assert.deepEqual(confirmedPaymentLogs(unconfirmed), []);
});
