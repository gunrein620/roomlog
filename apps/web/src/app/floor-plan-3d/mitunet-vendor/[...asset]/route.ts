import { readFile } from "node:fs/promises";
import path from "node:path";

import { mitunetAssetCacheControl } from "../../mitunet-cache";

export const dynamic = "force-dynamic";

const runtimeRoot = process.cwd();
const webRoot = runtimeRoot.endsWith(path.join("apps", "web"))
  ? runtimeRoot
  : path.join(/* turbopackIgnore: true */ runtimeRoot, "apps", "web");
const VENDOR_ROOTS = {
  "lucide-0.468.0": path.join(webRoot, "node_modules", "lucide"),
  "three-0.185.0": path.join(webRoot, "node_modules", "three"),
} as const;
const ALLOWED_VENDOR_EXTENSIONS = new Set([".js", ".mjs", ".wasm"]);

const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
};

type VendorName = keyof typeof VENDOR_ROOTS;
type RouteContext = { params: Promise<{ asset: string[] }> };

function resolveVendorFile(segments: string[]) {
  const [vendor, ...asset] = segments;
  if (!(vendor in VENDOR_ROOTS) || asset.length === 0) return null;
  if (asset.some(segment => !segment || segment === "." || segment === ".." || /[\\/]/.test(segment))) {
    return null;
  }
  const vendorRoot = VENDOR_ROOTS[vendor as VendorName];
  const filePath = path.resolve(vendorRoot, ...asset);
  if (!filePath.startsWith(`${vendorRoot}${path.sep}`)) return null;
  if (!ALLOWED_VENDOR_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return null;
  return filePath;
}

export async function GET(_request: Request, context: RouteContext) {
  const { asset } = await context.params;
  const filePath = resolveVendorFile(asset);
  if (!filePath) return new Response("Not found", { status: 404 });
  try {
    return new Response(await readFile(filePath), {
      headers: {
        "Cache-Control": mitunetAssetCacheControl(asset.join("/"), true),
        "Content-Type": CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
