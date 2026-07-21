import { readMitunetViewerFile, transformMitunetViewerHtml } from "../mitunet-proxy";
import { MITUNET_HTML_CACHE_CONTROL } from "../mitunet-cache";

export const dynamic = "force-dynamic";

export async function GET() {
  const html = await readMitunetViewerFile("index.html");
  return new Response(transformMitunetViewerHtml(html), {
    headers: {
      "Cache-Control": MITUNET_HTML_CACHE_CONTROL,
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
