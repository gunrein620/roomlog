import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { RoomlogService } from "./roomlog.service";

describe("RoomlogService", () => {
  it("creates a tenant complaint with linked ticket analysis", () => {
    const service = new RoomlogService();

    const complaint = service.createComplaint("tenant-demo", {
      title: "천장에서 물이 떨어져요",
      description:
        "어젯밤부터 안방 천장 모서리에서 물이 계속 떨어지고 얼룩이 커지고 있어요.",
      location: "안방 천장",
      occurredAt: "2026-06-29T21:10:00.000Z",
      availableTimes: "평일 오후 7시 이후"
    });

    assert.equal(complaint.complaint.status, "SUBMITTED");
    assert.equal(complaint.ticket.status, "RECEIVED");
    assert.equal(complaint.ticket.category, "누수");
    assert.equal(complaint.ticket.priority, 1);
    assert.equal(complaint.analysis.responsibilityHint, "임대인 책임 가능성");
  });

  it("moves a ticket through vendor assignment and completion approval", () => {
    const service = new RoomlogService();
    const { ticket } = service.createComplaint("tenant-demo", {
      title: "보일러가 완전히 꺼졌어요",
      description: "보일러가 켜지지 않아 온수와 난방을 쓸 수 없습니다.",
      location: "주방 보일러실",
      occurredAt: "2026-06-29T08:30:00.000Z",
      availableTimes: "오늘 언제든 가능"
    });

    const repair = service.assignVendor("landlord-demo", ticket.id, {
      vendorId: "vendor-demo",
      requestNote: "긴급 점검 후 견적을 제출해주세요."
    });

    assert.equal(repair.status, "REQUESTED");
    assert.equal(service.getTicket(ticket.id)?.status, "VENDOR_ASSIGNED");

    const estimate = service.submitEstimate("vendor-demo", repair.id, {
      estimateAmount: 120000,
      estimateDescription: "순환 펌프 점검 및 부품 교체 예상"
    });

    assert.equal(estimate.status, "ESTIMATE_SUBMITTED");
    assert.equal(service.getTicket(ticket.id)?.status, "ESTIMATE_REVIEW");

    service.scheduleRepair("vendor-demo", repair.id, {
      scheduledAt: "2026-06-30T10:00:00.000Z"
    });
    const report = service.reportCompletion("vendor-demo", repair.id, {
      completionNote: "부품 교체 후 온수 정상 작동 확인",
      completionPhotoUrls: ["/uploads/repair-complete.jpg"]
    });

    assert.equal(report.status, "COMPLETION_REPORTED");
    assert.equal(service.getTicket(ticket.id)?.status, "COMPLETION_REPORTED");

    const completed = service.approveCompletion(
      "landlord-demo",
      ticket.id,
      "임차인 확인 후 완료 승인"
    );

    assert.equal(completed.status, "COMPLETED");
    assert.equal(service.getComplaint(completed.complaintId)?.status, "COMPLETED");
  });
});
