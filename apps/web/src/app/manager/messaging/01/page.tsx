import type { AnnouncementDraft } from "@roomlog/types";
import {
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

// 새 공지는 항상 빈 폼에서 시작한다 — 샘플(긴급 단수 안내) 초안이 미리 채워져 있으면
// 대상만 고르고 오래된 내용을 실수로 발송할 위험이 있다. 저장된 초안은 ?id=로만 불러온다.
const EMPTY_COMPOSE_DRAFT: AnnouncementDraft = {
  id: "",
  category: "life",
  scope: "all",
  targetLabel: "",
  targetRoomIds: [],
  title: "",
  body: "",
  translations: [],
  confirmRequired: false,
  status: "draft",
  updatedAt: "",
};

type SearchParams = Promise<{ id?: string; drafts?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const [{ id, drafts: draftsState }, user, drafts] = await Promise.all([
    searchParams,
    requireUser("LANDLORD"),
    listAnnouncementDrafts(),
  ]);
  const draft = id ? await getAnnouncementDraft(id) : EMPTY_COMPOSE_DRAFT;
  const initialDraft = prepareAnnouncementDraftForCompose(draft, Boolean(id));
  const closeHref = id
    ? `${MANAGER_MESSAGING_ROUTES["M-MSG-01"]}?id=${encodeURIComponent(id)}`
    : MANAGER_MESSAGING_ROUTES["M-MSG-01"];

  return (
    <>
      <ScreenHeader eyebrow="M-MSG-01" title="공지 작성" />
      {id ? (
        <p
          role="status"
          style={{
            margin: 0,
            padding: "var(--space-sm) var(--space-md)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            background: "var(--surface-container-low)",
            color: "var(--on-surface-variant)",
            fontSize: "var(--fs-caption)",
            fontWeight: 800,
          }}
        >
          저장된 초안을 불러왔습니다 — 내용과 대상을 확인한 뒤 발송하세요.
        </p>
      ) : null}
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
