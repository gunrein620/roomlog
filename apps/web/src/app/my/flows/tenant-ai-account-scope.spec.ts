import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const flowDirectory = join(process.cwd(), "src/app/my/flows");
const tenantPageSource = readFileSync(join(flowDirectory, "TenantMyPage.tsx"), "utf8");
const homeAppSource = readFileSync(join(process.cwd(), "src/app/HomeApp.tsx"), "utf8");

describe("tenant AI account boundary wiring", () => {
  it("activates tenant AI storage only after the authenticated user and selected room are known", () => {
    assert.match(tenantPageSource, /activateTenantAiAssistantScope/);
    assert.match(
      tenantPageSource,
      /activateTenantAiAssistantScope\(\{\s*userId:\s*me\.userId,\s*roomId:\s*selectedRoom\.roomId\s*\}\)/,
    );
  });

  it("clears tenant AI state and the authenticated realtime socket during logout", () => {
    assert.match(homeAppSource, /clearTenantAiAssistantSession/);
    assert.match(homeAppSource, /resetRealtimeSocket/);
    assert.match(
      homeAppSource,
      /const logout = async \(\) => \{[\s\S]*clearTenantAiAssistantSession\(\);[\s\S]*resetRealtimeSocket\(\);/,
    );
  });

  it("clears a prior browser identity before accepting a newly authenticated account", () => {
    const completeServiceAuthSource = sourceBlock(
      homeAppSource,
      "const completeServiceAuth",
      "const toggleQuickFilter",
    );
    assert.match(
      completeServiceAuthSource,
      /clearTenantAiAssistantSession\(\);[\s\S]*resetRealtimeSocket\(\);/,
    );
  });
});

function sourceBlock(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return source.slice(start, end);
}
