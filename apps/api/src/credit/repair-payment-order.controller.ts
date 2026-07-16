import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post
} from "@nestjs/common";
import type {
  ConfirmRepairPaymentOrderInput,
  CreateRepairPaymentOrderInput,
  RepairPaymentCheckout,
  RepairPaymentOrderPublicView,
  RepairPaymentOrderView,
  RetryRepairPaymentOrderInput
} from "@roomlog/types";
import { CreditService } from "./credit.service";
import type { RepairPaymentActor } from "./repair-payment-order.repository";
import { RepairPaymentOrderService } from "./repair-payment-order.service";
import { publicRepairPaymentOrder } from "./repair-payment-order-public";

function inputValue(input: unknown, key: string): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }
  return (input as Record<string, unknown>)[key];
}

@Controller()
export class RepairPaymentOrderController {
  constructor(
    private readonly credit: CreditService,
    private readonly orders: RepairPaymentOrderService
  ) {}

  @Post("manager/vendor-payment-requests/:id/toss-orders")
  async createManagerOrder(
    @Headers("authorization") authorization: string | undefined,
    @Param("id") paymentRequestId: string,
    @Body() input: CreateRepairPaymentOrderInput
  ) {
    return this.publicResponse(
      await this.orders.createOrder(
        await this.managerActor(authorization),
        paymentRequestId,
        this.createInput(input)
      )
    );
  }

  @Get("manager/repair-payment-orders/:orderId")
  async getManagerOrder(
    @Headers("authorization") authorization: string | undefined,
    @Param("orderId") orderId: string
  ) {
    return this.publicResponse(
      await this.orders.getOrder(await this.managerActor(authorization), orderId)
    );
  }

  @Post("manager/repair-payment-orders/:orderId/confirm")
  async confirmManagerOrder(
    @Headers("authorization") authorization: string | undefined,
    @Param("orderId") orderId: string,
    @Body() input: ConfirmRepairPaymentOrderInput
  ) {
    return this.publicResponse(
      await this.orders.confirmOrder(
        await this.managerActor(authorization),
        orderId,
        this.confirmInput(input)
      )
    );
  }

  @Post("manager/repair-payment-orders/:orderId/reconcile")
  async reconcileManagerOrder(
    @Headers("authorization") authorization: string | undefined,
    @Param("orderId") orderId: string
  ) {
    return this.publicResponse(
      await this.orders.reconcileOrder(
        await this.managerActor(authorization),
        orderId
      )
    );
  }

  @Post("manager/repair-payment-orders/:orderId/cancel")
  async cancelManagerOrder(
    @Headers("authorization") authorization: string | undefined,
    @Param("orderId") orderId: string
  ) {
    return this.publicResponse(
      await this.orders.cancelOrder(
        await this.managerActor(authorization),
        orderId
      )
    );
  }

  @Post("manager/repair-payment-orders/:orderId/retry")
  async retryManagerOrder(
    @Headers("authorization") authorization: string | undefined,
    @Param("orderId") orderId: string,
    @Body() input: RetryRepairPaymentOrderInput
  ) {
    return this.publicResponse(
      await this.orders.retryOrder(
        await this.managerActor(authorization),
        orderId,
        this.retryInput(input)
      )
    );
  }

  @Post("tenant/vendor-payment-requests/:id/toss-orders")
  async createTenantOrder(
    @Headers("authorization") authorization: string | undefined,
    @Param("id") paymentRequestId: string,
    @Body() input: CreateRepairPaymentOrderInput
  ) {
    return this.publicResponse(
      await this.orders.createOrder(
        await this.tenantActor(authorization),
        paymentRequestId,
        this.createInput(input)
      )
    );
  }

  @Get("tenant/repair-payment-orders/:orderId")
  async getTenantOrder(
    @Headers("authorization") authorization: string | undefined,
    @Param("orderId") orderId: string
  ) {
    return this.publicResponse(
      await this.orders.getOrder(await this.tenantActor(authorization), orderId)
    );
  }

  @Post("tenant/repair-payment-orders/:orderId/confirm")
  async confirmTenantOrder(
    @Headers("authorization") authorization: string | undefined,
    @Param("orderId") orderId: string,
    @Body() input: ConfirmRepairPaymentOrderInput
  ) {
    return this.publicResponse(
      await this.orders.confirmOrder(
        await this.tenantActor(authorization),
        orderId,
        this.confirmInput(input)
      )
    );
  }

  @Post("tenant/repair-payment-orders/:orderId/reconcile")
  async reconcileTenantOrder(
    @Headers("authorization") authorization: string | undefined,
    @Param("orderId") orderId: string
  ) {
    return this.publicResponse(
      await this.orders.reconcileOrder(
        await this.tenantActor(authorization),
        orderId
      )
    );
  }

  @Post("tenant/repair-payment-orders/:orderId/cancel")
  async cancelTenantOrder(
    @Headers("authorization") authorization: string | undefined,
    @Param("orderId") orderId: string
  ) {
    return this.publicResponse(
      await this.orders.cancelOrder(await this.tenantActor(authorization), orderId)
    );
  }

  @Post("tenant/repair-payment-orders/:orderId/retry")
  async retryTenantOrder(
    @Headers("authorization") authorization: string | undefined,
    @Param("orderId") orderId: string,
    @Body() input: RetryRepairPaymentOrderInput
  ) {
    return this.publicResponse(
      await this.orders.retryOrder(
        await this.tenantActor(authorization),
        orderId,
        this.retryInput(input)
      )
    );
  }

  private async managerActor(
    authorization?: string
  ): Promise<RepairPaymentActor> {
    return {
      payerRole: "MANAGER",
      payerUserId: await this.credit.requireManager(authorization),
      initiatedBy: "USER_UI"
    };
  }

  private async tenantActor(
    authorization?: string
  ): Promise<RepairPaymentActor> {
    return {
      payerRole: "TENANT",
      payerUserId: await this.orders.requireTenant(authorization),
      initiatedBy: "USER_UI"
    };
  }

  private createInput(input: CreateRepairPaymentOrderInput) {
    return {
      creationKey: inputValue(input, "creationKey") as string,
      returnPath: inputValue(input, "returnPath") as string
    };
  }

  private confirmInput(input: ConfirmRepairPaymentOrderInput) {
    return {
      paymentKey: inputValue(input, "paymentKey") as string,
      amount: inputValue(input, "amount") as number
    };
  }

  private retryInput(input: RetryRepairPaymentOrderInput) {
    return {
      creationKey: inputValue(input, "creationKey") as string,
      returnPath: inputValue(input, "returnPath") as string
    };
  }

  private publicOrder(
    order: RepairPaymentOrderView | RepairPaymentOrderPublicView
  ): RepairPaymentOrderPublicView {
    return "id" in order
      ? publicRepairPaymentOrder(order)
      : order;
  }

  private publicResponse(
    result: RepairPaymentOrderView | RepairPaymentCheckout
  ): RepairPaymentOrderPublicView | RepairPaymentCheckout {
    if ("order" in result) {
      return { ...result, order: this.publicOrder(result.order) };
    }
    return this.publicOrder(result);
  }
}
