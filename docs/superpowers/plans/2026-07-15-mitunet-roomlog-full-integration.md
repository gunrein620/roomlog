# MitUNet RoomLog Full Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace RoomLog's 3D-floor-plan creation entry with the standalone MitUNet editor and automatically carry the completed polygon plan back into RoomLog preview, persistence, and listing-detail rendering.

**Architecture:** Keep `floorplan-to-3d-mitunet` as an independent FastAPI/vanilla-Three.js service. Open it from RoomLog in a new tab, exchange a versioned and origin-checked `postMessage`, store the sanitized polygon plan alongside the legacy `walls3D` shape, and branch the existing React Three Fiber viewer by plan format.

**Tech Stack:** Next.js 16, React 19, React Three Fiber, Three.js, NestJS, Node test runner, FastAPI, pytest, browser `window.postMessage`.

## Global Constraints

- RoomLog repository: `C:\Users\smoun\Jungle\woo-zu\roomlog`.
- MitUNet repository: `C:\Users\smoun\Jungle\floorplan-to-3d-mitunet`.
- Local RoomLog web origin is `http://127.0.0.1:3000` or `http://localhost:3000`; local MitUNet editor URL is `http://127.0.0.1:8012`.
- RoomLog reads `NEXT_PUBLIC_MITUNET_EDITOR_URL`; MitUNet reads `ROOMLOG_ALLOWED_ORIGINS`.
- Never use `postMessage(..., "*")`; validate message origin, source window, request ID, schema, and version.
- Never persist `input_image_b64`, wall masks, or edit history in RoomLog listing data.
- Preserve legacy `walls3D` listings and JSON imports.
- Preserve all pre-existing uncommitted changes in both repositories. Stage only newly created files or demonstrably isolated hunks; do not include unrelated dirty-file content in commits.
- Follow red-green-refactor: every production change starts with a failing focused test.

---

### Task 1: MitUNet RoomLog message contract and allowlist endpoint

**Files:**
- Create: `C:\Users\smoun\Jungle\floorplan-to-3d-mitunet\viewer\roomlog-integration.mjs`
- Create: `C:\Users\smoun\Jungle\floorplan-to-3d-mitunet\tests_js\roomlog-integration.test.mjs`
- Modify: `C:\Users\smoun\Jungle\floorplan-to-3d-mitunet\server\main.py`
- Modify: `C:\Users\smoun\Jungle\floorplan-to-3d-mitunet\tests\test_server_openings.py`

**Interfaces:**
- Produces: `readRoomLogContext(locationLike, allowedOrigins) -> RoomLogContext | null`.
- Produces: `buildRoomLogCompletion(context, plan, sourceName) -> RoomLogCompletionMessage`.
- Produces: `sendRoomLogCompletion(context, plan, sourceName, opener) -> RoomLogCompletionMessage`.
- Produces: `GET /integration-config -> { roomlog_allowed_origins: string[] }`.
- Consumes: the composed plan shape already used by `buildPlanExport()`.

- [ ] **Step 1: Write failing JavaScript contract tests**

Create `tests_js/roomlog-integration.test.mjs` with cases that require exact origin allowlisting, reject missing IDs, strip the embedded input image, retain calibration, and post to the exact origin:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRoomLogCompletion,
  readRoomLogContext,
  sendRoomLogCompletion,
} from "../viewer/roomlog-integration.mjs";

const locationLike = {
  search: "?integration=roomlog&returnOrigin=http%3A%2F%2Flocalhost%3A3000&requestId=req-123",
};
const plan = {
  canvas_size: [1024, 1024],
  content_rect: [0, 0, 1024, 1024],
  input_image_b64: "must-not-leave-editor",
  calibration: { millimetersPerPixel: 4.25 },
  polygons: {
    wall: [{ outer: [[0, 0], [10, 0], [10, 5]], holes: [] }],
    door: [],
    window: [],
  },
};

test("accepts an allowlisted RoomLog return origin", () => {
  assert.deepEqual(readRoomLogContext(locationLike, ["http://localhost:3000"]), {
    requestId: "req-123",
    returnOrigin: "http://localhost:3000",
  });
});

test("rejects an unlisted return origin", () => {
  assert.equal(readRoomLogContext(locationLike, ["https://roomlog.example"]), null);
});

test("builds a minimal versioned completion message", () => {
  const context = readRoomLogContext(locationLike, ["http://localhost:3000"]);
  const message = buildRoomLogCompletion(context, plan, "home.png");
  assert.equal(message.type, "roomlog.floor-plan.completed");
  assert.equal(message.schema, "roomlog-mitunet-floor-plan");
  assert.equal(message.version, 1);
  assert.equal(message.requestId, "req-123");
  assert.equal(message.payload.name, "home.png");
  assert.equal(message.payload.millimetersPerPixel, 4.25);
  assert.equal("input_image_b64" in message.payload, false);
});

