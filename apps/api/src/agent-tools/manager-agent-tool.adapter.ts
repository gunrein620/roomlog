import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import type {
  AgentToolName,
  DecideRepairCompletionInput,
  ManagerAgentCommandInput,
  ManagerAgentToolName,
  ManagerVendorPaymentRequestView,
  RepairPaymentCheckout,
  RepairPaymentOrderView,
  ManagerVendorView,
  VendorCatalogRecord,
  VendorCatalogSearchFilters,
  VendorCatalogSearchResult,
  VendorEstimateReviewInput,
  VendorJobSummary,
} from "@roomlog/types";
import type { RoomlogService } from "../roomlog/roomlog.service";
import type { CreditService } from "../credit/credit.service";
import type { RepairPaymentOrderService } from "../credit/repair-payment-order.service";
import type { RepairPaymentActor } from "../credit/repair-payment-order.repository";
import type { RoomlogManagerVendorDomain } from "../roomlog/services/roomlog-manager-vendor.domain";
import type { RoomlogVendorWorkflowDomain } from "../roomlog/services/roomlog-vendor-workflow.domain";
import type {
  AgentPreparedMutation,
  AgentPrincipal,
  AgentRoleToolAdapter,
} from "./agent-tool-action.repository";
import { AgentResourceRefCodec } from "./agent-resource-ref";

const POLICY = {
  "ticket.query": "IMMEDIATE",
  "billing.summary": "IMMEDIATE",
  "billing.send_dunning": "PREPARE",
  "messaging.list_threads": "IMMEDIATE",
  "messaging.draft_reply": "IMMEDIATE",
  "messaging.send_reply": "PREPARE",
  "vendor.list": "IMMEDIATE",
  "vendor.search": "IMMEDIATE",
  "vendor.register": "PREPARE",
  "vendor.archive": "PREPARE",
  "vendor.assign": "PREPARE",
  "vendor.get_workflow": "IMMEDIATE",
  "vendor.review_estimate": "PREPARE",
  "vendor.review_completion": "PREPARE",
  "credit.summary": "IMMEDIATE",
  "credit.topup.prepare": "PREPARE",
  "repair_payment.list_payable": "IMMEDIATE",
  "repair_payment.prepare": "PREPARE",
  "repair_payment.get": "IMMEDIATE",
  "repair_payment.reconcile": "IMMEDIATE",
  "repair_payment.cancel": "PREPARE",
  "repair_payment.retry": "PREPARE",
} as const satisfies Record<ManagerAgentToolName, "IMMEDIATE" | "PREPARE">;

const TRADES = new Set([
  "plumbing", "electrical", "hvac", "appliance", "locksmith",
  "waterproofing", "cleaning", "general", "other",
]);

function only(args: Record<string, unknown>, allowed: string[]) {
  const set = new Set(allowed);
  if (Object.keys(args).some((key) => !set.has(key))) {
    throw new BadRequestException("서버에서 확인해야 하는 값은 요청 인자로 지정할 수 없습니다.");
  }
}

function optionalText(value: unknown, message: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new BadRequestException(message);
  return value.trim();
}

function requiredText(value: unknown, message: string) {
  const normalized = optionalText(value, message);
  if (!normalized) throw new BadRequestException(message);
  return normalized;
}

type ExistingPendingKind = "billing.send_dunning" | "messaging.send_reply";

export class ManagerAgentToolAdapter implements AgentRoleToolAdapter {
  constructor(
    private readonly roomlog: RoomlogService,
    private readonly refs: AgentResourceRefCodec,
    private readonly managerVendors?: RoomlogManagerVendorDomain,
    private readonly workflows?: RoomlogVendorWorkflowDomain,
    private readonly credit?: CreditService,
    private readonly orders?: RepairPaymentOrderService,
  ) {}

  policy(principal: AgentPrincipal, tool: string) {
    if (principal.role !== "LANDLORD") return undefined;
    return POLICY[tool as keyof typeof POLICY];
  }

