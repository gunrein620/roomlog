import { redirect } from "next/navigation";
import { getReportChat } from "@/lib/report-api";
import { MANAGER_REPORT_ROUTES, reportHref } from "@/lib/report-nav";
import { Button, Card, Input } from "@roomlog/ui";
import { ChatTranscript, FaqButtons, LinkButton, PageStack, ScreenHeader, Section } from "../_components";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ id?: string; question?: string }>;

async function askReportQuestion(formData: FormData) {
  "use server";

  const reportId = String(formData.get("reportId") ?? "").trim() || undefined;
  const question = String(formData.get("question") ?? "").trim();

  redirect(reportHref("M-RPT-04", reportId, question));
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id, question } = await searchParams;
  const { scopeLabel, messages, faq } = await getReportChat(id, question);

  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-RPT-04"
        title="질의 챗봇"
        subtitle={`${scopeLabel} · 답변은 조회와 초안 제안까지만 제공합니다.`}
        actions={<LinkButton href={MANAGER_REPORT_ROUTES["M-RPT-00"]} variant="secondary">허브로</LinkButton>}
      />

      <Section title="추천 질의">
        <FaqButtons faq={faq} targetReportId={id} />
      </Section>

      <Section title="대화">
        <ChatTranscript messages={messages} />
      </Section>

      <form action={askReportQuestion}>
        <Card style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--space-sm)", alignItems: "center" }}>
          <input type="hidden" name="reportId" value={id ?? ""} />
          <Input
            aria-label="질의 입력"
            name="question"
            placeholder="예: 연남 스테이 6월 미납 세대 알려줘"
            defaultValue={question ?? ""}
          />
          <Button type="submit">질의 전송</Button>
        </Card>
      </form>
    </PageStack>
  );
}