test("posts only to the exact RoomLog origin", () => {
  const calls = [];
  const opener = { postMessage: (...args) => calls.push(args) };
  const context = readRoomLogContext(locationLike, ["http://localhost:3000"]);
  sendRoomLogCompletion(context, plan, "home.png", opener);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], "http://localhost:3000");
});
```

- [ ] **Step 2: Run the JavaScript test and confirm RED**

Run from the MitUNet repository:

```powershell
node --test tests_js\roomlog-integration.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `viewer/roomlog-integration.mjs`.

- [ ] **Step 3: Implement the pure message contract**

Create `viewer/roomlog-integration.mjs` with immutable cloning and explicit validation:

```js
const MESSAGE_TYPE = "roomlog.floor-plan.completed";
const MESSAGE_SCHEMA = "roomlog-mitunet-floor-plan";
const MESSAGE_VERSION = 1;

export function readRoomLogContext(locationLike, allowedOrigins = []) {
  const params = new URLSearchParams(locationLike?.search ?? "");
  if (params.get("integration") !== "roomlog") return null;
  const returnOrigin = params.get("returnOrigin") ?? "";
  const requestId = params.get("requestId")?.trim() ?? "";
  if (!allowedOrigins.includes(returnOrigin) || !requestId) return null;
  return { requestId, returnOrigin };
}

function clonePolygons(polygons) {
  return JSON.parse(JSON.stringify({
    wall: Array.isArray(polygons?.wall) ? polygons.wall : [],
    door: Array.isArray(polygons?.door) ? polygons.door : [],
    window: Array.isArray(polygons?.window) ? polygons.window : [],
  }));
}

export function buildRoomLogCompletion(context, plan, sourceName = "") {
  if (!context) throw new Error("RoomLog integration is not active");
  if (!Array.isArray(plan?.polygons?.wall) || plan.polygons.wall.length === 0) {
    throw new Error("A rendered wall plan is required");
  }
  const millimetersPerPixel = Number(plan?.calibration?.millimetersPerPixel);
  return {
    type: MESSAGE_TYPE,
    schema: MESSAGE_SCHEMA,
    version: MESSAGE_VERSION,
    requestId: context.requestId,
    payload: {
      name: String(sourceName || "MitUNet floor plan"),
      canvasSize: [...plan.canvas_size],
      contentRect: [...plan.content_rect],
      millimetersPerPixel: Number.isFinite(millimetersPerPixel) && millimetersPerPixel > 0
        ? millimetersPerPixel
        : null,
      polygons: clonePolygons(plan.polygons),
    },
  };
}

export function sendRoomLogCompletion(context, plan, sourceName, opener) {
  if (!opener || typeof opener.postMessage !== "function") {
    throw new Error("The RoomLog window is no longer available");
  }
  const message = buildRoomLogCompletion(context, plan, sourceName);
  opener.postMessage(message, context.returnOrigin);
  return message;
}
```

- [ ] **Step 4: Add failing FastAPI config test**

Add to `tests/test_server_openings.py` using the existing FastAPI test client fixture:

```py
def test_integration_config_returns_roomlog_origin_allowlist(client, monkeypatch):
    monkeypatch.setenv(
        "ROOMLOG_ALLOWED_ORIGINS",
        "http://localhost:3000,https://roomlog.example",
    )
    response = client.get("/integration-config")
    assert response.status_code == 200
    assert response.json() == {
        "roomlog_allowed_origins": [
            "http://localhost:3000",
            "https://roomlog.example",
        ]
    }
```

- [ ] **Step 5: Run the FastAPI test and confirm RED**

```powershell
& '.\.venv\Scripts\python.exe' -m pytest tests\test_server_openings.py -q -p no:cacheprovider
```

Expected: FAIL because `/integration-config` returns 404.

- [ ] **Step 6: Implement the config endpoint and run focused tests GREEN**

Add to `server/main.py`:

```py
def roomlog_allowed_origins() -> list[str]:
    configured = os.getenv(
        "ROOMLOG_ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    )
    return [origin.strip() for origin in configured.split(",") if origin.strip()]


@app.get("/integration-config")
def integration_config() -> dict[str, list[str]]:
    return {"roomlog_allowed_origins": roomlog_allowed_origins()}
```

Run:

```powershell
node --test tests_js\roomlog-integration.test.mjs
& '.\.venv\Scripts\python.exe' -m pytest tests\test_server_openings.py -q -p no:cacheprovider
```

Expected: all focused tests PASS.

- [ ] **Step 7: Commit only isolated Task 1 files**

```powershell
git add viewer/roomlog-integration.mjs tests_js/roomlog-integration.test.mjs
git diff --cached --check
git commit -m "feat: define RoomLog floor plan handoff"
```