  async executeImmediate(
    principal: AgentPrincipal,
    tool: AgentToolName,
    args: Record<string, unknown>,
    _context: { toolCallId: string },
  ): Promise<Record<string, unknown>> {
    this.requireManager(principal);
    if (tool === "ticket.query") {
      only(args, ["text"]);
      const result = this.roomlog.runManagerAgentCommand(principal.userId, {
        command: tool,
        text: optionalText(args.text, "티켓 조회 조건이 올바르지 않습니다."),
      });
      const data = result.data as { matchedTickets?: Array<Record<string, unknown>>; [key: string]: unknown } | undefined;
      return {
        summary: result.summary,
        ...(data ? {
          answer: data.answer,
          scope: data.scope,
          filters: data.filters,
          matches: (data.matchedTickets ?? []).map(({ ticketId, complaintId: _complaintId, ...ticket }) => ({
            ...ticket,
            ticketRef: this.refs.issue(principal, "ticket", String(ticketId)),
          })),
          nextActions: data.nextActions,
          generatedAt: data.generatedAt,
        } : {}),
      };
    }
    if (tool === "billing.summary") {
      only(args, []);
      const result = this.roomlog.runManagerAgentCommand(principal.userId, { command: tool });
      return { summary: result.summary };
    }
    if (tool === "messaging.list_threads") {
      only(args, []);
      const threads = this.roomlog.listManagerMessagingThreads(principal.userId);
      return {
        threads: threads.slice(0, 20).map(({ id, tenantId: _tenantId, contextRef: _contextRef, messages: _messages, ...thread }) => ({
          ...thread,
          threadRef: this.refs.issue(principal, "thread", id),
        })),
      };
    }
    if (tool === "messaging.draft_reply") {
      only(args, ["text", "body"]);
      const result = this.roomlog.runManagerAgentCommand(principal.userId, {
        command: tool,
        text: optionalText(args.text, "답장 요청이 올바르지 않습니다."),
        body: optionalText(args.body, "답장 초안이 올바르지 않습니다."),
      });
      const data = result.data as { draftText?: string } | undefined;
      return { summary: result.summary, draftText: data?.draftText ?? "" };
    }
    if (tool === "vendor.list") {
      const vendors = await this.vendors().list(
        principal.userId,
        this.vendorFilters(args, ["query", "trade", "serviceArea"]),
      );
      return { vendors: vendors.map((vendor) => this.publicRegisteredVendor(principal, vendor)) };
    }
    if (tool === "vendor.search") {
      only(args, ["query", "trade", "serviceArea", "ticketRef"]);
      const query = optionalText(args.query, "업체 검색어가 올바르지 않습니다.");
      if (args.ticketRef !== undefined && (args.trade !== undefined || args.serviceArea !== undefined)) {
        throw new BadRequestException("하자 접수 기준 검색에는 업종·지역을 별도로 지정할 수 없습니다.");
      }
      const results = args.ticketRef === undefined
        ? await this.vendors().searchCatalog(
            principal.userId,
            this.vendorFilters(args, ["query", "trade", "serviceArea"]),
          )
        : await this.vendors().searchAssignmentCandidates(
            principal.userId,
            this.refs.read(principal, "ticket", args.ticketRef).resourceId,
            query,
          );
      return { vendors: results.map((vendor) => this.publicSearchVendor(principal, vendor)) };
    }
    if (tool === "vendor.get_workflow") {
      only(args, ["ticketRef"]);
      const ticketId = this.refs.read(principal, "ticket", args.ticketRef).resourceId;
      const lookup = await this.vendors().findJobByTicket(principal.userId, ticketId);
      return lookup
        ? this.publicJob(principal, lookup.job, lookup.vendor.catalog.businessName)
        : { found: false };
    }
    if (tool === "credit.summary") {
      only(args, []);
      const account = await this.creditService().getAccount(principal.userId);
      return { balance: account.balance, updatedAt: account.updatedAt };
    }
    if (tool === "repair_payment.list_payable") {
      only(args, []);
      const workspace = await this.creditService().getWorkspace(principal.userId, { limit: 100 });
      return {
        items: workspace.paymentRequests
          .filter((request) => this.isManagerPayable(request))
          .map((request) => this.publicPaymentRequest(principal, request)),
      };
    }
    if (tool === "repair_payment.get" || tool === "repair_payment.reconcile") {
      only(args, ["orderRef"]);
      const orderId = this.refs.read(principal, "order", args.orderRef).resourceId;
      const actor = this.paymentActor(principal, _context.toolCallId);
      const order = tool === "repair_payment.get"
        ? await this.paymentOrders().getOrder(actor, orderId)
        : await this.paymentOrders().reconcileOrder(actor, orderId);
      return this.publicPaymentOrder(principal, order);
    }
    throw new BadRequestException("즉시 실행할 수 없는 도구입니다.");
  }

