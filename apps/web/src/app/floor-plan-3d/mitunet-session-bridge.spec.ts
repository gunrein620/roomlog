import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const viewerSource = readFileSync(
  join(process.cwd(), "../../services/mitunet/viewer/index.html"),
  "utf8",
);

test("bridges the cached floor-plan token before requesting GPT room materials", () => {
  const bridgeOffset = viewerSource.indexOf("async function ensureRoomLogSession()");
  const floorMaterialOffset = viewerSource.indexOf("async function ensureRoomFloorMaterials()");

  assert.ok(bridgeOffset >= 0, "RoomLog session bridge must exist in the viewer");
  assert.ok(floorMaterialOffset >= 0, "floor-material generation must remain available");
  assert.ok(bridgeOffset < floorMaterialOffset, "session bridge must be declared before floor-material generation");
  assert.match(viewerSource, /window\.location\.pathname\.startsWith\("\/floor-plan-3d\/"\)/);
  assert.match(viewerSource, /window\.localStorage\.getItem\("floorPlanAccessToken"\)/);
  assert.match(viewerSource, /fetch\("\/api\/auth\/floor-plan-session"/);
  assert.match(viewerSource, /Authorization:\s*`Bearer \$\{token\}`/);
  assert.match(viewerSource, /credentials:\s*"same-origin"/);

  const ensureBody = viewerSource.slice(floorMaterialOffset, viewerSource.indexOf("function pointIsInsideFinishedFloor", floorMaterialOffset));
  assert.match(ensureBody, /await ensureRoomLogSession\(\);/);
  assert.ok(
    ensureBody.indexOf("await ensureRoomLogSession();") < ensureBody.indexOf('fetch("/room-materials"'),
    "session bridge must run before the room-material request",
  );
});
