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

  it("discards the legacy unscoped browser session", () => {
    const sessionStorage = createSessionStorage();
    installWindow(sessionStorage);
    const store = require(storePath) as TenantAiAssistantStoreModule;
    sessionStorage.setItem(
      "tenant-ai-assistant-session-v1",
      JSON.stringify({
        messages: [{ id: "a-message", sender: "tenant", text: "A 계정 대화" }],
        sessionId: "session-a",
      }),
    );

    store.activateTenantAiAssistantScope({ userId: "tenant-a", roomId: "room-a" });

    assert.equal(store.getTenantAiAssistantState().sessionId, null);
    assert.deepEqual(store.getTenantAiAssistantState().messages, [
      {
        id: "tenant-ai-welcome",
        sender: "assistant",
        text: "안녕하세요! 우주(Woo-zu) AI 어시스턴트입니다. 생활 중 불편한 점을 알려주시면 정리해서 관리자에게 접수까지 도와드릴게요.",
      },
    ]);
    assert.equal(sessionStorage.getItem("tenant-ai-assistant-session-v1"), null);
  });

  it("restores a chat only for the active tenant and room", () => {
    const sessionStorage = createSessionStorage();
    installWindow(sessionStorage);
    const store = require(storePath) as TenantAiAssistantStoreModule;
    const tenantAScope = { userId: "tenant-a", roomId: "room-a" };

    store.activateTenantAiAssistantScope(tenantAScope);
    store.appendTenantAiMessage("tenant", "A 계정 대화");
    store.setTenantAiSessionId("session-a");

    store.activateTenantAiAssistantScope({ userId: "tenant-b", roomId: "room-b" });

    assert.equal(store.getTenantAiAssistantState().sessionId, null);
    assert.equal(
      store.getTenantAiAssistantState().messages.some((message) => message.text === "A 계정 대화"),
      false,
    );

    store.activateTenantAiAssistantScope(tenantAScope);
    assert.equal(store.getTenantAiAssistantState().sessionId, "session-a");
    assert.equal(
      store.getTenantAiAssistantState().messages.some((message) => message.text === "A 계정 대화"),
      true,
    );
  });

  it("removes the active tenant chat when logging out", () => {
    const sessionStorage = createSessionStorage();
    installWindow(sessionStorage);
    const store = require(storePath) as TenantAiAssistantStoreModule;
    const scope = { userId: "tenant-a", roomId: "room-a" };

    store.activateTenantAiAssistantScope(scope);
    store.setTenantAiSessionId("session-a");
    store.clearTenantAiAssistantSession();

    assert.equal(store.getTenantAiAssistantState().sessionId, null);
    assert.equal(sessionStorage.getItem(store.tenantAiAssistantStorageKey(scope)), null);
  });
});

type TenantAiAssistantStoreModule = {
  activateTenantAiAssistantScope(scope: { userId: string; roomId: string }): void;
  appendTenantAiMessage(sender: "assistant" | "tenant" | "system" | "receipt", text: string): void;
  clearTenantAiAssistantSession(): void;
  getTenantAiAssistantState(): {
    messages: Array<{ id: string; sender: string; text: string }>;
    sessionId: string | null;
  };
  setTenantAiSessionId(sessionId: string | null): void;
  tenantAiAssistantStorageKey(scope: { userId: string; roomId: string }): string;
};

function createSessionStorage() {
  const entries = new Map<string, string>();
  return {
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      entries.set(key, value);
    },
    removeItem(key: string) {
      entries.delete(key);
    },
  };
}

function installWindow(sessionStorage: ReturnType<typeof createSessionStorage>) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage },
  });
}