  async prepareMutation(
    principal: AgentPrincipal,
    tool: AgentToolName,
    args: Record<string, unknown>,
  ): Promise<AgentPreparedMutation> {
    this.requireManager(principal);
    if (tool === "credit.topup.prepare" || tool.startsWith("repair_payment.")) {
      return this.preparePaymentMutation(principal, tool, args);
    }
    if (tool !== "billing.send_dunning" && tool !== "messaging.send_reply") {
      return this.prepareVendorMutation(principal, tool, args);
    }
    const kind = tool as ExistingPendingKind;
    only(args, kind === "billing.send_dunning"
      ? ["billRef", "text", "channel", "body"]
      : ["threadRef", "text", "body"]);
    const commandInput: ManagerAgentCommandInput = { command: kind };
    for (const key of ["text", "channel", "body"] as const) {
      const value = optionalText(args[key], "발송 요청 내용이 올바르지 않습니다.");
      if (value) commandInput[key] = value;
    }
    if (kind === "billing.send_dunning" && args.billRef !== undefined) {
      commandInput.billId = this.refs.read(principal, "bill", args.billRef).resourceId;
    }
    if (kind === "messaging.send_reply" && args.threadRef !== undefined) {
      commandInput.threadId = this.refs.read(principal, "thread", args.threadRef).resourceId;
    }
    const resolved = this.roomlog.resolveManagerAgentPendingCommand(
      principal.userId,
      kind,
      commandInput,
    );
    if (resolved.status !== "ready") throw new BadRequestException(resolved.summary);
    const preview = "dunningPreview" in resolved ? resolved.dunningPreview : undefined;
    const thread = kind === "messaging.send_reply" && resolved.commandInput.threadId
      ? this.roomlog.getManagerMessagingThread(principal.userId, resolved.commandInput.threadId)
      : undefined;
    return {
      executorName: kind,
      commandPayload: { kind, commandInput: resolved.commandInput },
      card: {
        title: kind === "billing.send_dunning" ? "연체 독촉 발송 확인" : "임차인 답장 발송 확인",
        target: preview
          ? `${preview.billingMonth} ${preview.tenantName}`
          : resolved.summary,
        ...(preview ? {
          room: [preview.buildingName, preview.unitId].filter(Boolean).join(" "),
          amount: preview.unpaidAmount,
          work: preview.messageText,
        } : {
          room: thread ? [thread.buildingName, thread.unitId].filter(Boolean).join(" ") : undefined,
          work: String(resolved.commandInput.body ?? ""),
        }),
        action: kind === "billing.send_dunning"
          ? "저장된 청구 상태를 다시 확인한 뒤 독촉 메시지를 발송합니다."
          : "대상 대화의 접근 권한을 다시 확인한 뒤 답장을 발송합니다.",
      },
    };
  }

  async executePending(
    principal: AgentPrincipal,
    executorName: string,
    payload: Record<string, unknown>,
    _context: { confirmationId: string; toolCallId: string },
  ): Promise<Record<string, unknown>> {
    this.requireManager(principal);
    if (executorName === "credit.topup.prepare" || executorName.startsWith("repair_payment.")) {
      return this.executePaymentMutation(principal, executorName, payload, _context);
    }
    if (executorName !== "billing.send_dunning" && executorName !== "messaging.send_reply") {
      return this.executeVendorMutation(principal, executorName, payload);
    }
    const commandInput = payload.commandInput;
    if (!commandInput || typeof commandInput !== "object" || Array.isArray(commandInput) ||
        typeof (commandInput as Record<string, unknown>).command !== "string") {
      throw new BadRequestException("보류 작업 정보가 올바르지 않습니다.");
    }
    const storedCommand = commandInput as ManagerAgentCommandInput;
    const resolved = this.roomlog.resolveManagerAgentPendingCommand(
      principal.userId,
      executorName,
      storedCommand,
    );
    if (resolved.status !== "ready") throw new BadRequestException(resolved.summary);
    const result = this.roomlog.runManagerAgentCommand(principal.userId, resolved.commandInput);
    if (result.status !== "executed") throw new BadRequestException(result.summary);
    return { summary: result.summary };
  }

  private requireManager(principal: AgentPrincipal) {
    if (principal.role !== "LANDLORD") {
      throw new ForbiddenException("관리인 권한으로만 사용할 수 있습니다.");
    }
  }

  private vendors() {
    if (!this.managerVendors) throw new BadRequestException("업체 관리 기능을 사용할 수 없습니다.");
    return this.managerVendors;
  }

  private vendorWorkflow() {
    if (!this.workflows) throw new BadRequestException("업체 작업 기능을 사용할 수 없습니다.");
    return this.workflows;
  }

  private creditService() {
    if (!this.credit) throw new BadRequestException("크레딧 기능을 사용할 수 없습니다.");
    return this.credit;
  }

  private paymentOrders() {
    if (!this.orders) throw new BadRequestException("수리비 결제 기능을 사용할 수 없습니다.");
    return this.orders;
  }

  private vendorFilters(args: Record<string, unknown>, allowed: string[]): VendorCatalogSearchFilters {
    only(args, allowed);
    const filters: VendorCatalogSearchFilters = {};
    const query = optionalText(args.query, "업체 검색어가 올바르지 않습니다.");
    const trade = optionalText(args.trade, "업종 정보가 올바르지 않습니다.");
    const serviceArea = optionalText(args.serviceArea, "서비스 지역이 올바르지 않습니다.");
    if (trade && !TRADES.has(trade)) throw new BadRequestException("지원하지 않는 업체 업종입니다.");
    if (query) filters.query = query;
    if (trade) filters.trade = trade;
    if (serviceArea) filters.serviceArea = serviceArea;
    return filters;
  }

