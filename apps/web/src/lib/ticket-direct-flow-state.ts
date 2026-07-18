import type {
  RepairStage,
  TicketDirectHandling,
  TicketStatus,
} from "@roomlog/types";

export type TicketDirectFlowInput = {
  ticketStatus: TicketStatus;
  directHandling?: TicketDirectHandling | null;
  hasRepairPath?: boolean;
  repairStage?: RepairStage | null;
};

export type TicketDirectFlowState = {
  directPhase:
    | "none"
    | "active"
    | "completion_pending"
    | "resolved_history"
    | "reopened_history"
    | "history";
  repairPhase: "none" | "active" | "terminal";
  canStartDirect: boolean;
  showVendorAssignment: boolean;
  intakeIsCurrent: boolean;
  tenantProgress:
    | "none"
    | "direct_active"
    | "direct_completion_pending"
    | "direct_resolved"
    | "direct_reopened"
    | "direct_history"
    | "repair_active"
    | "repair_resolved"
    | "repair_reopened"
    | "repair_history";
};

export function resolveTicketDirectFlow({
  ticketStatus,
  directHandling,
  hasRepairPath = false,
  repairStage,
}: TicketDirectFlowInput): TicketDirectFlowState {
  const repairPhase: TicketDirectFlowState["repairPhase"] = !hasRepairPath && !repairStage
    ? "none"
    : repairStage === "completed" || repairStage === "paid"
      ? "terminal"
      : "active";
  const directPhase: TicketDirectFlowState["directPhase"] = !directHandling
    ? "none"
    : ticketStatus === "processing"
      && !(directHandling.completedAt && repairPhase === "active")
      ? directHandling.completedAt
        ? "completion_pending"
        : "active"
      : ticketStatus === "resolved"
        ? "resolved_history"
        : ticketStatus === "reopened"
          ? "reopened_history"
          : "history";
  const currentDirect = directPhase === "active" || directPhase === "completion_pending";
  const canReplaceRepair = repairPhase === "none"
    || (repairPhase === "terminal" && ticketStatus === "reopened");

  let tenantProgress: TicketDirectFlowState["tenantProgress"] = "none";
  if (directPhase === "active") tenantProgress = "direct_active";
  else if (directPhase === "completion_pending") tenantProgress = "direct_completion_pending";
  else if (repairPhase === "active") tenantProgress = "repair_active";
  else if (directPhase === "resolved_history") tenantProgress = "direct_resolved";
  else if (directPhase === "reopened_history") tenantProgress = "direct_reopened";
  else if (directPhase === "history") tenantProgress = "direct_history";
  else if (repairPhase === "terminal" && ticketStatus === "resolved") {
    tenantProgress = "repair_resolved";
  } else if (repairPhase === "terminal" && ticketStatus === "reopened") {
    tenantProgress = "repair_reopened";
  } else if (repairPhase === "terminal") {
    tenantProgress = "repair_history";
  }

  return {
    directPhase,
    repairPhase,
    canStartDirect:
      !currentDirect
      && canReplaceRepair
      && ticketStatus !== "resolved"
      && ticketStatus !== "cancelled",
    showVendorAssignment:
      !currentDirect
      && ticketStatus !== "resolved"
      && ticketStatus !== "cancelled",
    intakeIsCurrent:
      tenantProgress === "none"
      || tenantProgress === "direct_reopened"
      || tenantProgress === "repair_reopened",
    tenantProgress,
  };
}