`server/main.py` and `tests/test_server_openings.py` are already dirty. Do not stage them wholesale. Keep their additive hunks in the working tree for final user review unless their pre-existing changes have been committed separately first.

### Task 2: MitUNet `RoomLog에 연결` user interface

**Files:**
- Modify: `C:\Users\smoun\Jungle\floorplan-to-3d-mitunet\viewer\index.html`
- Modify: `C:\Users\smoun\Jungle\floorplan-to-3d-mitunet\tests\test_viewer_shell.py`

**Interfaces:**
- Consumes: Task 1 `readRoomLogContext()` and `sendRoomLogCompletion()`.
- Produces: integration-only button `#connect-roomlog-btn` and visible success/error status.

- [ ] **Step 1: Write failing shell assertions**

Add to the existing viewer shell test:

```py
def test_viewer_exposes_roomlog_completion_action():
    source = VIEWER_HTML.read_text(encoding="utf-8")
    assert 'id="connect-roomlog-btn"' in source
    assert 'from "/viewer-assets/roomlog-integration.mjs"' in source
    assert 'fetch("/integration-config")' in source
    assert "sendRoomLogCompletion" in source
```

- [ ] **Step 2: Run the test and confirm RED**

```powershell
& '.\.venv\Scripts\python.exe' -m pytest tests\test_viewer_shell.py -q -p no:cacheprovider
```

Expected: FAIL because the integration button and import are absent.

- [ ] **Step 3: Wire the button without changing the existing save flow**

In `viewer/index.html`, add a hidden disabled button next to `#save-json-btn`, import Task 1 helpers, and initialize the context from the server allowlist:

```html
<button class="btn primary with-icon" id="connect-roomlog-btn" hidden disabled>
  <i data-lucide="link" aria-hidden="true"></i><span>RoomLog에 연결</span>
</button>
```

```js
import {
  readRoomLogContext,
  sendRoomLogCompletion,
} from "/viewer-assets/roomlog-integration.mjs";

const connectRoomLogButton = document.getElementById("connect-roomlog-btn");
let roomLogContext = null;

async function initializeRoomLogIntegration() {
  const response = await fetch("/integration-config");
  if (!response.ok) return;
  const config = await response.json();
  roomLogContext = readRoomLogContext(
    window.location,
    config.roomlog_allowed_origins ?? [],
  );
  connectRoomLogButton.hidden = !roomLogContext;
  updateEditorControls();
}

connectRoomLogButton.addEventListener("click", () => {
  try {
    sendRoomLogCompletion(
      roomLogContext,
      currentComposedPlan,
      currentSourceName,
      window.opener,
    );
    setStatus("RoomLog에 3D 도면을 연결했습니다. RoomLog 탭으로 돌아가세요.");
    connectRoomLogButton.disabled = true;
  } catch (error) {
    setStatus(`RoomLog 연결 실패: ${error.message}`, "error");
  }
});
```

Extend `updateEditorControls()` so the button is enabled only when `roomLogContext` and `currentComposedPlan` both exist. Call `initializeRoomLogIntegration()` once during viewer startup. Leave `Save JSON` unchanged.

- [ ] **Step 4: Run viewer tests GREEN**

```powershell
& '.\.venv\Scripts\python.exe' -m pytest tests\test_viewer_shell.py -q -p no:cacheprovider
node --test tests_js\roomlog-integration.test.mjs tests_js\plan-export.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 5: Preserve dirty-file boundaries**

Run:

```powershell
git diff -- viewer/index.html tests/test_viewer_shell.py
```

Confirm the RoomLog integration hunks are additive and that existing view-transition, door-header, and review-editor changes remain intact. Do not commit these already-dirty files without an explicit clean baseline from the user.

### Task 3: RoomLog browser bridge and MitUNet JSON normalization

**Files:**
- Create: `C:\Users\smoun\Jungle\woo-zu\roomlog\apps\web\src\lib\mitunet-floor-plan.ts`
- Create: `C:\Users\smoun\Jungle\woo-zu\roomlog\apps\web\src\lib\mitunet-floor-plan.spec.ts`

**Interfaces:**
- Produces: `MitunetFloorPlan`, `MitunetCompletionMessage`, and `MitunetLaunchSession` types.
- Produces: `buildMitunetEditorUrl(editorUrl, roomlogOrigin, requestId) -> string`.
- Produces: `parseMitunetMessage(event, session) -> MitunetFloorPlan | null`.
- Produces: `parseMitunetProjectJson(value) -> MitunetFloorPlan | null`.

- [ ] **Step 1: Write failing unit tests for URL and message validation**

Create `apps/web/src/lib/mitunet-floor-plan.spec.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMitunetEditorUrl,
  parseMitunetMessage,
  parseMitunetProjectJson,
} from "./mitunet-floor-plan";

