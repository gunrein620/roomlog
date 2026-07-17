import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { RoomlogController } from "./roomlog.controller";
import { RoomlogService } from "./roomlog.service";
import { RoomlogVendorWorkflowDomain } from "./services/roomlog-vendor-workflow.domain";

describe("vendor repair message controller", () => {
  it("broadcasts ticket activity only after the assigned vendor message is stored", async () => {
    const service = new RoomlogService();
    const events: string[] = [];
    const realtime = {
      broadcast(event: string, payload: Record<string, unknown>) {
        events.push(`${event}:${String(payload.kind)}`);
      }
    } as RealtimeGateway;
    const vendorWorkflow = {
      async addVendorRepairMessage(
        userId: string,
        repairId: string,
        input: { messageText?: string; attachmentUrls?: string[] }
      ) {
        events.push(`stored:${userId}:${repairId}`);
        return {
          senderRole: "VENDOR",
          messageText: input.messageText ?? "",
          attachmentUrls: input.attachmentUrls ?? [],
          createdAt: "2026-07-18T00:00:00.000Z"
        };
      }
    } as unknown as RoomlogVendorWorkflowDomain;
    const controller = new RoomlogController(
      service,
      realtime,
      undefined,
      vendorWorkflow
    );
    const auth = service.login({
      email: "vendor@roomlog.test",
      password: "password123!"
    });
    (service as unknown as { rolesForUser: () => string[] }).rolesForUser = () => [
      "VENDOR"
    ];

    const result = await controller.addVendorRepairMessage(
      `Bearer ${auth.accessToken}`,
      "repair-vendor-chat",
      { messageText: "화요일 오후 3시 방문 가능합니다." }
    );

    assert.equal(result.senderRole, "VENDOR");
    assert.deepEqual(events, [
      "stored:vendor-demo-user:repair-vendor-chat",
      "roomlog:activity:ticket"
    ]);
  });
});
