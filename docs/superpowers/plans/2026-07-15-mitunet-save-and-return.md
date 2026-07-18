# MitUNet Save and Return Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the RoomLog-facing connection copy with a 3D-plan save action that stores the converted plan and returns to the listing-registration screen.

**Architecture:** RoomLog continues to serve MitUNet through its internal proxy. The proxy rewrites only the viewer UI copy and hides file-download export during a RoomLog session; the existing same-tab completion handler remains the single writer of canonical `roomlog-mitunet-floor-plan` JSON to `roomlogListingFloorPlan3D`, then redirects to `/?flow=listing#my-page`.

**Tech Stack:** Next.js route handlers, TypeScript, Node test runner, MitUNet viewer modules.

## Global Constraints

- Keep the external MitUNet project unmodified; all integration changes live in RoomLog.
- Keep `Show 3D` as a preview action; the save action is enabled only after a composed 3D plan exists.
- Preserve standalone `Save JSON` download behavior outside the RoomLog internal route.
- Do not create a git commit unless the user requests one.

---

### Task 1: Lock the RoomLog viewer copy and export behavior with a regression test

**Files:**
- Create: `apps/web/src/app/floor-plan-3d/mitunet-proxy.spec.ts`
- Modify: `apps/web/src/app/floor-plan-3d/mitunet-proxy.ts`

**Interfaces:**
- Consumes: `transformMitunetViewerHtml(html: string): string`.
- Produces: RoomLog-only HTML with `3D 도면 저장하기` copy and a hidden file-download button during an integration session.

- [ ] **Step 1: Write the failing test**

```ts
const transformed = transformMitunetViewerHtml(`
  <button id="save-json-btn"><span>Save JSON</span></button>
  <button id="connect-roomlog-btn" title="Connect this 3D plan to RoomLog"><span>RoomLog에 연결</span></button>
  <script>saveJsonButton.hidden = !canSave;</script>
`);
assert.match(transformed, /3D 도면 저장하기/);
assert.doesNotMatch(transformed, /RoomLog에 연결/);
assert.match(transformed, /saveJsonButton\.hidden = !canSave \|\| Boolean\(roomLogContext\)/);
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `$env:TS_NODE_COMPILER_OPTIONS='{ "module": "commonjs" }'; node --test -r ts-node/register src/app/floor-plan-3d/mitunet-proxy.spec.ts`

Expected: failure because the transformed viewer still contains RoomLog connection copy and leaves the download button visible.

- [ ] **Step 3: Implement the minimal proxy rewrite**

```ts
.replaceAll('title="Connect this 3D plan to RoomLog"', 'title="Save this 3D plan and return to the listing"')
.replaceAll('>RoomLog에 연결</span>', '>3D 도면 저장하기</span>')
.replaceAll('saveJsonButton.hidden = !canSave;', 'saveJsonButton.hidden = !canSave || Boolean(roomLogContext);')
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `$env:TS_NODE_COMPILER_OPTIONS='{ "module": "commonjs" }'; node --test -r ts-node/register src/app/floor-plan-3d/mitunet-proxy.spec.ts`

Expected: 1 passing test.

### Task 2: Verify the complete registration handoff still uses canonical JSON

**Files:**
- Test: `apps/web/src/app/floor-plan-3d/mitunet-internal-page.spec.ts`
- Test: `apps/web/src/app/my/flows/landlord-mitunet-entry.spec.ts`
- Test: `apps/web/src/lib/mitunet-floor-plan.spec.ts`
- Test: `apps/api/src/trade/mitunet-floor-plan.spec.ts`
- Test: `apps/api/src/trade/trade-mitunet-persistence.spec.ts`

**Interfaces:**
- Consumes: transformed completion module writes `roomlogListingFloorPlan3D` with `mitunet` payload.
- Produces: listing registration reads the saved payload and the trade service persists it on final registration.

- [ ] **Step 1: Run web integration tests**

Run: `$env:TS_NODE_COMPILER_OPTIONS='{ "module": "commonjs" }'; node --test -r ts-node/register src/app/floor-plan-3d/mitunet-proxy.spec.ts src/app/floor-plan-3d/mitunet-internal-page.spec.ts src/app/my/flows/landlord-mitunet-entry.spec.ts src/lib/mitunet-floor-plan.spec.ts`

Expected: all tests pass.

- [ ] **Step 2: Run API persistence tests**

Run: `$env:TS_NODE_COMPILER_OPTIONS='{ "module": "commonjs" }'; node --test -r ts-node/register src/trade/mitunet-floor-plan.spec.ts src/trade/trade-mitunet-persistence.spec.ts`

Expected: all tests pass.

- [ ] **Step 3: Build and live-check the RoomLog route**

Run: `node scripts/next-with-root-env.mjs build`

Expected: exit code 0. Restart the local RoomLog server, then fetch `/floor-plan-3d/mitunet` and assert the served HTML contains `3D 도면 저장하기` and the transformed module still writes `roomlogListingFloorPlan3D` before redirecting to `/?flow=listing#my-page`.
