import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { ManagerProxyIntakeRoom } from "@/lib/ticket-manager-api";
import {
  buildManagerProxyIntakeInput,
  createProxyIntakeClientRequestId,
  focusTrapTarget,
} from "./proxy-intake-behavior";
import * as proxyIntakeBehavior from "./proxy-intake-behavior";

const sharedRoom: ManagerProxyIntakeRoom = {
  roomId: "room-301",
  buildingName: "정글빌라",
  unitLabel: "301호",
  hasTenant: true,
  tenants: [
    { tenantId: "tenant-demo", name: "김민수" },
    { tenantId: "multi-demo", name: "정겸직" },
  ],
};

const singleTenantRoom: ManagerProxyIntakeRoom = {
  roomId: "room-302",
  buildingName: "정글빌라",
  unitLabel: "302호",
  hasTenant: true,
  tenants: [{ tenantId: "tenant-billing-302", name: "김하윤" }],
};

const fields = {
  title: "주방 수전 점검",
  description: "주방 수전에서 물이 새어 확인이 필요합니다.",
  location: "주방 싱크대",
  occurredAt: "2026-07-18T09:30",
  availableTimes: "평일 오후 7시 이후",
  urgency: 2 as const,
  reportedVia: "phone" as const,
};

describe("manager proxy-intake form behavior", () => {
  it("builds a multi-tenant payload with the selected tenant, stable request id, and ISO date", () => {
    const input = buildManagerProxyIntakeInput({
      room: sharedRoom,
      selectedTenantId: "multi-demo",
      clientRequestId: "proxy-form-1",
      fields,
    });

    assert.equal(input.roomId, "room-301");
    assert.equal(input.tenantId, "multi-demo");
    assert.equal(input.clientRequestId, "proxy-form-1");
    assert.equal(input.occurredAt, new Date(fields.occurredAt).toISOString());
  });

  it("omits tenantId for server-side auto attribution in a single-tenant room", () => {
    const input = buildManagerProxyIntakeInput({
      room: singleTenantRoom,
      selectedTenantId: "",
      clientRequestId: "proxy-form-2",
      fields: { ...fields, occurredAt: "" },
    });

    assert.equal(Object.hasOwn(input, "tenantId"), false);
    assert.equal(Object.hasOwn(input, "occurredAt"), false);
  });

  it("rejects a missing multi-tenant selection and an invalid date", () => {
    assert.throws(
      () => buildManagerProxyIntakeInput({
        room: sharedRoom,
        selectedTenantId: "",
        clientRequestId: "proxy-form-3",
        fields,
      }),
      /세입자를 선택해 주세요/u,
    );
    assert.throws(
      () => buildManagerProxyIntakeInput({
        room: singleTenantRoom,
        selectedTenantId: "",
        clientRequestId: "proxy-form-4",
        fields: { ...fields, occurredAt: "not-a-date" },
      }),
      /발생 시점/u,
    );
  });

  it("creates request ids through an injectable UUID source", () => {
    let calls = 0;
    const id = createProxyIntakeClientRequestId(() => {
      calls += 1;
      return "proxy-form-stable";
    });

    assert.equal(id, "proxy-form-stable");
    assert.equal(calls, 1);
  });
});

describe("manager proxy-intake focus trapping", () => {
  const focusable = ["room", "cancel", "submit"] as const;

  it("wraps forward Tab from the last control to the first", () => {
    assert.equal(focusTrapTarget(focusable, "submit", false), "room");
  });

  it("wraps Shift+Tab from the first control to the last", () => {
    assert.equal(focusTrapTarget(focusable, "room", true), "submit");
  });

  it("does not interfere while focus remains within the dialog", () => {
    assert.equal(focusTrapTarget(focusable, "cancel", false), undefined);
    assert.equal(focusTrapTarget(focusable, "cancel", true), undefined);
  });
});

describe("manager proxy-intake upload retry cache", () => {
  it("keeps each successful upload and skips it after a later file fails", async () => {
    const uploadProxyIntakeFiles = (
      proxyIntakeBehavior as unknown as {
        uploadProxyIntakeFiles?: <T>(
          files: readonly T[],
          cachedUrls: readonly string[],
          uploadFile: (file: T) => Promise<string>,
          onProgress: (urls: readonly string[]) => void,
        ) => Promise<string[]>;
      }
    ).uploadProxyIntakeFiles;
    assert.equal(typeof uploadProxyIntakeFiles, "function");
    if (!uploadProxyIntakeFiles) return;

    let cachedUrls: readonly string[] = [];
    const firstAttempted: string[] = [];
    await assert.rejects(
      () => uploadProxyIntakeFiles(
        ["first.jpg", "second.jpg"],
        cachedUrls,
        async (file) => {
          firstAttempted.push(file);
          if (file === "second.jpg") throw new Error("upload failed");
          return "/uploads/first.jpg";
        },
        (urls) => {
          cachedUrls = [...urls];
        },
      ),
      /upload failed/u,
    );
    assert.deepEqual(firstAttempted, ["first.jpg", "second.jpg"]);
    assert.deepEqual(cachedUrls, ["/uploads/first.jpg"]);

    const retriedFiles: string[] = [];
    const result = await uploadProxyIntakeFiles(
      ["first.jpg", "second.jpg"],
      cachedUrls,
      async (file) => {
        retriedFiles.push(file);
        return `/uploads/${file}`;
      },
      (urls) => {
        cachedUrls = [...urls];
      },
    );

    assert.deepEqual(retriedFiles, ["second.jpg"]);
    assert.deepEqual(result, ["/uploads/first.jpg", "/uploads/second.jpg"]);
  });
});
