import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { VendorJobDetail } from "@roomlog/types";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { RoomlogController } from "./roomlog.controller";
import { RoomlogService } from "./roomlog.service";
import { RoomlogVendorWorkflowDomain } from "./services/roomlog-vendor-workflow.domain";
import type {
  VendorAssignmentNoticeRecord,
  VendorWorkflowRepository,
} from "./vendor-workflow.repository";

const job = {
  repairId: "repair-notice-1",
  status: "REQUESTED",
} as VendorJobDetail;

const notice: VendorAssignmentNoticeRecord = {
  id: "message-notice-1",
  ticketId: "ticket-notice-1",
  complaintId: "complaint-notice-1",
  repairId: "repair-notice-1",
  senderUserId: "landlord-demo",
  senderRole: "LANDLORD",
  messageText:
    "배정 업체: 빠른누수 설비. 연락처는 010-1234-5678입니다. 해당 업체에 전화하여 방문 일정을 상의해 주세요.",
  attachmentUrls: [],
  createdAt: "2026-07-19T00:00:00.000Z",
};

describe("vendor assignment tenant notice", () => {
  it("syncs the durable assignment notice into the shared ticket thread", async () => {
    const repository = {
      async assignVendor() {
        return { ...job, assignmentNotice: notice };
      },
    } as unknown as VendorWorkflowRepository;
    const synced: VendorAssignmentNoticeRecord[] = [];
    const accounts = {
      async resolveActiveVendorId() {
        return undefined;
      },
      async resolveActiveVendorAccount() {
        return undefined;
      },
      ingestVendorAssignmentNotice(record: VendorAssignmentNoticeRecord) {
        synced.push(record);
      },
    };
    const domain = new RoomlogVendorWorkflowDomain(repository, accounts);

    const result = await domain.assignVendor("landlord-demo", notice.ticketId, {
      vendorId: "vendor-notice-1",
      requestNote: "누수 점검 요청",
    });

    assert.equal(result.assignmentNotice, notice);
    assert.deepEqual(synced, [notice]);
  });

  it("broadcasts the saved notice once but keeps the existing assignment response shape", async () => {
    const service = new RoomlogService();
    const broadcasts: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const realtime = {
      broadcast(event: string, payload: Record<string, unknown>) {
        broadcasts.push({ event, payload });
      },
    } as RealtimeGateway;
    const workflow = {
      async assignVendor() {
        return { ...job, assignmentNotice: notice };
      },
    } as RoomlogVendorWorkflowDomain;
    const controller = new RoomlogController(service, realtime, undefined, workflow);
    const auth = service.login({
      email: "manager@roomlog.test",
      password: "password123!",
    });

    const result = await controller.assignVendor(
      `Bearer ${auth.accessToken}`,
      notice.ticketId,
      { vendorId: "vendor-notice-1", requestNote: "누수 점검 요청" },
    );

    assert.deepEqual(result, job);
    assert.deepEqual(broadcasts, [
      {
        event: "roomlog:ticket-message",
        payload: { ticketId: notice.ticketId, message: notice },
      },
    ]);
  });
});