  private publicCatalog(principal: AgentPrincipal, catalog: VendorCatalogRecord) {
    const { id, createdAt: _createdAt, updatedAt: _updatedAt, ...publicCatalog } = catalog;
    return { ...publicCatalog, vendorRef: this.refs.issue(principal, "vendor", id) };
  }

  private publicSearchVendor(principal: AgentPrincipal, result: VendorCatalogSearchResult) {
    return {
      ...this.publicCatalog(principal, result.catalog),
      accountStatus: result.accountStatus,
      registrationStatus: result.registrationStatus,
      canAssign: result.canAssign,
    };
  }

  private publicRegisteredVendor(principal: AgentPrincipal, vendor: ManagerVendorView) {
    return {
      ...this.publicCatalog(principal, vendor.catalog),
      status: vendor.status,
      accountStatus: vendor.accountStatus,
      managerNote: vendor.managerNote,
      registeredAt: vendor.registeredAt,
      activeJobCount: vendor.activeJobCount,
      waitingPaymentCount: vendor.waitingPaymentCount,
      completedJobCount: vendor.completedJobCount,
    };
  }

  private publicJob(principal: AgentPrincipal, job: VendorJobSummary, vendorName?: string) {
    const estimate = job.latestEstimate;
    const completion = job.latestCompletion;
    const payment = job.paymentRequest;
    return {
      found: true,
      title: job.title,
      trade: job.trade,
      status: job.status,
      room: job.publicLocation,
      vendor: vendorName,
      updatedAt: job.updatedAt,
      ticketRef: this.refs.issue(principal, "ticket", job.ticketId),
      repairRef: this.refs.issue(principal, "repair", job.repairId, job.ticketId),
      ...(estimate ? {
        estimate: {
          version: estimate.version,
          responseType: estimate.responseType,
          status: estimate.status,
          visitAvailableAt: estimate.visitAvailableAt,
          estimatedDurationMinutes: estimate.estimatedDurationMinutes,
          workDescription: estimate.workDescription,
          declineReason: estimate.declineReason,
          totalAmount: estimate.totalAmount,
          submittedAt: estimate.submittedAt,
          reviewNote: estimate.reviewNote,
          lineItems: estimate.lineItems.map(({ id: _id, ...item }) => item),
          estimateRef: this.refs.issue(principal, "estimate", estimate.id, job.ticketId),
        },
      } : {}),
      ...(completion ? {
        completion: {
          version: completion.version,
          workSummary: completion.workSummary,
          completedAt: completion.completedAt,
          attachmentUrls: completion.attachmentUrls,
          review: completion.review,
          submittedAt: completion.submittedAt,
        },
      } : {}),
      ...(payment ? {
        payment: {
          amount: payment.amount,
          status: payment.status,
          failureReason: payment.failureReason,
          lastAttemptMode: payment.lastAttemptMode,
          createdAt: payment.createdAt,
          processedAt: payment.processedAt,
          paymentRef: this.refs.issue(principal, "payment", payment.id, job.ticketId),
        },
      } : {}),
    };
  }

