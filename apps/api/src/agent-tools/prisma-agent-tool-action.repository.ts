import { PrismaPg } from "@prisma/adapter-pg";
import {
  Prisma,
  PrismaClient,
  type AgentToolAction,
} from "@prisma/client";
import type {
  AgentConfirmationCard,
  AgentToolName,
} from "@roomlog/types";
import {
  AgentToolActionUnavailableError,
  type AgentPrincipal,
  type AgentToolActionClaim,
  type AgentToolActionRecord,
  type AgentToolActionRepository,
  type BeginAgentImmediateInput,
  type CreateAgentPendingInput,
} from "./agent-tool-action.repository";

function json(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function record(row: AgentToolAction): AgentToolActionRecord {
  return {
    id: row.id,
    principal: {
      userId: row.principalUserId,
      role: row.principalRole as AgentPrincipal["role"],
    },
    tool: row.toolName as AgentToolName,
    toolCallId: row.toolCallId,
    arguments: row.arguments as Record<string, unknown>,
    ...(row.executorName ? { executorName: row.executorName } : {}),
    ...(row.commandPayload
      ? { commandPayload: row.commandPayload as Record<string, unknown> }
      : {}),
    ...(row.confirmationCard
      ? { card: row.confirmationCard as unknown as AgentConfirmationCard }
      : {}),
    ...(row.result ? { result: row.result as Record<string, unknown> } : {}),
    ...(row.failureSummary ? { failureSummary: row.failureSummary } : {}),
    status: row.status,
    ...(row.expiresAt ? { expiresAt: row.expiresAt } : {}),
    ...(row.confirmedAt ? { confirmedAt: row.confirmedAt } : {}),
    ...(row.completedAt ? { completedAt: row.completedAt } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isRetryable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

export class PrismaAgentToolActionRepository
  implements AgentToolActionRepository
{
  private readonly prisma: PrismaClient;
  private closed = false;

  constructor(databaseUrl: string) {
    this.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
  }

  async beginImmediate(input: BeginAgentImmediateInput) {
    try {
      await this.prisma.agentToolAction.create({
        data: {
          id: input.id,
          principalUserId: input.principal.userId,
          principalRole: input.principal.role,
          toolName: input.tool,
          toolCallId: input.toolCallId,
          arguments: json(input.arguments),
          status: "EXECUTING",
        },
      });
      return "CLAIMED" as const;
    } catch (error) {
      if (!isRetryable(error)) throw error;
      const existing = await this.byToolCall(
        input.principal,
        input.toolCallId,
      );
      if (!existing) throw error;
      return existing;
    }
  }

  async createPending(input: CreateAgentPendingInput) {
    const activeKey = `${input.principal.role}:${input.principal.userId}`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const now = new Date();
            await tx.agentToolAction.updateMany({
              where: {
                principalUserId: input.principal.userId,
                status: "PENDING",
                expiresAt: { lte: now },
              },
              data: { status: "EXPIRED", activeKey: null, completedAt: now },
            });
            const duplicate = await tx.agentToolAction.findUnique({
              where: {
                principalUserId_principalRole_toolCallId: {
                  principalUserId: input.principal.userId,
                  principalRole: input.principal.role,
                  toolCallId: input.toolCallId,
                },
              },
            });
            if (duplicate) return record(duplicate);
            const current = await tx.agentToolAction.findUnique({
              where: { activeKey },
            });
            if (current) return record(current);
            return record(
              await tx.agentToolAction.create({
                data: {
                  id: input.id,
                  activeKey,
                  principalUserId: input.principal.userId,
                  principalRole: input.principal.role,
                  toolName: input.tool,
                  executorName: input.executorName,
                  toolCallId: input.toolCallId,
                  arguments: json(input.arguments),
                  commandPayload: json(input.commandPayload),
                  confirmationCard: json(
                    input.card as unknown as Record<string, unknown>,
                  ),
                  status: "PENDING",
                  expiresAt: input.expiresAt,
                },
              }),
            );
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (!isRetryable(error) || attempt === 2) throw error;
      }
    }
    throw new Error("Unable to create pending agent action.");
  }

  async current(principal: AgentPrincipal) {
    const activeKey = `${principal.role}:${principal.userId}`;
    const now = new Date();
    await this.prisma.agentToolAction.updateMany({
      where: { activeKey, status: "PENDING", expiresAt: { lte: now } },
      data: { status: "EXPIRED", activeKey: null, completedAt: now },
    });
    const row = await this.prisma.agentToolAction.findUnique({
      where: { activeKey },
    });
    return row ? record(row) : null;
  }

  async claim(
    principal: AgentPrincipal,
    confirmationId: string,
  ): Promise<AgentToolActionClaim> {
    const now = new Date();
    const claimed = await this.prisma.agentToolAction.updateMany({
      where: {
        id: confirmationId,
        principalUserId: principal.userId,
        principalRole: principal.role,
        status: "PENDING",
        expiresAt: { gt: now },
      },
      data: { status: "EXECUTING", confirmedAt: now },
    });
    if (claimed.count === 1) {
      return { claimed: true, action: await this.owned(principal, confirmationId) };
    }
    await this.prisma.agentToolAction.updateMany({
      where: {
        id: confirmationId,
        principalUserId: principal.userId,
        principalRole: principal.role,
        status: "PENDING",
        expiresAt: { lte: now },
      },
      data: { status: "EXPIRED", activeKey: null, completedAt: now },
    });
    return {
      claimed: false,
      action: await this.owned(principal, confirmationId),
    };
  }

  async complete(
    principal: AgentPrincipal,
    actionId: string,
    result: Record<string, unknown>,
  ) {
    const completedAt = new Date();
    await this.prisma.agentToolAction.updateMany({
      where: {
        id: actionId,
        principalUserId: principal.userId,
        principalRole: principal.role,
        status: "EXECUTING",
      },
      data: {
        status: "EXECUTED",
        activeKey: null,
        result: json(result),
        completedAt,
      },
    });
    return this.owned(principal, actionId);
  }

  async fail(principal: AgentPrincipal, actionId: string, summary: string) {
    const completedAt = new Date();
    await this.prisma.agentToolAction.updateMany({
      where: {
        id: actionId,
        principalUserId: principal.userId,
        principalRole: principal.role,
        status: "EXECUTING",
      },
      data: {
        status: "FAILED",
        activeKey: null,
        failureSummary: summary,
        completedAt,
      },
    });
    return this.owned(principal, actionId);
  }

  async cancel(principal: AgentPrincipal, confirmationId: string) {
    const completedAt = new Date();
    await this.prisma.agentToolAction.updateMany({
      where: {
        id: confirmationId,
        principalUserId: principal.userId,
        principalRole: principal.role,
        status: "PENDING",
      },
      data: {
        status: "CANCELLED",
        activeKey: null,
        completedAt,
      },
    });
    return this.owned(principal, confirmationId);
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    await this.prisma.$disconnect();
  }

  private async byToolCall(principal: AgentPrincipal, toolCallId: string) {
    const row = await this.prisma.agentToolAction.findUnique({
      where: {
        principalUserId_principalRole_toolCallId: {
          principalUserId: principal.userId,
          principalRole: principal.role,
          toolCallId,
        },
      },
    });
    return row ? record(row) : null;
  }

  private async owned(principal: AgentPrincipal, id: string) {
    const row = await this.prisma.agentToolAction.findFirst({
      where: {
        id,
        principalUserId: principal.userId,
        principalRole: principal.role,
      },
    });
    if (!row) throw new AgentToolActionUnavailableError();
    return record(row);
  }
}
