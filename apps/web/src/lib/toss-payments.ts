export const TOSS_PAYMENTS_SDK_URL = "https://js.tosspayments.com/v2/standard";

export type TossWidgets = {
  setAmount(input: { currency: "KRW"; value: number }): Promise<void>;
  renderPaymentMethods(input: { selector: string; variantKey?: string }): Promise<void>;
  renderAgreement(input: { selector: string; variantKey?: string }): Promise<void>;
  requestPayment(input: {
    orderId: string;
    orderName: string;
    successUrl: string;
    failUrl: string;
    customerName?: string;
  }): Promise<void>;
};

type TossPaymentWindow = {
  requestPayment(input: {
    method: "CARD";
    amount: { currency: "KRW"; value: number };
    orderId: string;
    orderName: string;
    successUrl: string;
    failUrl: string;
    customerName?: string;
    card?: { flowMode: "DEFAULT" };
  }): Promise<void>;
};

type TossPaymentsInstance = {
  widgets(input: { customerKey: string }): TossWidgets;
  payment(input: { customerKey: string }): TossPaymentWindow;
};

export type TossPaymentMode = "widget" | "payment-window";

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => TossPaymentsInstance;
  }
}

export function tossPaymentMode(clientKey: string): TossPaymentMode {
  return clientKey.includes("_gck_") ? "widget" : "payment-window";
}

export function isTossPaymentsReady(): boolean {
  return typeof window !== "undefined" && Boolean(window.TossPayments);
}

function requireTossPayments(clientKey: string): TossPaymentsInstance {
  if (typeof window === "undefined" || !window.TossPayments) {
    throw new Error("Toss 결제 SDK를 불러오지 못했습니다.");
  }
  return window.TossPayments(clientKey);
}

export function createTossWidgets(
  clientKey: string,
  customerKey: string,
): TossWidgets {
  return requireTossPayments(clientKey).widgets({ customerKey });
}

export type TossPaymentRequest = {
  clientKey: string;
  customerKey: string;
  orderId: string;
  amount: number;
  orderName: string;
  successUrl: string;
  failUrl: string;
  customerName?: string;
  widgets?: TossWidgets;
};

async function requestCardPaymentWindow(input: TossPaymentRequest): Promise<void> {
  await requireTossPayments(input.clientKey).payment({
    customerKey: input.customerKey,
  }).requestPayment({
    method: "CARD",
    amount: { currency: "KRW", value: input.amount },
    orderId: input.orderId,
    orderName: input.orderName,
    successUrl: input.successUrl,
    failUrl: input.failUrl,
    customerName: input.customerName,
    card: { flowMode: "DEFAULT" },
  });
}

/** Tenant 결제는 기존 키 종류에 따라 위젯/결제창을 동일하게 분기한다. */
export async function requestTossPayment(input: TossPaymentRequest): Promise<void> {
  if (tossPaymentMode(input.clientKey) === "widget") {
    if (!input.widgets) throw new Error("결제위젯을 먼저 불러와 주세요.");
    await input.widgets.requestPayment({
      orderId: input.orderId,
      orderName: input.orderName,
      successUrl: input.successUrl,
      failUrl: input.failUrl,
      customerName: input.customerName,
    });
    return;
  }

  await requestCardPaymentWindow(input);
}

export type ManagerCardPaymentRequest = TossPaymentRequest;

/** 관리자 크레딧 충전도 발급된 키 종류에 맞춰 위젯 또는 결제창으로 요청한다. */
export async function requestManagerCardPayment(
  input: ManagerCardPaymentRequest,
): Promise<void> {
  await requestTossPayment({
    ...input,
    customerName: input.customerName ?? "집우집주 관리자",
  });
}

export type GaraCardPaymentRequest = TossPaymentRequest;

/** Gara의 공개 업체 크레딧 충전은 관리자 세션과 독립된 Toss 결제 흐름을 쓴다. */
export async function requestGaraCardPayment(
  input: GaraCardPaymentRequest,
): Promise<void> {
  await requestTossPayment({
    ...input,
    customerName: input.customerName ?? "Gara 업체",
  });
}
