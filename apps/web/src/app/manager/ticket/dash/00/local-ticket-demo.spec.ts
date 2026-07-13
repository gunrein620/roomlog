import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { Ticket } from "@roomlog/types";
import {
  appendLocalTicketDemoRows,
  isLocalRequestHost,
  type LocalDemoFileReader,
} from "./local-ticket-demo";
import type { DefectDashboardRow } from "./ticket-dashboard-model";

const ticket = (id: string): Ticket => ({
  id,
  type: id.includes("complaint") ? "complaint" : "defect",
  unitId: "101",
  title: `로컬 테스트 ${id}`,
  description: "로컬 화면 확인용 데이터",
  status: "received",
  urgency: 3,
  createdAt: "2026-07-13T09:00:00+09:00",
  updatedAt: "2026-07-13T09:00:00+09:00",
});

const row = (id: string): DefectDashboardRow => ({
  ticket: ticket(id),
  buildingName: "로컬 테스트 빌딩",
});

describe("manager ticket local demo loader", () => {
  it("accepts only loopback hosts with an optional numeric port", () => {
    for (const host of [
      "localhost",
      "localhost:3000",
      "127.0.0.1",
      "127.0.0.1:3000",
      "[::1]",
      "[::1]:3000",
    ]) {
      assert.equal(isLocalRequestHost(host), true, host);
    }

    for (const host of [
      undefined,
      null,
      "",
      "roomlog.example.com",
      "localhost.example.com",
      "localhost:abc",
      "127.0.0.2:3000",
      "[::2]:3000",
    ]) {
      assert.equal(isLocalRequestHost(host), false, String(host));
    }
  });

  it("appends at most ten valid local rows after real rows without mutating input", async () => {
    const realRows = [row("real-1")];
    const localRows = Array.from({ length: 11 }, (_, index) => row(`local-${index + 1}`));
    const readFile: LocalDemoFileReader = async () => JSON.stringify(localRows);

    const result = await appendLocalTicketDemoRows(realRows, "localhost:3000", readFile);

    assert.deepEqual(result.map(({ ticket: item }) => item.id), [
      "real-1",
      ...localRows.slice(0, 10).map(({ ticket: item }) => item.id),
    ]);
    assert.equal(realRows.length, 1);
    assert.notEqual(result, realRows);
  });

  it("does not read or append local rows for a deployment host", async () => {
    const realRows = [row("real-1")];
    let readCount = 0;
    const readFile: LocalDemoFileReader = async () => {
      readCount += 1;
      return JSON.stringify([row("local-1")]);
    };

    const result = await appendLocalTicketDemoRows(
      realRows,
      "admin.roomlog.example.com",
      readFile,
    );

    assert.deepEqual(result, realRows);
    assert.notEqual(result, realRows);
    assert.equal(readCount, 0);
  });

  it("keeps real rows when the local file is missing or malformed", async () => {
    const realRows = [row("real-1")];
    const missing: LocalDemoFileReader = async () => {
      throw new Error("ENOENT");
    };
    const malformed: LocalDemoFileReader = async () => "not-json";

    assert.deepEqual(
      await appendLocalTicketDemoRows(realRows, "127.0.0.1:3000", missing),
      realRows,
    );
    assert.deepEqual(
      await appendLocalTicketDemoRows(realRows, "[::1]:3000", malformed),
      realRows,
    );
  });

  it("drops structurally invalid local rows", async () => {
    const readFile: LocalDemoFileReader = async () =>
      JSON.stringify([
        row("local-valid"),
        { ticket: { id: "local-invalid" } },
        { buildingName: "티켓 없음" },
      ]);

    const result = await appendLocalTicketDemoRows([], "localhost", readFile);

    assert.deepEqual(result.map(({ ticket: item }) => item.id), ["local-valid"]);
  });
});
