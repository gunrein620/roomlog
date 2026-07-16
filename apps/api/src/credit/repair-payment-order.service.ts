import { createHmac } from "node:crypto";
import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException
} from "@nestjs/common";
import type {
  ConfirmRepairPaymentOrderInput,
  CreateRepairPaymentOrderInput,
  RepairPaymentCheckout,
  RepairPaymentOrderPublicView,
  RepairPaymentOrderView,
  RetryRepairPaymentOrderInput
} from "@roomlog/types";
import { requireBearerSubject } from "../auth/bearer-token";
import {
  TossPaymentGatewayError,
  type TossPaymentGateway,
  type TossPaymentSnapshot
} from "../payment/toss-payment.gateway";
import {
  CREDIT_SERVICE_OPTIONS,
  TOSS_PAYMENT_GATEWAY,
  type CreditServiceOptions
} from "./credit.service";
import {
  REPAIR_PAYMENT_ORDER_REPOSITORY,
  type RepairPaymentActor,
  type RepairPaymentOrderRepository
} from "./repair-payment-order.repository";
import {
  requireRepairPaymentCreationKey,
  requireRepairPaymentKey,
  requireRepairPaymentOrderId,
  requireRepairPaymentReturnPath
} from "./repair-payment-order.validation";
import { publicRepairPaymentOrder } from "./repair-payment-order-public";

const REPAIR_PAYMENT_ORDER_NAME = "집우집주 수리비 결제" as const;
const SAFE_RETRY_MESSAGE =
  "결제 결과 확인이 지연되고 있습니다. 잠시 후 다시 확인해 주세요.";

function environmentOptions(): CreditServiceOptions {
  return {
    clientKey:
      process.env.TOSS_CLIENT_KEY?.trim() ||
      process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim() ||
      "test_ck_roomlog_credit",
    tokenSecret:
      process.env.JWT_SECRET?.trim() || "roomlog-local-dev-secret"
  };
}

function requireInputRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("요청 본문이 올바르지 않습니다.");
  }
  return value as Record<string, unknown>;
}

function requireNonblank(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestException(`${label}이(가) 필요합니다.`);
  }
  return value.trim();
}

function requirePositiveAmount(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new BadRequestException("결제 금액은 1원 이상의 정수여야 합니다.");
  }
  return value as number;
}

function invalidReturnPath(): never {
  throw new BadRequestException("복귀 경로는 서비스 내부 경로여야 합니다.");
}

function returnPathname(value: string) {
  const delimiterIndex = value.search(/[?#]/);
  return delimiterIndex === -1 ? value : value.slice(0, delimiterIndex);
}

function assertSafeInternalPath(value: string) {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    invalidReturnPath();
  }

  let pathname = returnPathname(value);
  for (let depth = 0; depth < 8; depth += 1) {
    if (/%(?:25)*(?:2f|5c|2e)/i.test(pathname)) invalidReturnPath();
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      invalidReturnPath();
    }
    if (
      decoded.startsWith("//") ||
      decoded.includes("\\") ||
      decoded.split("/").some((segment) => segment === "." || segment === "..")
    ) {
      invalidReturnPath();
    }
    if (decoded === pathname) return;
    pathname = decoded;
  }
  invalidReturnPath();
}

function requireInternalReturnPath(value: unknown) {
  const raw = requireRepairPaymentReturnPath(value);
  assertSafeInternalPath(raw);
  const base = new URL("https://roomlog.local");
  let parsed: URL;
  try {
    parsed = new URL(raw, base);
  } catch {
    invalidReturnPath();
  }
  if (parsed.origin !== base.origin) invalidReturnPath();
  const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  assertSafeInternalPath(normalized);
  return requireRepairPaymentReturnPath(normalized);
}

function providerReason(error: unknown, fallback: string) {
  return error instanceof TossPaymentGatewayError ? error.code : fallback;
}

function matchingProviderIdentity(
  payment: TossPaymentSnapshot,
  expected: { orderId: string; paymentKey: string; amount: number }
) {
  return (
    payment.orderId === expected.orderId &&
    payment.paymentKey === expected.paymentKey &&
    payment.amount === expected.amount
  );
}

function matchingDonePayment(
  payment: TossPaymentSnapshot,
  expected: { orderId: string; paymentKey: string; amount: number }
) {
  return payment.status === "DONE" && matchingProviderIdentity(payment, expected);
}

@Injectable()
export class RepairPaymentOrderService {
  private readonly options: CreditServiceOptions;

  constructor(
    @Inject(REPAIR_PAYMENT_ORDER_REPOSITORY)
    private readonly repository: RepairPaymentOrderRepository,
    @Inject(TOSS_PAYMENT_GATEWAY)
    private readonly paymentGateway: TossPaymentGateway,
    @Optional() @Inject(CREDIT_SERVICE_OPTIONS) options?: CreditServiceOptions
  ) {
    this.options = options ?? environmentOptions();
  }

  async requireTenant(authorization?: string): Promise<string> {
    const payerUserId = requireBearerSubject(
      authorization,
      this.options.tokenSecret
    );
    await this.repository.assertTenantAccess({
      payerRole: "TENANT",
      payerUserId,
      initiatedBy: "USER_UI"
    });
    return payerUserId;
  }

  async createOrder(
    actor: RepairPaymentActor,
    paymentRequestId: string,
    input: CreateRepairPaymentOrderInput
  ): Promise<RepairPaymentCheckout> {
    const body = requireInputRecord(input);
    const order = await this.repository.createOrder(actor, {
      paymentRequestId: requireNonblank(paymentRequestId, "지급 요청 ID"),
      creationKey: requireRepairPaymentCreationKey(body.creationKey),
      returnPath: requireInternalReturnPath(body.returnPath)
    });
    return this.checkout(order);
  }

