import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { RoomlogService } from "./roomlog.service";

type MutableStore = {
  messages: Array<{
    id: string;
    ticketId: string;
    complaintId?: string;
    repairId?: string;
    senderUserId: string;
    senderRole: "TENANT" | "LANDLORD" | "VENDOR" | "AI_ASSISTANT" | "SYSTEM";
    messageText: string;
    attachmentUrls: string[];
    createdAt: string;
  }>;
  repairs: Array<Record<string, unknown>>;
};

function createTicket(service: RoomlogService, title: string) {
  return service.createComplaint("tenant-demo", {
    title,
    description: "싱크대 아래 배관에서 물이 새고 있습니다.",
    location: "301호 주방",
    availableTimes: "평일 오후 6시 이후",
  });
}

describe("RoomlogService manager ticket detail projection", () => {
  it("exposes the complete detail thread in chronological order but omits messages from the list", () => {
    const service = new RoomlogService();
    const { complaint, ticket } = createTicket(service, "관리자 상세 메시지 정렬");
    const store = (service as unknown as { store: MutableStore }).store;

    store.messages.push(
      {
        id: "manager-thread-late",
        ticketId: ticket.id,
        complaintId: complaint.id,
        senderUserId: "vendor-demo",
        senderRole: "VENDOR",
        messageText: "오후 4시에 방문하겠습니다.",
        attachmentUrls: [],
        createdAt: "2026-07-18T07:00:00.000Z",
      },
      {
        id: "manager-thread-early",
        ticketId: ticket.id,
        complaintId: complaint.id,
        senderUserId: "tenant-demo",
        senderRole: "TENANT",
        messageText: "오후 시간에 방문 가능합니다.",
        attachmentUrls: [],
        createdAt: "2026-07-18T05:00:00.000Z",
      },
      {
        id: "manager-thread-middle",
        ticketId: ticket.id,
        complaintId: complaint.id,
        senderUserId: "landlord-demo",
        senderRole: "LANDLORD",
        messageText: "업체에 일정을 확인하겠습니다.",
        attachmentUrls: [],
        createdAt: "2026-07-18T06:00:00.000Z",
      },
    );

    const detail = service.getTicketDetailForManager("landlord-demo", ticket.id);
    const listItem = service
      .listTicketsForManager("landlord-demo")
      .find((item) => item.id === ticket.id);
    const detailMessages = detail.messages;

    assert.ok(detailMessages);
    assert.deepEqual(
      detailMessages
        .filter((message) => message.id.startsWith("manager-thread-"))
        .map((message) => message.id),
      ["manager-thread-early", "manager-thread-middle", "manager-thread-late"],
    );
    assert.equal(Object.hasOwn(listItem ?? {}, "messages"), false);
  });

  it("projects the latest cancelled repair decline reason only on manager detail", () => {
    const service = new RoomlogService();
    const { ticket } = createTicket(service, "업체 거절 관리자 표시");
    const store = (service as unknown as { store: MutableStore }).store;

    store.repairs.push({
      id: "repair-declined-manager-detail",
      ticketId: ticket.id,
      vendorId: "vendor-demo",
      status: "CANCELLED",
      title: "배관 처리 요청",
      description: "누수 부위를 확인해 주세요.",
      completionPhotoUrls: [],
      createdAt: "2026-07-18T01:00:00.000Z",
      updatedAt: "2026-07-18T02:00:00.000Z",
      latestEstimate: {
        status: "DECLINED",
        declineReason: "현재 긴급 출동 인력이 없습니다.",
        submittedAt: "2026-07-18T02:00:00.000Z",
      },
    });

    const detail = service.getTicketDetailForManager("landlord-demo", ticket.id) as unknown as {
      vendorDecline?: { repairId: string; reason: string };
    };
    const listItem = service
      .listTicketsForManager("landlord-demo")
      .find((item) => item.id === ticket.id);

    assert.deepEqual(detail.vendorDecline, {
      repairId: "repair-declined-manager-detail",
      reason: "현재 긴급 출동 인력이 없습니다.",
    });
    assert.equal(Object.hasOwn(listItem ?? {}, "vendorDecline"), false);
  });
});
