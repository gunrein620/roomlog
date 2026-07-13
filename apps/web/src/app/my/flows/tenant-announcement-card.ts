import type { Announcement } from "@roomlog/types";

export function latestTenantAnnouncement(
  announcements: readonly Announcement[],
): Announcement | null {
  return announcements.reduce<Announcement | null>((latest, current) => {
    if (!latest || current.sentAt.localeCompare(latest.sentAt) > 0) {
      return current;
    }

    return latest;
  }, null);
}
