import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { tradeChatDisplayMode } from "./trade-chat-display";

describe("trade chat display mode", () => {
  it("keeps a focused thread visible even when the summary list is temporarily empty", () => {
    assert.equal(
      tradeChatDisplayMode({
        needsLogin: false,
        threadsLoaded: true,
        threadCount: 0,
        hasOpenThreadId: true,
        hasOpenThread: true
      }),
      "open"
    );
  });

  it("shows loading instead of an empty state while a focused thread is still loading", () => {
    assert.equal(
      tradeChatDisplayMode({
        needsLogin: false,
        threadsLoaded: true,
        threadCount: 0,
        hasOpenThreadId: true,
        hasOpenThread: false
      }),
      "loading"
    );
  });
});