  getOrder(actor: RepairPaymentActor, orderId: string) {
    return this.repository.getOrder(
      actor,
      requireRepairPaymentOrderId(orderId)
    );
  }

  async confirmOrder(
    actor: RepairPaymentActor,
    orderId: string,
    input: ConfirmRepairPaymentOrderInput
  ): Promise<RepairPaymentOrderView> {
    const body = requireInputRecord(input);
    const normalizedOrderId = requireRepairPaymentOrderId(orderId);
    const paymentKey = requireRepairPaymentKey(body.paymentKey);
    const amount = requirePositiveAmount(body.amount);
    const claim = await this.repository.claimConfirmation(actor, {
      orderId: normalizedOrderId,
      paymentKey,
      amount
    });
    if (claim.outcome !== "CLAIMED") return claim.order;

    const expected = {
      orderId: claim.order.orderId,
      paymentKey,
      amount: claim.order.amount
    };
    if (
      claim.order.orderId !== normalizedOrderId ||
      claim.order.paymentKey !== paymentKey ||
      claim.order.amount !== amount
    ) {
      return this.persistUncertain(actor, normalizedOrderId, "LOCAL_CLAIM_MISMATCH");
    }

    let payment: TossPaymentSnapshot;
    try {
      payment = await this.paymentGateway.confirmPayment(expected);
    } catch (error) {
      if (
        error instanceof TossPaymentGatewayError &&
        error.kind === "DECLINED"
      ) {
        return this.repository.markRejected(actor, {
          orderId: normalizedOrderId,
          reason: error.code
        });
      }
      return this.persistUncertain(
        actor,
        normalizedOrderId,
        providerReason(error, "PAYMENT_CONFIRM_UNKNOWN")
      );
    }

    if (!matchingDonePayment(payment, expected)) {
      return this.persistUncertain(
        actor,
        normalizedOrderId,
        "PAYMENT_CONFIRM_MISMATCH"
      );
    }

    try {
      return await this.repository.finalizeOrder(actor, {
        orderId: normalizedOrderId,
        payment
      });
    } catch {
      return this.persistUncertain(
        actor,
        normalizedOrderId,
        "LOCAL_FINALIZE_UNCERTAIN"
      );
    }
  }

  async reconcileOrder(
    actor: RepairPaymentActor,
    orderId: string
  ): Promise<RepairPaymentOrderView> {
    const normalizedOrderId = requireRepairPaymentOrderId(orderId);
    const order = await this.repository.getOrder(actor, normalizedOrderId);
    if (
      order.status !== "CONFIRMING" &&
      order.status !== "RECONCILIATION_REQUIRED"
    ) {
      return order;
    }

    let payment: TossPaymentSnapshot;
    try {
      payment = await this.paymentGateway.getPaymentByOrderId(order.orderId);
    } catch (error) {
      return this.persistUncertain(
        actor,
        normalizedOrderId,
        providerReason(error, "PAYMENT_LOOKUP_UNKNOWN")
      );
    }

    const expected = {
      orderId: order.orderId,
      paymentKey: order.paymentKey ?? "",
      amount: order.amount
    };
    if (!expected.paymentKey || !matchingProviderIdentity(payment, expected)) {
      return this.persistUncertain(
        actor,
        normalizedOrderId,
        "PAYMENT_RECONCILIATION_MISMATCH"
      );
    }
    if (payment.status === "ABORTED" || payment.status === "EXPIRED") {
      return this.repository.markRejected(actor, {
        orderId: normalizedOrderId,
        reason: `PAYMENT_${payment.status}`
      });
    }
    if (payment.status !== "DONE") {
      return this.persistUncertain(
        actor,
        normalizedOrderId,
        `PAYMENT_${payment.status || "NONTERMINAL"}`
      );
    }

    try {
      return await this.repository.finalizeOrder(actor, {
        orderId: normalizedOrderId,
        payment
      });
    } catch {
      return this.persistUncertain(
        actor,
        normalizedOrderId,
        "LOCAL_RECONCILIATION_UNCERTAIN"
      );
    }
  }

  cancelOrder(actor: RepairPaymentActor, orderId: string) {
    return this.repository.cancelOrder(actor, {
      orderId: requireRepairPaymentOrderId(orderId)
    });
  }

  async retryOrder(
    actor: RepairPaymentActor,
    orderId: string,
    input: RetryRepairPaymentOrderInput
  ): Promise<RepairPaymentCheckout> {
    const body = requireInputRecord(input);
    const order = await this.repository.retryOrder(actor, {
      orderId: requireRepairPaymentOrderId(orderId),
      creationKey: requireRepairPaymentCreationKey(body.creationKey),
      returnPath: requireInternalReturnPath(body.returnPath)
    });
    return this.checkout(order);
  }

  private checkout(order: RepairPaymentOrderView): RepairPaymentCheckout {
    return {
      order: publicRepairPaymentOrder(order),
      clientKey: this.options.clientKey,
      customerKey: `repair_${createHmac("sha256", this.options.tokenSecret)
        .update(`repair-payment-customer:${order.payerUserId}`, "utf8")
        .digest("base64url")}`,
      orderName: REPAIR_PAYMENT_ORDER_NAME
    };
  }

  private async persistUncertain(
    actor: RepairPaymentActor,
    orderId: string,
    reason: string
  ) {
    try {
      return await this.repository.markUncertain(actor, { orderId, reason });
    } catch {
      throw new ServiceUnavailableException(SAFE_RETRY_MESSAGE);
    }
  }
}
