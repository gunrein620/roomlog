import assert from "node:assert/strict";
import test from "node:test";

import {
  beginRoomLogFurnitureSimulation,
  buildRoomLogCompletion,
  buildRoomLogEditorResumeUrl,
  furnitureRelativePathFromModelUrl,
  readRoomLogFurnitureDraft,
  sendRoomLogCompletion,
} from "./roomlog-integration.mjs";

const context = { requestId: "request-1", returnOrigin: "http://localhost:3000" };
const plan = {
  canvas_size: [100, 100],
  content_rect: [0, 0, 100, 100],
  calibration: { millimetersPerPixel: 10 },
  polygons: { wall: [{ outer: [[0, 0], [10, 0], [10, 2], [0, 2]], holes: [] }], door: [], window: [] }
};

function furniture(placement) {
  return {
    id: "furniture-1",
    relativePath: "lighting/lamp.glb",
    position: [1, 1, 2],
    rotationY: 0,
    sizeMm: { width: 300, height: 500, depth: 100 },
    ...(placement ? { placement } : {})
  };
}

test("RoomLog completion preserves surface and wall attachment metadata", () => {
  const surface = buildRoomLogCompletion(context, plan, "plan", [
    furniture({ mode: "surface", supportFurnitureId: "table-1" })
  ]);
  const wall = buildRoomLogCompletion(context, plan, "plan", [
    furniture({ mode: "wall", wallId: "wall-1" })
  ]);

  assert.deepEqual(surface.payload.furnitures[0].placement, { mode: "surface", supportFurnitureId: "table-1" });
  assert.deepEqual(wall.payload.furnitures[0].placement, { mode: "wall", wallId: "wall-1" });
});

test("RoomLog completion leaves legacy furniture attachment absent", () => {
  const message = buildRoomLogCompletion(context, plan, "plan", [furniture()]);
  assert.equal(message.payload.furnitures[0].placement, undefined);
});

test("RoomLog completion rejects incomplete attachment metadata", () => {
  assert.throws(
    () => buildRoomLogCompletion(context, plan, "plan", [furniture({ mode: "surface" })]),
    /supportFurnitureId/
  );
  assert.throws(
    () => buildRoomLogCompletion(context, plan, "plan", [furniture({ mode: "wall" })]),
    /wallId/
  );
});

test("RoomLog furniture handoff preserves a resumable editor snapshot per request", () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage: storage, location: { href: "" } };
  const editorSnapshot = {
    composedPlan: { ...plan, input_image_b64: "aW1hZ2U=" },
    review: { input_image_b64: "aW1hZ2U=", wall_mask_b64: "bWFzaw==", openings: [] },
    sourceName: "plan.png",
  };

  try {
    beginRoomLogFurnitureSimulation(context, plan, "plan", [], "floor", undefined, editorSnapshot);
    const saved = readRoomLogFurnitureDraft(storage, context.requestId);
    assert.deepEqual(saved.editorSnapshot, editorSnapshot);
    editorSnapshot.sourceName = "changed.png";
    assert.equal(saved.editorSnapshot.sourceName, "plan.png");
  } finally {
    globalThis.window = originalWindow;
  }
});

test("Floor furniture handoff retains the original plan image for a later 3D switch", () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage: storage, location: { href: "" } };

  try {
    beginRoomLogFurnitureSimulation(
      context,
      { ...plan, input_image_b64: "c291cmNlLXBsYW4=" },
      "plan",
      [],
      "floor",
    );
    const saved = readRoomLogFurnitureDraft(storage, context.requestId);
    assert.equal(saved.floorPlan.mitunet.surfaceMode, "floor");
    assert.equal(saved.floorPlan.mitunet.sourceImageB64, "c291cmNlLXBsYW4=");
  } finally {
    globalThis.window = originalWindow;
  }
});

test("RoomLog editor resume URL carries the request and requested view", () => {
  const original = new URL(buildRoomLogEditorResumeUrl(context, "original"));
  const threeDimensional = new URL(buildRoomLogEditorResumeUrl(context, "3d"));
  const floor = new URL(buildRoomLogEditorResumeUrl(context, "floor"));

  assert.equal(original.pathname, "/floor-plan-3d/mitunet");
  assert.equal(original.searchParams.get("integration"), "roomlog");
  assert.equal(original.searchParams.get("requestId"), context.requestId);
  assert.equal(original.searchParams.get("returnOrigin"), context.returnOrigin);
  assert.equal(original.searchParams.get("resumeView"), "original");
  assert.equal(threeDimensional.searchParams.get("resumeView"), "3d");
  assert.equal(floor.searchParams.get("resumeView"), "floor");
  assert.throws(() => buildRoomLogEditorResumeUrl(context, "furnishing"), /resume view/i);
});

