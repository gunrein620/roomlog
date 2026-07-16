import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const MITUNET_INTERNAL_SERVICE_URL =
  process.env.MITUNET_INTERNAL_SERVICE_URL ??
  "http://127.0.0.1:8012";

const FALLBACK_MITUNET_PROJECT_ROOT = "C:/Users/smoun/Jungle/floorplan-to-3d-mitunet";

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
};

function projectRootCandidates() {
  return [
    process.env.MITUNET_PROJECT_ROOT,
    path.resolve(process.cwd(), "..", "..", "..", "..", "floorplan-to-3d-mitunet"),
    path.resolve(process.cwd(), "..", "floorplan-to-3d-mitunet"),
    FALLBACK_MITUNET_PROJECT_ROOT,
  ].filter((candidate): candidate is string => Boolean(candidate));
}

function resolveMitunetProjectRoot() {
  const root = projectRootCandidates().find((candidate) => existsSync(path.join(candidate, "viewer", "index.html")));
  if (!root) {
    throw new Error("MitUNet viewer files were not found. Set MITUNET_PROJECT_ROOT to the floorplan-to-3d-mitunet path.");
  }
  return root;
}

export function resolveMitunetViewerFile(...segments: string[]) {
  const viewerRoot = path.resolve(resolveMitunetProjectRoot(), "viewer");
  const filePath = path.resolve(viewerRoot, ...segments);
  if (filePath !== viewerRoot && !filePath.startsWith(`${viewerRoot}${path.sep}`)) {
    throw new Error("MitUNet viewer asset path escaped the viewer directory.");
  }
  return filePath;
}

export async function readMitunetViewerFile(assetPath: string) {
  return readFile(resolveMitunetViewerFile(assetPath), "utf8");
}

export function contentTypeFor(filePath: string) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

export function transformMitunetViewerHtml(html: string) {
  return html
    .replaceAll('"/viewer-assets/', '"/floor-plan-3d/mitunet-assets/')
    .replaceAll("'/viewer-assets/", "'/floor-plan-3d/mitunet-assets/")
    .replaceAll('fetch("/extract-image"', 'fetch("/floor-plan-3d/mitunet-api/extract-image"')
    .replaceAll('fetch("/compose-edits"', 'fetch("/floor-plan-3d/mitunet-api/compose-edits"')
    .replaceAll('fetch("/integration-config"', 'fetch("/floor-plan-3d/mitunet-api/integration-config"')
    .replaceAll('fetch("/healthz"', 'fetch("/floor-plan-3d/mitunet-api/healthz"')
    .replaceAll(
      'title="Connect this 3D plan to RoomLog"',
      'title="3D 도면을 저장하고 매물 등록으로 돌아가기"',
    )
    .replaceAll('>RoomLog에 연결</span>', '>3D 도면 저장하기</span>')
    .replaceAll(
      'saveJsonButton.hidden = !canSave;',
      'saveJsonButton.hidden = !canSave || Boolean(roomLogContext);',
    )
    .replaceAll(
      'setStatus("RoomLog에 3D 도면을 연결했습니다. RoomLog 탭으로 돌아가세요.");',
      'setStatus("3D 도면을 저장했습니다. 매물 등록 화면으로 돌아갑니다.");',
    );
}

export function transformRoomLogIntegrationModule(source: string, storageKey: string, returnPath: string) {
  return source.replace(
    /export function sendRoomLogCompletion\([^)]*\) \{[\s\S]*?\n\}/,
    `export function sendRoomLogCompletion(context, plan, sourceName) {
  const message = buildRoomLogCompletion(context, plan, sourceName);
  const storageValue = {
    name: message.payload.name,
    savedAt: Date.now(),
    walls3D: [],
    furnitures: [],
    mitunet: message.payload,
  };
  window.localStorage.setItem(${JSON.stringify(storageKey)}, JSON.stringify(storageValue));
  window.location.href = new URL(${JSON.stringify(returnPath)}, context.returnOrigin).toString();
  return message;
}`,
  );
}
