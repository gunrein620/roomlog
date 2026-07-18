import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { toRepair, toTicket, type TeamComplaint } from "./defect-mapping";
import { toManagerTicket, type TeamManagerTicket } from "./manager-mapping";
import {
  resolveTicketDirectFlow,
  type TicketDirectFlowInput,
  type TicketDirectFlowState,
} from "./ticket-direct-flow-state";

function source(path: string) {
  return readFileSync(join(process.cwd(), "src", path), "utf8");
}

function teamComplaint(ticketFields: Record<string, unknown>): TeamComplaint {
  return {
    id: "complaint-1",
    title: "싱크대 누수",
    description: "싱크대 아래에서 물이 샙니다.",
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
    room: { roomNo: "301호" },
    ticket: {
      id: "ticket-1",
      complaintId: "complaint-1",
      status: "REPAIR_IN_PROGRESS",
      priority: 2,
      responsibilityHint: "임대인 책임 가능성",
      ...ticketFields,
    },
  };
}

const STARTED = { startedAt: "2026-07-17T01:00:00.000Z" };
const COMPLETED = {
  ...STARTED,
  completedAt: "2026-07-17T02:00:00.000Z",
};

test("direct-flow state combines ticket status, timestamps, and repair stage", () => {
  const cases: Array<{
    name: string;
    input: TicketDirectFlowInput;
    expected: TicketDirectFlowState;
  }> = [
    {
      name: "fresh allowed",
      input: { ticketStatus: "received" },
      expected: {
        directPhase: "none",
        repairPhase: "none",
        canStartDirect: true,
        showVendorAssignment: true,
        intakeIsCurrent: true,
        tenantProgress: "none",
      },
    },
    {
      name: "active direct",
      input: { ticketStatus: "processing", directHandling: STARTED },
      expected: {
        directPhase: "active",
        repairPhase: "none",
        canStartDirect: false,
        showVendorAssignment: false,
        intakeIsCurrent: false,
        tenantProgress: "direct_active",
      },
    },
    {
      name: "completion pending",
      input: { ticketStatus: "processing", directHandling: COMPLETED },
      expected: {
        directPhase: "completion_pending",
        repairPhase: "none",
        canStartDirect: false,
        showVendorAssignment: false,
        intakeIsCurrent: false,
        tenantProgress: "direct_completion_pending",
      },
    },
    {
      name: "resolved direct",
      input: { ticketStatus: "resolved", directHandling: COMPLETED },
      expected: {
        directPhase: "resolved_history",
        repairPhase: "none",
        canStartDirect: false,
        showVendorAssignment: false,
        intakeIsCurrent: false,
        tenantProgress: "direct_resolved",
      },
    },
    {
      name: "reopened historical direct",
      input: { ticketStatus: "reopened", directHandling: COMPLETED },
      expected: {
        directPhase: "reopened_history",
        repairPhase: "none",
        canStartDirect: true,
        showVendorAssignment: true,
        intakeIsCurrent: true,
        tenantProgress: "direct_reopened",
      },
    },
    {
      name: "active repair conflict",
      input: { ticketStatus: "reopened", repairStage: "in_progress" },
      expected: {
        directPhase: "none",
        repairPhase: "active",
        canStartDirect: false,
        showVendorAssignment: true,
        intakeIsCurrent: false,
        tenantProgress: "repair_active",
      },
    },
    {
      name: "terminal completed repair on reopened",
      input: {
        ticketStatus: "reopened",
        hasRepairPath: true,
        repairStage: "completed",
      },
      expected: {
        directPhase: "none",
        repairPhase: "terminal",
        canStartDirect: true,
        showVendorAssignment: true,
        intakeIsCurrent: true,
        tenantProgress: "repair_reopened",
      },
    },
    {
      name: "terminal paid repair on reopened",
      input: {
        ticketStatus: "reopened",
        hasRepairPath: true,
        repairStage: "paid",
      },
      expected: {
        directPhase: "none",
        repairPhase: "terminal",
        canStartDirect: true,
        showVendorAssignment: true,
        intakeIsCurrent: true,
        tenantProgress: "repair_reopened",
      },
    },
    {
      name: "terminal repair on processing cannot start direct handling",
      input: {
        ticketStatus: "processing",
        hasRepairPath: true,
        repairStage: "completed",
      },
      expected: {
        directPhase: "none",
        repairPhase: "terminal",
        canStartDirect: false,
        showVendorAssignment: true,
        intakeIsCurrent: false,
        tenantProgress: "repair_history",
      },
    },
    {
      name: "repair path without loaded detail is not mistaken for no repair",
      input: { ticketStatus: "processing", hasRepairPath: true },
      expected: {
        directPhase: "none",
        repairPhase: "active",
        canStartDirect: false,
        showVendorAssignment: true,
        intakeIsCurrent: false,
        tenantProgress: "repair_active",
      },
    },
    {
      name: "current direct takes tenant precedence over historical repair",
      input: {
        ticketStatus: "processing",
        directHandling: STARTED,
        repairStage: "paid",
      },
      expected: {
        directPhase: "active",
        repairPhase: "terminal",
        canStartDirect: false,
        showVendorAssignment: false,
        intakeIsCurrent: false,
        tenantProgress: "direct_active",
      },
    },
    {
      name: "active repair supersedes completed direct history after reopen",
      input: {
        ticketStatus: "processing",
        directHandling: COMPLETED,
        hasRepairPath: true,
        repairStage: "in_progress",
      },
      expected: {
        directPhase: "history",
        repairPhase: "active",
        canStartDirect: false,
        showVendorAssignment: true,
        intakeIsCurrent: false,
        tenantProgress: "repair_active",
      },
    },
    {
      name: "resolved direct history stays primary over terminal repair history",
      input: {
        ticketStatus: "resolved",
        directHandling: COMPLETED,
        hasRepairPath: true,
        repairStage: "completed",
      },
      expected: {
        directPhase: "resolved_history",
        repairPhase: "terminal",
        canStartDirect: false,
        showVendorAssignment: false,
        intakeIsCurrent: false,
        tenantProgress: "direct_resolved",
      },
    },
    {
      name: "reopened direct history stays primary over terminal repair history",
      input: {
        ticketStatus: "reopened",
        directHandling: COMPLETED,
        hasRepairPath: true,
        repairStage: "paid",
      },
      expected: {
        directPhase: "reopened_history",
        repairPhase: "terminal",
        canStartDirect: true,
        showVendorAssignment: true,
        intakeIsCurrent: true,
        tenantProgress: "direct_reopened",
      },
    },
    {
      name: "cancelled direct history exposes no new actions",
      input: { ticketStatus: "cancelled", directHandling: COMPLETED },
      expected: {
        directPhase: "history",
        repairPhase: "none",
        canStartDirect: false,
        showVendorAssignment: false,
        intakeIsCurrent: false,
        tenantProgress: "direct_history",
      },
    },
  ];

  for (const { name, input, expected } of cases) {
    assert.deepEqual(resolveTicketDirectFlow(input), expected, name);
  }
});

