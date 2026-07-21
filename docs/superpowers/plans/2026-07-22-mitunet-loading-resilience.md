# MitUNet Loading Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make floor-plan upload interactive before the 3D engine loads, remove runtime unpkg dependencies, cache immutable viewer assets, and bound/measure GPU requests.

**Architecture:** A small dependency-free upload module owns file selection before the main Three.js module evaluates. Version-pinned browser runtime files live under the shared MitUNet viewer assets so RoomLog and standalone FastAPI use the same origin-local dependencies, while focused helpers own cache policy and upstream timeout behavior. The GPU server keeps one loaded model, serializes GPU access explicitly, and moves blocking inference to a worker thread so the event loop remains responsive.

**Implementation note (post-review):** The planned Next-only vendor route was replaced by checked-in browser runtime assets under `services/mitunet/viewer/vendor`. This preserves both the RoomLog proxy and the documented standalone FastAPI viewer, removes runtime Node package lookup, and lets both origins use `/viewer-assets`. Deploy-SHA path versioning is applied to the complete proxied module graph.

**Tech Stack:** Next.js 16 route handlers, Node test runner, browser ES modules, FastAPI, asyncio, unittest, Docker Compose.

## Global Constraints

- Keep the existing MitUNet recognition and 3D rendering output unchanged.
- Do not introduce CloudFront or another new infrastructure service.
- Keep tenant/owner behavior inside the existing RoomLog route and origin.
- Preserve the demo fallback when the inference API is unavailable.
- Use `bash scripts/verify.sh` as the final repository verification.

---

### Task 1: Immediate upload bridge

**Files:**
- Create: `services/mitunet/viewer/upload-bootstrap.mjs`
- Create: `services/mitunet/tests_js/upload-bootstrap.test.mjs`
- Modify: `services/mitunet/viewer/index.html`
- Modify: `apps/web/src/app/floor-plan-3d/mitunet-internal-page.spec.ts`

**Interfaces:**
- Produces: `createUploadBridge({ uploadButton, fileInput, statusElement })`
- Produces browser events: `mitunet-upload-selected` with `{ file }`
- Consumes browser event: `mitunet-upload-ready`

- [ ] **Step 1: Write failing upload bridge tests**

Test a fake event target and input showing that button clicks call `fileInput.click()`, selections made before readiness retain only the latest file, and readiness dispatches that file exactly once.

```js
test("queues the latest file until the viewer is ready", () => {
  const bridge = createUploadBridge(fakes);
  fileInput.files = [first];
  fileInput.dispatchEvent({ type: "change" });
  fileInput.files = [second];
  fileInput.dispatchEvent({ type: "change" });
  windowTarget.dispatchEvent({ type: "mitunet-upload-ready" });
  assert.deepEqual(delivered, [second]);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test services/mitunet/tests_js/upload-bootstrap.test.mjs`

Expected: FAIL because `viewer/upload-bootstrap.mjs` does not exist.

- [ ] **Step 3: Implement the minimal upload bridge and wire it before the main module**

Add a module that accepts injected event targets for unit tests and auto-starts in the browser. In `index.html`, load it before the main Three.js module, remove the duplicated `pendingUploadFile`/input listeners, subscribe to `mitunet-upload-selected`, and dispatch `mitunet-upload-ready` after `reviewEditor` is constructed.

```js
export function createUploadBridge({ windowTarget, uploadButton, fileInput, statusElement }) {
  let ready = false;
  let pendingFile = null;
  const deliver = file => windowTarget.dispatchEvent(
    new CustomEvent("mitunet-upload-selected", { detail: { file } }),
  );
  uploadButton.addEventListener("click", openFilePicker);
  fileInput.addEventListener("change", selectCurrentFile);
  windowTarget.addEventListener("mitunet-upload-ready", markReady);
  return { dispose() {} };
}
```

- [ ] **Step 4: Run bridge and existing viewer tests and verify GREEN**

Run: `node --test services/mitunet/tests_js/upload-bootstrap.test.mjs`

Run: `pnpm --filter web test:unit`

Expected: both PASS.

- [ ] **Step 5: Commit the immediate upload bridge**

