import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { listManagerTicketRows, managerTicketAttachmentUrls } from "./ticket-manager-api";
import type { TeamManagerTicket } from "./manager-mapping";

const ticket = {
  messages: [
    { attachmentUrls: [" /uploads/high.png ", "", "/uploads/high.png"] },
    { attachmentUrls: ["/uploads/wide.jpg"] },
  ],
} as unknown as TeamManagerTicket;

describe("manager ticket attachment mapping", () => {
  it("trims, removes blanks, and deduplicates attachment URLs", () => {
    assert.deepEqual(managerTicketAttachmentUrls(ticket), [
      "/uploads/high.png",
      "/uploads/wide.jpg",
    ]);
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