test("raw repair mapping and flow exclude cancelled paths and select the next active repair", () => {
  const cancelledOnly = teamComplaint({
    status: "REOPENED",
    repairs: [
      {
        id: "repair-cancelled",
        ticketId: "ticket-1",
        status: "CANCELLED",
      },
    ],
  });
  const cancelledTicket = toTicket(cancelledOnly);
  const cancelledRepair = toRepair(cancelledOnly);
  const cancelledFlow = resolveTicketDirectFlow({
    ticketStatus: cancelledTicket.status,
    directHandling: cancelledTicket.directHandling,
    hasRepairPath: Boolean(cancelledRepair),
    repairStage: cancelledRepair?.stage,
  });

  assert.equal(cancelledTicket.repairJobId, undefined);
  assert.equal(cancelledRepair, null);
  assert.equal(cancelledFlow.canStartDirect, true);
  assert.equal(cancelledFlow.repairPhase, "none");
  assert.equal(cancelledFlow.tenantProgress, "none");

  const activeAfterCancelled = teamComplaint({
    status: "REOPENED",
    repairs: [
      {
        id: "repair-cancelled",
        ticketId: "ticket-1",
        status: "CANCELLED",
      },
      {
        id: "repair-active",
        ticketId: "ticket-1",
        status: "IN_PROGRESS",
      },
    ],
  });
  const activeTicket = toTicket(activeAfterCancelled);
  const activeRepair = toRepair(activeAfterCancelled);
  const activeFlow = resolveTicketDirectFlow({
    ticketStatus: activeTicket.status,
    directHandling: activeTicket.directHandling,
    hasRepairPath: Boolean(activeRepair),
    repairStage: activeRepair?.stage,
  });

  assert.equal(activeTicket.repairJobId, "repair-active");
  assert.equal(activeRepair?.id, "repair-active");
  assert.equal(activeFlow.canStartDirect, false);
  assert.equal(activeFlow.repairPhase, "active");
  assert.equal(activeFlow.tenantProgress, "repair_active");
});

