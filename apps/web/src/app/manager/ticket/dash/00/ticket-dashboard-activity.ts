export function isTicketActivity(
  payload: unknown,
): payload is { kind: "ticket" } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    (payload as { kind?: unknown }).kind === "ticket"
  );
}
