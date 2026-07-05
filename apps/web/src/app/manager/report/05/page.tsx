import { getReportChat, getReportFaq } from "@/lib/report-api";
import { DEMO_REPORT_ID } from "@/lib/demo-report";
import { MANAGER_REPORT_ROUTES, reportHref } from "@/lib/report-nav";
import { Card } from "@roomlog/ui";
import { AnswerCard, FaqButtons, LinkButton, PageStack, ScreenHeader, Section } from "../_components";

type SearchParams = Promise<{ question?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { question } = await searchParams;
  const faq = await getReportFaq();
  const selectedQuestion = question?.trim() || faq[0]?.query || "이번 달 미납 세대 알려줘";
  const { messages } = await getReportChat(DEMO_REPORT_ID, selectedQuestion);
  const answer = messages.find((message) => message.answer)?.answer;

  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-RPT-05"
        title="빠른 조회"
        subtitle="모바일 짝 화면의 FAQ 우선 흐름을 데스크탑 셸 안에서 확인합니다."
        actions={<LinkButton href={MANAGER_REPORT_ROUTES["M-RPT-04"]}>정밀 질의로</LinkButton>}
      />

      <Section title="자주 묻는 질문">
        <FaqButtons faq={faq} targetReportId={DEMO_REPORT_ID} screenId="M-RPT-05" />
      </Section>

      <Section
        title="빠른 조회 결과"
        action={<LinkButton href={reportHref("M-RPT-04", DEMO_REPORT_ID, selectedQuestion)} variant="secondary">정밀 질의로</LinkButton>}
      >
        {answer ? (
          <AnswerCard answer={answer} />
        ) : (
          <Card style={{ lineHeight: "var(--lh-body)", maxWidth: 560 }}>
            선택한 질의 답변을 불러오지 못했습니다. 정밀 질의 화면에서 다시 확인하세요.
          </Card>
        )}
      </Section>
    </PageStack>
  );
}
