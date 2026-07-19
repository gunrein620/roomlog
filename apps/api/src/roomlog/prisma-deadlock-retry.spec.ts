import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Prisma } from "@prisma/client";
import { isDeadlockError, withDeadlockRetry } from "./prisma-deadlock-retry";

function deadlockError(meta: Record<string, unknown>, code = "P2010") {
  return new Prisma.PrismaClientKnownRequestError("deadlock detected", {
    code,
    clientVersion: "7.8.0",
    meta
  });
}

describe("isDeadlockError", () => {
  it("recognizes P2010 raw query failures carrying SQLSTATE 40P01", () => {
    assert.equal(isDeadlockError(deadlockError({ code: "40P01" })), true);
    assert.equal(
      isDeadlockError(deadlockError({ originalCode: "40P01" })),
      true
    );
    assert.equal(
      isDeadlockError(
        deadlockError({ driverAdapterError: { cause: { code: "40P01" } } })
      ),
      true
    );
  });

  it("recognizes P2034 transaction write conflicts", () => {
    assert.equal(isDeadlockError(deadlockError({}, "P2034")), true);
  });

  it("rejects other Prisma errors and plain errors", () => {
    assert.equal(isDeadlockError(deadlockError({ code: "23505" })), false);
    assert.equal(isDeadlockError(deadlockError({}, "P2002")), false);
    assert.equal(isDeadlockError(new Error("deadlock detected")), false);
  });
});

describe("withDeadlockRetry", () => {
  it("retries the whole transaction after a deadlock and returns the result", async () => {
    let attempts = 0;
    const result = await withDeadlockRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw deadlockError({ code: "40P01" });
        return "ok";
      },
      { sleep: async () => undefined }
    );
    assert.equal(result, "ok");
    assert.equal(attempts, 3);
  });

  it("gives up after maxAttempts and rethrows the deadlock error", async () => {
    let attempts = 0;
    await assert.rejects(
      withDeadlockRetry(
        async () => {
          attempts += 1;
          throw deadlockError({ code: "40P01" });
        },
        { maxAttempts: 2, sleep: async () => undefined }
      ),
      (error: unknown) => isDeadlockError(error)
    );
    assert.equal(attempts, 2);
  });

  it("does not retry non-deadlock errors", async () => {
    let attempts = 0;
    await assert.rejects(
      withDeadlockRetry(
        async () => {
          attempts += 1;
          throw deadlockError({}, "P2002");
        },
        { sleep: async () => undefined }
      )
    );
    assert.equal(attempts, 1);
  });
});
