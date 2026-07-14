import type { Announcement } from "@roomlog/types";

export const ANNOUNCEMENT_FILTERS = ["all", "urgent", "building", "life", "event"] as const;
export type AnnouncementFilter = (typeof ANNOUNCEMENT_FILTERS)[number];

export function normalizeAnnouncementFilter(value: string | undefined): AnnouncementFilter {
  return ANNOUNCEMENT_FILTERS.includes(value as AnnouncementFilter)
    ? (value as AnnouncementFilter)
    : "all";
}

function matchesFilter(item: Announcement, filter: AnnouncementFilter): boolean {
  if (filter === "all") return true;
  if (filter === "building") return item.scope === "building";
  return item.category === filter;
}

export function selectAnnouncements(
  items: readonly Announcement[],
  options: { filter: AnnouncementFilter; query: string },
): Announcement[] {
  const query = options.query.trim().toLocaleLowerCase("ko-KR");
  return items
    .filter((item) => matchesFilter(item, options.filter))
    .filter((item) => !query || [item.title, item.body, item.sender].some((value) => value.toLocaleLowerCase("ko-KR").includes(query)))
    .sort((a, b) => {
      const urgentOrder = Number(b.category === "urgent") - Number(a.category === "urgent");
      return urgentOrder || b.sentAt.localeCompare(a.sentAt);
    });
}

export function tenantAnnouncementDetailHref(id: string): string {
  return `/tenant/messaging/02/${encodeURIComponent(id)}`;
}

export function tenantAnnouncementListHref(filter: AnnouncementFilter, query: string): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (query.trim()) params.set("q", query.trim());
  const suffix = params.toString();
  return `/tenant/messaging/02${suffix ? `?${suffix}` : ""}`;
}
