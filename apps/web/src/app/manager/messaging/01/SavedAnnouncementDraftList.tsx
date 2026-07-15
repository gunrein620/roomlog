import type { AnnouncementDraft } from "@roomlog/types";
import { Card } from "@roomlog/ui";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";
import { LinkButton, formatDateTime } from "../_components";
import {
  savedAnnouncementDraftTitle,
  selectSavedAnnouncementDrafts,
} from "./saved-drafts-state";

export function SavedAnnouncementDraftList({
  drafts,
}: {
  drafts: AnnouncementDraft[];
}) {
  const savedDrafts = selectSavedAnnouncementDrafts(drafts);

  return (
    <Card
      style={{
        marginBottom: "var(--space-lg)",
        display: "grid",
        gap: "var(--space-md)",
      }}
    >
      <h2 style={{ margin: 0, fontSize: "var(--fs-subtitle)" }}>
        임시 저장된 공지
      </h2>

      {savedDrafts.length > 0 ? (
        <div style={{ display: "grid", gap: "var(--space-sm)" }}>
          {savedDrafts.map((draft) => (
            <div
              key={draft.id}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                alignItems: "center",
                gap: "var(--space-md)",
                padding: "var(--space-sm) 0",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800 }}>
                  {savedAnnouncementDraftTitle(draft)}
                </div>
                <div
                  style={{
                    marginTop: "var(--space-xs)",
                    color: "var(--on-surface-variant)",
                    fontSize: "var(--fs-caption)",
                  }}
                >
                  {draft.targetLabel} · 마지막 저장 {formatDateTime(draft.updatedAt)}
                </div>
              </div>
              <LinkButton
                href={`${MANAGER_MESSAGING_ROUTES["M-MSG-01"]}?id=${encodeURIComponent(draft.id)}`}
                variant="secondary"
              >
                불러오기
              </LinkButton>
            </div>
          ))}
        </div>
      ) : (
        <p
          style={{
            margin: 0,
            color: "var(--on-surface-variant)",
            fontSize: "var(--fs-caption)",
          }}
        >
          임시 저장된 공지가 없습니다.
        </p>
      )}
    </Card>
  );
}