```bash
git add services/mitunet/viewer/upload-bootstrap.mjs services/mitunet/tests_js/upload-bootstrap.test.mjs services/mitunet/viewer/index.html apps/web/src/app/floor-plan-3d/mitunet-internal-page.spec.ts
git commit -m "fix: make floor plan upload immediately interactive"
```

### Task 2: Same-origin vendor assets and cache policy

**Files:**
- Create: `apps/web/src/app/floor-plan-3d/mitunet-vendor/[...asset]/route.ts`
- Create: `apps/web/src/app/floor-plan-3d/mitunet-cache.ts`
- Create: `apps/web/src/app/floor-plan-3d/mitunet-cache.spec.ts`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/web/Dockerfile`
- Modify: `services/mitunet/viewer/index.html`
- Modify: `apps/web/src/app/floor-plan-3d/mitunet-proxy.ts`
- Modify: `apps/web/src/app/floor-plan-3d/mitunet/route.ts`
- Modify: `apps/web/src/app/floor-plan-3d/mitunet-assets/[...asset]/route.ts`
- Modify: `apps/web/src/app/floor-plan-3d/mitunet-internal-page.spec.ts`

**Interfaces:**
- Produces: `mitunetAssetCacheControl(assetPath: string, versioned: boolean): string`
- Produces: allowlisted GETs under `/floor-plan-3d/mitunet-vendor/`
- Consumes: `ROOMLOG_DEPLOY_SHA` for URL versioning

- [ ] **Step 1: Write failing cache and vendor-route contract tests**

Assert immutable caching only for versioned unchanged assets, short revalidation for unversioned/transformed assets, HTML `no-cache`, no `unpkg.com` references, and an allowlist that rejects traversal/unknown vendor files.

```ts
assert.equal(mitunetAssetCacheControl("floor-finishes.mjs", true), "public, max-age=31536000, immutable");
assert.equal(mitunetAssetCacheControl("review-editor.mjs", true), "public, max-age=300, must-revalidate");
assert.equal(mitunetAssetCacheControl("floor-finishes.mjs", false), "public, max-age=300, must-revalidate");
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm --filter web test:unit`

Expected: FAIL because the cache helper/vendor route and local vendor URLs do not exist.

- [ ] **Step 3: Add the explicit Lucide dependency and vendor route**

Run: `pnpm --filter web add lucide@0.468.0`

Map the first URL segment to exactly `three` or `lucide`, reject empty segments, `.`/`..`, encoded separators, and extensions outside `.js`, `.mjs`, `.wasm`, then resolve the remainder below that package root and verify the resolved path retains the root prefix. In the Docker builder, copy dereferenced package directories to `/tmp/mitunet-vendor/{three,lucide}`; in the runner, copy that directory to `/app/apps/web/node_modules/` so `require.resolve` works identically in production.

```ts
const VENDOR_ROOTS = {
  three: resolvePackageRoot("three"),
  lucide: resolvePackageRoot("lucide"),
} as const;

const ALLOWED_VENDOR_EXTENSIONS = new Set([".js", ".mjs", ".wasm"]);
```

- [ ] **Step 4: Apply local URLs and cache headers**

Update the import map, Lucide script, and Draco decoder URL to the same-origin vendor route. Add the deploy version to transformed internal asset URLs and use `no-cache` for HTML plus the helper-selected policy for asset/vendor responses.

- [ ] **Step 5: Run web tests and build and verify GREEN**

Run: `pnpm --filter web test:unit`

Run: `pnpm --filter web build`

Expected: PASS with no `unpkg.com` reference in the MitUNet viewer.

- [ ] **Step 6: Commit vendor and caching changes**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/Dockerfile apps/web/src/app/floor-plan-3d services/mitunet/viewer/index.html
git commit -m "perf: serve mitunet runtime assets locally"
```

### Task 3: Bounded and observable inference proxy

**Files:**
- Create: `apps/web/src/app/floor-plan-3d/mitunet-upstream.ts`
- Create: `apps/web/src/app/floor-plan-3d/mitunet-upstream.spec.ts`
- Modify: `apps/web/src/app/floor-plan-3d/mitunet-api/[...endpoint]/route.ts`

**Interfaces:**
- Produces: `fetchMitunetUpstream(url, init, { timeoutMs, now, log }): Promise<Response>`
- Produces: timeout response `{ error: "MITUNET_UPSTREAM_TIMEOUT" }` with status 504

