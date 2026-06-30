const absoluteUrlPattern = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;

export function resolveAttachmentUrl(
  url: string,
  apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
) {
  if (
    !url.startsWith("/") ||
    absoluteUrlPattern.test(url) ||
    url.startsWith("data:") ||
    url.startsWith("blob:")
  ) {
    return url;
  }

  if (!/^https?:\/\//i.test(apiBase)) {
    return url;
  }

  return new URL(url, apiBase).toString();
}
