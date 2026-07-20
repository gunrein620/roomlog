import { readFile } from "node:fs/promises";

import {
  contentTypeFor,
  resolveMitunetViewerFile,
  transformRoomLogReviewEditorModule,
} from "../../mitunet-proxy";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ asset: string[] }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { asset } = await context.params;
  const filePath = resolveMitunetViewerFile(...asset);
  const assetPath = asset.join("/");
  const body = assetPath === "review-editor.mjs"
      ? transformRoomLogReviewEditorModule(await readFile(filePath, "utf8"))
    : await readFile(filePath);

  return new Response(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": contentTypeFor(filePath),
    },
  });
}
