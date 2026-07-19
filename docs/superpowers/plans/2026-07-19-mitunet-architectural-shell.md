# MitUNet Architectural Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompose the MitUNet viewer into the approved Plan2Scene-style workspace shell while preserving every viewer interaction and RoomLog integration contract.

**Architecture:** Add one static application header and use the existing viewer state classes to arrange the current controls into a stage card, thin tool rail, centre work surface, and bottom mode switcher. Existing controls retain their ids and bindings; CSS owns responsive layout.

**Tech Stack:** Static HTML, inline CSS, vanilla ES modules, Lucide icons, Node.js built-in test runner.

## Global Constraints

- Preserve every existing viewer id, `data-*` attribute, button, input, script, request path, save payload, and event listener contract.
- Do not modify Three.js canvas construction, `createConcreteTexture`, lighting, GTAO, flood-fill, or integration proxy request strings.
- Use RoomLog Cosmic tokens and NanumSquareRound; do not import Plan2Scene markup or its blue/white token set.
- Keep `view-3d`, `view-original`, `view-furnishing`, `view-transitioning`, `is-busy`, and `dragging` as the only layout state drivers.
- Verify the MitUNet suite and retain the current six known `property-shell.spec.mjs` failures without adding another.

---

## File Structure

- Modify: `services/mitunet/viewer/index.html` — static workspace header plus architectural-shell CSS only.
- Modify: `services/mitunet/tests_js/cosmic-viewer-style.test.mjs` — shell-selector and existing-hook regression contract.
- No new runtime module, API, asset, or persisted data.

### Task 1: Specify the workspace-shell regression contract

**Files:**

- Modify: `services/mitunet/tests_js/cosmic-viewer-style.test.mjs:14-63`
- Test: `services/mitunet/tests_js/cosmic-viewer-style.test.mjs`

**Interfaces:**

- Consumes: inline `<style>` and existing viewer HTML hooks.
- Produces: assertions for the workspace header, tool rail, bottom switcher, and existing integration paths.

- [ ] **Step 1: Add the failing shell assertions**

```js
for (const declaration of [
  "#workspace-header",
  "#workspace-brand",
  "body.view-original #editor-tools",
  "#view-controls {",
  "bottom: 28px;",
  "#upload-btn {",
]) {
  assert.ok(css.includes(declaration), `missing architectural shell: ${declaration}`);
}

for (const hook of [
  'id="workspace-header"',
  'id="workspace-brand"',
  'id="upload-btn"',
  'id="editor-tools"',
  'id="view-switch"',
]) {
  assert.ok(html.includes(hook), `missing workspace hook: ${hook}`);
}
```

- [ ] **Step 2: Run the focused test and confirm the red state**

Run: `node --test tests_js/cosmic-viewer-style.test.mjs`

Expected: FAIL with `missing architectural shell: #workspace-header`.

- [ ] **Step 3: Preserve the request-path assertions verbatim**

```js
for (const requestPath of [
  'fetch("/extract-image"',
  'fetch("/compose-edits"',
  'fetch("/room-materials"',
  'fetch("/integration-config"',
  'fetch("/healthz"',
]) {
  assert.ok(html.includes(requestPath), `missing integration path: ${requestPath}`);
}
```

- [ ] **Step 4: Commit the red test**

```powershell
git add services/mitunet/tests_js/cosmic-viewer-style.test.mjs
git commit -m "test: specify MitUNet architectural shell"
```

### Task 2: Add the static header and desktop control reflow

**Files:**

- Modify: `services/mitunet/viewer/index.html:660-664`
- Modify: `services/mitunet/viewer/index.html:143-648`
- Test: `services/mitunet/tests_js/cosmic-viewer-style.test.mjs`

**Interfaces:**

- Consumes: `#control-stack`, `#ui`, `#editor-tools`, `#view-controls`, `#upload-btn`, and body state classes.
- Produces: a static `#workspace-header` and CSS-only stage-card, rail, upload-zone, and mode-switch layout.

- [ ] **Step 1: Insert only this header directly after `<body class="view-3d">`**

```html
<header id="workspace-header">
  <div id="workspace-brand" aria-label="RoomLog">RoomLog</div>
  <div class="workspace-header-context" aria-hidden="true">도면 → 3D</div>
</header>
```

Do not move, rename, duplicate, or rewire a viewer button. `#save-json-btn` and `#connect-roomlog-btn` remain the only save controls.

- [ ] **Step 2: Add the header and stage-card CSS in the existing `<style>` block**

```css
#workspace-header {
  position: fixed; inset: 0 0 auto; z-index: 20;
  display: flex; min-height: 72px; align-items: center; justify-content: space-between;
  padding: 0 28px; color: var(--nav-on); background: rgba(32, 26, 63, .82);
  box-shadow: 0 8px 28px rgba(4, 6, 15, .16); backdrop-filter: blur(18px);
}
#workspace-brand { font-size: 20px; font-weight: 800; letter-spacing: -.03em; }
.workspace-header-context { color: rgba(244, 241, 253, .72); font-size: 12px; font-weight: 700; }
#control-stack { top: 96px; bottom: 28px; left: 28px; width: 312px; gap: 14px; }
#ui { border-radius: var(--radius-md); padding: 20px; }
```

Keep both canvases at `inset: 0`; the header overlays rather than resizes the renderer viewport.

- [ ] **Step 3: Turn the existing editor into the narrow, scrollable icon rail**

```css
#editor-tools {
  position: fixed; top: 96px; bottom: 28px; left: 28px; width: 76px;
  padding: 12px 10px; overflow-y: auto;
}
body.view-original #editor-tools { transform: translateX(0); }
#editor-tools .label,
#editor-tools .btn span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
#editor-tools .tool-grid,
#editor-tools .navigation-grid,
#editor-tools .action-grid { grid-template-columns: 1fr; }
#editor-tools .btn { min-height: 44px; padding: 8px; }
```

