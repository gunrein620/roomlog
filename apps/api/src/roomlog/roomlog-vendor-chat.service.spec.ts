import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { RoomlogService } from "./roomlog.service";

type MutableStore = {
  repairs: Array<Record<string, unknown>>;
};

function createTicket(service: RoomlogService, title: string) {
  return service.createComplaint("tenant-demo", {
    title,
    description: "싱크대 아래 배관에서 물이 새고 있습니다.",
    location: "301호 주방",
    availableTimes: "평일 오후 6시 이후"
  });
}

describe("RoomlogService vendor chat message scoping", () => {
  it("scopes tenant and manager messages to the active repair", () => {
    const service = new RoomlogService();
    const { complaint, ticket } = createTicket(service, "활성 수리 채팅 스코프");
    const store = (service as unknown as { store: MutableStore }).store;
    const repairId = "repair-vendor-chat-active";

    store.repairs.push({
      id: repairId,
      ticketId: ticket.id,
      vendorId: "vendor-demo",
      status: "REQUESTED",
      title: "배관 처리 요청",
      description: "누수 부위를 확인해 주세요.",
      completionPhotoUrls: [],
      createdAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-18T00:00:00.000Z"
    });

    const tenantResult = service.addTenantComplaintMessage(
      "tenant-demo",
      complaint.id,
      { messageText: "화요일 오후 3시에 방문 가능해요." }
    );
    const managerResult = service.sendManagerTicketReply(
      "landlord-demo",
      ticket.id,
      { messageText: "업체 기사님도 이 시간을 확인해 주세요." }
    );

    assert.equal(tenantResult.message.repairId, repairId);
    assert.equal(managerResult.message.repairId, repairId);
  });

  it("keeps tenant and manager messages ticket-scoped without an active repair", () => {
    const service = new RoomlogService();
    const { complaint, ticket } = createTicket(service, "티켓 레벨 채팅 스코프");

    const tenantResult = service.addTenantComplaintMessage(
      "tenant-demo",
      complaint.id,
      { messageText: "책임 범위를 먼저 확인해 주세요." }
    );
    const managerResult = service.sendManagerTicketReply(
      "landlord-demo",
      ticket.id,
      { messageText: "관리자 검토 후 다시 안내드리겠습니다." }
    );

    assert.equal(tenantResult.message.repairId, undefined);
    assert.equal(managerResult.message.repairId, undefined);
  });
});
