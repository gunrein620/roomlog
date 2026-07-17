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
import { AgentToolGateService } from "./agent-tool-gate.service";

const FORBIDDEN_ARGUMENTS = new Set([
  "tenantId",
  "payerUserId",
  "principalUserId",
  "principalRole",
  "managerId",
  "landlordId",
  "userId",
  "role",
  "vendorId",
  "paymentKey",
  "amount",
]);

function input(value: unknown): AgentToolInvokeInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("도구 요청 본문이 올바르지 않습니다.");
  }
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (key) => !["tool", "arguments", "toolCallId"].includes(key),
    )
  ) {
    throw new BadRequestException("허용되지 않은 도구 요청 필드가 있습니다.");
  }
  if (
    body.arguments !== undefined &&
    (!body.arguments ||
      typeof body.arguments !== "object" ||
      Array.isArray(body.arguments))
  ) {
    throw new BadRequestException("도구 인자는 객체여야 합니다.");
  }
  const args = (body.arguments ?? {}) as Record<string, unknown>;
  if (Object.keys(args).some((key) => FORBIDDEN_ARGUMENTS.has(key))) {
    throw new BadRequestException(
      "사용자·업체·금액·결제 식별자는 서버에서 확인합니다.",
    );
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

@Controller()
export class TenantAgentToolsController {
  constructor(
    private readonly roomlog: RoomlogService,
    private readonly gate: AgentToolGateService,
  ) {}

  @Post("tenant/agent-tools/invoke")
  invoke(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown,
  ) {
    return this.gate.invoke(this.principal(authorization), input(body));
  }

  @Get("tenant/agent-confirmations/current")
  async current(@Headers("authorization") authorization: string | undefined) {
    return {
      pendingAction: await this.gate.current(this.principal(authorization)),
    };
  }

  @Post("tenant/agent-confirmations/:confirmationId/confirm")
  confirm(
    @Headers("authorization") authorization: string | undefined,
    @Param("confirmationId") id: string,
  ) {
    return this.gate.confirm(
      this.principal(authorization),
      confirmationId(id),
    );
  }

  @Post("tenant/agent-confirmations/:confirmationId/cancel")
  cancel(
    @Headers("authorization") authorization: string | undefined,
    @Param("confirmationId") id: string,
  ) {
    return this.gate.cancel(
      this.principal(authorization),
      confirmationId(id),
    );
  }

  private principal(authorization?: string) {
    const user = this.roomlog.getUserFromToken(authorization);
    if (!this.roomlog.rolesForUser(user).includes("TENANT")) {
      throw new ForbiddenException("임차인 권한으로만 사용할 수 있습니다.");
    }
    return { userId: user.id, role: "TENANT" as const };
  }
}
