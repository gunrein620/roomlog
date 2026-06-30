export function buildInviteHref(signupUrl: string, roleOrigin: string) {
  const rawUrl = signupUrl.trim();

  if (!rawUrl) {
    return roleOrigin;
  }

  if (/^https?:\/\//i.test(rawUrl)) {
    return rawUrl;
  }

  const pathWithSlash = rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`;
  const appRootPath = pathWithSlash.replace(/^\/(?:tenant|vendor)(?=\/|\?|#|$)/, "") || "/";
  const normalizedPath =
    appRootPath.startsWith("?") || appRootPath.startsWith("#") ? `/${appRootPath}` : appRootPath;

  if (!roleOrigin) {
    return normalizedPath;
  }

  return `${roleOrigin.replace(/\/+$/, "")}${normalizedPath}`;
}
