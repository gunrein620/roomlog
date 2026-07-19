import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query
} from "@nestjs/common";
import type {
  CancelVendorPaymentRequestInput,
  ConfirmManagerCreditTopupInput,
  CreateGaraVendorCreditCheckoutInput,
  CreateGaraVendorPayoutInput,
  CreateManagerCreditTopupInput,
  ManagerCreditAccountView,
  ManagerCreditTopupOrderPublicView,
  ManagerCreditTopupOrderView,
  ManagerCreditWorkspace,
  ManagerCreditWorkspacePublicView,
  ManagerVendorPaymentRequestPublicView,
  ManagerVendorPaymentRequestView,
  ReverseVendorCreditPaymentInput,
  SettleVendorPaymentRequestInput,
  UpdateAutoPayPolicyInput,
  VoidVendorDirectPaymentInput
} from "@roomlog/types";
import { CreditService } from "./credit.service";
import { publicRepairPaymentOrder } from "./repair-payment-order-public";

function publicTopupOrder(
  order: ManagerCreditTopupOrderView
): ManagerCreditTopupOrderPublicView {
  const { id: _id, paymentKey: _paymentKey, ...visible } = order;
  return visible;
}

function publicAccount(account: ManagerCreditAccountView) {
  const { id: _id, ...visible } = account;
  return visible;
}

function publicPaymentRequest(
  request: ManagerVendorPaymentRequestView
): ManagerVendorPaymentRequestPublicView {
  return {
    id: request.id,
    repairId: request.repairId,
    ...(request.ticketId ? { ticketId: request.ticketId } : {}),
    ...(request.vendorName ? { vendorName: request.vendorName } : {}),
    ...(request.repairTitle ? { repairTitle: request.repairTitle } : {}),
    ...(request.roomLabel ? { roomLabel: request.roomLabel } : {}),
    payerRole: request.payerRole,
    amount: request.amount,
    status: request.status,
    ...(request.failureReason ? { failureReason: request.failureReason } : {}),
    ...(request.directPaidAt ? { directPaidAt: request.directPaidAt } : {}),
    ...(request.directPaymentReference
      ? { directPaymentReference: request.directPaymentReference }
      : {}),
    ...(request.latestRepairPaymentOrder
      ? {
          latestRepairPaymentOrder: publicRepairPaymentOrder(
            request.latestRepairPaymentOrder
          )
        }
      : {}),
    createdAt: request.createdAt,
    ...(request.processedAt ? { processedAt: request.processedAt } : {})
  };
}

function publicWorkspace(
  workspace: ManagerCreditWorkspace
): ManagerCreditWorkspacePublicView {
  return {
    account: publicAccount(workspace.account),
    policy: workspace.policy,
    ledgerEntries: workspace.ledgerEntries.map(
      ({ id: _id, referenceId: _referenceId, reversesLedgerEntryId: _reversal, ...entry }) => entry
    ),
    topupOrders: workspace.topupOrders.map(publicTopupOrder),
    paymentRequests: workspace.paymentRequests.map(publicPaymentRequest),
    ...(workspace.nextLedgerCursor
      ? { nextLedgerCursor: encodeCursor("ledger", workspace.nextLedgerCursor) }
      : {}),
    ...(workspace.nextTopupCursor
      ? { nextTopupCursor: encodeCursor("topup", workspace.nextTopupCursor) }
      : {}),
    ...(workspace.nextPaymentCursor
      ? { nextPaymentCursor: encodeCursor("payment", workspace.nextPaymentCursor) }
      : {})
  };
}

function encodeCursor(kind: string, id: string): string {
  return Buffer.from(`${kind}:${id}`, "utf8").toString("base64url");
}