- [ ] **Step 1: Write failing upstream helper tests**

Use an injected fetch implementation to assert a successful structured timing log and convert an `AbortError`/`TimeoutError` into a stable timeout result without exposing the upstream URL.

```ts
await assert.rejects(
  () => fetchMitunetUpstream(url, init, { timeoutMs: 1, fetchImpl: timeoutFetch, log }),
  MitunetUpstreamTimeoutError,
);
assert.deepEqual(entries[0], { event: "mitunet_upstream", endpoint: "extract-image", status: 504, elapsedMs: 1 });
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm --filter web test:unit`

Expected: FAIL because `mitunet-upstream.ts` does not exist.

- [ ] **Step 3: Implement timeout helper and route error mapping**

Use `AbortSignal.timeout(90_000)` for inference POSTs and `AbortSignal.timeout(5_000)` for health/config GETs. Log one JSON object per upstream completion. Map only the typed timeout error to 504; preserve other upstream response statuses.

- [ ] **Step 4: Run web tests and verify GREEN**

Run: `pnpm --filter web test:unit`

Expected: PASS.

- [ ] **Step 5: Commit proxy resilience**

```bash
git add apps/web/src/app/floor-plan-3d/mitunet-upstream.ts apps/web/src/app/floor-plan-3d/mitunet-upstream.spec.ts apps/web/src/app/floor-plan-3d/mitunet-api/[...endpoint]/route.ts
git commit -m "fix: bound and trace mitunet upstream requests"
```

### Task 4: Non-blocking serialized GPU execution

**Files:**
- Create: `services/mitunet/server/inference_runtime.py`
- Create: `services/mitunet/tests/test_inference_runtime.py`
- Modify: `services/mitunet/server/main.py`

**Interfaces:**
- Produces: `InferenceRuntime.run(operation: Callable[[], T]) -> Awaitable[T]`
- Produces log fields: `wait_ms`, `run_ms`, `status`

- [ ] **Step 1: Write failing asyncio runtime tests**

Run two blocking operations concurrently and use an event-loop heartbeat to assert operations never overlap while the heartbeat advances during execution.

```py
first, second = await asyncio.gather(runtime.run(blocking_operation), runtime.run(blocking_operation))
self.assertEqual(max_active, 1)
self.assertGreater(heartbeat_count, 0)
```

- [ ] **Step 2: Run focused Python test and verify RED**

Run: `cd services/mitunet && .venv/bin/python -m unittest tests.test_inference_runtime -v`

Expected: FAIL because `server.inference_runtime` does not exist.

- [ ] **Step 3: Implement runtime and route integration**

Create one `InferenceRuntime(asyncio.Semaphore(1))` during lifespan. Move image decoding, `predict_mask`, YOLO detection, composition, and base64 encoding into the callable passed to `await runtime.run(...)`. Keep upload byte validation in the async handler.

```py
async with self._semaphore:
    wait_ms = elapsed_ms(wait_started)
    return await asyncio.to_thread(operation)
```

- [ ] **Step 4: Run MitUNet server tests and verify GREEN**

Run: `cd services/mitunet && .venv/bin/python -m unittest tests.test_inference_runtime tests.test_server_openings tests.test_mitunet_inference -v`

Expected: PASS.

- [ ] **Step 5: Commit GPU runtime changes**

```bash
git add services/mitunet/server/inference_runtime.py services/mitunet/server/main.py services/mitunet/tests/test_inference_runtime.py
git commit -m "fix: keep mitunet event loop responsive during inference"
```

### Task 5: Full verification

**Files:**
- Modify only files required by failures attributable to Tasks 1–4.

**Interfaces:**
- Consumes all preceding task contracts.

- [ ] **Step 1: Run all MitUNet JavaScript tests**

Run: `node --test services/mitunet/tests_js/*.test.mjs`

Expected: PASS.

- [ ] **Step 2: Run web tests**

Run: `pnpm test:web`

Expected: PASS.

- [ ] **Step 3: Run repository verification**

Run: `bash scripts/verify.sh`

Expected: types, UI, web, API builds and API smoke checks all PASS.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff --check HEAD~4..HEAD && git status --short`

Expected: no whitespace errors and a clean worktree.
