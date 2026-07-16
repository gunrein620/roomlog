import type { AnnouncementDraft } from "@roomlog/types";

export function selectSavedAnnouncementDrafts(
  drafts: AnnouncementDraft[],
): AnnouncementDraft[] {
  return drafts
    .filter((draft) => draft.status === "draft")
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );
}

export function savedAnnouncementDraftTitle(
  draft: Pick<AnnouncementDraft, "title">,
): string {
  return draft.title.trim() || "제목 없는 공지";
}