function decodeCursor(
  kind: "ledger" | "topup" | "payment",
  value?: string
): string | undefined {
  if (!value?.trim()) return undefined;
  try {
    const decoded = Buffer.from(value.trim(), "base64url").toString("utf8");
    const prefix = `${kind}:`;
    if (!decoded.startsWith(prefix) || !decoded.slice(prefix.length).trim()) {
      throw new Error("invalid cursor");
    }
    return decoded.slice(prefix.length);
  } catch {
    throw new BadRequestException("조회 위치가 올바르지 않습니다.");
  }
}

function optionalPositiveInteger(value: string | undefined) {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

@Controller()
export class CreditController {
  constructor(private readonly credit: CreditService) {}

  @Post("gara/vendor-credit-checkouts")
  async createGaraVendorCreditCheckout(
    @Body() input: CreateGaraVendorCreditCheckoutInput
  ) {
    const checkout =
      await this.credit.createGaraVendorCreditCheckout(input);
    return { ...checkout, order: publicTopupOrder(checkout.order) };
  }

  @Get("gara/vendor-credit-checkouts/:orderId")
  async getGaraVendorCreditCheckout(@Param("orderId") orderId: string) {
    const garaOrder = await this.credit.getGaraTopupOrder(orderId);
    return publicTopupOrder(
      await this.credit.getTopupOrder(garaOrder.managerId, orderId)
    );
  }

  @Post("gara/vendor-credit-checkouts/:orderId/confirm")
  async confirmGaraVendorCreditCheckout(
    @Param("orderId") orderId: string,
    @Body() input: ConfirmManagerCreditTopupInput
  ) {
    const garaOrder = await this.credit.getGaraTopupOrder(orderId);
    return publicTopupOrder(
      await this.credit.confirmTopup(
        garaOrder.managerId,
        orderId,
        input,
        garaOrder.managerVendorId
      )
    );
  }

  @Post("gara/vendor-credit-checkouts/:orderId/cancel")
  async cancelGaraVendorCreditCheckout(@Param("orderId") orderId: string) {
    const garaOrder = await this.credit.getGaraTopupOrder(orderId);
    return publicTopupOrder(
      await this.credit.cancelTopup(garaOrder.managerId, orderId)
    );
  }

  @Get("manager/credits/account")
  async getAccount(@Headers("authorization") authorization?: string) {
    const managerId = await this.credit.requireManager(authorization);
    return publicAccount(await this.credit.getAccount(managerId));
  }

  @Get("manager/credits")
  async getWorkspace(
    @Headers("authorization") authorization?: string,
    @Query("ledgerCursor") ledgerCursor?: string,
    @Query("topupCursor") topupCursor?: string,
    @Query("paymentCursor") paymentCursor?: string,
    @Query("limit") limit?: string
  ) {
    const managerId = await this.credit.requireManager(authorization);
    const decodedLedgerCursor = decodeCursor("ledger", ledgerCursor);
    const decodedTopupCursor = decodeCursor("topup", topupCursor);
    const decodedPaymentCursor = decodeCursor("payment", paymentCursor);
    return publicWorkspace(await this.credit.getWorkspace(managerId, {
      ...(decodedLedgerCursor
        ? { ledgerCursor: decodedLedgerCursor }
        : {}),
      ...(decodedTopupCursor
        ? { topupCursor: decodedTopupCursor }
        : {}),
      ...(decodedPaymentCursor
        ? { paymentCursor: decodedPaymentCursor }
        : {}),
      ...(optionalPositiveInteger(limit) === undefined
        ? {}
        : { limit: optionalPositiveInteger(limit) })
    }));
  }

  @Post("manager/credits/topup-orders")
  async createTopupOrder(
    @Headers("authorization") authorization: string | undefined,
    @Body() input: CreateManagerCreditTopupInput
  ) {
    const managerId = await this.credit.requireManager(authorization);
    const checkout = await this.credit.createTopupOrder(managerId, input);
    return { ...checkout, order: publicTopupOrder(checkout.order) };
  }

  @Post("manager/gara/vendor-payout-requests")
  async createGaraVendorPayout(
    @Headers("authorization") authorization: string | undefined,
    @Body() input: CreateGaraVendorPayoutInput
  ) {
    const managerId = await this.credit.requireManager(authorization);
    const result = await this.credit.createGaraVendorPayout(managerId, input);
    return { request: result.request, account: publicAccount(result.account) };
  }

  @Get("manager/credits/topup-orders/:orderId")
  async getTopupOrder(
    @Headers("authorization") authorization: string | undefined,
    @Param("orderId") orderId: string
  ) {
    const managerId = await this.credit.requireManager(authorization);
    return publicTopupOrder(await this.credit.getTopupOrder(managerId, orderId));
  }

  @Post("manager/credits/topup-orders/:orderId/confirm")
  async confirmTopup(
    @Headers("authorization") authorization: string | undefined,
    @Param("orderId") orderId: string,
    @Body() input: ConfirmManagerCreditTopupInput
  ) {
    const managerId = await this.credit.requireManager(authorization);
    return publicTopupOrder(await this.credit.confirmTopup(managerId, orderId, input));
  }

  @Post("manager/credits/topup-orders/:orderId/reconcile")
  async reconcileTopup(
    @Headers("authorization") authorization: string | undefined,
    @Param("orderId") orderId: string
  ) {
    const managerId = await this.credit.requireManager(authorization);
    return publicTopupOrder(await this.credit.reconcileTopup(managerId, orderId));
  }

  @Post("manager/credits/topup-orders/:orderId/cancel")
  async cancelTopup(
    @Headers("authorization") authorization: string | undefined,
    @Param("orderId") orderId: string
  ) {
    const managerId = await this.credit.requireManager(authorization);
    return publicTopupOrder(await this.credit.cancelTopup(managerId, orderId));
  }

  @Patch("manager/credits/auto-pay-policy")
  async updateAutoPayPolicy(
    @Headers("authorization") authorization: string | undefined,
    @Body() input: UpdateAutoPayPolicyInput
  ) {
    const managerId = await this.credit.requireManager(authorization);
    return this.credit.updateAutoPayPolicy(managerId, input);
  }

  @Post("manager/vendor-payment-requests/:paymentRequestId/settle")
  async settlePaymentRequest(
    @Headers("authorization") authorization: string | undefined,
    @Param("paymentRequestId") paymentRequestId: string,
    @Body() input: SettleVendorPaymentRequestInput
  ) {
    const managerId = await this.credit.requireManager(authorization);
    const result = await this.credit.settlePaymentRequest(
      managerId,
      paymentRequestId,
      input
    );
    return publicPaymentRequest(result.request);
  }

  @Post("manager/vendor-payment-requests/:paymentRequestId/reverse-credit")
  async reverseCreditPayment(
    @Headers("authorization") authorization: string | undefined,
    @Param("paymentRequestId") paymentRequestId: string,
    @Body() input: ReverseVendorCreditPaymentInput
  ) {
    const managerId = await this.credit.requireManager(authorization);
    return publicPaymentRequest(
      await this.credit.reverseCreditPayment(managerId, paymentRequestId, input)
    );
  }

  @Post("manager/vendor-payment-requests/:paymentRequestId/void-direct")
  async voidDirectPayment(
    @Headers("authorization") authorization: string | undefined,
    @Param("paymentRequestId") paymentRequestId: string,
    @Body() input: VoidVendorDirectPaymentInput
  ) {
    const managerId = await this.credit.requireManager(authorization);
    return publicPaymentRequest(
      await this.credit.voidDirectPayment(managerId, paymentRequestId, input)
    );
  }

  @Post("manager/vendor-payment-requests/:paymentRequestId/cancel")
  async cancelPaymentRequest(
    @Headers("authorization") authorization: string | undefined,
    @Param("paymentRequestId") paymentRequestId: string,
    @Body() input: CancelVendorPaymentRequestInput
  ) {
    const managerId = await this.credit.requireManager(authorization);
    return publicPaymentRequest(
      await this.credit.cancelPaymentRequest(managerId, paymentRequestId, input)
    );
  }
}
