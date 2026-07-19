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

test("shows the supplied night landscape over the empty green workspace", async () => {
  const html = await readFile(viewerPath, "utf8");
  const css = readViewerStyle(html);

  assert.match(html, /<body class="view-3d upload-empty">/);
  assert.match(html, /id="workspace-empty-backdrop"/);
  assert.match(html, /classList\.remove\("upload-empty"\)/);
  assert.match(
    css,
    /#workspace-empty-backdrop\s*\{[\s\S]*?url\("\/viewer-assets\/assets\/cosmic-night-landscape\.png"\)[\s\S]*?background-size:\s*cover;/,
  );
  assert.match(css, /body\.upload-empty #workspace-empty-backdrop\s*\{[\s\S]*?opacity:\s*1;/);
});

test("hides the workspace header bar on the empty landing screen", async () => {
  const html = await readFile(viewerPath, "utf8");
  const css = readViewerStyle(html);

  assert.ok(html.includes('id="workspace-header"'));
  assert.match(css, /#workspace-header\s*\{[\s\S]*?display:\s*none;/);
  assert.match(css, /#workspace-empty-backdrop\s*\{[\s\S]*?inset:\s*0;/);
});

test("turns the empty landing screen into a guided left entry card", async () => {
  const html = await readFile(viewerPath, "utf8");
  const css = readViewerStyle(html);

  assert.match(html, /id="ui"/);
  assert.match(html, /id="landing-intro"/);
  assert.match(html, /도면 한 장이면,/);
  assert.match(html, /3D 공간/);
  assert.match(html, /id="start-sample-btn"/);
  assert.match(html, /fetchAndLoad\("\/viewer-assets\/demos\/1191\.json"\)/);
  assert.match(css, /body\.upload-empty #ui\s*\{[\s\S]*?display:\s*block;/);
  assert.match(css, /body\.upload-empty #ui #upload-btn\s*\{[\s\S]*?position:\s*static;/);
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

test("shows a four-step creation workflow from the landing screen", async () => {
  const html = await readFile(viewerPath, "utf8");
  const css = readViewerStyle(html);

  assert.match(html, /id="workflow-progress"/);
  for (const label of ["업로드", "공간 분석", "3D 생성", "편집"]) {
    assert.ok(html.includes(label), `missing workflow label: ${label}`);
  }
  assert.match(html, /function updateWorkflowProgress\(step\)/);
  assert.match(html, /updateWorkflowProgress\(2\)/);
  assert.match(html, /updateWorkflowProgress\(3\)/);
  assert.match(html, /updateWorkflowProgress\(4\)/);
  assert.match(css, /#workflow-progress\s*\{[\s\S]*?border-radius:\s*999px;/);
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
