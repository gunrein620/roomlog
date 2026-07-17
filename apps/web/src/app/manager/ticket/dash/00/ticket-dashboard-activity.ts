type TicketActivity = {
  kind: "ticket";
  action?: unknown;
};

export function isTicketActivity(
  payload: unknown,
): payload is TicketActivity {
  return (
    typeof payload === "object" &&
    payload !== null &&
    (payload as { kind?: unknown }).kind === "ticket"
  );
}

export function shouldRefreshTicketDashboard(payload: unknown): boolean {
  return isTicketActivity(payload) && payload.action !== "read";
}