All scale, action, and legend controls remain in the rail scroll region; do not use `display: none` on an existing control.

- [ ] **Step 4: Centre the existing upload button and move the existing switch to a bottom pill**

```css
body:not(.view-original):not(.view-furnishing) #upload-btn {
  position: fixed; top: 50%; left: 50%; z-index: 15;
  width: min(52vw, 720px); min-height: min(46vh, 480px);
  transform: translate(-50%, -50%); border: 2px dashed var(--nav-border);
  background: rgba(255, 255, 255, .9); color: var(--primary);
}
#view-controls {
  position: fixed; z-index: 21; bottom: 28px; left: 50%; width: max-content;
  margin: 0; padding: 7px; transform: translateX(-50%); border-radius: 999px;
  background: rgba(255, 255, 255, .94); box-shadow: var(--shadow);
}
```

Keep the existing `[hidden]` selector. When the current controller hides `#upload-btn`, the centre action disappears too.

- [ ] **Step 5: Run the focused test and confirm the green state**

Run: `node --test tests_js/cosmic-viewer-style.test.mjs`

Expected: PASS with 2 tests and 0 failures.

- [ ] **Step 6: Commit the desktop workspace shell**

```powershell
git add services/mitunet/viewer/index.html services/mitunet/tests_js/cosmic-viewer-style.test.mjs
git commit -m "feat: reflow MitUNet into architectural workspace"
```

### Task 3: Keep the shell usable on narrow screens and without motion

**Files:**

- Modify: `services/mitunet/viewer/index.html:632-650`
- Test: `services/mitunet/tests_js/cosmic-viewer-style.test.mjs`

**Interfaces:**

- Consumes: the desktop shell selectors from Task 2.
- Produces: mobile rules without JavaScript state changes.

- [ ] **Step 1: Add the responsive and reduced-motion rules**

```css
@media (max-width: 720px) {
  #workspace-header { min-height: 60px; padding: 0 16px; }
  #control-stack { top: 72px; right: 16px; bottom: auto; left: 16px; width: auto; }
  #editor-tools { top: auto; right: 16px; bottom: 82px; left: 16px; width: auto; max-height: 96px; }
  #editor-tools .tool-grid,
  #editor-tools .navigation-grid,
  #editor-tools .action-grid { display: flex; overflow-x: auto; }
  body:not(.view-original):not(.view-furnishing) #upload-btn { width: calc(100vw - 32px); min-height: 38vh; }
  #view-controls { bottom: 16px; max-width: calc(100vw - 32px); overflow-x: auto; }
}
@media (prefers-reduced-motion: reduce) {
  #workspace-header, #view-controls, #upload-btn, #editor-tools { transition: none; }
}
```

- [ ] **Step 2: Run the complete viewer suite**

Run: `node --test tests_js/*.test.mjs`

Expected: PASS with 0 failures.

- [ ] **Step 3: Commit the responsive shell**

```powershell
git add services/mitunet/viewer/index.html services/mitunet/tests_js/cosmic-viewer-style.test.mjs
git commit -m "fix: keep MitUNet workspace responsive"
```

### Task 4: Verify source scope, rendered states, and application-shell boundary

**Files:**

- Modify: none unless browser inspection proves a CSS-only defect.
- Test: `services/mitunet/tests_js/*.test.mjs`, `apps/web/property-shell.spec.mjs`

**Interfaces:**

- Consumes: local viewer at `http://localhost:3000/floor-plan-3d/mitunet`.
- Produces: evidence of the five visual states without runtime or proxy changes.

- [ ] **Step 1: Prove only viewer shell files changed**

```powershell
git diff --check -- services/mitunet/viewer/index.html services/mitunet/tests_js/cosmic-viewer-style.test.mjs
git diff -- services/mitunet/viewer/index.html | Select-String -Pattern '<script|fetch\(|createConcreteTexture|GTAO|floor_materials'
```

Expected: no whitespace error and no changed runtime, proxy, or renderer line.

- [ ] **Step 2: Inspect upload, 3D, original-plan, furnishing, and save feedback in the local browser**

Confirm one header, one stage card, a rail only in original-plan mode, a bottom view switcher, the existing furniture panel in furnishing mode, and zero console errors.

- [ ] **Step 3: Run the app-shell suite and record its established boundary**

Run: `node --test property-shell.spec.mjs`

Expected: 150 tests, 144 passes, and these six existing failures only: `tenant complaint modal persists, restores, and clears the authenticated room draft`; `manager contract forms submit date-only values and show correction save errors`; `failed manager contract confirmation reveals every field that needs correction`; `borrows mature Zigbang and Dabang product patterns for trust and map search`; `makes filters and saved listings behave like interactive app state`; `opens a Dabang-like listing detail view from a listing card`.

- [ ] **Step 4: Commit only an actual browser-confirmed correction**

```powershell
git add services/mitunet/viewer/index.html services/mitunet/tests_js/cosmic-viewer-style.test.mjs
git commit -m "fix: refine MitUNet workspace shell"
```

Do not commit if browser inspection requires no correction.

## Self-review

- Spec coverage: Tasks 2 and 3 cover header, rail, stage card, centred upload action, bottom switcher, Cosmic styling, mobile layout, and state preservation. Task 4 covers browser and regression verification.
- Placeholder scan: each task has exact paths, code, commands, and expected output.
- Interface consistency: only `index.html` and the existing style regression test change; the plan adds no runtime API or JavaScript dependency.
