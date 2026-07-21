export const MITUNET_HTML_CACHE_CONTROL = "no-cache";

const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const REVALIDATED_CACHE_CONTROL = "public, max-age=300, must-revalidate";

export function mitunetAssetCacheControl(assetPath: string, versioned: boolean) {
  if (!versioned || assetPath === "review-editor.mjs") {
    return REVALIDATED_CACHE_CONTROL;
  }
  return IMMUTABLE_CACHE_CONTROL;
}
