import { readFile } from "node:fs/promises";

import {
  furnitureContentTypeFor,
  resolveFurnitureAssetFile,
} from "@/lib/furniture-dataset";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ asset: string[] }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { asset } = await context.params;
  let filePath: string;
  try {
    filePath = resolveFurnitureAssetFile(...asset);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  let body: Buffer;
  try {
    body = await readFile(filePath);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(body), {
    headers: {
      // GLB files carry a content hash in their name, so they never change.
      "Cache-Control": filePath.endsWith(".glb")
        ? "public, max-age=86400, immutable"
        : "no-store",
      "Content-Type": furnitureContentTypeFor(filePath),
    },
  });
}