test("raw repair mapping prioritizes active repair over completed history", () => {
  const activeAfterCompleted = teamComplaint({
    status: "REOPENED",
    repairs: [
      {
        id: "repair-completed",
        ticketId: "ticket-1",
        status: "COMPLETED",
      },
      {
        id: "repair-current",
        ticketId: "ticket-1",
        status: "IN_PROGRESS",
      },
    ],
  });
  const currentTicket = toTicket(activeAfterCompleted);
  const currentRepair = toRepair(activeAfterCompleted);
  const currentFlow = resolveTicketDirectFlow({
    ticketStatus: currentTicket.status,
    directHandling: currentTicket.directHandling,
    hasRepairPath: Boolean(currentRepair),
    repairStage: currentRepair?.stage,
  });

  assert.equal(currentTicket.repairJobId, "repair-current");
  assert.equal(currentRepair?.id, "repair-current");
  assert.equal(currentFlow.canStartDirect, false);
  assert.equal(currentFlow.repairPhase, "active");
  assert.equal(currentFlow.tenantProgress, "repair_active");
});

test("reopened direct and repair histories keep the intake section current", () => {
  const cases: TicketDirectFlowInput[] = [
    { ticketStatus: "reopened", directHandling: COMPLETED },
    {
      ticketStatus: "reopened",
      hasRepairPath: true,
      repairStage: "completed",
    },
  ];

  for (const input of cases) {
    const flow = resolveTicketDirectFlow(input) as TicketDirectFlowState & {
      intakeIsCurrent?: boolean;
    };
    assert.equal(flow.intakeIsCurrent, true);
  }
});

test("tenant and manager ticket mappings preserve direct handling and self-repair contracts", () => {
  const directHandling = {
    startedAt: "2026-07-17T01:00:00.000Z",
    note: "관리자가 현장을 확인합니다.",
  };
  const complaint = teamComplaint({ directHandling });
  const managerTicket = {
    ...complaint.ticket,
    complaintId: complaint.id,
    complaint: {
      title: complaint.title,
      description: complaint.description,
      createdAt: complaint.createdAt,
      updatedAt: complaint.updatedAt,
    },
    room: complaint.room,
    selfRepair: { active: true, statusLabel: "견적 검토 중" },
  } as unknown as TeamManagerTicket;

  const tenantMapped = toTicket(complaint) as ReturnType<typeof toTicket> & {
    directHandling?: unknown;
  };
  const managerMapped = toManagerTicket(managerTicket) as ReturnType<typeof toManagerTicket> & {
    directHandling?: unknown;
    selfRepair?: unknown;
  };

  assert.deepEqual(tenantMapped.directHandling, directHandling);
  assert.deepEqual(managerMapped.directHandling, directHandling);
  assert.deepEqual(managerMapped.selfRepair, {
    active: true,
    statusLabel: "견적 검토 중",
  });
});

test("shared contracts expose domain-prefixed direct handling, self-repair, and partnership union", () => {
  const ticketTypes = source("../../../packages/types/src/ticket.ts");
  const vendorTypes = source("../../../packages/types/src/vendor-workflow.ts");

  assert.match(ticketTypes, /interface TicketDirectHandling/);
  assert.match(ticketTypes, /interface TicketSelfRepairSummary/);
  assert.match(vendorTypes, /partnership:\s*"REGISTERED"/);
  assert.match(vendorTypes, /partnership:\s*"UNREGISTERED"/);
});

