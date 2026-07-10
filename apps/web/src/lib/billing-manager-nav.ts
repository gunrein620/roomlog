export const MANAGER_BILLING_ROUTES = {
  dashboard: "/manager/billing",
  collection: "/manager/billing/collection",
  matching: "/manager/billing/matching",
  overdue: "/manager/billing/overdue",
} as const;

export function managerBillHref(billId: string): string {
  const id = encodeURIComponent(billId);
  return `/manager/billing/${id}?id=${id}`;
}

export function managerDunningHref(billId: string): string {
  const id = encodeURIComponent(billId);
  return `/manager/billing/dunning/${id}?id=${id}`;
}
