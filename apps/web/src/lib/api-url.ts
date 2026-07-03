const DEFAULT_INTERNAL_API_BASE = "http://localhost:4000";

export type ApiUrlOptions = {
  requestUrl?: string;
};

function cleanBase(value: string | undefined) {
  return value?.trim().replace(/\/+$/, "") ?? "";
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function resolveApiBase(options: ApiUrlOptions = {}) {
  const internalBase = cleanBase(process.env.API_INTERNAL_URL);
  if (internalBase) return internalBase;

  const publicBase = cleanBase(process.env.NEXT_PUBLIC_API_URL);
  if (!publicBase) return DEFAULT_INTERNAL_API_BASE;
  if (isHttpUrl(publicBase)) return publicBase;

  if (publicBase.startsWith("/")) {
    if (process.env.NODE_ENV !== "production") return DEFAULT_INTERNAL_API_BASE;
    if (options.requestUrl) return cleanBase(new URL(publicBase, options.requestUrl).toString());
  }

  return publicBase;
}

export function apiUrl(path: string, options: ApiUrlOptions = {}): string {
  const base = resolveApiBase(options);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return base.endsWith("/api") ? `${base}${normalizedPath}` : `${base}/api${normalizedPath}`;
}
