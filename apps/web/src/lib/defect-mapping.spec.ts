import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { toTicket, type TeamComplaint } from "./defect-mapping";

function teamComplaint(ticketFields: Record<string, unknown>): TeamComplaint {
  return {
    id: "complaint-1",
    title: "테스트 접수",
    description: "테스트 접수 내용",
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    room: { roomNo: "301호" },
    ticket: {
      id: "ticket-1",
      complaintId: "complaint-1",
      status: "RECEIVED",
      priority: 3,
      responsibilityHint: "판단 어려움",
      ...ticketFields,
    },
  };
}

describe("ticket kind mapping", () => {
  it("prefers the explicit API kind over the legacy category", () => {
    assert.equal(
      toTicket(teamComplaint({ kind: "complaint", category: "설비" })).type,
      "complaint",
    );
  });

  it("keeps category fallback compatibility for older API responses", () => {
    assert.equal(toTicket(teamComplaint({ category: "소음" })).type, "complaint");
    assert.equal(toTicket(teamComplaint({ category: "누수" })).type, "defect");
  });
});
