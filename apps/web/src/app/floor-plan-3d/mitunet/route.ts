import { readMitunetViewerFile, transformMitunetViewerHtml } from "../mitunet-proxy";

export const dynamic = "force-dynamic";

export async function GET() {
  const html = await readMitunetViewerFile("index.html");
  return new Response(transformMitunetViewerHtml(html), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
