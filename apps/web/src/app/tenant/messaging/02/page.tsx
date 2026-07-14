import { listAnnouncements } from "@/lib/messaging-api";
import { AnnouncementListPage } from "./AnnouncementListPage";
import { normalizeAnnouncementFilter } from "./announcement-list-model";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ filter?: string; q?: string; id?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [{ filter, q }, announcements] = await Promise.all([searchParams, listAnnouncements()]);

  return (
    <AnnouncementListPage
      announcements={announcements}
      filter={normalizeAnnouncementFilter(filter)}
      query={q ?? ""}
    />
  );
}