  private async prepareVendorMutation(
    principal: AgentPrincipal,
    tool: AgentToolName,
    args: Record<string, unknown>,
  ): Promise<AgentPreparedMutation> {
    if (tool === "vendor.register" || tool === "vendor.archive") {
      only(args, ["vendorRef"]);
      const vendorId = this.refs.read(principal, "vendor", args.vendorRef).resourceId;
      const catalog = tool === "vendor.register"
        ? (await this.vendors().searchCatalog(principal.userId, {}))
            .find((item) => item.catalog.id === vendorId)?.catalog
        : (await this.vendors().getDetail(principal.userId, vendorId)).vendor.catalog;
      if (!catalog) throw new BadRequestException("등록 가능한 업체를 찾을 수 없습니다.");
      return {
        executorName: tool,
        commandPayload: { vendorId },
        card: {
          title: tool === "vendor.register" ? "내 업체 등록 확인" : "내 업체 해제 확인",
          target: catalog.businessName,
          vendor: catalog.businessName,
          action: tool === "vendor.register"
            ? "검증된 업체를 내 업체 목록에 등록합니다."
            : "업체를 내 업체 목록에서 보관 처리합니다.",
        },
      };
    }
    if (tool === "vendor.assign") {
      only(args, ["ticketRef", "vendorRef", "requestNote"]);
      const ticketId = this.refs.read(principal, "ticket", args.ticketRef).resourceId;
      const vendorId = this.refs.read(principal, "vendor", args.vendorRef).resourceId;
      const requestNote = requiredText(args.requestNote, "업체 요청 내용을 입력해 주세요.");
      const candidate = (await this.vendors().searchAssignmentCandidates(principal.userId, ticketId))
        .find((item) => item.catalog.id === vendorId);
      if (!candidate?.canAssign) throw new BadRequestException("이 업체는 해당 수리에 배정할 수 없습니다.");
      const ticket = await this.roomlog.getCurrentTicketDetailForManager(principal.userId, ticketId);
      return {
        executorName: tool,
        commandPayload: { ticketId, vendorId, requestNote },
        card: {
          title: "수리 업체 배정 확인",
          target: ticket.complaint.title,
          room: ticket.room ? `${ticket.room.buildingName} ${ticket.room.roomNo}` : undefined,
          vendor: candidate.catalog.businessName,
          work: requestNote,
          action: "접근 권한과 업체 배정 가능 상태를 다시 확인한 뒤 수리 작업을 배정합니다.",
        },
      };
    }
    if (tool === "vendor.review_estimate") {
      only(args, ["repairRef", "estimateRef", "action", "costBearer", "note"]);
      const repair = this.refs.read(principal, "repair", args.repairRef);
      const estimate = this.refs.read(principal, "estimate", args.estimateRef);
      const ticketId = this.sameTicket(repair.complaintId, estimate.complaintId);
      const lookup = await this.requireJob(principal, ticketId, repair.resourceId);
      if (lookup.job.latestEstimate?.id !== estimate.resourceId) {
        throw new BadRequestException("검토할 최신 견적을 찾을 수 없습니다.");
      }
      const action = requiredText(args.action, "견적 검토 방식을 선택해 주세요.");
      const note = optionalText(args.note, "견적 검토 메모가 올바르지 않습니다.");
      if (!["APPROVE", "REQUEST_REVISION", "REJECT"].includes(action)) {
        throw new BadRequestException("지원하지 않는 견적 검토 방식입니다.");
      }
      if (action !== "APPROVE" && !note) {
        throw new BadRequestException("견적 검토 사유를 입력해 주세요.");
      }
      const costBearer = action === "APPROVE"
        ? requiredText(args.costBearer, "비용 부담 주체를 선택해 주세요.")
        : undefined;
      if (costBearer && !["LANDLORD", "TENANT", "PENDING"].includes(costBearer)) {
        throw new BadRequestException("비용 부담 주체를 확인해 주세요.");
      }
      const review = action === "APPROVE"
        ? {
            action,
            costBearer,
            ...(note ? { note } : {}),
          }
        : { action, ...(note ? { note } : {}) };
      return {
        executorName: tool,
        commandPayload: { ticketId, repairId: repair.resourceId, estimateId: estimate.resourceId, review },
        card: {
          title: "업체 견적 검토 확인",
          target: lookup.job.title,
          room: lookup.job.publicLocation,
          vendor: lookup.vendor.catalog.businessName,
          work: lookup.job.latestEstimate.workDescription,
          amount: lookup.job.latestEstimate.totalAmount,
          action: action === "APPROVE"
            ? `견적 승인(${costBearer === "LANDLORD" ? "관리인" : costBearer === "TENANT" ? "세입자" : "부담 주체 미정"})을 실행합니다.`
            : "견적 반려·수정 요청을 실행합니다.",
        },
      };
    }
    if (tool === "vendor.review_completion") {
      only(args, ["repairRef", "decision", "note"]);
      const repair = this.refs.read(principal, "repair", args.repairRef);
      const ticketId = this.ticketClaim(repair.complaintId);
      const lookup = await this.requireJob(principal, ticketId, repair.resourceId);
      if (!lookup.job.latestCompletion) throw new BadRequestException("검토할 완료 보고를 찾을 수 없습니다.");
      const decision = requiredText(args.decision, "완료 검토 방식을 선택해 주세요.");
      const note = optionalText(args.note, "완료 검토 메모가 올바르지 않습니다.");
      if (!["APPROVED", "REJECTED"].includes(decision)) {
        throw new BadRequestException("지원하지 않는 완료 검토 방식입니다.");
      }
      if (decision === "REJECTED" && !note) {
        throw new BadRequestException("완료 반려 사유를 입력해 주세요.");
      }
      return {
        executorName: tool,
        commandPayload: {
          ticketId,
          repairId: repair.resourceId,
          decision: { decision, ...(note ? { note } : {}) },
        },
        card: {
          title: "수리 완료 검토 확인",
          target: lookup.job.title,
          room: lookup.job.publicLocation,
          vendor: lookup.vendor.catalog.businessName,
          work: lookup.job.latestCompletion.workSummary,
          amount: lookup.job.paymentRequest?.amount ?? lookup.job.latestEstimate?.totalAmount,
          action: decision === "APPROVED" ? "수리 완료를 승인합니다." : "수리 완료 보고를 반려합니다.",
        },
      };
    }
    throw new BadRequestException("확인을 준비할 수 없는 도구입니다.");
  }

