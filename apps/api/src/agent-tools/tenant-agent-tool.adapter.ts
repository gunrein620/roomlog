import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type {
  RepairPaymentCheckout,
  RepairPaymentOrderView,
  TenantAgentToolName,
  TenantVendorWorkflowView,
} from "@roomlog/types";
import type { RepairPaymentOrderService } from "../credit/repair-payment-order.service";
import type { RepairPaymentActor } from "../credit/repair-payment-order.repository";
import type { RoomlogTenantVendorConnectionDomain } from "../roomlog/services/roomlog-tenant-vendor-connection.domain";
import type { RoomlogVendorWorkflowDomain } from "../roomlog/services/roomlog-vendor-workflow.domain";
import type {
  AgentPreparedMutation,
  AgentPrincipal,
  AgentRoleToolAdapter,
} from "./agent-tool-action.repository";
import { AgentResourceRefCodec } from "./agent-resource-ref";

const POLICY = {
  "vendor.search_candidates": "IMMEDIATE",
  "vendor.prepare_connection": "PREPARE",
  "vendor.confirm_connection": "CONFIRM_ONLY",
  "vendor.get_workflow": "IMMEDIATE",
  "vendor.accept_estimate": "PREPARE",
  "vendor.confirm_completion": "PREPARE",
  "repair_payment.list_payable": "IMMEDIATE",
  "repair_payment.prepare": "PREPARE",
  "repair_payment.get": "IMMEDIATE",
  "repair_payment.reconcile": "IMMEDIATE",
  "repair_payment.cancel": "PREPARE",
  "repair_payment.retry": "PREPARE",
} as const satisfies Record<
  TenantAgentToolName,
  "IMMEDIATE" | "PREPARE" | "CONFIRM_ONLY"
>;

function text(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestException(message);
  }
  return value.trim();
}

function optionalText(value: unknown, message: string) {
  return value === undefined ? undefined : text(value, message);
}

function only(args: Record<string, unknown>, allowed: string[]) {
  const allowedSet = new Set(allowed);
  if (Object.keys(args).some((key) => !allowedSet.has(key))) {
    throw new BadRequestException(
      "서버에서 확인해야 하는 값은 요청 인자로 지정할 수 없습니다.",
    );
  }
}

export class TenantAgentToolAdapter implements AgentRoleToolAdapter {
  constructor(
    private readonly connections: RoomlogTenantVendorConnectionDomain,
    private readonly workflows: RoomlogVendorWorkflowDomain,
    private readonly orders: RepairPaymentOrderService,
    private readonly refs: AgentResourceRefCodec,
  ) {}

  policy(principal: AgentPrincipal, tool: string) {
    if (principal.role !== "TENANT") return undefined;
    return POLICY[tool as keyof typeof POLICY];
  }

  async executeImmediate(
    principal: AgentPrincipal,
    tool: TenantAgentToolName,
    args: Record<string, unknown>,
    context: { toolCallId: string },
  ): Promise<Record<string, unknown>> {
    this.requireTenant(principal);
    if (tool === "vendor.search_candidates") {
      only(args, ["complaintId", "query"]);
      const result = await this.connections.search(
        principal.userId,
        text(args.complaintId, "하자 접수 정보가 필요합니다."),
        optionalText(args.query, "업체 검색어가 올바르지 않습니다."),
      );
      return {
        complaint: result.complaint,
        requiredTrade: result.requiredTrade,
        vendors: result.vendors.map(({ vendorId, ...vendor }) => ({
          ...vendor,
          vendorSelectionRef: vendorId,
        })),
      };
    }
    if (tool === "vendor.get_workflow") {
      only(args, ["complaintId"]);
      const complaintId = text(
        args.complaintId,
        "하자 접수 정보가 필요합니다.",
      );
      const workflow = await this.workflows.getTenantWorkflow(
        principal.userId,
        complaintId,
      );
      return workflow
        ? this.publicWorkflow(principal, workflow)
        : { complaintId, found: false };
    }
    if (tool === "repair_payment.list_payable") {
      only(args, []);
      const items = await this.workflows.listTenantPayableWorkflows(
        principal.userId,
      );
      return {
        items: items.map((item) => this.publicWorkflow(principal, item)),
      };
    }
    if (tool === "repair_payment.get" || tool === "repair_payment.reconcile") {
      only(args, ["orderRef"]);
      const claims = this.refs.read(
        principal,
        "order",
        args.orderRef,
      );
      const actor = this.actor(principal, context.toolCallId);
      const order =
        tool === "repair_payment.get"
          ? await this.orders.getOrder(actor, claims.resourceId)
          : await this.orders.reconcileOrder(actor, claims.resourceId);
      return this.publicOrder(principal, order, claims.complaintId);
    }
    throw new BadRequestException("즉시 실행할 수 없는 도구입니다.");
  }

