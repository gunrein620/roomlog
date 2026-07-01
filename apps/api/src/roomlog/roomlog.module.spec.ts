import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { createRoomlogServiceOptions } from "./roomlog.module";

describe("RoomlogModule", () => {
  const testDatabaseUrl = process.env.ROOMLOG_TEST_DATABASE_URL;

  it("configures a Prisma projector when DATABASE_URL is present", { skip: !testDatabaseUrl }, async () => {
    const options = await createRoomlogServiceOptions({
      DATABASE_URL: testDatabaseUrl!
    });

    assert.equal(Boolean(options.storeProjector), true);
    await options.storeProjector?.disconnect?.();
  });

  it("does not configure a Prisma projector without DATABASE_URL", async () => {
    const options = await createRoomlogServiceOptions({});

    assert.equal(options.storeProjector, undefined);
  });
});
