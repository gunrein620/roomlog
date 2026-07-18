import type { TicketStatus } from "@roomlog/types";
import { ticketLaneOf, type TicketLane } from "./ticket-lane";

export type TicketLaneOverride = Partial<
  Record<string, { lane: TicketLane; updatedAt?: string }>
>;

type TicketRow = {
  ticket: {
    id: string;
    status: TicketStatus;
    updatedAt: string;
  };
};

export function ticketStatusForLane(lane: TicketLane): TicketStatus {
  return lane;
}

/**
 * 성공한 변경은 RSC 재조회가 도착하기 전에도 현재 표에 남긴다.
 * 서버가 같은 레인을 돌려줄 때만 override를 비워, 늦게 도착한 이전 목록이
 * 첫 클릭의 결과를 되돌리지 못하게 한다.
 */
export function applyTicketLaneOverrides<T extends TicketRow>(
  rows: readonly T[],
  overrides: TicketLaneOverride,
): T[] {
  return rows.map((row) => {
    const override = overrides[row.ticket.id];
    if (!override) return row;

    return {
      ...row,
      ticket: { ...row.ticket, status: ticketStatusForLane(override.lane) },
    } as T;
  });
}

export function reconcileTicketLaneOverrides<T extends TicketRow>(
  overrides: TicketLaneOverride,
  rows: readonly T[],
): TicketLaneOverride {
  const serverTicketById = new Map(rows.map((row) => [row.ticket.id, row.ticket]));
  let changed = false;
  const next: TicketLaneOverride = {};

  for (const [ticketId, override] of Object.entries(overrides)) {
    if (!override) continue;
    const serverTicket = serverTicketById.get(ticketId);
    const serverIsNewer =
      Boolean(override.updatedAt) &&
      Date.parse(serverTicket?.updatedAt ?? "") >= Date.parse(override.updatedAt ?? "");

    if (!serverTicket || ticketLaneOf(serverTicket.status) === override.lane || serverIsNewer) {
      changed = true;
      continue;
    }
    next[ticketId] = override;
  }

  return changed ? next : overrides;
}
