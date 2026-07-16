import {
  DEMO_MANAGER_DRAFTS,
  getAnnouncementDraft,
  listAnnouncementDrafts,
} from "@/lib/messaging-manager-api";
import { prepareAnnouncementDraftForCompose } from "@/lib/announcement-compose-state";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";
import { requireUser } from "@/lib/session";
import { ScreenHeader } from "../_components";
import { AnnouncementComposer } from "./AnnouncementComposer";
import { SavedAnnouncementDraftModal } from "./SavedAnnouncementDraftModal";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ id?: string; drafts?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [{ id, drafts: draftsState }, user, drafts] = await Promise.all([
    searchParams,
    requireUser("LANDLORD"),
    listAnnouncementDrafts(),
  ]);
  const draft = id ? await getAnnouncementDraft(id) : DEMO_MANAGER_DRAFTS[0];
  const initialDraft = prepareAnnouncementDraftForCompose(draft, Boolean(id));
  const closeHref = id
    ? `${MANAGER_MESSAGING_ROUTES["M-MSG-01"]}?id=${encodeURIComponent(id)}`
    : MANAGER_MESSAGING_ROUTES["M-MSG-01"];

  return (
    <>
      <ScreenHeader eyebrow="M-MSG-01" title="공지 작성" />
      <SavedAnnouncementDraftModal
        drafts={drafts}
        open={draftsState === "open"}
        closeHref={closeHref}
      />
      <AnnouncementComposer
        key={id ?? "new"}
        initialDraft={initialDraft}
        draftId={id}
        managedRooms={user.managedRooms ?? []}
      />
    </>
  );
}
