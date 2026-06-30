import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("includes database connectivity in the health response", async () => {
    const controller = new (HealthController as any)({
      check: async () => ({ status: "ok", provider: "postgresql" })
    });

    assert.deepEqual(await controller.getHealth(), {
      status: "ok",
      service: "roomlog-api",
      database: {
        status: "ok",
        provider: "postgresql"
      }
    });
  });
});