const payload = {
  name: "home.png",
  canvasSize: [1024, 1024],
  contentRect: [0, 0, 1024, 1024],
  millimetersPerPixel: 4.25,
  polygons: {
    wall: [{ outer: [[0, 0], [10, 0], [10, 5]], holes: [] }],
    door: [],
    window: [],
  },
};

test("builds the MitUNet integration URL", () => {
  const url = new URL(buildMitunetEditorUrl(
    "http://127.0.0.1:8012",
    "http://localhost:3000",
    "req-1",
  ));
  assert.equal(url.searchParams.get("integration"), "roomlog");
  assert.equal(url.searchParams.get("returnOrigin"), "http://localhost:3000");
  assert.equal(url.searchParams.get("requestId"), "req-1");
});

test("accepts only the expected origin, source, and request", () => {
  const editorWindow = {} as Window;
  const session = {
    editorOrigin: "http://127.0.0.1:8012",
    editorWindow,
    requestId: "req-1",
  };
  const data = {
    type: "roomlog.floor-plan.completed",
    schema: "roomlog-mitunet-floor-plan",
    version: 1,
    requestId: "req-1",
    payload,
  };
  assert.ok(parseMitunetMessage({ origin: session.editorOrigin, source: editorWindow, data }, session));
  assert.equal(parseMitunetMessage({ origin: "https://evil.example", source: editorWindow, data }, session), null);
  assert.equal(parseMitunetMessage({ origin: session.editorOrigin, source: {}, data }, session), null);
});

test("imports the existing MitUNet project JSON without its source image", () => {
  const parsed = parseMitunetProjectJson({
    schema: "mitunet-floorplan-3d-project",
    version: 1,
    source_name: "home.png",
    plan: {
      canvas_size: [1024, 1024],
      content_rect: [0, 0, 1024, 1024],
      input_image_b64: "ignored",
      calibration: { millimetersPerPixel: 4.25 },
      polygons: payload.polygons,
    },
  });
  assert.equal(parsed?.name, "home.png");
  assert.equal("input_image_b64" in (parsed ?? {}), false);
});
```

- [ ] **Step 2: Run the unit test and confirm RED**

```powershell
pnpm --filter web exec node --test -r ts-node/register src/lib/mitunet-floor-plan.spec.ts
```

Expected: FAIL because `mitunet-floor-plan.ts` does not exist.

- [ ] **Step 3: Implement strict finite-number and size validation**

Create `apps/web/src/lib/mitunet-floor-plan.ts` with these public constants and signatures:

```ts
export const MITUNET_SCHEMA = "roomlog-mitunet-floor-plan" as const;
export const MITUNET_VERSION = 1 as const;
export const MAX_POLYGONS_PER_CLASS = 2_000;
export const MAX_POINTS_PER_RING = 2_000;

export type MitunetRing = [number, number][];
export type MitunetPolygon = { outer: MitunetRing; holes: MitunetRing[] };
export type MitunetFloorPlan = {
  schema: typeof MITUNET_SCHEMA;
  version: typeof MITUNET_VERSION;
  name: string;
  canvasSize: [number, number];
  contentRect: [number, number, number, number];
  millimetersPerPixel: number | null;
  polygons: {
    wall: MitunetPolygon[];
    door: MitunetPolygon[];
    window: MitunetPolygon[];
  };
};

export type MitunetLaunchSession = {
  editorOrigin: string;
  editorWindow: Window;
  requestId: string;
};

export function buildMitunetEditorUrl(
  editorUrl: string,
  roomlogOrigin: string,
  requestId: string,
): string;

