import { redirect } from "next/navigation";
import {
  DEMO_MANAGER_DRAFT_ID,
  getAnnouncementDraft,
  listAnnouncementRecipients,
} from "@/lib/messaging-manager-api";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";
import { ApiError } from "@/lib/server-api";
import { findAttachedTranslation } from "../01/attachment-state";
import { AnnouncementSendForm } from "./AnnouncementSendForm";
import { announcementRecipientState } from "./review-state";
import {
  Badge,
  Card,
  CATEGORY_LABEL,
  LinkButton,
  NoticeCard,
  SCOPE_LABEL,
  ScreenHeader,
  sectionTitleStyle,
} from "../_components";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ id?: string; resend?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id, resend } = await searchParams;
  let draft;
  let recipients;
  try {
    draft = await getAnnouncementDraft(id ?? DEMO_MANAGER_DRAFT_ID);
    recipients = await listAnnouncementRecipients(draft.id);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect("/manager/login");
    }
    throw error;
  }
  const isUrgent = draft.category === "urgent";
  const attachedTranslation = findAttachedTranslation(draft);
  const finalLanguage = attachedTranslation?.langLabel ?? "한국어";
  const recipientState = announcementRecipientState(recipients.length);
  const reviewActions = (
    <div
      data-testid="announcement-review-actions"
      style={{
        display: "flex",
        justifyContent: "flex-end",
        gap: "var(--space-sm)",
        flexWrap: "wrap",
        marginTop: "var(--space-md)",
      }}
    >
      <div style={{ width: "min(280px, 100%)" }}>
        <AnnouncementSendForm
          draftId={draft.id}
          canSend={recipientState.canSend}
        />
      </div>
    </div>
  );

  return (
    <>
      <ScreenHeader
        eyebrow="M-MSG-02"
        title="발송 전 검토"
        actions={<LinkButton href={`${MANAGER_MESSAGING_ROUTES["M-MSG-01"]}?id=${draft.id}`} variant="secondary">수정</LinkButton>}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
        <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
            <Badge emphasis={isUrgent}>{CATEGORY_LABEL[draft.category]}</Badge>
            <Badge>{SCOPE_LABEL[draft.scope]}</Badge>
            <Badge>{draft.targetLabel}</Badge>
            {resend ? <Badge emphasis>재발송 수신자 재산정</Badge> : null}
          </div>
          <div style={{ fontSize: "var(--fs-title)", fontWeight: 800, lineHeight: "var(--lh-title)" }}>
            {draft.title}
          </div>
          <p style={{ margin: 0, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{draft.body}</p>
        </Card>

        <Card>
          <div style={sectionTitleStyle}>수신자 명단 · 데스크탑 본체</div>
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            {recipientState.canSend ? (
              recipients.map((recipient) => (
                <div
                  key={`${recipient.unitId}-${recipient.tenantName}`}
                  style={{
                    minHeight: 48,
                    display: "grid",
                    gridTemplateColumns: "96px 1fr 120px",
                    alignItems: "center",
                    gap: "var(--space-sm)",
                    borderBottom: "1px solid var(--border)",
                    fontSize: "var(--fs-caption)",
                  }}
                >
                  <strong>{recipient.unitId}호</strong>
                  <span>{recipient.tenantName}</span>
                  <Badge>{recipient.preferredLang}</Badge>
                </div>
              ))
            ) : (
              <NoticeCard title="발송 가능한 수신자 없음">
                {recipientState.emptyMessage}
              </NoticeCard>
            )}
          </div>
        </Card>

        {!isUrgent ? reviewActions : null}

        {isUrgent ? (
          <Card>
            <div style={sectionTitleStyle}>최종 발송 언어</div>
            <Card style={{ background: "var(--surface-container)" }}>
              <Badge emphasis>{finalLanguage}</Badge>
              <div style={{ marginTop: "var(--space-sm)", fontWeight: 800 }}>
                {draft.title}
              </div>
              <div style={{ marginTop: "var(--space-sm)", fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
                {draft.body}
              </div>
            </Card>
            {reviewActions}
          </Card>
        ) : null}
      </div>
    </>
  );
}
