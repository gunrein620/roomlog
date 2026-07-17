import type { AgentToolName } from "@roomlog/types";
import type {
  AgentPreparedMutation,
  AgentPrincipal,
  AgentRoleToolAdapter,
} from "./agent-tool-action.repository";

export class AgentRoleToolRouter implements AgentRoleToolAdapter {
  constructor(
    private readonly tenant: AgentRoleToolAdapter,
    private readonly manager: AgentRoleToolAdapter,
  ) {}

  policy(principal: AgentPrincipal, tool: string) {
    return this.for(principal).policy(principal, tool);
  }

  executeImmediate(
    principal: AgentPrincipal,
    tool: AgentToolName,
    args: Record<string, unknown>,
    context: { toolCallId: string },
  ) {
    return this.for(principal).executeImmediate(principal, tool, args, context);
  }

  prepareMutation(
    principal: AgentPrincipal,
    tool: AgentToolName,
    args: Record<string, unknown>,
  ): Promise<AgentPreparedMutation> {
    return this.for(principal).prepareMutation(principal, tool, args);
  }

  executePending(
    principal: AgentPrincipal,
    executorName: string,
    payload: Record<string, unknown>,
    context: { confirmationId: string; toolCallId: string },
  ) {
    return this.for(principal).executePending(
      principal,
      executorName,
      payload,
      context,
    );
  }

  private for(principal: AgentPrincipal) {
    return principal.role === "LANDLORD" ? this.manager : this.tenant;
  }
}
