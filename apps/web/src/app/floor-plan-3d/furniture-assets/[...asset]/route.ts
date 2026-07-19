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

  // 프로드에는 로컬 GLB 데이터셋(runtime-assets)이 없다. 서버 런타임 env로 S3 프리픽스가
  // 주어지면 그쪽으로 넘긴다 — MitUNet 뷰어의 하드코딩 상대경로와 에디터의 로컬 폴백이
  // 코드 수정 없이 같이 살아난다. (NEXT_PUBLIC_*는 빌드타임 인라인이라 여기선 서버 env를 쓴다.)
  const configuredBaseUrl = process.env.FURNITURE_ASSET_BASE_URL?.trim();
  if (configuredBaseUrl) {
    const target = `${configuredBaseUrl.replace(/\/+$/, "")}/${asset
      .map((segment) => encodeURIComponent(segment))
      .join("/")}`;
    return Response.redirect(target, 302);
  }

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
