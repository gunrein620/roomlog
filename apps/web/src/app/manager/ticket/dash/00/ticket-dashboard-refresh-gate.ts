export type TicketDashboardRefreshGate = {
  request(canRefresh: boolean): boolean;
  flush(canRefresh: boolean): boolean;
};

export function createTicketDashboardRefreshGate(): TicketDashboardRefreshGate {
  let pending = false;

  return {
    request(canRefresh) {
      if (!canRefresh) {
        pending = true;
        return false;
      }
      pending = false;
      return true;
    },
    flush(canRefresh) {
      if (!pending || !canRefresh) return false;
      pending = false;
      return true;
    },
  };
}
