import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException
} from "@nestjs/common";
import { createHmac } from "node:crypto";
import type {
  ConfirmManagerCreditTopupInput,
  CreateManagerCreditTopupInput,
  ManagerCreditTopupOrderView,
  CancelVendorPaymentRequestInput,
  ReverseVendorCreditPaymentInput,
  SettleVendorPaymentRequestInput,
  UpdateAutoPayPolicyInput,
  VoidVendorDirectPaymentInput
} from "@roomlog/types";
import { requireBearerSubject } from "../auth/bearer-token";
import {
  TossPaymentGatewayError,
  type TossPaymentGateway,
  type TossPaymentSnapshot
} from "../payment/toss-payment.gateway";
import {
  CREDIT_COMMAND_REPOSITORY,
  type CreditCommandRepository
} from "./credit-command.repository";
import {
  CREDIT_QUERY_REPOSITORY,
  type CreditQueryRepository
} from "./credit-query.repository";

export const TOSS_PAYMENT_GATEWAY = Symbol("TOSS_PAYMENT_GATEWAY");
export const CREDIT_SERVICE_OPTIONS = Symbol("CREDIT_SERVICE_OPTIONS");

export type CreditServiceOptions = Readonly<{
  clientKey: string;
  tokenSecret: string;
}>;

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

function uncertainCode(error: unknown, fallback: string) {
  return error instanceof TossPaymentGatewayError ? error.code : fallback;
}

function requireInputRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("요청 본문이 올바르지 않습니다.");
  }
  return value as Record<string, unknown>;
}

function requireInputString(
  input: Record<string, unknown>,
  key: string,
  label: string
): string {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestException(`${label}이(가) 필요합니다.`);
  }
  return value.trim();
}

function requireIsoInstant(
  input: Record<string, unknown>,
  key: string,
  label: string
) {
  const raw = requireInputString(input, key, label);
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) {
    throw new BadRequestException(`${label}이(가) 올바른 날짜가 아닙니다.`);
  }
  return parsed.toISOString();
}

@Injectable()
export class CreditService {
  private readonly options: CreditServiceOptions;

  constructor(
    @Inject(CREDIT_COMMAND_REPOSITORY)
    private readonly commandRepository: CreditCommandRepository,
    @Inject(CREDIT_QUERY_REPOSITORY)
    private readonly queryRepository: CreditQueryRepository,
    @Inject(TOSS_PAYMENT_GATEWAY)
    private readonly paymentGateway: TossPaymentGateway,
    @Optional() @Inject(CREDIT_SERVICE_OPTIONS) options?: CreditServiceOptions
  ) {
    this.options = options ?? environmentOptions();
  }

  async requireManager(authorization?: string): Promise<string> {
    const subject = requireBearerSubject(
      authorization,
      this.options.tokenSecret
    );
    await this.queryRepository.assertManagerAccess(subject);
    return subject;
  }

  async createTopupOrder(
    managerId: string,
    input: CreateManagerCreditTopupInput
  ) {
    const body = requireInputRecord(input);
    if (!Number.isSafeInteger(body.amount) || (body.amount as number) <= 0) {
      throw new BadRequestException("충전 금액은 1원 이상의 정수여야 합니다.");
    }
    const { order } = await this.commandRepository.createTopupOrder({
      managerId,
      amount: body.amount as number,
      creationKey: requireInputString(body, "creationKey", "충전 요청 키"),
      returnPath: requireInputString(body, "returnPath", "결제 복귀 경로")
    });
    return {
      order,
      clientKey: this.options.clientKey,
      customerKey: `credit_${createHmac("sha256", this.options.tokenSecret)
        .update(`toss-credit-customer:${managerId}`, "utf8")
        .digest("base64url")}`,
      orderName: "집우집주 크레딧 충전"
    };
  }

