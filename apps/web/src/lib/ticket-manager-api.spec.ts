import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  getManagerTicketDetail,
  listManagerProxyIntakeRooms,
  listManagerTicketRows,
  managerTicketAttachmentUrls,
  managerTicketByIdOrNull,
} from "./ticket-manager-api";
import type { TeamManagerTicket } from "./manager-mapping";
import { ApiError, ApiPayloadError } from "./server-api";

const ticket = {
  messages: [
    { attachmentUrls: [" /uploads/high.png ", "", "/uploads/high.png"] },
    { attachmentUrls: ["/uploads/chat-only.jpg"] },
  ],
} as unknown as TeamManagerTicket;

const detailTicket = {
  id: "ticket-1",
  complaintId: "complaint-1",
  status: "RECEIVED",
  priority: 3,
  responsibilityHint: "판단 어려움",
  complaint: {
    title: "현관 도어락 점검",
    description: "도어락이 간헐적으로 열리지 않습니다.",
    location: "현관",
    createdAt: "2026-07-16T09:00:00+09:00",
    updatedAt: "2026-07-16T09:00:00+09:00",
  },
  room: { roomNo: "301호" },
  messages: [
    { attachmentUrls: [" /uploads/photo.jpg ", "/uploads/photo.jpg"] },
  ],
} as TeamManagerTicket;

describe("manager ticket attachment mapping", () => {
  it("keeps only the initial intake photos and normalizes their URLs", () => {
    assert.deepEqual(managerTicketAttachmentUrls(ticket), [
      "/uploads/high.png",
    ]);
  });

  it("does not promote later chat photos when the intake had no photo", () => {
    const chatOnlyTicket = {
      messages: [
        { messageText: "사진 없이 접수했습니다.", attachmentUrls: [] },
        { messageText: "채팅 사진", attachmentUrls: ["/uploads/chat-only.jpg"] },
      ],
    } as unknown as TeamManagerTicket;

    assert.deepEqual(managerTicketAttachmentUrls(chatOnlyTicket), []);
  });

  it("returns an empty list when messages or attachments are absent", () => {
    assert.deepEqual(managerTicketAttachmentUrls({} as TeamManagerTicket), []);
    assert.deepEqual(
      managerTicketAttachmentUrls({ messages: [{}] } as unknown as TeamManagerTicket),
      [],
    );
  });
});

describe("manager ticket row loading", () => {
  it("preserves the manager unread state on dashboard rows", async () => {
    const [row] = await listManagerTicketRows(async () => [
      { ...detailTicket, isManagerUnread: true },
    ]);

    assert.equal(row?.isManagerUnread, true);
  });

  it("places a newly assigned vendor ticket ahead of older dashboard rows", async () => {
    const rows = await listManagerTicketRows(async () => [
      detailTicket,
      {
        ...detailTicket,
        id: "ticket-newly-assigned",
        complaintId: "complaint-newly-assigned",
        complaint: {
          ...detailTicket.complaint,
          updatedAt: "2026-07-19T09:00:00+09:00",
        },
        assignedVendor: { businessName: "테스트1" },
        repairs: [{
          id: "repair-newly-assigned",
          ticketId: "ticket-newly-assigned",
          status: "REQUESTED",
        }],
      },
    ]);

    assert.deepEqual(rows.map((row) => row.ticket.id), [
      "ticket-newly-assigned",
      "ticket-1",
    ]);
    assert.equal(rows[0]?.repair?.vendorName, "테스트1");
  });

  it("propagates API failures instead of returning an empty dashboard", async () => {
    const failure = new Error("manager tickets unavailable");

    await assert.rejects(
      () => listManagerTicketRows(async () => {
        throw failure;
      }),
      (error) => error === failure,
    );
  });

  it("keeps an actual empty API response as an empty dashboard", async () => {
    assert.deepEqual(await listManagerTicketRows(async () => []), []);
  });
});

describe("manager proxy-intake room loading", () => {
  it("uses demo rooms only for a fetch transport TypeError", async () => {
    const cause = Object.assign(new Error("connect refused"), { code: "ECONNREFUSED" });
    const rooms = await listManagerProxyIntakeRooms(async () => {
      throw new TypeError("fetch failed", { cause });
    });

    assert.ok(rooms.length > 0);
    assert.equal(rooms.some((room) => room.roomId === "room-301"), true);
  });

  it("rethrows HTTP and malformed-payload API errors", async () => {
    const apiFailure = new ApiError(500, "proxy-intake rooms unavailable");
    const payloadFailure = new ApiPayloadError(
      "INVALID_JSON",
      "/manager/proxy-intake/rooms",
      "GET",
      200,
    );

    for (const failure of [apiFailure, payloadFailure]) {
      await assert.rejects(
        () => listManagerProxyIntakeRooms(async () => {
          throw failure;
        }),
        (error) => error === failure,
      );
    }
  });

  it("does not hide arbitrary loader bugs behind demo data", async () => {
    for (const failure of [new Error("mapping bug"), new TypeError("mapping bug")]) {
      await assert.rejects(
        () => listManagerProxyIntakeRooms(async () => {
          throw failure;
        }),
        (error) => error === failure,
      );
    }
  });
});

describe("manager ticket detail loading", () => {
  it("maps only real detail fields and keeps missing analysis and repair null", async () => {
    const detail = await getManagerTicketDetail("ticket-1", {
      byId: async () => detailTicket,
      list: async () => {
        throw new Error("must not list tickets for an explicit id");
      },
    });

    assert.equal(detail?.ticket.id, "ticket-1");
    assert.equal(detail?.ticket.unitId, "301");
    assert.equal(detail?.analysis, null);
    assert.equal(detail?.repair, null);
    assert.deepEqual(detail?.attachmentUrls, ["/uploads/photo.jpg"]);
  });

  it("never replaces a missing explicit ticket with another active ticket", async () => {
    let listed = false;
    const detail = await getManagerTicketDetail("missing-ticket", {
      byId: async () => null,
      list: async () => {
        listed = true;
        return [detailTicket];
      },
    });

    assert.equal(detail, null);
    assert.equal(listed, false);
  });

  it("uses the first real ticket only when no id is specified", async () => {
    const detail = await getManagerTicketDetail(undefined, {
      byId: async () => {
        throw new Error("must not load by id");
      },
      list: async () => [detailTicket],
    });
    const empty = await getManagerTicketDetail(undefined, {
      byId: async () => {
        throw new Error("must not load by id");
      },
      list: async () => [],
    });

    assert.equal(detail?.ticket.id, "ticket-1");
    assert.equal(empty, null);
  });

  it("returns null only for a 404 and propagates server failures", async () => {
    const missing = await managerTicketByIdOrNull("missing-ticket", async () => {
      throw new ApiError(404, "not found");
    });
    const failure = new ApiError(500, "manager tickets unavailable");

    assert.equal(missing, null);
    await assert.rejects(
      () => managerTicketByIdOrNull("ticket-1", async () => {
        throw failure;
      }),
      (error) => error === failure,
    );
  });
});
