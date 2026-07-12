import { DEMO_MANAGER_DRAFTS, getAnnouncementDraft } from "@/lib/messaging-manager-api";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";
import { prepareAnnouncementDraftForCompose } from "@/lib/announcement-compose-state";
import { requireUser } from "@/lib/session";
import { LinkButton, ScreenHeader } from "../_components";
import { AnnouncementComposer } from "./AnnouncementComposer";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ id?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [{ id }, user] = await Promise.all([searchParams, requireUser("LANDLORD")]);
  const draft = id ? await getAnnouncementDraft(id) : DEMO_MANAGER_DRAFTS[0];
  const initialDraft = prepareAnnouncementDraftForCompose(draft, Boolean(id));

  return (
    <>
      <ScreenHeader
        eyebrow="M-MSG-01"
        title="공지 작성"
        actions={(
          <LinkButton href={MANAGER_MESSAGING_ROUTES["M-MSG-00"]} variant="secondary">
            허브
          </LinkButton>
        )}
      />
      <AnnouncementComposer
        initialDraft={initialDraft}
        draftId={id}
        managedRooms={user.managedRooms ?? []}
      />
    </>
  );
}