  async confirmTopup(
    managerId: string,
    orderId: string,
    input: ConfirmManagerCreditTopupInput
  ): Promise<ManagerCreditTopupOrderView> {
    const body = requireInputRecord(input);
    const paymentKey = requireInputString(body, "paymentKey", "결제 키");
    if (!Number.isSafeInteger(body.amount) || (body.amount as number) <= 0) {
      throw new BadRequestException("결제 금액은 1원 이상의 정수여야 합니다.");
    }
    const amount = body.amount as number;
    const claim = await this.commandRepository.claimTopupConfirmation({
      managerId,
      orderId,
      paymentKey,
      amount
    });
    if (claim.outcome !== "CLAIMED") return claim.order;

    let payment: TossPaymentSnapshot;
    try {
      payment = await this.paymentGateway.confirmPayment({
        paymentKey,
        orderId,
        amount
      });
    } catch (error) {
      if (
        error instanceof TossPaymentGatewayError &&
        error.kind === "DECLINED"
      ) {
        return this.commandRepository.markTopupRejected({
          managerId,
          orderId,
          reason: error.code
        });
      }
      return this.persistUncertain(
        managerId,
        orderId,
        uncertainCode(error, "PAYMENT_CONFIRM_UNKNOWN")
      );
    }

    try {
      this.assertMatchingDonePayment(payment, {
        orderId,
        paymentKey,
        amount
      });
      return (
        await this.commandRepository.finalizeTopup({
          managerId,
          orderId,
          payment
        })
      ).order;
    } catch (_error) {
      return this.persistUncertain(
        managerId,
        orderId,
        "LOCAL_FINALIZE_UNCERTAIN"
      );
    }
  }

  async reconcileTopup(managerId: string, orderId: string) {
    const order = await this.queryRepository.getTopupOrder(managerId, orderId);
    if (
      order.status !== "CONFIRMING" &&
      order.status !== "RECONCILIATION_REQUIRED"
    ) {
      return order;
    }

    let payment: TossPaymentSnapshot;
    try {
      payment = await this.paymentGateway.getPaymentByOrderId(orderId);
    } catch (error) {
      if (
        error instanceof TossPaymentGatewayError &&
        error.kind === "DECLINED"
      ) {
        return this.commandRepository.markTopupRejected({
          managerId,
          orderId,
          reason: error.code
        });
      }
      return this.persistUncertain(
        managerId,
        orderId,
        uncertainCode(error, "PAYMENT_LOOKUP_UNKNOWN")
      );
    }

    if (payment.status === "ABORTED" || payment.status === "EXPIRED") {
      return this.commandRepository.markTopupRejected({
        managerId,
        orderId,
        reason: `PAYMENT_${payment.status}`
      });
    }
    if (payment.status !== "DONE") {
      return this.persistUncertain(
        managerId,
        orderId,
        `PAYMENT_${payment.status || "NONTERMINAL"}`
      );
    }

    try {
      this.assertMatchingDonePayment(payment, {
        orderId,
        paymentKey: order.paymentKey ?? "",
        amount: order.amount
      });
      return (
        await this.commandRepository.finalizeTopup({
          managerId,
          orderId,
          payment
        })
      ).order;
    } catch (_error) {
      return this.persistUncertain(
        managerId,
        orderId,
        "LOCAL_RECONCILIATION_UNCERTAIN"
      );
    }
  }

  async cancelTopup(managerId: string, orderId: string) {
    return this.commandRepository.cancelReadyTopup({ managerId, orderId });
  }

  async getTopupOrder(managerId: string, orderId: string) {
    return this.queryRepository.getTopupOrder(managerId, orderId);
  }

  async getAccount(managerId: string) {
    await this.commandRepository.ensureAccount({ managerId });
    return this.queryRepository.getAccount(managerId);
  }

  async getWorkspace(
    managerId: string,
    page?: {
      ledgerCursor?: string;
      topupCursor?: string;
      paymentCursor?: string;
      limit?: number;
    }
  ) {
    await this.commandRepository.ensureAccount({ managerId });
    return this.queryRepository.getWorkspace(managerId, page);
  }

