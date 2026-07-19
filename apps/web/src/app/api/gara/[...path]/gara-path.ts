const GARA_PATH_ORIGIN = "https://roomlog.invalid";

function decodedSegment(segment: string): string | null {
  let decoded = segment;
  for (let depth = 0; depth < 4; depth += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return decoded;
      decoded = next;
    } catch {
      return null;
    }
  }
  return decoded;
}

function isSafeSegment(segment: string): boolean {
  return Boolean(segment)
    && segment !== "."
    && segment !== ".."
    && !segment.includes("/")
    && !segment.includes("\\")
    && !segment.includes("\0");
}

/** Builds a percent-encoded API path only when every decoded segment stays beneath /gara/. */
export function garaUpstreamPath(path: readonly string[]): string | null {
  if (path.length === 0) return null;

  const encodedSegments: string[] = [];
  for (const segment of path) {
    const decoded = decodedSegment(segment);
    if (decoded === null || !isSafeSegment(decoded)) return null;
    encodedSegments.push(encodeURIComponent(decoded));
  }

  const upstream = new URL(`/gara/${encodedSegments.join("/")}`, GARA_PATH_ORIGIN);
  if (!upstream.pathname.startsWith("/gara/")) return null;
  return upstream.pathname;
}
