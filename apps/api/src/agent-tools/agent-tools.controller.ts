import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
} from "@nestjs/common";
import type { AgentToolInvokeInput } from "@roomlog/types";
import { RoomlogService } from "../roomlog/roomlog.service";
import type { AgentPrincipal } from "./agent-tool-action.repository";
import { AgentToolGateService } from "./agent-tool-gate.service";

const IDENTITY_ARGUMENTS = new Set([
  "tenantId", "payerUserId", "principalUserId", "principalRole",
  "managerId", "landlordId", "userId", "role", "paymentKey",
]);
const MANAGER_RAW_IDS = new Set([
  "vendorId", "ticketId", "complaintId", "billId", "threadId",
  "repairId", "estimateId", "paymentRequestId", "orderId",
]);

function containsForbidden(
  value: unknown,
  role: AgentPrincipal["role"],
  tool: string,
): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsForbidden(item, role, tool));
  }
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) =>
    IDENTITY_ARGUMENTS.has(key) ||
    (key === "amount" && !(role === "LANDLORD" && tool === "credit.topup.prepare")) ||
    (role === "LANDLORD" && MANAGER_RAW_IDS.has(key)) ||
    containsForbidden(child, role, tool),
  );
}

function input(value: unknown, role: AgentPrincipal["role"]): AgentToolInvokeInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("도구 요청 본문이 올바르지 않습니다.");
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["tool", "arguments", "toolCallId"].includes(key))) {
    throw new BadRequestException("허용되지 않은 도구 요청 필드가 있습니다.");
  }
  if (body.arguments !== undefined &&
      (!body.arguments || typeof body.arguments !== "object" || Array.isArray(body.arguments))) {
    throw new BadRequestException("도구 인자는 객체여야 합니다.");
  }
  const tool = typeof body.tool === "string" ? body.tool.trim() : "";
  if (containsForbidden(body.arguments ?? {}, role, tool)) {
    throw new BadRequestException("사용자·대상·금액·결제 식별자는 서버에서 확인합니다.");
  }
  return body as unknown as AgentToolInvokeInput;
}

function confirmationId(value: string) {
  const normalized = value?.trim();
  if (!normalized || normalized.length > 200) {
    throw new BadRequestException("확인 정보가 올바르지 않습니다.");
  }
  return normalized;
}

abstract class RoleAgentToolsController {
  protected constructor(
    protected readonly roomlog: RoomlogService,
    protected readonly gate: AgentToolGateService,
  ) {}

  protected abstract principal(authorization?: string): AgentPrincipal;

  protected invokeFor(authorization: string | undefined, body: unknown) {
    const principal = this.principal(authorization);
    return this.gate.invoke(principal, input(body, principal.role));
  }

  protected async currentFor(authorization?: string) {
    return { pendingAction: await this.gate.current(this.principal(authorization)) };
  }

  protected confirmFor(authorization: string | undefined, id: string) {
    return this.gate.confirm(this.principal(authorization), confirmationId(id));
  }

  protected cancelFor(authorization: string | undefined, id: string) {
    return this.gate.cancel(this.principal(authorization), confirmationId(id));
  }
}

@Controller()
export class TenantAgentToolsController extends RoleAgentToolsController {
  constructor(roomlog: RoomlogService, gate: AgentToolGateService) {
    super(roomlog, gate);
  }

  @Post("tenant/agent-tools/invoke")
  invoke(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    return this.invokeFor(authorization, body);
  }

  @Get("tenant/agent-confirmations/current")
  current(@Headers("authorization") authorization?: string) {
    return this.currentFor(authorization);
  }

  @Post("tenant/agent-confirmations/:confirmationId/confirm")
  confirm(@Headers("authorization") authorization: string | undefined, @Param("confirmationId") id: string) {
    return this.confirmFor(authorization, id);
  }

  @Post("tenant/agent-confirmations/:confirmationId/cancel")
  cancel(@Headers("authorization") authorization: string | undefined, @Param("confirmationId") id: string) {
    return this.cancelFor(authorization, id);
  }

  protected principal(authorization?: string): AgentPrincipal {
    const user = this.roomlog.getUserFromToken(authorization);
    if (!this.roomlog.rolesForUser(user).includes("TENANT")) {
      throw new ForbiddenException("임차인 권한으로만 사용할 수 있습니다.");
    }
    return { userId: user.id, role: "TENANT" };
  }
}

@Controller()
export class ManagerAgentToolsController extends RoleAgentToolsController {
  constructor(roomlog: RoomlogService, gate: AgentToolGateService) {
    super(roomlog, gate);
  }

  @Post("manager/agent-tools/invoke")
  invoke(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    return this.invokeFor(authorization, body);
  }

  @Get("manager/agent-confirmations/current")
  current(@Headers("authorization") authorization?: string) {
    return this.currentFor(authorization);
  }

  @Post("manager/agent-confirmations/:confirmationId/confirm")
  confirm(@Headers("authorization") authorization: string | undefined, @Param("confirmationId") id: string) {
    return this.confirmFor(authorization, id);
  }

  @Post("manager/agent-confirmations/:confirmationId/cancel")
  cancel(@Headers("authorization") authorization: string | undefined, @Param("confirmationId") id: string) {
    return this.cancelFor(authorization, id);
  }

  protected principal(authorization?: string): AgentPrincipal {
    const user = this.roomlog.getUserFromToken(authorization);
    if (!this.roomlog.rolesForUser(user).includes("LANDLORD")) {
      throw new ForbiddenException("관리인 권한으로만 사용할 수 있습니다.");
    }
    return { userId: user.id, role: "LANDLORD" };
  }
}
