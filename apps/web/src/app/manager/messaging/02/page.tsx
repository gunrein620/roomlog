import { redirect } from "next/navigation";
import { Button } from "@roomlog/ui";
import {
  DEMO_MANAGER_DRAFT_ID,
  getAnnouncementDraft,
  listAnnouncementRecipients,
  sendAnnouncementDraft,
} from "@/lib/messaging-manager-api";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";
import { ApiError } from "@/lib/server-api";
import {
  Badge,
  Card,
  CATEGORY_LABEL,
  LinkButton,
  MetaRow,
  NoticeCard,
  SCOPE_LABEL,
  ScreenHeader,
  StaticButton,
  gridStyle,
  sectionTitleStyle,
} from "../_components";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ id?: string; resend?: string }>;

async function sendAnnouncement(formData: FormData) {
  "use server";

  const draftId = String(formData.get("draftId") ?? "");

  if (!draftId) {
    redirect(MANAGER_MESSAGING_ROUTES["M-MSG-00"]);
  }

  let result;
  try {
    result = await sendAnnouncementDraft(draftId);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect("/manager/login");
    }
    throw error;
  }
  redirect(
    `${MANAGER_MESSAGING_ROUTES["M-MSG-03"]}?id=${encodeURIComponent(result.announcementId)}`,
  );
}

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

  return (
    <>
      <ScreenHeader
        eyebrow="M-MSG-02"
        title="발송 전 검토"
        actions={<LinkButton href={`${MANAGER_MESSAGING_ROUTES["M-MSG-01"]}?id=${draft.id}`} variant="secondary">수정하러</LinkButton>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: "var(--space-lg)", alignItems: "start" }}>
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
              {recipients.map((recipient) => (
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
              ))}
            </div>
          </Card>

          {isUrgent ? (
            <Card>
              <div style={sectionTitleStyle}>D21 주요 언어 번역 미리보기</div>
              <div style={gridStyle}>
                {(draft.translations ?? []).map((translation) => (
                  <Card key={translation.lang} style={{ background: "var(--surface-container)" }}>
                    <Badge emphasis={translation.reviewed}>{translation.langLabel}</Badge>
                    <div style={{ marginTop: "var(--space-sm)", fontWeight: 800 }}>{translation.title}</div>
                    <div style={{ marginTop: "var(--space-sm)", fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
                      {translation.body}
                    </div>
                  </Card>
                ))}
              </div>
            </Card>
          ) : null}
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          <NoticeCard title="폰 read-only 미리보기">
            대량 명단 검토와 승인 발송은 데스크탑 본체에서만 진행합니다. 폰은 미리보기와 웹 딥링크만 제공합니다.
          </NoticeCard>
          <Card>
            <div style={sectionTitleStyle}>문구 톤 체크</div>
            <MetaRow label="미납 타깃" value="없음" />
            <MetaRow label="독촉 문구" value="없음" />
            <MetaRow label="확인 정책" value={draft.confirmRequired ? "확인 게이트" : "읽음"} />
            <MetaRow label="번역 검수" value={isUrgent ? "주요 언어 검수 완료" : "해당 없음"} />
          </Card>
          <NoticeCard title="확인 게이트" emphasis>
            발송은 이 화면의 승인 이후에만 진행됩니다. 작성 화면에서 자동 발송하지 않습니다.
          </NoticeCard>
          <StaticButton>체크 완료</StaticButton>
          <form action={sendAnnouncement}>
            <input type="hidden" name="draftId" value={draft.id} />
            <Button type="submit" fullWidth>
              승인하고 발송
            </Button>
          </form>
        </aside>
      </div>
    </>
  );
}
