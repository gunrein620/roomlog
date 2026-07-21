import { readFile } from "node:fs/promises";

import {
  contentTypeFor,
  MITUNET_ASSET_VERSION,
  resolveMitunetViewerFile,
  transformRoomLogReviewEditorModule,
  transformMitunetViewerModule,
} from "../../mitunet-proxy";
import { mitunetAssetCacheControl } from "../../mitunet-cache";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ asset: string[] }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { asset } = await context.params;
  const [version, ...assetSegments] = asset;
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(version ?? "") || assetSegments.length === 0) {
    return new Response("Not found", { status: 404 });
  }
  if (assetSegments.some(segment => !segment || segment === "." || segment === ".." || /[\\/]/.test(segment))) {
    return new Response("Not found", { status: 404 });
  }
  const filePath = resolveMitunetViewerFile(...assetSegments);
  const assetPath = assetSegments.join("/");
  const extension = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  const isModule = extension === ".js" || extension === ".mjs";
  const source = isModule ? await readFile(filePath, "utf8") : null;
  const body = assetPath === "review-editor.mjs"
    ? transformRoomLogReviewEditorModule(source ?? "")
    : source === null ? await readFile(filePath) : transformMitunetViewerModule(source);

  return new Response(body, {
    headers: {
      "Cache-Control": version === MITUNET_ASSET_VERSION
        ? mitunetAssetCacheControl(assetPath, version !== "dev")
        : "no-store",
      "Content-Type": contentTypeFor(filePath),
    },
  });
}
