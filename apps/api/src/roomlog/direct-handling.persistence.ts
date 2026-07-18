export type StartDirectHandlingCommand = {
  managerId: string;
  ticketId: string;
  note?: string;
  occurredAt: string;
};

export type CompleteDirectHandlingCommand = {
  managerId: string;
  ticketId: string;
  note: string;
  occurredAt: string;
  cost?: {
    amount: number;
    item?: string;
  };
};

export type CancelDirectHandlingCommand = {
  managerId: string;
  ticketId: string;
  reason: string;
  occurredAt: string;
};

export type DirectHandlingPersistenceErrorCode =
  | "TICKET_NOT_FOUND"
  | "ACCESS_DENIED"
  | "ALREADY_ACTIVE"
  | "ACTIVE_REPAIR_CONFLICT"
  | "INVALID_STATE";

export class DirectHandlingPersistenceError extends Error {
  constructor(
    readonly code: DirectHandlingPersistenceErrorCode,
    message: string
  ) {
    super(message);
    this.name = "DirectHandlingPersistenceError";
  }
}

export type DirectHandlingMutationResult = {
  ticket: Ticket;
  complaint: Complaint;
  message: TicketMessage;
  history: StatusHistory;
  cost?: Cost;
};

export interface DirectHandlingPersistence {
  startDirectHandling(
    command: StartDirectHandlingCommand
  ): Promise<DirectHandlingMutationResult>;
  completeDirectHandling(
    command: CompleteDirectHandlingCommand
  ): Promise<DirectHandlingMutationResult>;
  cancelDirectHandling(
    command: CancelDirectHandlingCommand
  ): Promise<DirectHandlingMutationResult>;
}
import type {
  Complaint,
  Cost,
  StatusHistory,
  Ticket,
  TicketMessage
} from "./roomlog.types";
