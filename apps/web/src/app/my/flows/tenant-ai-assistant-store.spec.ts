import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const storePath = join(
  process.cwd(),
  "src/app/my/flows/tenant-ai-assistant-store.ts",
);

describe("tenant AI assistant store", () => {
  it("restores stable conversation state and resets transient busy state", async () => {
    assert.equal(existsSync(storePath), true, "tenant AI assistant store must exist");
    const store = require(storePath) as {
      parseTenantAiAssistantState(raw: string | null): {
        open: boolean;
        mode: string;
        draft: string;
        messages: unknown[];
        sessionId: string | null;
        busy: boolean;
      };
    };
    const restored = store.parseTenantAiAssistantState(JSON.stringify({
      open: true,
      mode: "call",
      draft: "에어컨이 안 돼요",
      messages: [{ id: "m1", sender: "tenant", text: "에어컨이 안 돼요" }],
      sessionId: "intake-1",
      busy: true,
    }));

    assert.equal(restored.open, true);
    assert.equal(restored.mode, "call");
    assert.equal(restored.draft, "에어컨이 안 돼요");
    assert.equal(restored.messages.length, 1);
    assert.equal(restored.sessionId, "intake-1");
    assert.equal(restored.busy, false);
  });

  it("falls back safely when stored state is malformed", async () => {
    assert.equal(existsSync(storePath), true, "tenant AI assistant store must exist");
    const store = require(storePath) as {
      initialTenantAiAssistantState: unknown;
      parseTenantAiAssistantState(raw: string | null): unknown;
    };

    assert.deepEqual(
      store.parseTenantAiAssistantState("{broken"),
      store.initialTenantAiAssistantState,
    );
  });
});
