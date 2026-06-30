import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { createRoomlogServiceOptions } from "./roomlog.module";

describe("RoomlogModule", () => {
  it("configures a Prisma projector when DATABASE_URL is present", async () => {
    const options = createRoomlogServiceOptions({
      DATABASE_URL: "postgresql://roomlog:roomlog@localhost:5433/roomlog?schema=public"
    });

    assert.equal(Boolean(options.storeProjector), true);
    await options.storeProjector?.disconnect?.();
  });

  it("does not configure a Prisma projector without DATABASE_URL", () => {
    const options = createRoomlogServiceOptions({});

    assert.equal(options.storeProjector, undefined);
  });
});
