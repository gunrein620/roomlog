import { MANAGER_DEFECT_DASHBOARD_DEMO_RECORDS } from "../../../../../lib/manager-defect-dashboard-demo";
import type { DefectDashboardRow } from "./ticket-dashboard-model";

export const MANAGER_DEFECT_DASHBOARD_DEMO_ROWS =
  MANAGER_DEFECT_DASHBOARD_DEMO_RECORDS.map(
    ({ ticket, repair, buildingName }) => ({
      ticket,
      repair,
      buildingName,
      isDemo: true,
    }),
  ) satisfies readonly DefectDashboardRow[];
