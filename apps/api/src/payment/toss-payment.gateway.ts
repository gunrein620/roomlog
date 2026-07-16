export interface TossConfirmPaymentInput {
  paymentKey: string;
  orderId: string;
  amount: number;
}

export interface TossPaymentSnapshot {
  paymentKey: string;
  orderId: string;
  amount: number;
  status: string;
  method?: string;
  approvedAt?: string;
}

export interface TossPaymentGateway {
  confirmPayment(input: TossConfirmPaymentInput): Promise<TossPaymentSnapshot>;
  getPaymentByOrderId(orderId: string): Promise<TossPaymentSnapshot>;
}

export class TossPaymentGatewayError extends Error {
  readonly name = "TossPaymentGatewayError";

  constructor(
    readonly kind: "DECLINED" | "UNKNOWN",
    readonly code: string,
    message: string,
    readonly httpStatus?: number
  ) {
    super(message);
  }
}

export type TossFetchImplementation = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>;

const DEFAULT_API_BASE = "https://api.tosspayments.com";
const DEFAULT_TIMEOUT_MS = 10_000;
const UNKNOWN_PROVIDER_CODE =
  /(?:UNKNOWN|INTERNAL|PROVIDER|TEMPORARY|PROCESSING|UNAVAILABLE|TIMEOUT)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalString(
  record: Record<string, unknown>,
  key: string
): string | undefined | false {
  const value = record[key];
  if (value === undefined || value === null) return undefined;
  return nonEmptyString(value) ?? false;
}

function parseJson(text: string): unknown {
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function normalizeSnapshot(payload: unknown): TossPaymentSnapshot {
  if (!isRecord(payload)) {
    throw new TossPaymentGatewayError(
      "UNKNOWN",
      "MALFORMED_SUCCESS_RESPONSE",
      "토스페이먼츠 성공 응답 형식이 올바르지 않습니다."
    );
  }

  const paymentKey = nonEmptyString(payload.paymentKey);
  const orderId = nonEmptyString(payload.orderId);
  const status = nonEmptyString(payload.status);
  const amount =
    typeof payload.totalAmount === "number"
      ? payload.totalAmount
      : payload.amount;
  const method = optionalString(payload, "method");
  const approvedAt = optionalString(payload, "approvedAt");

  if (
    !paymentKey ||
    !orderId ||
    !status ||
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    method === false ||
    approvedAt === false
  ) {
    throw new TossPaymentGatewayError(
      "UNKNOWN",
      "MALFORMED_SUCCESS_RESPONSE",
      "토스페이먼츠 성공 응답 형식이 올바르지 않습니다."
    );
  }

  return {
    paymentKey,
    orderId,
    amount,
    status,
    ...(method === undefined ? {} : { method }),
    ...(approvedAt === undefined ? {} : { approvedAt })
  };
}

function providerError(response: Response, payload: unknown) {
  const code = isRecord(payload)
    ? nonEmptyString(payload.code)
    : undefined;
  const message = isRecord(payload)
    ? nonEmptyString(payload.message)
    : undefined;
  const validated = code !== undefined && message !== undefined;
  const fallbackCode = `HTTP_${response.status}`;
  const fallbackMessage = "토스페이먼츠 요청 처리 결과를 확인할 수 없습니다.";
  const normalizedCode = code ?? fallbackCode;
  const normalizedMessage = message ?? fallbackMessage;
  const uncertain =
    !validated ||
    response.status === 429 ||
    response.status >= 500 ||
    response.status < 400 ||
    normalizedCode === "ALREADY_PROCESSED_PAYMENT" ||
    UNKNOWN_PROVIDER_CODE.test(normalizedCode);

  return new TossPaymentGatewayError(
    uncertain ? "UNKNOWN" : "DECLINED",
    normalizedCode,
    normalizedMessage,
    response.status
  );
}

export class TossPaymentsHttpGateway implements TossPaymentGateway {
  private readonly apiBase: string;

  constructor(
    private readonly secretKey = process.env.TOSS_SECRET_KEY,
    private readonly fetchImpl: TossFetchImplementation = globalThis.fetch,
    apiBase = process.env.TOSS_API_BASE_URL ?? DEFAULT_API_BASE,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS
  ) {
    this.apiBase = apiBase.replace(/\/$/, "");
  }

  confirmPayment(input: TossConfirmPaymentInput): Promise<TossPaymentSnapshot> {
    return this.request("/v1/payments/confirm", {
      method: "POST",
      body: JSON.stringify(input)
    });
  }

  getPaymentByOrderId(orderId: string): Promise<TossPaymentSnapshot> {
    return this.request(`/v1/payments/orders/${encodeURIComponent(orderId)}`, {
      method: "GET"
    });
  }

  private async request(
    path: string,
    init: Pick<RequestInit, "method" | "body">
  ): Promise<TossPaymentSnapshot> {
    const secretKey = this.secretKey?.trim();
    if (!secretKey) {
      throw new TossPaymentGatewayError(
        "UNKNOWN",
        "MISSING_SECRET_KEY",
        "TOSS_SECRET_KEY가 설정되어 있지 않습니다."
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.max(1, this.timeoutMs)
    );
    timeout.unref?.();

    let response: Response;
    let responseText: string;
    try {
      response = await this.fetchImpl(`${this.apiBase}${path}`, {
        ...init,
        headers: {
          Authorization: `Basic ${Buffer.from(`${secretKey}:`, "utf8").toString("base64")}`,
          Accept: "application/json",
          ...(init.body === undefined
            ? {}
            : { "Content-Type": "application/json" })
        },
        signal: controller.signal
      });
      responseText = await response.text();
    } catch (error) {
      const timedOut = controller.signal.aborted;
      throw new TossPaymentGatewayError(
        "UNKNOWN",
        timedOut ? "TIMEOUT" : "NETWORK_ERROR",
        timedOut
          ? "토스페이먼츠 응답 시간이 초과되었습니다."
          : error instanceof Error
            ? error.message
            : "토스페이먼츠 네트워크 요청에 실패했습니다."
      );
    } finally {
      clearTimeout(timeout);
    }

    const payload = parseJson(responseText);
    if (!response.ok) throw providerError(response, payload);
    return normalizeSnapshot(payload);
  }
}
