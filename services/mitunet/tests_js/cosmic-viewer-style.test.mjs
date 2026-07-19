import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const viewerPath = fileURLToPath(new URL("../viewer/index.html", import.meta.url));

function readViewerStyle(html) {
  const match = html.match(/<style>([\s\S]*?)<\/style>/);
  assert.ok(match, "viewer must keep its inline style block");
  return match[1].replace(/\r\n/g, "\n");
}

test("uses the RoomLog cosmic tokens for every floating viewer surface", async () => {
  const html = await readFile(viewerPath, "utf8");
  const css = readViewerStyle(html);

  for (const declaration of [
    '@font-face {\n    font-family: "NanumSquareRound"',
    "--surface: #f1eef9;",
    "--primary: #5747cf;",
    "--nav-surface: #201a3f;",
    "--shadow: 0 24px 56px rgba(35, 27, 74, .09);",
    "--radius-md: 20px;",
    "#ui,\n  #editor-tools",
    "#furniture-panel",
    "#furniture-floating-toolbar",
    "body.dragging::after",
  ]) {
    assert.ok(css.includes(declaration), `missing cosmic style: ${declaration}`);
  }

  assert.match(css, /#ui,[\s\S]*?border:\s*0;/);
  assert.match(css, /#furniture-panel\s*\{[\s\S]*?border:\s*0;/);
  assert.match(css, /body\.dragging::after\s*\{[\s\S]*?content:\s*"PNG 또는 JPG를 여기에 놓으세요"/);

  for (const declaration of [
    "#workspace-header",
    "#workspace-brand",
    "body.view-original #editor-tools",
    "#view-controls {",
    "bottom: 28px;",
    "#upload-btn {",
    "#upload-btn .upload-empty-icon",
    "#upload-btn .upload-title",
    "#upload-btn .upload-cta",
    "#upload-btn > svg",
    "#upload-btn .upload-format-icons svg",
    "#upload-btn .upload-format-icons > span",
  ]) {
    assert.ok(css.includes(declaration), `missing architectural shell: ${declaration}`);
  }
});

test("uses the CSS star field for the empty landing screen", async () => {
  const html = await readFile(viewerPath, "utf8");
  const css = readViewerStyle(html);

  assert.match(html, /<body class="view-3d upload-empty">/);
  assert.match(html, /id="workspace-empty-backdrop"/);
  assert.match(html, /classList\.remove\("upload-empty"\)/);
  const backdropRule = css.match(/#workspace-empty-backdrop\s*\{([^}]*)\}/);
  assert.ok(backdropRule, "missing empty-workspace backdrop rule");
  assert.doesNotMatch(backdropRule[1], /cosmic-night-landscape\.png/);
  assert.match(backdropRule[1], /radial-gradient/);
  assert.match(backdropRule[1], /linear-gradient\(#04060f, #101a38 55%, #26355e\)/);
  assert.match(backdropRule[1], /background-repeat:\s*repeat/);
  assert.match(css, /body\.upload-empty #workspace-empty-backdrop\s*\{[\s\S]*?opacity:\s*1;/);
});

test("hides the workspace header bar on the empty landing screen", async () => {
  const html = await readFile(viewerPath, "utf8");
  const css = readViewerStyle(html);

  assert.ok(html.includes('id="workspace-header"'));
  assert.match(css, /#workspace-header\s*\{[\s\S]*?display:\s*none;/);
  assert.match(css, /#workspace-empty-backdrop\s*\{[\s\S]*?inset:\s*0;/);
});

test("centers a transparent landing hero over the night sky", async () => {
  const html = await readFile(viewerPath, "utf8");
  const css = readViewerStyle(html);

  assert.match(html, /id="ui"/);
  assert.match(html, /id="landing-intro"/);
  assert.match(html, /도면 한 장이면,/);
  assert.match(html, /3D 공간/);
  assert.match(html, /id="start-sample-btn"/);
  assert.match(html, /fetchAndLoad\("\/viewer-assets\/demos\/1191\.json"\)/);
  assert.match(css, /body\.upload-empty #control-stack\s*\{[^}]*inset:\s*0;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/);
  assert.match(css, /body\.upload-empty #ui\s*\{[^}]*width:\s*min\(660px, calc\(100vw - 48px\)\);[^}]*background:\s*transparent;[^}]*text-align:\s*center;/);
  assert.match(css, /body\.upload-empty #ui #upload-btn\s*\{[^}]*display:\s*inline-flex;[^}]*width:\s*auto;[^}]*border-radius:\s*999px;/);
  assert.match(css, /#start-sample-btn\s*\{[^}]*width:\s*auto;[^}]*border-radius:\s*999px;/);
  assert.match(css, /body\.upload-empty #start-sample-btn\s*\{\s*display:\s*inline-flex;/);
  assert.doesNotMatch(css, /body\.upload-empty #ui\s*\{[^}]*background:\s*rgba\(255, 255, 255/);
});

test("keeps the legacy upload controls off the loaded 3D workspace", async () => {
  const html = await readFile(viewerPath, "utf8");
  const css = readViewerStyle(html);

  assert.doesNotMatch(css, /body:not\(\.view-original\):not\(\.view-furnishing\) #upload-btn/);
  for (const selector of [
    "body:not(.upload-empty) #ui > h1",
    "body:not(.upload-empty) #upload-label",
    "body:not(.upload-empty) #upload-btn",
    "body:not(.upload-empty) #status",
  ]) {
    assert.ok(css.includes(selector), `missing loaded-workspace hide selector: ${selector}`);
  }
  assert.match(css, /body:not\(\.upload-empty\) \.landing-feature-row\s*\{\s*display:\s*none;/);
});

test("does not render the workflow progress bar", async () => {
  const html = await readFile(viewerPath, "utf8");
  const css = readViewerStyle(html);

  assert.doesNotMatch(html, /id="workflow-progress"/);
  assert.doesNotMatch(html, /data-workflow-step/);
  assert.doesNotMatch(html, /updateWorkflowProgress/);
  assert.doesNotMatch(css, /#workflow-progress|\.workflow-step|workflow-step-ripple/);
  assert.match(css, /#view-controls\s*\{[^}]*bottom:\s*28px;/);
});

test("keeps Show Original and Show 3D available for an open review document", async () => {
  const html = await readFile(viewerPath, "utf8");
  const css = readViewerStyle(html);

  assert.match(html, /<div id="view-controls" hidden>[\s\S]*?data-view="original"[\s\S]*?data-view="3d"/);
  assert.match(html, /<\/div>\s*<div id="view-controls" hidden>[\s\S]*?<aside id="editor-tools"/);
  assert.match(html, /function updateEditorControls\(\)\s*\{[\s\S]*?const hasDocument = Boolean\(reviewDocument\);[\s\S]*?viewControls\.hidden = !hasDocument;[\s\S]*?viewButtons\.forEach/);
  assert.match(css, /#view-controls\s*\{[^}]*pointer-events:\s*auto;/);
});

test("shows the RoomLog save button only after a 3D plan is rendered", async () => {
  const html = await readFile(viewerPath, "utf8");

  assert.match(html, /const canSave = \["3d", "furnishing"\]\.includes\(currentView\)[\s\S]*?Boolean\(currentComposedPlan\)/);
  assert.match(html, /connectRoomLogButton\.hidden = !roomLogContext \|\| !canSave;/);
});

test.skip("renders the original-plan editor as a compact Korean card toolbar", async () => {
  const html = await readFile(viewerPath, "utf8");
  const css = readViewerStyle(html);

  for (const label of [
    "도구", "선택", "이동", "벽", "지우기", "문", "창문", "스케일",
    "두 점을 선택하세요.", "실제 길이", "적용", "브러시 크기", "탐색",
    "실행취소", "다시실행", "삭제", "종류 변경", "전체 초기화", "클래스",
  ]) {
    assert.ok(html.includes(label), `missing Korean editor label: ${label}`);
  }
  assert.match(css, /#editor-tools\s*\{[\s\S]*?bottom:\s*auto;[\s\S]*?width:\s*min\(440px, calc\(100vw - 56px\)\);[\s\S]*?max-height:\s*calc\(100vh - 124px\);[\s\S]*?padding:\s*24px;/);
  assert.match(css, /#editor-tools \.label,[\s\S]*?#editor-tools \.btn span\s*\{[\s\S]*?position:\s*static;/);
  assert.match(css, /#editor-tools \.tool-grid,[\s\S]*?#editor-tools \.navigation-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);[\s\S]*?gap:\s*12px;/);
  assert.match(css, /#editor-tools \.tool-grid \.btn\s*\{[\s\S]*?min-height:\s*60px;/);
  assert.match(css, /#editor-tools \.navigation-grid \.btn\s*\{[\s\S]*?min-height:\s*54px;/);
  assert.match(css, /#editor-tools \.action-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);[\s\S]*?gap:\s*12px;/);
  assert.match(css, /#editor-tools \.btn:disabled\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?background:\s*#f4f1ff;[\s\S]*?color:\s*#aaa4d9;/);
  assert.match(css, /#editor-tools \.scale-input-row input\s*\{[\s\S]*?height:\s*50px;/);
  assert.match(html, /scaleSummary\.textContent = "두 점을 선택하세요\."/);
  assert.match(css, /#editor-tools \.legend\s*\{[\s\S]*?grid-template-columns:\s*1fr;/);
  assert.doesNotMatch(css, /#editor-tools \.tool-grid,[\s\S]*?#editor-tools \.action-grid\s*\{\s*display:\s*flex;/);
});

test("does not leave an empty white panel in original-plan editing", async () => {
  const html = await readFile(viewerPath, "utf8");
  const css = readViewerStyle(html);

  assert.match(html, /id="ui"/);
  assert.match(css, /body\.view-original #ui\s*\{\s*display:\s*none !important;\s*\}/);
});

test("keeps contextual wall and scale controls separate from navigation and classes", async () => {
  const html = await readFile(viewerPath, "utf8");
  const css = readViewerStyle(html);

  for (const hook of [
    'id="editor-context-panel"',
    'id="editor-rail-navigation"',
    'id="editor-class-legend"',
  ]) {
    assert.ok(html.includes(hook), `missing contextual editor hook: ${hook}`);
  }
  assert.match(css, /#editor-context-panel\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?left:\s*112px;[\s\S]*?border-radius:\s*0\s+14px\s+14px\s+0;/);
  assert.match(css, /#editor-class-legend\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?right:\s*24px;[\s\S]*?bottom:\s*24px;/);
  assert.match(css, /#editor-rail-navigation\s*\{[\s\S]*?grid-template-columns:\s*1fr;/);
  assert.match(html, /selectedTool === "wall" \|\| selectedTool === "scale"/);
  assert.match(html, /brushControl\.hidden = selectedTool !== "wall";/);
  assert.match(html, /brushLabel\.hidden = selectedTool !== "wall";/);
  assert.match(html, /scaleControl\.hidden = selectedTool !== "scale";/);
});

test("renders the original-plan editor as a narrow vertical Korean toolbar", async () => {
  const html = await readFile(viewerPath, "utf8");
  const css = readViewerStyle(html);

  for (const hook of [
    'id="editor-utility-panel"',
    'id="editor-more-btn"',
    'class="editor-rail-divider"',
  ]) {
    assert.ok(html.includes(hook), `missing compact editor toolbar hook: ${hook}`);
  }
  assert.match(css, /#editor-tools\s*\{[\s\S]*?width:\s*92px;[\s\S]*?height:\s*calc\(100vh - 112px\);[\s\S]*?padding:\s*14px 10px;/);
  assert.match(css, /#editor-tools \.tool-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr;/);
  assert.ok(css.includes("#editor-tools .tool-grid .btn:nth-child(2)::after"));
  assert.match(css, /#editor-tools \.tool-grid \.btn:nth-child\(2\)::after,[\s\S]*?content:\s*"";/);
  assert.match(css, /#editor-tools \.tool-grid \.btn\s*\{[\s\S]*?min-height:\s*66px;[\s\S]*?flex-direction:\s*column;/);
  assert.match(css, /#editor-tools \.tool-grid \.btn\.active\s*\{[\s\S]*?background:\s*#e8e7ef;[\s\S]*?color:\s*#315bb4;/);
  assert.match(css, /#editor-utility-panel\s*\{[\s\S]*?left:\s*112px;[\s\S]*?width:\s*min\(360px, calc\(100vw - 132px\)\);/);
  assert.match(html, /editorMoreButton\.addEventListener\("click"/);
  assert.match(html, /editorUtilityPanel\.hidden = !isOpen;/);
});

test("uses blue, yellow, and red class swatches in the editor", async () => {
  const html = await readFile(viewerPath, "utf8");
  const css = readViewerStyle(html);

  assert.match(css, /#editor-tools \.swatch\.wall\s*\{\s*background:\s*#3a70d6;/);
  assert.match(css, /#editor-tools \.swatch\.door\s*\{\s*background:\s*#e6ab1d;/);
  assert.match(css, /#editor-tools \.swatch\.window\s*\{\s*background:\s*#e05357;/);
});

test("lays out the furniture catalog as two-column image cards", async () => {
  const html = await readFile(viewerPath, "utf8");
  const css = readViewerStyle(html);

  assert.match(html, /const FURNITURE_PAGE_SIZE = 4;/);
  assert.match(css, /#furniture-panel\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;/);
  assert.match(css, /#furniture-results\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);[\s\S]*?flex:\s*1;[\s\S]*?max-height:\s*none;/);
  assert.match(css, /\.furniture-card\s*\{[\s\S]*?flex-direction:\s*column;/);
  assert.match(css, /\.furniture-card-swatch\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100px;/);
  assert.match(css, /\.furniture-card-details\s*\{[\s\S]*?padding:\s*10px;/);
  assert.match(css, /#furniture-pagination\s*\{[\s\S]*?margin-top:\s*auto;/);
  assert.match(html, /details\.className = "furniture-card-details";/);
});

test("keeps the existing viewer hooks and integration request paths intact", async () => {
  const html = await readFile(viewerPath, "utf8");

  for (const hook of [
    'id="workspace-header"',
    'id="workspace-brand"',
    'id="upload-btn"',
    'class="upload-empty-icon"',
    'class="upload-title"',
    'class="upload-cta"',
    'id="demo-select"',
    'id="status"',
    'id="view-switch"',
    'id="editor-tools"',
    'id="furniture-panel"',
    'id="furniture-floating-toolbar"',
    'id="save-json-btn"',
    'id="connect-roomlog-btn"',
    'canvas id="scene"',
  ]) {
    assert.ok(html.includes(hook), `missing viewer hook: ${hook}`);
  }

  for (const requestPath of [
    'fetch("/extract-image"',
    'fetch("/compose-edits"',
    'fetch("/room-materials"',
    'fetch("/integration-config"',
    'fetch("/healthz"',
  ]) {
    assert.ok(html.includes(requestPath), `missing integration path: ${requestPath}`);
  }
});
