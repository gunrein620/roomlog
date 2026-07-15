import assert from "node:assert/strict";
import test from "node:test";

import { transformMitunetViewerHtml } from "./mitunet-proxy";

test("uses a save-and-return action instead of the RoomLog connection copy", () => {
  const transformed = transformMitunetViewerHtml(`
    <button id="save-json-btn"><span>Save JSON</span></button>
    <button id="connect-roomlog-btn" title="Connect this 3D plan to RoomLog"><span>RoomLog에 연결</span></button>
    <script>saveJsonButton.hidden = !canSave;</script>
  `);

  assert.match(transformed, /title="3D 도면을 저장하고 매물 등록으로 돌아가기"/);
  assert.match(transformed, /3D 도면 저장하기/);
  assert.doesNotMatch(transformed, /RoomLog에 연결/);
  assert.match(transformed, /saveJsonButton\.hidden = !canSave \|\| Boolean\(roomLogContext\);/);
});
