import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { VendorJobEstimateView } from "@roomlog/types";
import * as visitNegotiation from "./visit-negotiation";

type RevisionNoteSelector = (
  latest: VendorJobEstimateView | undefined,
  estimates: VendorJobEstimateView[],
) => string | undefined;

type VisitProposalValidator = (
  lookup: unknown,
  repairId: string,
  estimateId: string,
) => { repairId: string; estimateId: string; visitAvailableAt: string };

const selectVendorRevisionRequestNote = (
  visitNegotiation as Record<string, unknown>
).selectVendorRevisionRequestNote as RevisionNoteSelector | undefined;
const requireCurrentManagerVisitProposal = (
  visitNegotiation as Record<string, unknown>
).requireCurrentManagerVisitProposal as VisitProposalValidator | undefined;

function estimate(
  version: number,
  status: VendorJobEstimateView["status"],
  overrides: Partial<VendorJobEstimateView> = {},
): VendorJobEstimateView {
  return {
    id: `estimate-${version}`,
    repairId: "repair-1",
    vendorId: "vendor-1",
    version,
    origin: "LIVE",
    responseType: "VISIT_REQUIRED",
    status,
    lineItems: [],
    ...overrides,
  };
}

function lookup({
  source = "API",
  partnership = "REGISTERED",
  repairId = "repair-1",
  currentEstimate = estimate(1, "SUBMITTED", {
    visitAvailableAt: "2026-07-25T01:00:00.000Z",
  }),
}: {
  source?: "API" | "DEMO";
  partnership?: "REGISTERED" | "UNREGISTERED";
  repairId?: string;
  currentEstimate?: VendorJobEstimateView;
} = {}) {
  return {
    source,
    data: {
      partnership,
      job: { repairId, latestEstimate: currentEstimate },
    },
  };
}

function source(path: string) {
  return readFileSync(join(process.cwd(), "src", path), "utf8");
}

const vendorDetailPage = source("app/vendor/job/01/page.tsx");
const vendorEstimatePage = source("app/vendor/job/02/page.tsx");
const vendorComponents = source("app/vendor/job/_components.tsx");
const vendorWorkflowApi = source("lib/vendor-workflow-api.ts");

test("revision note selector only exposes the current revision request provenance", () => {
  assert.equal(typeof selectVendorRevisionRequestNote, "function");
  if (!selectVendorRevisionRequestNote) return;

  const requested = estimate(1, "REVISION_REQUESTED", { reviewNote: "  시간을 바꿔 주세요.  " });
  assert.equal(
    selectVendorRevisionRequestNote(requested, [requested]),
    "시간을 바꿔 주세요.",
  );

  const draft = estimate(2, "DRAFT");
  assert.equal(
    selectVendorRevisionRequestNote(draft, [draft, requested]),
    "시간을 바꿔 주세요.",
  );
  for (const status of ["REJECTED", "SUPERSEDED"] as const) {
    const previous = estimate(1, status, { reviewNote: "오래된 검토 메모" });
    assert.equal(selectVendorRevisionRequestNote(draft, [draft, previous]), undefined);
  }
  const nonImmediate = estimate(1, "REVISION_REQUESTED", { reviewNote: "오래된 재협의" });
  assert.equal(
    selectVendorRevisionRequestNote(estimate(3, "DRAFT"), [nonImmediate]),
    undefined,
  );
  assert.equal(
    selectVendorRevisionRequestNote(
      estimate(2, "SUBMITTED", { reviewNote: "제출 뒤 숨길 메모" }),
      [requested],
    ),
    undefined,
  );
});

test("manager visit proposal validator returns only the stored registered API proposal", () => {
  assert.equal(typeof requireCurrentManagerVisitProposal, "function");
  if (!requireCurrentManagerVisitProposal) return;

  assert.deepEqual(
    requireCurrentManagerVisitProposal(lookup(), "repair-1", "estimate-1"),
    {
      repairId: "repair-1",
      estimateId: "estimate-1",
      visitAvailableAt: "2026-07-25T01:00:00.000Z",
    },
  );
});

test("manager visit proposal validator rejects stale, unregistered, and invalid proposals", () => {
  assert.equal(typeof requireCurrentManagerVisitProposal, "function");
  if (!requireCurrentManagerVisitProposal) return;

  const invalidCases = [
    lookup({ source: "DEMO" }),
    lookup({ partnership: "UNREGISTERED" }),
    lookup({ repairId: "repair-other" }),
    lookup({ currentEstimate: estimate(1, "SUBMITTED", {
      id: "estimate-other",
      visitAvailableAt: "2026-07-25T01:00:00.000Z",
    }) }),
    lookup({ currentEstimate: estimate(1, "DRAFT", {
      visitAvailableAt: "2026-07-25T01:00:00.000Z",
    }) }),
    lookup({ currentEstimate: estimate(1, "SUBMITTED", {
      responseType: "FIXED_ESTIMATE",
      visitAvailableAt: "2026-07-25T01:00:00.000Z",
    }) }),
    lookup({ currentEstimate: estimate(1, "SUBMITTED", {
      visitAvailableAt: "not-an-iso-date",
    }) }),
  ];

  for (const current of invalidCases) {
    assert.throws(
      () => requireCurrentManagerVisitProposal(current, "repair-1", "estimate-1"),
      /현재 업체 방문 제안을 다시 확인해 주세요/,
    );
  }
});

test("vendor screens wire trimmed availability and accessible revision-note UI", () => {
  for (const page of [vendorDetailPage, vendorEstimatePage]) {
    assert.match(page, /<TenantAvailableTimes value=\{job\.tenantAvailableTimes\} \/>/);
  }
  const availabilityComponent = vendorComponents.slice(
    vendorComponents.indexOf("export function TenantAvailableTimes"),
    vendorComponents.indexOf("export function WorkflowEstimateSummary"),
  );
  assert.match(availabilityComponent, /const normalized = value\?\.trim\(\);/);
  assert.match(availabilityComponent, /if \(!normalized\) return null;/);
  assert.match(availabilityComponent, />세입자 방문 가능 시간</);
  assert.match(availabilityComponent, /gap: "var\(--space-sm\)"/);

  const demoDetail = vendorWorkflowApi.slice(
    vendorWorkflowApi.indexOf("export const DEMO_VENDOR_JOB_DETAIL"),
    vendorWorkflowApi.indexOf("export const DEMO_VENDOR_JOBS"),
  );
  assert.doesNotMatch(demoDetail, /tenantAvailableTimes\s*:/);
  assert.match(vendorEstimatePage, /selectVendorRevisionRequestNote\(latest, job\.estimates\)/);
  assert.match(vendorEstimatePage, /<section aria-labelledby="revision-request-title">/);
  assert.match(vendorEstimatePage, /<h2\s+id="revision-request-title"/);
  assert.doesNotMatch(vendorEstimatePage, /role="status"/);
  assert.doesNotMatch(vendorEstimatePage, /gap: 8/);
  assert.ok(
    vendorEstimatePage.indexOf("revision-request-title")
      < vendorEstimatePage.indexOf("<EstimateResponseForm"),
    "the revision request must appear above the estimate form",
  );
});