  async prepareMutation(
    principal: AgentPrincipal,
    tool: TenantAgentToolName,
    args: Record<string, unknown>,
  ): Promise<AgentPreparedMutation> {
    this.requireTenant(principal);
    if (tool === "vendor.prepare_connection") {
      only(args, ["complaintId", "vendorSelectionRef", "requestNote"]);
      const complaintId = text(
        args.complaintId,
        "하자 접수 정보가 필요합니다.",
      );
      const requestNote = optionalText(
        args.requestNote,
        "업체 요청 메모가 올바르지 않습니다.",
      );
      const preview = await this.connections.prepare(
        principal.userId,
        complaintId,
        {
          vendorId: text(
            args.vendorSelectionRef,
            "업체 선택 정보가 필요합니다.",
          ),
        },
      );
      return {
        executorName: "vendor.confirm_connection",
        commandPayload: {
          complaintId,
          previewId: preview.previewId,
          ...(requestNote ? { requestNote } : {}),
        },
        card: {
          title: "업체 접수 확인",
          target: preview.complaint.title,
          room: preview.complaint.location,
          vendor: preview.vendor.businessName,
          work: preview.ticket.summary,
          action: "선택한 업체에 수리 요청을 접수합니다.",
        },
      };
    }
    if (tool === "vendor.accept_estimate") {
      only(args, ["repairRef", "estimateRef"]);
      const repair = this.refs.read(principal, "repair", args.repairRef);
      const estimate = this.refs.read(principal, "estimate", args.estimateRef);
      const complaintId = this.sameComplaint(repair, estimate);
      const workflow = await this.requireWorkflow(principal, complaintId);
      this.requireEstimate(workflow, repair.resourceId, estimate.resourceId);
      return {
        executorName: "vendor.accept_estimate",
        commandPayload: {
          complaintId,
          repairId: repair.resourceId,
          estimateId: estimate.resourceId,
        },
        card: {
          title: "견적 승인 확인",
          target: workflow.title,
          room: workflow.publicLocation,
          vendor: workflow.vendor.businessName,
          work: workflow.latestEstimate?.workDescription ?? workflow.title,
          amount: workflow.latestEstimate?.totalAmount,
          action: "저장된 견적을 승인합니다.",
        },
      };
    }
    if (tool === "vendor.confirm_completion") {
      only(args, ["repairRef"]);
      const repair = this.refs.read(principal, "repair", args.repairRef);
      const complaintId = this.complaint(repair);
      const workflow = await this.requireWorkflow(principal, complaintId);
      this.requireCompletion(workflow, repair.resourceId);
      return {
        executorName: "vendor.confirm_completion",
        commandPayload: { complaintId, repairId: repair.resourceId },
        card: {
          title: "수리 완료 승인 확인",
          target: workflow.title,
          room: workflow.publicLocation,
          vendor: workflow.vendor.businessName,
          work: workflow.latestCompletion?.workSummary,
          ...(workflow.paymentRequest
            ? { amount: workflow.paymentRequest.amount }
            : {}),
          action: "업체가 제출한 수리 완료 결과를 승인합니다.",
        },
      };
    }
    if (tool === "repair_payment.prepare") {
      only(args, ["paymentRef", "method"]);
      const payment = this.refs.read(principal, "payment", args.paymentRef);
      const complaintId = this.complaint(payment);
      const workflow = await this.requireWorkflow(principal, complaintId);
      const method = text(args.method, "결제 방식을 선택해 주세요.");
      if (method !== "TOSS" && method !== "DIRECT") {
        throw new BadRequestException("지원하지 않는 결제 방식입니다.");
      }
      this.requirePayable(workflow, payment.resourceId, method);
      return {
        executorName: "repair_payment.prepare",
        commandPayload: {
          complaintId,
          paymentRequestId: payment.resourceId,
          method,
        },
        card: {
          title: method === "TOSS" ? "Toss 수리비 결제 확인" : "직접결제 기록 요청 확인",
          target: workflow.title,
          room: workflow.publicLocation,
          vendor: workflow.vendor.businessName,
          work:
            workflow.latestCompletion?.workSummary ??
            workflow.latestEstimate?.workDescription ??
            workflow.title,
          amount: workflow.paymentRequest?.amount,
          paymentMethod: method,
          action:
            method === "TOSS"
              ? "Toss 결제창을 준비합니다. 최종 인증은 결제창에서 직접 진행합니다."
              : "업체가 입금 수령을 확인할 직접결제 기록을 요청합니다.",
        },
      };
    }
    if (tool === "repair_payment.cancel" || tool === "repair_payment.retry") {
      only(args, ["orderRef"]);
      const orderClaims = this.refs.read(principal, "order", args.orderRef);
      const complaintId = this.complaint(orderClaims);
      const order = await this.orders.getOrder(
        this.actor(principal, "prepare"),
        orderClaims.resourceId,
      );
      this.requireMutableOrder(order.status, tool);
      const workflow = await this.requireWorkflow(principal, complaintId);
      if (
        workflow.latestRepairPaymentOrder?.orderId !== order.orderId ||
        workflow.paymentRequest?.amount !== order.amount
      ) {
        throw new ConflictException("현재 수리비 결제 주문과 일치하지 않습니다.");
      }
      const retry = tool === "repair_payment.retry";
      return {
        executorName: tool,
        commandPayload: { complaintId, orderId: order.orderId },
        card: {
          title: retry ? "수리비 재결제 확인" : "수리비 주문 취소 확인",
          target: workflow.title,
          room: workflow.publicLocation,
          vendor: workflow.vendor.businessName,
          work:
            workflow.latestCompletion?.workSummary ??
            workflow.latestEstimate?.workDescription ??
            workflow.title,
          amount: order.amount,
          paymentMethod: "TOSS",
          action: retry
            ? "기존 READY 주문을 취소하고 새 Toss 결제창을 준비합니다."
            : "현재 수리비 결제 주문을 취소합니다.",
        },
      };
    }
    throw new BadRequestException("확인이 필요한 도구가 아닙니다.");
  }

