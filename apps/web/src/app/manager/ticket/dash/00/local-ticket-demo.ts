import { readFile } from "node:fs/promises";
import { join, sep } from "node:path";
import type { RepairJob, Ticket } from "@roomlog/types";
import type { DefectDashboardRow } from "./ticket-dashboard-model";

const LOCAL_DEMO_LIMIT = 10;
const TICKET_TYPES = new Set<Ticket["type"]>(["defect", "complaint"]);
const TICKET_STATUSES = new Set<Ticket["status"]>([
  "received",
  "reviewing",
  "info_requested",
  "processing",
  "resolved",
  "reopened",
  "cancelled",
]);
const REPAIR_STAGES = new Set<RepairJob["stage"]>([
  "vendor_assigned",
  "quoted",
  "scheduled",
  "in_progress",
  "completed",
  "paid",
]);

export type LocalDemoFileReader = (path: string) => Promise<string>;

function localDemoPath() {
  const cwd = process.cwd();
  const webRoot = cwd.endsWith(`${sep}apps${sep}web`) ? cwd : join(cwd, "apps", "web");
  return join(webRoot, ".local-data", "manager-ticket-demo.json");
}

const defaultFileReader: LocalDemoFileReader = (path) => readFile(path, "utf8");

export function isLocalRequestHost(host: string | null | undefined) {
  if (!host) return false;

  return /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTicket(value: unknown): value is Ticket {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    TICKET_TYPES.has(value.type as Ticket["type"]) &&
    typeof value.unitId === "string" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    TICKET_STATUSES.has(value.status as Ticket["status"]) &&
    [1, 2, 3, 4].includes(value.urgency as number) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isRepair(value: unknown): value is RepairJob {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.ticketId === "string" &&
    REPAIR_STAGES.has(value.stage as RepairJob["stage"])
  );
}

function isDashboardRow(value: unknown): value is DefectDashboardRow {
  if (!isRecord(value) || !isTicket(value.ticket)) return false;
  if (value.repair !== undefined && !isRepair(value.repair)) return false;
  if (value.buildingName !== undefined && typeof value.buildingName !== "string") return false;

  return true;
}

export async function appendLocalTicketDemoRows(
  realRows: readonly DefectDashboardRow[],
  host: string | null | undefined,
  readText: LocalDemoFileReader = defaultFileReader,
): Promise<DefectDashboardRow[]> {
  if (!isLocalRequestHost(host)) return [...realRows];

  try {
    const parsed: unknown = JSON.parse(await readText(localDemoPath()));
    const localRows = Array.isArray(parsed)
      ? parsed.filter(isDashboardRow).slice(0, LOCAL_DEMO_LIMIT)
      : [];

    return [...realRows, ...localRows];
  } catch {
    return [...realRows];
  }
}
