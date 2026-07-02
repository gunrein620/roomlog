import { getReportChat } from "@/lib/report-api";
import { MANAGER_REPORT_ROUTES } from "@/lib/report-nav";
import { Card, Input } from "@roomlog/ui";
import { ChatTranscript, FaqButtons, LinkButton, PageStack, ScreenHeader, Section } from "../_components";

export default async function Page() {
  const { scopeLabel, messages, faq } = await getReportChat();

  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-RPT-04"
        title="질의 챗봇"
        subtitle={`${scopeLabel} · 답변은 조회와 초안 제안까지만 제공합니다.`}
        actions={<LinkButton href={MANAGER_REPORT_ROUTES["M-RPT-00"]} variant="secondary">허브로</LinkButton>}
      />

      <Section title="추천 질의">
        <FaqButtons faq={faq} />
      </Section>

      <Section title="대화">
        <ChatTranscript messages={messages} />
      </Section>

      <Card style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--space-sm)", alignItems: "center" }}>
        <Input aria-label="질의 입력" placeholder="예: 연남 스테이 6월 미납 세대 알려줘" />
        <LinkButton href={MANAGER_REPORT_ROUTES["M-RPT-04"]}>질의 전송</LinkButton>
      </Card>
    </PageStack>
  );
}