  async executePending(
    principal: AgentPrincipal,
    executorName: string,
    payload: Record<string, unknown>,
    context: { confirmationId: string; toolCallId: string },
  ): Promise<Record<string, unknown>> {
    this.requireTenant(principal);
    if (executorName === "vendor.confirm_connection") {
      const result = await this.connections.confirm(
        principal.userId,
        text(payload.complaintId, "하자 접수 정보가 올바르지 않습니다."),
        {
          previewId: text(
            payload.previewId,
            "업체 접수 확인 정보가 올바르지 않습니다.",
          ),
          idempotencyKey: `ai:${context.confirmationId}`,
          ...(payload.requestNote
            ? { requestNote: text(payload.requestNote, "요청 메모가 올바르지 않습니다.") }
            : {}),
        },
      );
      const { id: _id, ...request } = result.request;
      return { request, idempotent: result.idempotent };
    }
    if (executorName === "vendor.accept_estimate") {
      const complaintId = text(payload.complaintId, "하자 접수 정보가 올바르지 않습니다.");
      const repairId = text(payload.repairId, "수리 작업 정보가 올바르지 않습니다.");
      const estimateId = text(payload.estimateId, "견적 정보가 올바르지 않습니다.");
      this.requireEstimate(
        await this.requireWorkflow(principal, complaintId),
        repairId,
        estimateId,
      );
      return this.publicWorkflow(
        principal,
        await this.workflows.reviewTenantEstimate(
          principal.userId,
          repairId,
          estimateId,
          { action: "APPROVE" },
        ),
      );
    }
    if (executorName === "vendor.confirm_completion") {
      const complaintId = text(payload.complaintId, "하자 접수 정보가 올바르지 않습니다.");
      const repairId = text(payload.repairId, "수리 작업 정보가 올바르지 않습니다.");
      this.requireCompletion(
        await this.requireWorkflow(principal, complaintId),
        repairId,
      );
      return this.publicWorkflow(
        principal,
        await this.workflows.decideTenantCompletion(
          principal.userId,
          repairId,
          { decision: "APPROVED" },
        ),
      );
    }
    if (executorName === "repair_payment.prepare") {
      const complaintId = text(payload.complaintId, "하자 접수 정보가 올바르지 않습니다.");
      const paymentRequestId = text(
        payload.paymentRequestId,
        "지급 요청 정보가 올바르지 않습니다.",
      );
      const method = text(payload.method, "결제 방식이 올바르지 않습니다.");
      const workflow = await this.requireWorkflow(principal, complaintId);
      if (method !== "TOSS" && method !== "DIRECT") {
        throw new BadRequestException("지원하지 않는 결제 방식입니다.");
      }
      this.requirePayable(workflow, paymentRequestId, method);
      if (method === "DIRECT") {
        return this.publicPayment(
          await this.workflows.requestTenantDirectPayment(
            principal.userId,
            paymentRequestId,
            { idempotencyKey: `ai:${context.confirmationId}` },
          ),
        );
      }
      const checkout = await this.orders.createOrder(
        this.actor(principal, context.toolCallId, context.confirmationId),
        paymentRequestId,
        { creationKey: `ai:${context.confirmationId}`, returnPath: "/living" },
      );
      return {
        order: this.publicOrder(principal, checkout.order, complaintId),
        clientKey: checkout.clientKey,
        customerKey: checkout.customerKey,
        orderName: checkout.orderName,
      };
    }
    if (
      executorName === "repair_payment.cancel" ||
      executorName === "repair_payment.retry"
    ) {
      const complaintId = text(payload.complaintId, "하자 접수 정보가 올바르지 않습니다.");
      const orderId = text(payload.orderId, "결제 주문 정보가 올바르지 않습니다.");
      const actor = this.actor(
        principal,
        context.toolCallId,
        context.confirmationId,
      );
      const current = await this.orders.getOrder(actor, orderId);
      this.requireMutableOrder(current.status, executorName);
      const workflow = await this.requireWorkflow(principal, complaintId);
      if (
        workflow.latestRepairPaymentOrder?.orderId !== current.orderId ||
        workflow.paymentRequest?.amount !== current.amount
      ) {
        throw new ConflictException("현재 수리비 결제 주문과 일치하지 않습니다.");
      }
      if (executorName === "repair_payment.cancel") {
        return this.publicOrder(
          principal,
          await this.orders.cancelOrder(actor, orderId),
          complaintId,
        );
      }
      const checkout = await this.orders.retryOrder(actor, orderId, {
        creationKey: `ai:${context.confirmationId}`,
        returnPath: "/living",
      });
      return {
        order: this.publicOrder(principal, checkout.order, complaintId),
        clientKey: checkout.clientKey,
        customerKey: checkout.customerKey,
        orderName: checkout.orderName,
      };
    }
    throw new BadRequestException("허용되지 않은 확인 작업입니다.");
  }