export function normalizeMitunetPayload(value: unknown): MitunetFloorPlan | null;
export function parseMitunetMessage(
  event: Pick<MessageEvent, "origin" | "source" | "data">,
  session: MitunetLaunchSession,
): MitunetFloorPlan | null;
export function parseMitunetProjectJson(value: unknown): MitunetFloorPlan | null;
```

Implementation rules inside `normalizeMitunetPayload()`:

- Accept only finite positive canvas dimensions and a four-number `contentRect`.
- Accept only finite coordinate pairs.
- Require every outer ring to have at least three and at most 2,000 points.
- Allow no more than 2,000 polygons per class, 100 holes per polygon, and 2,000 points per hole.
- Require at least one wall polygon.
- Return fresh arrays so caller-owned objects cannot mutate stored state.
- Normalize invalid or missing positive `millimetersPerPixel` to `null`.

- [ ] **Step 4: Run the test GREEN and commit**

```powershell
pnpm --filter web exec node --test -r ts-node/register src/lib/mitunet-floor-plan.spec.ts
git add apps/web/src/lib/mitunet-floor-plan.ts apps/web/src/lib/mitunet-floor-plan.spec.ts
git diff --cached --check
git commit -m "feat(web): validate MitUNet floor plan handoff"
```

Expected: focused unit tests PASS and the commit contains only the two new files.

### Task 4: RoomLog landlord entry, automatic receipt, and JSON fallback

**Files:**
- Modify: `C:\Users\smoun\Jungle\woo-zu\roomlog\apps\web\src\app\my\flows\LandlordMyPage.tsx`
- Modify: `C:\Users\smoun\Jungle\woo-zu\roomlog\apps\web\src\app\_components\ListingTourRoom3D.tsx`
- Modify: `C:\Users\smoun\Jungle\woo-zu\roomlog\apps\web\property-shell.spec.mjs`

**Interfaces:**
- Consumes: Task 3 URL builder and message parser.
- Produces: a launch session tied to one editor window and one request ID.
- Produces: local snapshot `{ walls3D: [], furnitures: [], name, mitunet }`.

- [ ] **Step 1: Replace the old source assertion with failing integration assertions**

Change the existing property-shell test around the landlord action to require the new bridge:

```js
test("opens the MitUNet editor and receives its completed floor plan", () => {
  assert.match(pageSource, /NEXT_PUBLIC_MITUNET_EDITOR_URL/);
  assert.match(pageSource, /buildMitunetEditorUrl/);
  assert.match(pageSource, /parseMitunetMessage/);
  assert.match(pageSource, /window\.open/);
  assert.match(pageSource, /3D 도면 만들기/);
  assert.doesNotMatch(pageSource, /href="\/floor-plan-3d"/);
});
```

- [ ] **Step 2: Run the source test and confirm RED**

```powershell
pnpm --filter web exec node --test property-shell.spec.mjs
```

Expected: FAIL because the current button still links to `/floor-plan-3d`.

- [ ] **Step 3: Add the launch and receive lifecycle**

In `LandlordMyPage.tsx`:

```ts
import {
  buildMitunetEditorUrl,
  parseMitunetMessage,
  parseMitunetProjectJson,
  type MitunetLaunchSession,
} from "@/lib/mitunet-floor-plan";

const MITUNET_EDITOR_URL =
  process.env.NEXT_PUBLIC_MITUNET_EDITOR_URL ?? "http://127.0.0.1:8012";
```

In `ListingTourRoom3D.tsx`, extend the existing web snapshot type before `LandlordMyPage.tsx` constructs it:

```ts
import type { MitunetFloorPlan } from "@/lib/mitunet-floor-plan";

export type ListingFloorPlan3D = {
  walls3D: ListingFloorPlanWall[];
  furnitures: ListingFloorPlanFurniture[];
  name?: string;
  mitunet?: MitunetFloorPlan;
};
```

Add `mitunetSessionRef`, register one `message` listener in an effect, and update local storage/state only for a valid completion:

```ts
const mitunetSessionRef = useRef<MitunetLaunchSession | null>(null);