test("manager API client posts all three direct-handling mutation contracts", () => {
  const api = source("lib/ticket-manager-api.ts");

  assert.match(api, /startManagerTicketDirectHandling/);
  assert.match(api, /\/direct-handling`/);
  assert.match(api, /completeManagerTicketDirectHandling/);
  assert.match(api, /\/direct-handling\/complete`/);
  assert.match(api, /cancelManagerTicketDirectHandling/);
  assert.match(api, /\/direct-handling\/cancel`/);
  assert.match(api, /body:\s*JSON\.stringify\(input\)/);
});

test("manager direct actions normalize FormData and expose start, complete, and cancel actions", () => {
  const actions = source("app/manager/ticket/dash/01/actions.ts");

  assert.match(actions, /startDirectHandlingAction/);
  assert.match(actions, /completeDirectHandlingAction/);
  assert.match(actions, /cancelDirectHandlingAction/);
  assert.match(actions, /formString\(formData, "note"\)/);
  assert.match(actions, /formString\(formData, "amount"\)/);
  assert.match(actions, /formString\(formData, "item"\)/);
  assert.match(actions, /formString\(formData, "reason"\)/);
  assert.match(actions, /Number\.isSafeInteger/);
});

test("manager next-action card renders conditional direct status and forms", () => {
  const page = source("app/manager/ticket/dash/01/page.tsx");
  const ui = source("app/manager/ticket/_components/ticket-manager-ui.tsx");
  const combined = `${page}\n${ui}`;

  assert.match(combined, /직접 처리 시작/);
  assert.match(combined, /처리 완료 보고/);
  assert.match(combined, /직접 처리 취소/);
  assert.match(combined, /name="note"[\s\S]*required/);
  assert.match(combined, /name="amount"/);
  assert.match(combined, /name="item"/);
  assert.match(combined, /name="reason"[\s\S]*required/);
  assert.match(combined, /directHandling\.completedAt/);
});

test("manager screens consume the shared status-aware flow model", () => {
  const managerPage = source("app/manager/ticket/dash/01/page.tsx");
  const managerUi = source("app/manager/ticket/_components/ticket-manager-ui.tsx");

  assert.match(managerUi, /resolveTicketDirectFlow/);
  assert.match(managerUi, /flow\.canStartDirect/);
  assert.match(managerUi, /flow\.directPhase/);
  assert.match(managerPage, /flow\.showVendorAssignment/);
  assert.doesNotMatch(
    `${managerPage}\n${managerUi}`,
    /hasRepairPath:\s*Boolean\(ticket\.repairJobId\)/,
  );
});

test("manager dashboard shows the exact active self-repair badge prefix", () => {
  const ui = source("app/manager/ticket/_components/ticket-manager-ui.tsx");

  assert.match(ui, /세입자 자가수리 진행중 ·/);
  assert.match(ui, /selfRepair\.statusLabel/);
});

test("unregistered vendor job screens are progress-only and hide manager mutations", () => {
  for (const screen of ["04", "05"] as const) {
    const page = source(`app/manager/ticket/dash/${screen}/page.tsx`);
    assert.match(page, /partnership === "UNREGISTERED"/);
    assert.match(page, /세입자가 연결한 플랫폼 업체 — 조회 전용/);
    assert.match(page, /readOnly/);
  }
});

// 세입자 상세는 상태와 긴급도만 요약하고, 직접 처리 후속 안내는 티켓 채팅으로 모은다.
test("tenant history detail keeps direct handling actions out of the chat-focused sheet", () => {
  const page = source("app/my/flows/TenantMyPage.tsx");

  assert.match(page, /detailStatusLabel/);
  assert.match(page, /진행 메시지/);
  assert.doesNotMatch(page, /관리자가 직접 처리 중/);
  assert.doesNotMatch(page, /관리자가 처리 완료를 보고했어요/);
  assert.doesNotMatch(page, /detailDirectHandling\.completedAt/);
  assert.doesNotMatch(page, /수리 완료 확인/);
});