test("re-entering furniture keeps the layout auto-saved by the owner page", () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage: storage, location: { href: "" } };
  const editorSnapshot = {
    composedPlan: { polygons: plan.polygons },
    review: { input_image_b64: "cGxhbi1h", wall_mask_b64: "bWFzaw==" },
    sourceName: "plan-a.png",
  };

  try {
    beginRoomLogFurnitureSimulation(context, plan, "plan", [], "floor", undefined, editorSnapshot);
    const saved = readRoomLogFurnitureDraft(storage, context.requestId);
    saved.floorPlan.furnitures = [{ id: "owner-saved-chair" }];
    storage.setItem(`roomlogOwnerFurnitureDraft:${context.requestId}`, JSON.stringify(saved));

    beginRoomLogFurnitureSimulation(context, plan, "plan", [], "floor", undefined, editorSnapshot);
    assert.deepEqual(
      readRoomLogFurnitureDraft(storage, context.requestId).floorPlan.furnitures,
      [{ id: "owner-saved-chair" }],
    );
  } finally {
    globalThis.window = originalWindow;
  }
});

test("a different uploaded plan does not inherit furniture from the previous draft", () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage: storage, location: { href: "" } };
  const snapshot = inputImage => ({
    composedPlan: { polygons: plan.polygons },
    review: { input_image_b64: inputImage, wall_mask_b64: "bWFzaw==" },
    sourceName: `${inputImage}.png`,
  });

  try {
    beginRoomLogFurnitureSimulation(context, plan, "plan", [], "floor", undefined, snapshot("cGxhbi1h"));
    const saved = readRoomLogFurnitureDraft(storage, context.requestId);
    saved.floorPlan.furnitures = [{ id: "old-chair" }];
    storage.setItem(`roomlogOwnerFurnitureDraft:${context.requestId}`, JSON.stringify(saved));

    beginRoomLogFurnitureSimulation(context, plan, "plan", [], "floor", undefined, snapshot("cGxhbi1i"));
    assert.deepEqual(readRoomLogFurnitureDraft(storage, context.requestId).floorPlan.furnitures, []);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("final RoomLog save keeps furniture auto-saved before returning through 2D or 3D", () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage: storage, location: { href: "" } };
  const resumablePlan = { ...plan, input_image_b64: "cGxhbi1h" };
  const editorSnapshot = {
    composedPlan: { polygons: plan.polygons },
    review: { input_image_b64: "cGxhbi1h", wall_mask_b64: "bWFzaw==" },
    sourceName: "plan-a.png",
  };

  try {
    beginRoomLogFurnitureSimulation(context, resumablePlan, "plan", [], "floor", undefined, editorSnapshot);
    const draft = readRoomLogFurnitureDraft(storage, context.requestId);
    draft.floorPlan.furnitures = [{ id: "owner-saved-chair" }];
    storage.setItem(`roomlogOwnerFurnitureDraft:${context.requestId}`, JSON.stringify(draft));

    sendRoomLogCompletion(context, resumablePlan, "plan", []);
    const listing = JSON.parse(storage.getItem(`roomlogListingFloorPlan3D:${context.requestId}`));
    assert.deepEqual(listing.furnitures, [{ id: "owner-saved-chair" }]);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("normalizes owner catalog modelUrls back to relative nested GLB paths for re-entry", () => {
  const s3Base = "https://woozu-static-file.s3.ap-northeast-2.amazonaws.com/furniture";

  // 로컬 base는 인자 없이도 벗겨진다.
  assert.equal(
    furnitureRelativePathFromModelUrl("/floor-plan-3d/furniture-assets/sofa/nyhamn.glb"),
    "sofa/nyhamn.glb",
  );

  // 등록 가구/폴리의 S3 절대 URL은 설정된 base로 상대경로가 된다 — 재진입 검증이 통과한다.
  assert.equal(
    furnitureRelativePathFromModelUrl(`${s3Base}/sofa/nyhamn.glb`, [s3Base]),
    "sofa/nyhamn.glb",
  );
  assert.equal(
    furnitureRelativePathFromModelUrl(`${s3Base}/polyhaven-cc0/chair.glb`, [`${s3Base}/`]),
    "polyhaven-cc0/chair.glb",
  );

  // 정규화한 상대경로는 mapFurniturePlacements 검증을 통과한다(빈 세그먼트 없음).
  const relativePath = furnitureRelativePathFromModelUrl(`${s3Base}/sofa/nyhamn.glb`, [s3Base]);
  assert.doesNotThrow(() =>
    buildRoomLogCompletion(context, plan, "plan", [
      { id: "chair", relativePath, position: [1, 0, 1], rotationY: 0, sizeMm: { width: 300, height: 500, depth: 100 } },
    ]),
  );

  // 재진입 실패를 재현: 정규화 전 절대 URL relativePath는 검증에서 throw 한다.
  assert.throws(
    () =>
      buildRoomLogCompletion(context, plan, "plan", [
        { id: "chair", relativePath: `${s3Base}/sofa/nyhamn.glb`, position: [1, 0, 1], rotationY: 0, sizeMm: { width: 300, height: 500, depth: 100 } },
      ]),
    /nested GLB asset/,
  );

  // 알 수 없는 base면 원본을 그대로 돌려준다(기존 동작 보존).
  assert.equal(furnitureRelativePathFromModelUrl("chair.glb"), "chair.glb");
  assert.equal(furnitureRelativePathFromModelUrl(""), "");
});
