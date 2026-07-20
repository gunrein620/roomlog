import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();
const assistantSource = readFileSync(
  join(root, "src/app/manager/_components/ManagerAssistant.tsx"),
  "utf8",
);
const sessionSource = readFileSync(
  join(root, "src/app/manager/_components/useManagerAssistantSession.ts"),
  "utf8",
);

describe("manager assistant text confirmation", () => {
  it("does not render the pending-action button card", () => {
    assert.doesNotMatch(assistantSource, /ManagerAssistantActionCard/);
  });

  it("keeps the composer available and explains the accepted approval text", () => {
    assert.doesNotMatch(sessionSource, /Boolean\(store\.pendingAction\)/);
    assert.match(assistantSource, /승인.*진행해/);
  });
});
