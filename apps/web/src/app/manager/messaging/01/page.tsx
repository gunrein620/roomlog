import { Input } from "@roomlog/ui";
import { DEMO_MANAGER_DRAFT_ID, getAnnouncementDraft } from "@/lib/messaging-manager-api";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";
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

type SearchParams = Promise<{ id?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  const draft = await getAnnouncementDraft(id ?? DEMO_MANAGER_DRAFT_ID);
  const reviewHref = `${MANAGER_MESSAGING_ROUTES["M-MSG-02"]}?id=${draft.id}`;

  return (
    <>
      <ScreenHeader
        eyebrow="M-MSG-01"
        title="공지 작성"
        actions={<LinkButton href={MANAGER_MESSAGING_ROUTES["M-MSG-00"]} variant="secondary">허브</LinkButton>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: "var(--space-lg)", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
          <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            <div style={sectionTitleStyle}>카테고리</div>
            <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
              {(["urgent", "life", "event"] as const).map((category) => (
                <Badge key={category} emphasis={draft.category === category}>
                  {CATEGORY_LABEL[category]}
                </Badge>
              ))}
            </div>
            <MetaRow label="확인 정책" value={draft.confirmRequired ? "확인 게이트 필요" : "읽음 처리"} />
          </Card>

          <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            <div style={sectionTitleStyle}>타깃</div>
            <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
              {(["all", "building", "unit"] as const).map((scope) => (
                <Badge key={scope} emphasis={draft.scope === scope}>
                  {SCOPE_LABEL[scope]}
                </Badge>
              ))}
            </div>
            <NoticeCard title="D20 타깃 가드">
              미납 세대 옵션은 없습니다. 연체·독촉은 M-BILL-05 단일 채널에서만 처리합니다.
            </NoticeCard>
          </Card>

          <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            <div style={sectionTitleStyle}>주제 → AI 초안</div>
            <Input aria-label="공지 주제" value={draft.title} readOnly />
            <div
              style={{
                minHeight: 190,
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-lg)",
                whiteSpace: "pre-wrap",
                lineHeight: 1.6,
                background: "var(--surface-container-lowest)",
              }}
            >
              {draft.body}
            </div>
            <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
              <StaticButton>초안 재생성</StaticButton>
              <StaticButton>임시 저장</StaticButton>
            </div>
          </Card>
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          <NoticeCard title="발송은 다음 화면에서만" emphasis>
            이 화면은 작성과 저장까지만 담당합니다. 자동 발송 없이 검토 게이트를 거칩니다.
          </NoticeCard>
          {draft.category === "urgent" ? (
            <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
              <div style={sectionTitleStyle}>긴급 다국어 검수 템플릿</div>
              <div style={gridStyle}>
                {(draft.translations ?? []).map((translation) => (
                  <Card key={translation.lang} style={{ background: "var(--surface-container)" }}>
                    <Badge emphasis={translation.reviewed}>{translation.langLabel} 검수</Badge>
                    <div style={{ marginTop: "var(--space-sm)", fontWeight: 800 }}>{translation.title}</div>
                    <div style={{ marginTop: "var(--space-sm)", fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
                      {translation.body}
                    </div>
                  </Card>
                ))}
              </div>
            </Card>
          ) : (
            <NoticeCard title="번역 안내">
              일반 공지는 선택 언어와 원문 토글을 제공합니다. 긴급만 주요 언어 검수 템플릿이 강제됩니다.
            </NoticeCard>
          )}
          <LinkButton href={reviewHref}>검토하고 발송으로</LinkButton>
        </aside>
      </div>
    </>
  );
}