  private async executeVendorMutation(
    principal: AgentPrincipal,
    executorName: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const vendorId = typeof payload.vendorId === "string" ? payload.vendorId : "";
    if (executorName === "vendor.register") {
      const candidate = (await this.vendors().searchCatalog(principal.userId, {}))
        .find((item) => item.catalog.id === vendorId);
      if (!candidate) throw new BadRequestException("현재 등록 가능한 업체가 아닙니다.");
      const result = await this.vendors().register(principal.userId, vendorId);
      return { summary: `${result.catalog.businessName} 업체를 등록했습니다.` };
    }
    if (executorName === "vendor.archive") {
      await this.vendors().getDetail(principal.userId, vendorId);
      const result = await this.vendors().archive(principal.userId, vendorId);
      return { summary: `${result.catalog.businessName} 업체를 보관 처리했습니다.` };
    }
    if (executorName === "vendor.assign") {
      const ticketId = requiredText(payload.ticketId, "하자 접수 정보를 확인할 수 없습니다.");
      const candidate = (await this.vendors().searchAssignmentCandidates(principal.userId, ticketId))
        .find((item) => item.catalog.id === vendorId);
      if (!candidate?.canAssign) throw new BadRequestException("현재 배정 가능한 업체가 아닙니다.");
      const job = await this.vendorWorkflow().assignVendor(principal.userId, ticketId, {
        vendorId,
        requestNote: requiredText(payload.requestNote, "업체 요청 내용을 확인할 수 없습니다."),
      });
      return { summary: `${candidate.catalog.businessName} 업체를 배정했습니다.`, ...this.publicJob(principal, job, candidate.catalog.businessName) };
    }
    if (executorName === "vendor.review_estimate") {
      const ticketId = requiredText(payload.ticketId, "작업 정보를 확인할 수 없습니다.");
      const repairId = requiredText(payload.repairId, "수리 작업 정보를 확인할 수 없습니다.");
      const estimateId = requiredText(payload.estimateId, "견적 정보를 확인할 수 없습니다.");
      const lookup = await this.requireJob(principal, ticketId, repairId);
      if (lookup.job.latestEstimate?.id !== estimateId) throw new BadRequestException("최신 견적 상태가 변경되었습니다.");
      const review = payload.review as VendorEstimateReviewInput;
      const result = await this.vendorWorkflow().reviewEstimate(principal.userId, repairId, estimateId, review);
      return { summary: "견적 검토를 반영했습니다.", status: result.status };
    }
    if (executorName === "vendor.review_completion") {
      const ticketId = requiredText(payload.ticketId, "작업 정보를 확인할 수 없습니다.");
      const repairId = requiredText(payload.repairId, "수리 작업 정보를 확인할 수 없습니다.");
      await this.requireJob(principal, ticketId, repairId);
      const stored = payload.decision as Record<string, unknown> | undefined;
      const decisionValue = stored?.decision;
      const note = typeof stored?.note === "string" ? stored.note : undefined;
      if (decisionValue !== "APPROVED" && decisionValue !== "REJECTED") {
        throw new BadRequestException("완료 검토 정보를 확인할 수 없습니다.");
      }
      if (decisionValue === "REJECTED" && !note) {
        throw new BadRequestException("완료 반려 사유를 확인할 수 없습니다.");
      }
      const decision: DecideRepairCompletionInput = decisionValue === "APPROVED"
        ? { decision: "APPROVED", ...(note ? { note } : {}) }
        : { decision: "REJECTED", note: note! };
      await this.vendorWorkflow().decideCompletion(principal.userId, repairId, decision);
      return { summary: decision.decision === "APPROVED" ? "수리 완료를 승인했습니다." : "수리 완료 보고를 반려했습니다." };
    }
    throw new BadRequestException("실행할 수 없는 보류 작업입니다.");
  }

  private async requireJob(principal: AgentPrincipal, ticketId: string, repairId: string) {
    const lookup = await this.vendors().findJobByTicket(principal.userId, ticketId);
    if (!lookup || lookup.job.repairId !== repairId) {
      throw new BadRequestException("조회 가능한 수리 작업을 찾을 수 없습니다.");
    }
    return lookup;
  }

  private ticketClaim(value?: string) {
    if (!value) throw new BadRequestException("작업 대상 확인 정보가 올바르지 않습니다.");
    return value;
  }

  private sameTicket(left?: string, right?: string) {
    const ticketId = this.ticketClaim(left);
    if (ticketId !== this.ticketClaim(right)) {
      throw new BadRequestException("수리 작업과 견적 대상이 일치하지 않습니다.");
    }
    return ticketId;
  }

