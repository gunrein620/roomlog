export function savedDraftsModalHref(
  pathname: string,
  searchParams: Pick<URLSearchParams, "get">,
): string | null {
  if (pathname !== "/manager/messaging/01") return null;

  const params = new URLSearchParams();
  const id = searchParams.get("id");
  if (id) params.set("id", id);
  params.set("drafts", "open");

  return `${pathname}?${params.toString()}`;
}