useEffect(() => {
  const receiveMitunetPlan = (event: MessageEvent) => {
    const session = mitunetSessionRef.current;
    if (!session) return;
    const mitunet = parseMitunetMessage(event, session);
    if (!mitunet) {
      const expectedSender =
        event.origin === session.editorOrigin &&
        event.source === session.editorWindow &&
        event.data?.requestId === session.requestId;
      if (expectedSender) {
        setOwnerToast("3D 도면 연결에 실패했습니다. MitUNet 결과를 다시 확인해 주세요.");
        mitunetSessionRef.current = null;
      }
      return;
    }
    const snapshot: ListingFloorPlan3D = {
      walls3D: [],
      furnitures: [],
      name: mitunet.name,
      mitunet,
    };
    writeListingFloorPlanSnapshot(snapshot);
    setFloorPlan3D(snapshot);
    setHas3DRoom(true);
    setRegistrationStatus("작성 중");
    setOwnerToast("MitUNet 3D 도면을 연결했습니다.");
    mitunetSessionRef.current = null;
  };
  window.addEventListener("message", receiveMitunetPlan);
  return () => window.removeEventListener("message", receiveMitunetPlan);
}, []);
```

Replace the `<a href="/floor-plan-3d">` with a `<button type="button">` whose click handler creates a request ID, builds the URL, opens the tab, and stores the exact window handle:

```ts
function openMitunetEditor() {
  const requestId = crypto.randomUUID();
  const editorUrl = buildMitunetEditorUrl(
    MITUNET_EDITOR_URL,
    window.location.origin,
    requestId,
  );
  const editorWindow = window.open(editorUrl, "_blank");
  if (!editorWindow) {
    setOwnerToast("팝업이 차단되었습니다. 팝업을 허용한 뒤 다시 시도해 주세요.");
    return;
  }
  mitunetSessionRef.current = {
    editorOrigin: new URL(MITUNET_EDITOR_URL).origin,
    editorWindow,
    requestId,
  };
  setRegistrationStatus("작성 중");
}
```

Update `readListingFloorPlanSnapshot()` and `writeListingFloorPlanSnapshot()` so a valid `mitunet` plan counts as connected even with zero `walls3D`. In the JSON upload handler, try `parseMitunetProjectJson(parsed)` before the legacy `walls3D` parser and store the same snapshot shape.

- [ ] **Step 4: Run RoomLog web tests GREEN**

```powershell
pnpm --filter web exec node --test property-shell.spec.mjs
pnpm --filter web run test:unit
```

Expected: property shell and TypeScript unit tests PASS.

- [ ] **Step 5: Commit only the integration hunk after reviewing dirty overlap**

`property-shell.spec.mjs` is already dirty. Review it and `LandlordMyPage.tsx` separately:

```powershell
git diff -- apps/web/property-shell.spec.mjs apps/web/src/app/my/flows/LandlordMyPage.tsx
```

If pre-existing changes are still mixed in `property-shell.spec.mjs`, do not stage that whole file. Commit `LandlordMyPage.tsx` only if it was clean at execution start; otherwise leave both files uncommitted and report the validated diff.

### Task 5: RoomLog API persistence and sanitization

**Files:**
- Modify: `C:\Users\smoun\Jungle\woo-zu\roomlog\apps\api\src\trade\trade.service.ts`
- Modify: `C:\Users\smoun\Jungle\woo-zu\roomlog\apps\api\src\trade\trade.service.spec.ts`

**Interfaces:**
- Consumes: the web snapshot `mitunet` field from Task 4.
- Produces: sanitized `ListingFloorPlan.mitunet` persisted through the existing JSON/Prisma store path.

- [ ] **Step 1: Write failing API tests**

Add a fixture and tests to `trade.service.spec.ts`:

```ts
const mitunetFloorPlan = {
  walls3D: [],
  furnitures: [],
  name: "home.png",
  mitunet: {
    schema: "roomlog-mitunet-floor-plan" as const,
    version: 1 as const,
    canvasSize: [1024, 1024] as [number, number],
    contentRect: [0, 0, 1024, 1024] as [number, number, number, number],
    millimetersPerPixel: 4.25,
    polygons: {
      wall: [{ outer: [[0, 0], [10, 0], [10, 5]], holes: [] }],
      door: [],
      window: [],
    },
    input_image_b64: "remove-me",
  },
};

test("stores a sanitized MitUNet polygon floor plan", () => {
  const created = service.createListing(owner, {
    ...validListingInput,
    floorPlan: mitunetFloorPlan,
  });
  assert.equal(created.floorPlan?.mitunet?.polygons.wall.length, 1);
  assert.equal("input_image_b64" in (created.floorPlan?.mitunet ?? {}), false);
});

test("rejects non-finite MitUNet coordinates", () => {
  const broken = structuredClone(mitunetFloorPlan);
  broken.mitunet.polygons.wall[0].outer[0][0] = Number.NaN;
  assert.throws(
    () => service.createListing(owner, { ...validListingInput, floorPlan: broken }),
    /유효하지 않은 MitUNet 3D 도면/,
  );
});
```

- [ ] **Step 2: Run the focused API test and confirm RED**

```powershell
pnpm --filter api exec node --test -r ts-node/register src/trade/trade.service.spec.ts
```

Expected: FAIL because `ListingFloorPlan` has no `mitunet` member and normalization rejects zero legacy walls.

- [ ] **Step 3: Implement server-side types and limits**

Add explicit polygon types to `trade.service.ts` and extend `ListingFloorPlan`:

```ts
export type ListingFloorPlanPolygon = {
  outer: [number, number][];
  holes: [number, number][][];
};

export type ListingMitunetFloorPlan = {
  schema: "roomlog-mitunet-floor-plan";
  version: 1;
  canvasSize: [number, number];
  contentRect: [number, number, number, number];
  millimetersPerPixel: number | null;
  polygons: {
    wall: ListingFloorPlanPolygon[];
    door: ListingFloorPlanPolygon[];
    window: ListingFloorPlanPolygon[];
  };
};