  private requireTenant(principal: AgentPrincipal) {
    if (principal.role !== "TENANT") {
      throw new ForbiddenException("임차인 도구에 접근할 수 없습니다.");
    }
  }

  private actor(
    principal: AgentPrincipal,
    toolCallId: string,
    confirmationId?: string,
  ): RepairPaymentActor {
    return {
      payerRole: "TENANT",
      payerUserId: principal.userId,
      initiatedBy: "AI_AGENT",
      ...(confirmationId ? { confirmationId } : {}),
      toolCallId,
    };
  }

  private publicWorkflow(
    principal: AgentPrincipal,
    workflow: TenantVendorWorkflowView,
  ): Record<string, unknown> {
    const estimate = workflow.latestEstimate;
    const completion = workflow.latestCompletion;
    const payment = workflow.paymentRequest;
    return {
      complaintId: workflow.complaintId,
      repairRef: this.refs.issue(
        principal,
        "repair",
        workflow.repairId,
        workflow.complaintId,
      ),
      title: workflow.title,
      room: workflow.publicLocation,
      status: workflow.status,
      vendor: workflow.vendor,
      ...(workflow.scheduledAt ? { scheduledAt: workflow.scheduledAt } : {}),
      ...(estimate
        ? {
            estimate: {
              estimateRef: this.refs.issue(
                principal,
                "estimate",
                estimate.id,
                workflow.complaintId,
              ),
              version: estimate.version,
              responseType: estimate.responseType,
              status: estimate.status,
              ...(estimate.visitAvailableAt
                ? { visitAvailableAt: estimate.visitAvailableAt }
                : {}),
              ...(estimate.estimatedDurationMinutes === undefined
                ? {}
                : { estimatedDurationMinutes: estimate.estimatedDurationMinutes }),
              ...(estimate.workDescription
                ? { workDescription: estimate.workDescription }
                : {}),
              ...(estimate.totalAmount === undefined
                ? {}
                : { totalAmount: estimate.totalAmount }),
              ...(estimate.submittedAt
                ? { submittedAt: estimate.submittedAt }
                : {}),
              lineItems: estimate.lineItems.map(({ id: _id, ...item }) => item),
            },
          }
        : {}),
      ...(completion
        ? {
            completion: {
              version: completion.version,
              origin: completion.origin,
              workSummary: completion.workSummary,
              completedAt: completion.completedAt,
              ...(completion.attachmentUrls
                ? { attachmentUrls: completion.attachmentUrls }
                : {}),
              ...(completion.review ? { review: completion.review } : {}),
              submittedAt: completion.submittedAt,
            },
          }
        : {}),
      ...(payment
        ? {
            payment: {
              paymentRef: this.refs.issue(
                principal,
                "payment",
                payment.id,
                workflow.complaintId,
              ),
              amount: payment.amount,
              status: payment.status,
              ...(payment.failureReason
                ? { failureReason: payment.failureReason }
                : {}),
              ...(payment.lastAttemptMode
                ? { lastAttemptMode: payment.lastAttemptMode }
                : {}),
              createdAt: payment.createdAt,
              ...(payment.processedAt ? { processedAt: payment.processedAt } : {}),
            },
          }
        : {}),
      ...(workflow.latestRepairPaymentOrder
        ? {
            latestOrder: this.publicOrder(
              principal,
              workflow.latestRepairPaymentOrder,
              workflow.complaintId,
            ),
          }
        : {}),
      updatedAt: workflow.updatedAt,
    };
  }

