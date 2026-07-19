import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { RoomlogService, type Store } from "./roomlog.service";

describe("RoomlogService demo bootstrap persistence", () => {
  it("persists the initial demo tenant and room when a database starts empty", async () => {
    const persisted: Store[] = [];
    const service = new RoomlogService({
      seedDemoData: true,
      storeProjector: {
        persist(store) {
          persisted.push(structuredClone(store));
        }
      }
    });

    await service.flushPersistence();

    assert.equal(persisted.length, 1);
    assert.ok(persisted[0].users.some((user) => user.id === "tenant-demo"));
    assert.ok(persisted[0].rooms.some((room) => room.id === "room-301"));
    assert.equal(persisted[0].tenantRooms["tenant-demo"], "room-301");
  });
});
