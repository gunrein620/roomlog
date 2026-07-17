export const OPEN_MANAGER_CREDIT_TOPUP_EVENT = "roomlog:open-manager-credit-topup";
export const MANAGER_CREDIT_BALANCE_CHANGED_EVENT = "roomlog:manager-credit-balance-changed";

export function openManagerCreditTopup(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_MANAGER_CREDIT_TOPUP_EVENT));
}

export function notifyManagerCreditBalanceChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(MANAGER_CREDIT_BALANCE_CHANGED_EVENT));
}
