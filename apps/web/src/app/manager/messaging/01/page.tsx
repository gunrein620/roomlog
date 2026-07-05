import { redirect } from "next/navigation";
import { Button, Input } from "@roomlog/ui";
import type { AnnouncementDraft } from "@roomlog/types";
import { createAnnouncementDraft, DEMO_MANAGER_DRAFT_ID, getAnnouncementDraft } from "@/lib/messaging-manager-api";
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
  gridStyle,
  sectionTitleStyle,
} from "../_components";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ id?: string; source?: string; actionType?: string; title?: string; unitIds?: string; billIds?: string; periodLabel?: string; note?: string }>;

type ReportFollowUpPrefill = Awaited<SearchParams>;

async function createDraftAction(formData: FormData) {
  "use server";

  const category = String(formData.get("category") ?? "life") as "urgent" | "life" | "event";
  const scope = String(formData.get("scope") ?? "all") as "all" | "building" | "unit";
  const targetLabel = String(formData.get("targetLabel") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const confirmRequired = formData.get("confirmRequired") === "on";

  try {
    const draft = await createAnnouncementDraft({
      category,
      scope,
      targetLabel: targetLabel || SCOPE_LABEL[scope],
      title,
      body,
      confirmRequired,
    });

    redirect(`${MANAGER_MESSAGING_ROUTES["M-MSG-02"]}?id=${encodeURIComponent(draft.id)}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect("/manager/login");
    }
    throw error;
  }
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { id } = params;
  let draft = await getAnnouncementDraft(id ?? DEMO_MANAGER_DRAFT_ID);
  draft = applyReportFollowUpPrefill(draft, params);

  return (
    <>
      <ScreenHeader
        eyebrow="M-MSG-01"
        title="공지 작성"
        actions={<LinkButton href={MANAGER_MESSAGING_ROUTES["M-MSG-00"]} variant="secondary">허브</LinkButton>}
      />

      <form
        action={createDraftAction}
        style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: "var(--space-lg)", alignItems: "start" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
          <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            <div style={sectionTitleStyle}>카테고리</div>
            <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", alignItems: "center" }}>
              {(["urgent", "life", "event"] as const).map((category) => (
                <label key={category} style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-xs)", cursor: "pointer" }}>
                  <input type="radio" name="category" value={category} defaultChecked={draft.category === category} />
                  <Badge emphasis={draft.category === category}>{CATEGORY_LABEL[category]}</Badge>
                </label>
              ))}
            </div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-sm)", fontSize: "var(--fs-caption)" }}>
              <input type="checkbox" name="confirmRequired" defaultChecked={draft.confirmRequired} />
              확인 게이트 필요
            </label>
          </Card>

          <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            <div style={sectionTitleStyle}>타깃</div>
            <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", alignItems: "center" }}>
              {(["all", "building", "unit"] as const).map((scope) => (
                <label key={scope} style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-xs)", cursor: "pointer" }}>
                  <input type="radio" name="scope" value={scope} defaultChecked={draft.scope === scope} />
                  <Badge emphasis={draft.scope === scope}>{SCOPE_LABEL[scope]}</Badge>
                </label>
              ))}
            </div>
            <Input name="targetLabel" aria-label="공지 타깃" defaultValue={draft.targetLabel} />
            <NoticeCard title="D20 타깃 가드">
              미납 세대 옵션은 없습니다. 연체·독촉은 M-BILL-05 단일 채널에서만 처리합니다.
            </NoticeCard>
          </Card>

          <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            <div style={sectionTitleStyle}>주제 → AI 초안</div>
            <Input name="title" aria-label="공지 주제" defaultValue={draft.title} required />
            <textarea
              name="body"
              aria-label="공지 본문"
              defaultValue={draft.body}
              required
              style={{
                minHeight: 190,
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-lg)",
                lineHeight: 1.6,
                background: "var(--surface-container-lowest)",
                color: "var(--on-surface)",
                resize: "vertical",
              }}
            />
            <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
              <Button type="submit">임시 저장</Button>
              <Button type="submit" variant="secondary">검토하고 발송으로</Button>
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
          <MetaRow label="저장 후 이동" value="발송 전 검토" />
          <Button type="submit" fullWidth>
            검토하고 발송으로
          </Button>
        </aside>
      </form>
    </>
  );
}

function applyReportFollowUpPrefill(draft: AnnouncementDraft, params: ReportFollowUpPrefill): AnnouncementDraft {
  const { source, actionType, title, unitIds, billIds, periodLabel, note } = params;

  if (source !== "report") {
    return draft;
  }

  const targetUnitIds = parseQueryList(unitIds);
  const targetBillIds = parseQueryList(billIds);
  const targetLabel = targetUnitIds.length ? `${targetUnitIds.join(", ")}호` : draft.targetLabel;
  const actionLabel = actionType === "dunning" ? "납부 독촉 초안 검토" : "생활 공지 초안 만들기";
  const bodyLines = [
    note?.trim(),
    periodLabel ? `기간: ${periodLabel}` : "",
    targetBillIds.length ? `청구서: ${targetBillIds.join(", ")}` : "",
    "발송 전 원본 행을 다시 대조하세요.",
    "연체·독촉은 M-BILL-05 단일 채널에서만 확정합니다.",
  ].filter(Boolean);

  return {
    ...draft,
    category: "life",
    scope: targetUnitIds.length ? "unit" : draft.scope,
    targetLabel,
    title: title?.trim() || actionLabel,
    body: bodyLines.join("\n"),
    confirmRequired: true,
  };
}

function parseQueryList(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
