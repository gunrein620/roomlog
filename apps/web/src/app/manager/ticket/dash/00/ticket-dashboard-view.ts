export type TicketDashboardView = "dashboard" | "management" | "complaint" | "defect";

export function resolveTicketDashboardView(params: {
  type?: string;
  view?: string;
}): TicketDashboardView {
  if (params.type === "complaint" || params.type === "defect") return params.type;
  if (params.view === "management") return "management";
  return "dashboard";
}