  private publicOrder(
    principal: AgentPrincipal,
    order: RepairPaymentOrderView | RepairPaymentCheckout["order"],
    complaintId?: string,
  ) {
    return {
      orderRef: this.refs.issue(
        principal,
        "order",
        order.orderId,
        complaintId,
      ),
      orderId: order.orderId,
      amount: order.amount,
      status: order.status,
      ...(order.method ? { method: order.method } : {}),
      ...(order.failureReason ? { failureReason: order.failureReason } : {}),
      ...(order.approvedAt ? { approvedAt: order.approvedAt } : {}),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private async requireWorkflow(
    principal: AgentPrincipal,
    complaintId: string,
  ) {
    const workflow = await this.workflows.getTenantWorkflow(
      principal.userId,
      complaintId,
    );
    if (!workflow) {
      throw new NotFoundException("조회 가능한 업체 작업을 찾을 수 없습니다.");
    }
    return workflow;
  }

  private complaint(claims: { complaintId?: string }) {
    return text(claims.complaintId, "하자 접수 확인 정보가 올바르지 않습니다.");
  }

  private sameComplaint(
    first: { complaintId?: string },
    second: { complaintId?: string },
  ) {
    const complaintId = this.complaint(first);
    if (complaintId !== this.complaint(second)) {
      throw new BadRequestException("서로 다른 하자 접수의 정보를 함께 사용할 수 없습니다.");
    }
    return complaintId;
  }

  private requireEstimate(
    workflow: TenantVendorWorkflowView,
    repairId: string,
    estimateId: string,
  ) {
    const estimate = workflow.latestEstimate;
    if (
      workflow.repairId !== repairId ||
      !estimate ||
      estimate.id !== estimateId ||
      estimate.responseType !== "FIXED_ESTIMATE" ||
      estimate.status !== "SUBMITTED" ||
      !Number.isSafeInteger(estimate.totalAmount) ||
      (estimate.totalAmount ?? 0) <= 0
    ) {
      throw new ConflictException("현재 승인할 수 있는 저장 견적과 일치하지 않습니다.");
    }
  }

  private requireCompletion(
    workflow: TenantVendorWorkflowView,
    repairId: string,
  ) {
    if (
      workflow.repairId !== repairId ||
      !workflow.latestCompletion ||
      workflow.latestCompletion.review
    ) {
      throw new ConflictException("현재 승인할 수 있는 수리 완료 결과가 없습니다.");
    }
  }

  private requirePayable(
    workflow: TenantVendorWorkflowView,
    paymentRequestId: string,
    method: "TOSS" | "DIRECT",
  ) {
    const payment = workflow.paymentRequest;
    if (
      !payment ||
      payment.id !== paymentRequestId ||
      payment.status !== "PENDING_APPROVAL" ||
      payment.lastAttemptMode === "DIRECT" ||
      !Number.isSafeInteger(payment.amount) ||
      payment.amount <= 0
    ) {
      throw new ConflictException("현재 결제할 수 있는 저장된 지급 요청이 없습니다.");
    }
    const orderStatus = workflow.latestRepairPaymentOrder?.status;
    if (
      orderStatus &&
      (method === "TOSS"
        ? orderStatus !== "CANCELLED"
        : ["READY", "CONFIRMING", "RECONCILIATION_REQUIRED"].includes(
            orderStatus,
          ))
    ) {
      throw new ConflictException(
        "기존 결제 주문을 상태 확인·취소·재결제한 뒤 다시 시도해 주세요.",
      );
    }
  }

  private requireMutableOrder(status: string, action: string) {
    if (status !== "READY" && status !== "FAILED") {
      throw new ConflictException(
        `${status} 상태의 주문은 ${action.endsWith("retry") ? "재결제" : "취소"}할 수 없습니다.`,
      );
    }
  }

  private publicPayment(payment: {
    amount: number;
    status: string;
    failureReason?: string;
    lastAttemptMode?: string;
    createdAt: string;
    processedAt?: string;
  }) {
    return {
      amount: payment.amount,
      status: payment.status,
      ...(payment.failureReason ? { failureReason: payment.failureReason } : {}),
      ...(payment.lastAttemptMode
        ? { lastAttemptMode: payment.lastAttemptMode }
        : {}),
      createdAt: payment.createdAt,
      ...(payment.processedAt ? { processedAt: payment.processedAt } : {}),
    };
  }
}