  private async preparePaymentMutation(
    principal: AgentPrincipal,
    tool: AgentToolName,
    args: Record<string, unknown>,
  ): Promise<AgentPreparedMutation> {
    if (tool === "credit.topup.prepare") {
      only(args, ["amount"]);
      if (!Number.isSafeInteger(args.amount) || (args.amount as number) <= 0) {
        throw new BadRequestException("충전 금액은 1원 이상의 정수여야 합니다.");
      }
      const amount = args.amount as number;
      return {
        executorName: tool,
        commandPayload: { amount },
        card: {
          title: "관리자 크레딧 충전 확인",
          target: "관리자 크레딧 계정",
          amount,
          paymentMethod: "TOSS",
          action: "Toss 충전 결제창을 준비합니다. 최종 인증은 결제창에서 직접 진행합니다.",
        },
      };
    }
    if (tool === "repair_payment.prepare") {
      only(args, ["paymentRef", "method"]);
      const paymentId = this.refs.read(principal, "payment", args.paymentRef).resourceId;
      const payment = await this.requirePayment(principal, paymentId);
      const method = requiredText(args.method, "결제 방식을 선택해 주세요.");
      if (method !== "CREDIT" && method !== "TOSS") {
        throw new BadRequestException("관리자 수리비는 크레딧 또는 Toss로 결제할 수 있습니다.");
      }
      if (payment.latestRepairPaymentOrder &&
          payment.latestRepairPaymentOrder.status !== "CANCELLED") {
        throw new ConflictException("기존 결제 주문을 상태 확인·취소·재결제한 뒤 다시 시도해 주세요.");
      }
      return {
        executorName: tool,
        commandPayload: { paymentRequestId: payment.id, method },
        card: this.paymentCard(
          payment,
          method === "CREDIT" ? "크레딧으로 업체 수리비를 차감 지급합니다." :
            "Toss 수리비 결제창을 준비합니다. 최종 인증은 결제창에서 직접 진행합니다.",
          method,
        ),
      };
    }
    if (tool === "repair_payment.cancel" || tool === "repair_payment.retry") {
      only(args, ["orderRef"]);
      const orderId = this.refs.read(principal, "order", args.orderRef).resourceId;
      const order = await this.paymentOrders().getOrder(
        this.paymentActor(principal, "prepare"),
        orderId,
      );
      this.requireMutableOrder(order.status, tool);
      const payment = await this.requirePayment(principal, order.paymentRequestId);
      if (payment.amount !== order.amount) throw new ConflictException("지급 요청과 결제 주문 금액이 일치하지 않습니다.");
      const retry = tool === "repair_payment.retry";
      return {
        executorName: tool,
        commandPayload: { paymentRequestId: payment.id, orderId },
        card: this.paymentCard(
          payment,
          retry
            ? "기존 READY 주문을 취소하고 새 Toss 결제창을 원자적으로 준비합니다."
            : "현재 수리비 결제 주문을 취소합니다.",
          "TOSS",
          retry ? "수리비 재결제 확인" : "수리비 주문 취소 확인",
        ),
      };
    }
    throw new BadRequestException("확인을 준비할 수 없는 결제 도구입니다.");
  }

  private async executePaymentMutation(
    principal: AgentPrincipal,
    executorName: string,
    payload: Record<string, unknown>,
    context: { confirmationId: string; toolCallId: string },
  ): Promise<Record<string, unknown>> {
    if (executorName === "credit.topup.prepare") {
      const amount = payload.amount;
      if (!Number.isSafeInteger(amount) || (amount as number) <= 0) {
        throw new BadRequestException("충전 금액을 확인할 수 없습니다.");
      }
      const checkout = await this.creditService().createTopupOrder(principal.userId, {
        amount: amount as number,
        creationKey: `ai:${context.confirmationId}`,
        returnPath: "/manager/vendor-mgmt/credit",
      });
      const { id: _id, paymentKey: _paymentKey, ...order } = checkout.order;
      return {
        order: {
          ...order,
          orderRef: this.refs.issue(principal, "topup", checkout.order.orderId),
        },
        clientKey: checkout.clientKey,
        customerKey: checkout.customerKey,
        orderName: checkout.orderName,
      };
    }
    if (executorName === "repair_payment.prepare") {
      const paymentRequestId = requiredText(payload.paymentRequestId, "지급 요청 정보를 확인할 수 없습니다.");
      const method = requiredText(payload.method, "결제 방식을 확인할 수 없습니다.");
      const payment = await this.requirePayment(principal, paymentRequestId);
      if (payment.latestRepairPaymentOrder && payment.latestRepairPaymentOrder.status !== "CANCELLED") {
        throw new ConflictException("기존 결제 주문을 상태 확인·취소·재결제한 뒤 다시 시도해 주세요.");
      }
      if (method === "CREDIT") {
        const result = await this.creditService().settlePaymentRequest(
          principal.userId,
          payment.id,
          { mode: "MANUAL_CREDIT", idempotencyKey: `ai:${context.confirmationId}` },
        );
        return {
          summary: `${payment.vendorName ?? "업체"} 수리비를 크레딧으로 지급했습니다.`,
          payment: this.publicPaymentRequest(principal, result.request),
        };
      }
      if (method !== "TOSS") throw new BadRequestException("지원하지 않는 결제 방식입니다.");
      const checkout = await this.paymentOrders().createOrder(
        this.paymentActor(principal, context.toolCallId, context.confirmationId),
        payment.id,
        { creationKey: `ai:${context.confirmationId}`, returnPath: "/manager/vendor-mgmt/credit" },
      );
      return this.publicCheckout(principal, checkout);
    }
    if (executorName === "repair_payment.cancel" || executorName === "repair_payment.retry") {
      const paymentRequestId = requiredText(payload.paymentRequestId, "지급 요청 정보를 확인할 수 없습니다.");
      const orderId = requiredText(payload.orderId, "결제 주문 정보를 확인할 수 없습니다.");
      const actor = this.paymentActor(principal, context.toolCallId, context.confirmationId);
      const order = await this.paymentOrders().getOrder(actor, orderId);
      this.requireMutableOrder(order.status, executorName);
      const payment = await this.requirePayment(principal, paymentRequestId);
      if (order.paymentRequestId !== payment.id || order.amount !== payment.amount) {
        throw new ConflictException("현재 지급 요청과 결제 주문이 일치하지 않습니다.");
      }
      if (executorName === "repair_payment.cancel") {
        return this.publicPaymentOrder(
          principal,
          await this.paymentOrders().cancelOrder(actor, orderId),
        );
      }
      return this.publicCheckout(
        principal,
        await this.paymentOrders().retryOrder(actor, orderId, {
          creationKey: `ai:${context.confirmationId}`,
          returnPath: "/manager/vendor-mgmt/credit",
        }),
      );
    }
    throw new BadRequestException("실행할 수 없는 결제 보류 작업입니다.");
  }

