import { readFile } from "node:fs/promises";

import {
  contentTypeFor,
  resolveMitunetViewerFile,
  transformRoomLogIntegrationModule,
} from "../../mitunet-proxy";

export const dynamic = "force-dynamic";

const ROOMLOG_LISTING_STORAGE_KEY = "roomlogListingFloorPlan3D";
const ROOMLOG_LISTING_RETURN_PATH = "/?flow=listing#my-page";

type RouteContext = {
  params: Promise<{ asset: string[] }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { asset } = await context.params;
  const filePath = resolveMitunetViewerFile(...asset);
  const body = asset.join("/") === "roomlog-integration.mjs"
    ? transformRoomLogIntegrationModule(
        await readFile(filePath, "utf8"),
        ROOMLOG_LISTING_STORAGE_KEY,
        ROOMLOG_LISTING_RETURN_PATH,
      )
    : await readFile(filePath);

  return new Response(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": contentTypeFor(filePath),
    },
  });
}
