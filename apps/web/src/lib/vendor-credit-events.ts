export const OPEN_MANAGER_CREDIT_TOPUP_EVENT = "roomlog:open-manager-credit-topup";
export const MANAGER_CREDIT_BALANCE_CHANGED_EVENT = "roomlog:manager-credit-balance-changed";

export function openManagerCreditTopup(amount?: number): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_MANAGER_CREDIT_TOPUP_EVENT, {
    detail: { amount },
  }));
}

export function notifyManagerCreditBalanceChanged(balance?: number): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MANAGER_CREDIT_BALANCE_CHANGED_EVENT, {
    detail: { balance },
  }));
}