  private async requirePayment(principal: AgentPrincipal, paymentRequestId: string) {
    const workspace = await this.creditService().getWorkspace(principal.userId, { limit: 100 });
    const payment = workspace.paymentRequests.find((item) => item.id === paymentRequestId);
    if (!payment || !this.isManagerPayable(payment)) {
      throw new ConflictException("현재 관리자가 결제할 수 있는 저장된 지급 요청이 없습니다.");
    }
    return payment;
  }

  private isManagerPayable(payment: ManagerVendorPaymentRequestView) {
    return payment.payerRole === "MANAGER" &&
      (payment.status === "PENDING_APPROVAL" || payment.status === "INSUFFICIENT_CREDIT") &&
      Number.isSafeInteger(payment.amount) && payment.amount > 0;
  }

  private publicPaymentRequest(principal: AgentPrincipal, payment: ManagerVendorPaymentRequestView) {
    return {
      paymentRef: this.refs.issue(principal, "payment", payment.id, payment.ticketId),
      vendor: payment.vendorName,
      work: payment.repairTitle,
      room: payment.roomLabel,
      amount: payment.amount,
      status: payment.status,
      failureReason: payment.failureReason,
      createdAt: payment.createdAt,
      processedAt: payment.processedAt,
      ...(payment.latestRepairPaymentOrder
        ? { latestOrder: this.publicPaymentOrder(principal, payment.latestRepairPaymentOrder) }
        : {}),
    };
  }

  private publicPaymentOrder(
    principal: AgentPrincipal,
    order: RepairPaymentOrderView | RepairPaymentCheckout["order"],
  ) {
    return {
      orderRef: this.refs.issue(principal, "order", order.orderId),
      orderId: order.orderId,
      amount: order.amount,
      status: order.status,
      method: order.method,
      failureReason: order.failureReason,
      approvedAt: order.approvedAt,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private publicCheckout(principal: AgentPrincipal, checkout: RepairPaymentCheckout) {
    return {
      order: this.publicPaymentOrder(principal, checkout.order),
      clientKey: checkout.clientKey,
      customerKey: checkout.customerKey,
      orderName: checkout.orderName,
    };
  }

  private paymentActor(
    principal: AgentPrincipal,
    toolCallId: string,
    confirmationId?: string,
  ): RepairPaymentActor {
    return {
      payerRole: "MANAGER",
      payerUserId: principal.userId,
      initiatedBy: "AI_AGENT",
      ...(confirmationId ? { confirmationId } : {}),
      toolCallId,
    };
  }

  private paymentCard(
    payment: ManagerVendorPaymentRequestView,
    action: string,
    paymentMethod: "CREDIT" | "TOSS",
    title = "업체 수리비 결제 확인",
  ) {
    return {
      title,
      target: payment.repairTitle ?? "업체 수리 작업",
      room: payment.roomLabel,
      vendor: payment.vendorName,
      work: payment.repairTitle,
      amount: payment.amount,
      paymentMethod,
      action,
    };
  }

  private requireMutableOrder(status: string, action: string) {
    if (status !== "READY" && status !== "FAILED") {
      throw new ConflictException(
        `${status} 상태의 주문은 ${action.endsWith("retry") ? "재결제" : "취소"}할 수 없습니다.`,
      );
    }
  }
}
