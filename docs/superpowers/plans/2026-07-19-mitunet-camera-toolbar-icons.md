# MitUNet Camera Toolbar Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the 3D camera toolbar to the upper-left corner and expose every camera view through a recognisable icon button.

**Architecture:** Keep `data-camera-view` values and the existing button event delegation unchanged. Restrict the change to the MitUNet viewer HTML, its embedded styles, and the existing source-level integration test.

**Tech Stack:** Static HTML/CSS, Lucide browser icons, Node.js built-in test runner.

## Global Constraints

- Preserve all six existing camera view identifiers and their click behavior.
- Keep Korean accessible names and browser tooltips for each icon-only button.
- Do not change the furnishing-stage button or camera-transition JavaScript.

---

### Task 1: Add the accessible icon toolbar

**Files:**
- Modify: `services/mitunet/viewer/index.html: camera preset styles and #camera-view-controls markup`
- Modify: `apps/web/src/app/floor-plan-3d/mitunet-internal-page.spec.ts: viewer source assertions`

**Interfaces:**
- Consumes: Existing `[data-camera-view]` click listeners and `updateCameraPresetButtons()` state synchronization.
- Produces: Six icon-only buttons retaining `data-camera-view`, `aria-label`, and `title` attributes.

- [ ] **Step 1: Write the failing test**

```ts
test("renders the camera toolbar as labelled icon buttons", () => {
  assert.match(viewerSource, /id="camera-view-controls"[\\s\\S]*?aria-label="입체 보기"[\\s\\S]*?data-lucide="box-3d"/);
  assert.match(viewerSource, /data-camera-view="auto"[^>]*aria-label="자동 둘러보기"[^>]*>[\\s\\S]*?data-lucide="orbit"/);
  assert.match(viewerSource, /#camera-view-controls\\s*\\{[\\s\\S]*?top:\\s*24px;[\\s\\S]*?left:\\s*24px;/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/web/src/app/floor-plan-3d/mitunet-internal-page.spec.ts`

Expected: FAIL because the existing toolbar uses text labels and has no upper-left style rule.

- [ ] **Step 3: Write minimal implementation**

```html
<button class="camera-preset active" data-camera-view="perspective" type="button" aria-label="입체 보기" title="입체 보기">
  <i data-lucide="box-3d" aria-hidden="true"></i>
</button>
```

```css
#camera-view-controls { position: absolute; top: 24px; left: 24px; z-index: 20; }
.camera-preset { display: grid; width: 38px; min-height: 38px; place-items: center; padding: 0; }
.camera-preset [data-lucide] { width: 18px; height: 18px; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test apps/web/src/app/floor-plan-3d/mitunet-internal-page.spec.ts`

Expected: PASS with no assertion failures.

- [ ] **Step 5: Run focused web verification**

Run: `pnpm --filter web test -- mitunet-internal-page.spec.ts`

Expected: PASS, confirming the served viewer still includes the changed toolbar.