export type ListingFloorPlan = {
  walls3D: ListingFloorPlanWall[];
  furnitures: ListingFloorPlanFurniture[];
  name?: string;
  mitunet?: ListingMitunetFloorPlan;
};
```

Implement `normalizeMitunetFloorPlan(value: unknown)` with the same limits as Task 3. Return only the fields above. Update `normalizeFloorPlan()` so it returns a plan when either `walls.length > 0` or a valid MitUNet wall polygon exists. If the caller supplied `input.mitunet` but normalization fails, throw `new BadRequestException("유효하지 않은 MitUNet 3D 도면입니다.")`.

- [ ] **Step 4: Run API tests GREEN**

```powershell
pnpm --filter api exec node --test -r ts-node/register src/trade/trade.service.spec.ts
pnpm --filter api run build
```

Expected: trade tests PASS and Nest build succeeds.

- [ ] **Step 5: Commit the API slice**

```powershell
git add apps/api/src/trade/trade.service.ts apps/api/src/trade/trade.service.spec.ts
git diff --cached --check
git commit -m "feat(api): persist MitUNet polygon floor plans"
```

### Task 6: Polygon geometry and RoomLog 3D rendering

**Files:**
- Create: `C:\Users\smoun\Jungle\woo-zu\roomlog\apps\web\src\app\floor-plan-3d\room-scene\mitunet-geometry.ts`
- Create: `C:\Users\smoun\Jungle\woo-zu\roomlog\apps\web\src\app\floor-plan-3d\room-scene\mitunet-geometry.spec.ts`
- Modify: `C:\Users\smoun\Jungle\woo-zu\roomlog\apps\web\src\app\floor-plan-3d\room-scene\RoomlogThreeFloorPlanView.tsx`
- Modify: `C:\Users\smoun\Jungle\woo-zu\roomlog\apps\web\src\app\_components\ListingTourRoom3D.tsx`
- Modify: `C:\Users\smoun\Jungle\woo-zu\roomlog\apps\web\src\app\my\flows\LandlordMyPage.tsx`

**Interfaces:**
- Consumes: Task 3 `MitunetFloorPlan`.
- Produces: `mitunetSceneTransform(plan)`, `mitunetShapeRings(plan)`, and optional `mitunetPlan` viewer prop.
- Preserves: existing `wallsData`, furniture rendering, pointer callbacks, and legacy floor bounds.

- [ ] **Step 1: Write failing pure geometry tests**

Create `mitunet-geometry.spec.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { mitunetSceneTransform, mitunetShapeRings } from "./mitunet-geometry";

const plan = {
  schema: "roomlog-mitunet-floor-plan" as const,
  version: 1 as const,
  name: "home.png",
  canvasSize: [100, 80] as [number, number],
  contentRect: [10, 10, 80, 60] as [number, number, number, number],
  millimetersPerPixel: 50,
  polygons: {
    wall: [{ outer: [[10, 10], [90, 10], [90, 20], [10, 20]], holes: [] }],
    door: [],
    window: [],
  },
};

test("uses calibrated meters and centers the content rectangle", () => {
  assert.deepEqual(mitunetSceneTransform(plan), {
    centerX: 50,
    centerY: 40,
    metersPerPixel: 0.05,
  });
});

test("converts image y coordinates into centered scene z coordinates", () => {
  const rings = mitunetShapeRings(plan, "wall");
  assert.deepEqual(rings[0].outer[0], { x: -2, z: 1.5 });
});
```

- [ ] **Step 2: Run geometry test and confirm RED**

```powershell
pnpm --filter web exec node --test -r ts-node/register src/app/floor-plan-3d/room-scene/mitunet-geometry.spec.ts
```

Expected: FAIL because `mitunet-geometry.ts` does not exist.

- [ ] **Step 3: Implement deterministic scene conversion**

Create `mitunet-geometry.ts`:

```ts
import type { MitunetFloorPlan } from "@/lib/mitunet-floor-plan";

export function mitunetSceneTransform(plan: MitunetFloorPlan) {
  const [left, top, width, height] = plan.contentRect;
  const calibrated = plan.millimetersPerPixel
    ? plan.millimetersPerPixel / 1000
    : 8 / Math.max(width, height);
  return {
    centerX: left + width / 2,
    centerY: top + height / 2,
    metersPerPixel: calibrated,
  };
}

