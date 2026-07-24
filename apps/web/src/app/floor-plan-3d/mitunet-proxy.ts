import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { resolveRoomlogRuntimePath } from "../../lib/runtime-asset-path";

export const MITUNET_INTERNAL_SERVICE_URL =
  process.env.MITUNET_INTERNAL_SERVICE_URL ??
  "http://127.0.0.1:8012";

const configuredAssetVersion = process.env.ROOMLOG_DEPLOY_SHA?.trim() ?? "";
export const MITUNET_ASSET_VERSION = /^[a-zA-Z0-9._-]{1,64}$/.test(configuredAssetVersion)
  ? configuredAssetVersion
  : "dev";

const DEFAULT_MITUNET_PROJECT_ROOT = "services/mitunet";

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
    process.env.MITUNET_PROJECT_ROOT
      ? resolveRoomlogRuntimePath(process.env.MITUNET_PROJECT_ROOT)
      : undefined,
    resolveRoomlogRuntimePath(DEFAULT_MITUNET_PROJECT_ROOT),
  ].filter((candidate): candidate is string => Boolean(candidate));
}

function resolveMitunetProjectRoot() {
  const root = projectRootCandidates().find((candidate) => existsSync(path.join(candidate, "viewer", "index.html")));
  if (!root) {
    throw new Error("MitUNet viewer files were not found under RoomLog services/mitunet.");
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

export function applyRoomLogMitunetFormOptions(endpointPath: string, formData: FormData) {
  if (endpointPath === "compose-edits") {
    formData.set("wall_polygon_mode", "copy-wall");
  }
  return formData;
}

// 뷰어는 route.ts가 raw HTML로 서빙해 Next 레이아웃(layout.tsx)을 거치지 않는다.
// 그래서 본문 서체(Pretendard)가 로드되지 않으므로 여기서 직접 주입한다.
// 버전은 apps/web/src/app/layout.tsx의 링크와 맞춰 둔다.
const PRETENDARD_LINK_TAGS =
  '<link rel="preconnect" href="https://cdn.jsdelivr.net" />' +
  '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />';

export function versionMitunetViewerAssetUrls(source: string, version = MITUNET_ASSET_VERSION) {
  const assetRoot = `/floor-plan-3d/mitunet-assets/${version}/`;
  return source
    .replaceAll('"/viewer-assets/', `"${assetRoot}`)
    .replaceAll("'/viewer-assets/", `'${assetRoot}`)
    .replaceAll("`/viewer-assets/", `\`${assetRoot}`);
}

// 소유자 가구 카탈로그(등록 가구/폴리)는 NEXT_PUBLIC_FURNITURE_ASSET_BASE_URL(S3 프리픽스)로
// modelUrl을 만든다. 뷰어는 이 값을 알아야 저장된 가구의 절대 URL을 상대 relativePath로 되돌려
// 재진입(mapFurniturePlacements 검증)이 깨지지 않는다. NEXT_PUBLIC_*는 빌드타임 인라인이지만
// 뷰어 HTML은 요청 시 프록시가 만들므로 여기서 서버 런타임 env를 읽어 주입한다.
const ROOMLOG_FURNITURE_ASSET_BASE_SCRIPT = () =>
  `<script>window.__ROOMLOG_FURNITURE_ASSET_BASE_URL=${JSON.stringify(
    process.env.NEXT_PUBLIC_FURNITURE_ASSET_BASE_URL?.trim() ?? "",
  )};</script>`;

export function transformMitunetViewerHtml(html: string) {
  return versionMitunetViewerAssetUrls(html
    .replace("<title>", `${PRETENDARD_LINK_TAGS}${ROOMLOG_FURNITURE_ASSET_BASE_SCRIPT()}<title>`)
    // 뷰어는 ./demos/…를 쓰지만 이 페이지는 /floor-plan-3d/mitunet(디렉토리 아님)에서
    // 서빙되므로 상대경로가 /floor-plan-3d/demos/…로 풀려 404가 난다.
    .replaceAll('"./demos/', '"/viewer-assets/demos/')
    .replaceAll("`./demos/", "`/viewer-assets/demos/")
    .replaceAll('fetch("/extract-image"', 'fetch("/floor-plan-3d/mitunet-api/extract-image"')
    .replaceAll('fetch("/compose-edits"', 'fetch("/floor-plan-3d/mitunet-api/compose-edits"')
    .replaceAll('fetch("/room-materials"', 'fetch("/floor-plan-3d/room-materials"')
    .replaceAll('fetch("/integration-config"', 'fetch("/floor-plan-3d/mitunet-api/integration-config"')
    .replaceAll('fetch("/healthz"', 'fetch("/floor-plan-3d/mitunet-api/healthz"')
    .replaceAll(
      'title="Connect this 3D plan to RoomLog"',
      'title="3D 도면을 저장하고 매물 등록으로 돌아가기"',
    )
    .replaceAll('>RoomLog에 연결</span>', '>3D 도면 저장하기</span>')
    .replaceAll(
      'setStatus("RoomLog에 3D 도면을 연결했습니다. RoomLog 탭으로 돌아가세요.");',
      'setStatus("3D 도면을 저장했습니다. 매물 등록 화면으로 돌아갑니다.");',
    ));
}

export function transformRoomLogReviewEditorModule(source: string) {
  return versionMitunetViewerAssetUrls(source.replace(
    "this.calibration = estimateCalibrationFromDoors(this.document.openings);",
    "this.calibration = null;",
  ));
}

export function transformMitunetViewerModule(source: string) {
  return versionMitunetViewerAssetUrls(source);
}
