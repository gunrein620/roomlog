import {
  Inject,
  Injectable,
  Module,
  ServiceUnavailableException,
  type OnModuleDestroy,
} from "@nestjs/common";
import { CreditModule } from "../credit/credit.module";
import { CreditService } from "../credit/credit.service";
import { RepairPaymentOrderService } from "../credit/repair-payment-order.service";
import { RoomlogModule } from "../roomlog/roomlog.module";
import { RoomlogService } from "../roomlog/roomlog.service";
import { RoomlogManagerVendorDomain } from "../roomlog/services/roomlog-manager-vendor.domain";
import { RoomlogTenantVendorConnectionDomain } from "../roomlog/services/roomlog-tenant-vendor-connection.domain";
import { RoomlogVendorWorkflowDomain } from "../roomlog/services/roomlog-vendor-workflow.domain";
import {
  AGENT_ROLE_TOOL_ADAPTER,
  AGENT_TOOL_ACTION_REPOSITORY,
  type AgentToolActionRepository,
} from "./agent-tool-action.repository";
import { AgentToolGateService } from "./agent-tool-gate.service";
import { AgentRoleToolRouter } from "./agent-role-tool.router";
import { AgentResourceRefCodec } from "./agent-resource-ref";
import { ManagerAgentToolAdapter } from "./manager-agent-tool.adapter";
import { ManagerCopilotActionGatewayService } from "./manager-copilot-action.gateway";
import { PrismaAgentToolActionRepository } from "./prisma-agent-tool-action.repository";
import { TenantAgentToolAdapter } from "./tenant-agent-tool.adapter";
import {
  ManagerAgentToolsController,
  TenantAgentToolsController,
} from "./agent-tools.controller";

const unavailable = async (): Promise<never> => {
  throw new ServiceUnavailableException(
    "DATABASE_URL이 없어 AI 도구 실행 기록을 처리할 수 없습니다.",
  );
};

function unavailableRepository(): AgentToolActionRepository {
  return {
    beginImmediate: unavailable,
    createPending: unavailable,
    current: unavailable,
    claim: unavailable,
    complete: unavailable,
    fail: unavailable,
    cancel: unavailable,
  };
}

@Injectable()
class AgentToolActionLifecycle implements OnModuleDestroy {
  constructor(
    @Inject(AGENT_TOOL_ACTION_REPOSITORY)
    private readonly repository: AgentToolActionRepository,
  ) {}

  async onModuleDestroy() {
    await (
      this.repository as AgentToolActionRepository & { close?: () => Promise<void> }
    ).close?.();
  }
}

@Module({
  imports: [RoomlogModule, CreditModule],
  controllers: [TenantAgentToolsController, ManagerAgentToolsController],
  providers: [
    {
      provide: AGENT_TOOL_ACTION_REPOSITORY,
      useFactory: () => {
        const databaseUrl = process.env.DATABASE_URL?.trim();
        return databaseUrl
          ? new PrismaAgentToolActionRepository(databaseUrl)
          : unavailableRepository();
      },
    },
    {
      provide: AgentResourceRefCodec,
      useFactory: () => new AgentResourceRefCodec(),
    },
    {
      provide: TenantAgentToolAdapter,
      inject: [
        RoomlogTenantVendorConnectionDomain,
        RoomlogVendorWorkflowDomain,
        RepairPaymentOrderService,
        AgentResourceRefCodec,
      ],
      useFactory: (
        connections: RoomlogTenantVendorConnectionDomain,
        workflows: RoomlogVendorWorkflowDomain,
        orders: RepairPaymentOrderService,
        refs: AgentResourceRefCodec,
      ) => new TenantAgentToolAdapter(connections, workflows, orders, refs),
    },
    {
      provide: ManagerAgentToolAdapter,
      inject: [
        RoomlogService,
        AgentResourceRefCodec,
        RoomlogManagerVendorDomain,
        RoomlogVendorWorkflowDomain,
        CreditService,
        RepairPaymentOrderService,
      ],
      useFactory: (
        roomlog: RoomlogService,
        refs: AgentResourceRefCodec,
        vendors: RoomlogManagerVendorDomain,
        workflows: RoomlogVendorWorkflowDomain,
        credit: CreditService,
        orders: RepairPaymentOrderService,
      ) => new ManagerAgentToolAdapter(
        roomlog,
        refs,
        vendors,
        workflows,
        credit,
        orders,
      ),
    },
    {
      provide: AgentRoleToolRouter,
      inject: [TenantAgentToolAdapter, ManagerAgentToolAdapter],
      useFactory: (
        tenant: TenantAgentToolAdapter,
        manager: ManagerAgentToolAdapter,
      ) => new AgentRoleToolRouter(tenant, manager),
    },
    {
      provide: AGENT_ROLE_TOOL_ADAPTER,
      useExisting: AgentRoleToolRouter,
    },
    AgentToolGateService,
    ManagerCopilotActionGatewayService,
    AgentToolActionLifecycle,
  ],
  exports: [AgentToolGateService],
})
export class AgentToolsModule {}