export function mitunetShapeRings(
  plan: MitunetFloorPlan,
  kind: "wall" | "door" | "window",
) {
  const transform = mitunetSceneTransform(plan);
  const convert = ([x, y]: [number, number]) => ({
    x: (x - transform.centerX) * transform.metersPerPixel,
    z: (transform.centerY - y) * transform.metersPerPixel,
  });
  return plan.polygons[kind].map((polygon) => ({
    outer: polygon.outer.map(convert),
    holes: polygon.holes.map((ring) => ring.map(convert)),
  }));
}
```

- [ ] **Step 4: Extend the R3F viewer with polygon meshes**

In `RoomlogThreeFloorPlanView.tsx`, add optional `mitunetPlan?: MitunetFloorPlan`. Build `THREE.Shape` objects from `mitunetShapeRings()`, add each hole as a `THREE.Path`, and use `extrudeGeometry` with a 2.5-meter wall depth. Rotate the shape from XY into XZ and place the extrusion vertically. Use the existing target-viewer material colors for wall, door, and window classes. Select polygon bounds for the camera and floor when `mitunetPlan` is present; otherwise keep `computeWallBoundsXZ(wallsData)` unchanged.

The public prop addition must be:

```ts
type RoomlogThreeFloorPlanViewProps = {
  wallsData: WheretoputWall3D[];
  mitunetPlan?: MitunetFloorPlan;
  placedFurnitures?: PlacedFurniture[];
  pendingFurniture?: PlacedFurniture | null;
  selectedFurnitureId?: string | null;
  onFloorPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
  onFloorPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onFurniturePointerDown?: (
    furniture: PlacedFurniture,
    event: ThreeEvent<PointerEvent>,
  ) => void;
};
```

In `ListingTourRoom3D.tsx`, pass `mitunetPlan={floorPlan.mitunet}` while preserving existing legacy props. In `LandlordMyPage.tsx`, pass the same prop to the dynamic preview.

When `mitunetPlan` is present, render a compact overlay label above the canvas. Show `실측 축척 적용` when `millimetersPerPixel` is positive and `실측 축척 미설정` when it is `null`. This label is display-only and must not alter stored geometry.

- [ ] **Step 5: Run geometry, web unit, and build tests GREEN**

```powershell
pnpm --filter web exec node --test -r ts-node/register src/app/floor-plan-3d/room-scene/mitunet-geometry.spec.ts
pnpm --filter web run test:unit
pnpm --filter web run build
```

Expected: geometry and all web unit tests PASS; Next.js production build succeeds.

- [ ] **Step 6: Commit clean and new renderer files only**

```powershell
git add apps/web/src/app/floor-plan-3d/room-scene/mitunet-geometry.ts apps/web/src/app/floor-plan-3d/room-scene/mitunet-geometry.spec.ts apps/web/src/app/floor-plan-3d/room-scene/RoomlogThreeFloorPlanView.tsx apps/web/src/app/_components/ListingTourRoom3D.tsx
git diff --cached --check
git commit -m "feat(web): render MitUNet polygon floor plans"
```

If `LandlordMyPage.tsx` remains mixed with uncommitted Task 4 work, keep it unstaged and include it in the final diff report.

### Task 7: Configuration docs and end-to-end verification

**Files:**
- Modify: `C:\Users\smoun\Jungle\floorplan-to-3d-mitunet\README.md`
- Modify: `C:\Users\smoun\Jungle\woo-zu\roomlog\.env.example`
- Modify: `C:\Users\smoun\Jungle\woo-zu\roomlog\README.md`

**Interfaces:**
- Documents: the two service URLs and both environment variables.
- Verifies: upload through listing-detail display without JSON download/upload.

- [ ] **Step 1: Add exact local configuration**

Document these values:

```dotenv
# roomlog/.env
NEXT_PUBLIC_MITUNET_EDITOR_URL=http://127.0.0.1:8012
```

```powershell
# floorplan-to-3d-mitunet shell
$env:ROOMLOG_ALLOWED_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
& '.\.venv\Scripts\python.exe' -m uvicorn server.main:app --host 127.0.0.1 --port 8012
```

State that production must use HTTPS origins and explicitly set both variables.

- [ ] **Step 2: Run complete automated verification**

From the MitUNet repository:

```powershell
node --test tests_js\*.test.mjs
& '.\.venv\Scripts\python.exe' -m pytest tests -q -p no:cacheprovider
```

Expected: all JavaScript and Python tests PASS.

From the RoomLog repository:

```powershell
pnpm --filter web run test
pnpm --filter api run test
pnpm --filter web run build
pnpm --filter api run build
```

Expected: all web/API tests and both builds PASS. If `bash scripts/verify.sh` is available in the current shell, run it as the final aggregate check and expect exit code 0.

- [ ] **Step 3: Run the actual browser flow**

Start MitUNet on `127.0.0.1:8012`, RoomLog web on `:3000`, and RoomLog API on `:4000`. Verify this exact sequence:

1. Open the landlord listing registration page.
2. Fill at least one form field and select a photo.
3. Click `3D 도면 만들기`; confirm the MitUNet tab opens and the RoomLog form remains intact.
4. Upload a PNG/JPEG plan, review it, apply a scale, and choose `Show 3D`.
5. Click `RoomLog에 연결`; confirm the RoomLog preview updates without downloading a JSON file.
6. Register the listing; open its detail and choose `3D 보기`.
7. Confirm the wall, door, and window geometry matches the MitUNet result and the scale-status label is correct.
8. Repeat with scale cleared and confirm the normalized preview displays `실측 축척 미설정`.
9. Stop MitUNet and confirm a new launch fails without losing the RoomLog form or previously linked plan.

- [ ] **Step 4: Review repository boundaries and report uncommitted integration hunks**

Run `git status --short` and `git diff --check` separately in both repositories. Confirm no unrelated files were staged or reverted. List any dirty overlapping files intentionally left uncommitted.

- [ ] **Step 5: Commit clean documentation files only**

In each repository, stage only documentation files that were clean before the task, run `git diff --cached --check`, and use:

```powershell
git commit -m "docs: explain RoomLog MitUNet integration"
```

Do not force a commit when a documentation file contains pre-existing user edits.