  async updateAutoPayPolicy(
    managerId: string,
    input: UpdateAutoPayPolicyInput
  ) {
    const body = requireInputRecord(input);
    if (
      body.mode !== "ALWAYS_REQUIRE_APPROVAL" &&
      body.mode !== "AUTO_DEBIT_UNDER_LIMIT"
    ) {
      throw new BadRequestException("지원하지 않는 자동결제 정책입니다.");
    }
    if (
      body.mode === "AUTO_DEBIT_UNDER_LIMIT" &&
      (!Number.isSafeInteger(body.perRequestLimit) ||
        (body.perRequestLimit as number) <= 0)
    ) {
      throw new BadRequestException("자동 차감 한도는 1원 이상의 정수여야 합니다.");
    }
    return this.commandRepository.saveAutoPayPolicy({
      managerId,
      mode: body.mode,
      ...(body.perRequestLimit === undefined
        ? {}
        : { perRequestLimit: body.perRequestLimit as number })
    });
  }

  async evaluateAfterCompletion(input: Readonly<{
    managerId: string;
    paymentRequestId: string;
    completionDecisionId: string;
    actorUserId: string;
  }>) {
    return this.commandRepository.evaluateAfterCompletion(input);
  }

  async settlePaymentRequest(
    managerId: string,
    paymentRequestId: string,
    input: SettleVendorPaymentRequestInput
  ) {
    const body = requireInputRecord(input);
    if (body.mode !== "MANUAL_CREDIT" && body.mode !== "DIRECT") {
      throw new BadRequestException("지원하지 않는 업체 지급 방식입니다.");
    }
    const common = {
      managerId,
      paymentRequestId,
      idempotencyKey: requireInputString(
        body,
        "idempotencyKey",
        "멱등성 키"
      ),
      actorUserId: managerId
    };
    if (body.mode === "DIRECT") {
      const reference = requireInputString(
        body,
        "reference",
        "외부 지급 거래참조"
      );
      if (reference.length > 120) {
        throw new BadRequestException("외부 지급 거래참조는 120자 이하여야 합니다.");
      }
      return this.commandRepository.settlePaymentRequest({
        ...common,
        mode: "DIRECT",
        paidAt: requireIsoInstant(body, "paidAt", "외부 지급 시각"),
        reference
      });
    }
    return this.commandRepository.settlePaymentRequest({
      ...common,
      mode: "MANUAL_CREDIT"
    });
  }

  async reverseCreditPayment(
    managerId: string,
    paymentRequestId: string,
    input: ReverseVendorCreditPaymentInput
  ) {
    const body = requireInputRecord(input);
    return this.commandRepository.reverseCreditPayment({
      managerId,
      paymentRequestId,
      idempotencyKey: requireInputString(body, "idempotencyKey", "멱등성 키"),
      actorUserId: managerId,
      note: requireInputString(body, "note", "취소 사유")
    });
  }

  async voidDirectPayment(
    managerId: string,
    paymentRequestId: string,
    input: VoidVendorDirectPaymentInput
  ) {
    const body = requireInputRecord(input);
    return this.commandRepository.voidDirectPayment({
      managerId,
      paymentRequestId,
      idempotencyKey: requireInputString(body, "idempotencyKey", "멱등성 키"),
      actorUserId: managerId,
      note: requireInputString(body, "note", "취소 사유")
    });
  }

  async cancelPaymentRequest(
    managerId: string,
    paymentRequestId: string,
    input: CancelVendorPaymentRequestInput
  ) {
    const body = requireInputRecord(input);
    return this.commandRepository.cancelPaymentRequest({
      managerId,
      paymentRequestId,
      idempotencyKey: requireInputString(body, "idempotencyKey", "멱등성 키"),
      actorUserId: managerId,
      note: requireInputString(body, "note", "취소 사유")
    });
  }

  private assertMatchingDonePayment(
    payment: TossPaymentSnapshot,
    expected: { orderId: string; paymentKey: string; amount: number }
  ) {
    if (
      payment.status !== "DONE" ||
      payment.orderId !== expected.orderId ||
      payment.paymentKey !== expected.paymentKey ||
      payment.amount !== expected.amount
    ) {
      throw new ConflictException("Toss 결제 결과가 충전 주문과 일치하지 않습니다.");
    }
  }

  private async persistUncertain(
    managerId: string,
    orderId: string,
    reason: string
  ) {
    try {
      return await this.commandRepository.markTopupUncertain({
        managerId,
        orderId,
        reason
      });
    } catch (_error) {
      throw new ServiceUnavailableException(
        "결제 결과 확인이 지연되고 있습니다. 잠시 후 다시 확인해 주세요."
      );
    }
  }
}
