import { Button, Card } from "@roomlog/ui";
import { redirect } from "next/navigation";
import { withId } from "@/lib/nav";
import { ROUTES } from "@/lib/vendor-nav";
import { getVendorWorkflowJob } from "@/lib/vendor-workflow-api";
import { startJobAction } from "../actions";
import {
  Body,
  DemoReadOnlyNotice,
  Footer,
  InfoRow,
  InlineNotice,
  LinkButton,
  ScreenHeader,
  Stepper,
  WorkflowEstimateSummary,
  formatDateTime,
  mutedStyle,
} from "../_components";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; error?: string }>;
}) {
  const { id, error } = await searchParams;
  const { data: job, source, accessDenied } = await getVendorWorkflowJob(id);
  if (accessDenied) redirect(ROUTES["V-JOB-E0"]);
  if (!job) redirect(ROUTES["V-JOB-00"]);
  const isInProgress = job.status === "IN_PROGRESS";
  const canStart = job.status === "SCHEDULED"
    && job.latestEstimate?.responseType === "FIXED_ESTIMATE"
    && job.latestEstimate.status === "APPROVED";
  const needsFinalEstimate = job.status === "SCHEDULED"
    && job.latestEstimate?.responseType === "VISIT_REQUIRED";

  return (
    <>
      <ScreenHeader title="방문·작업 시작" backTo={withId(ROUTES["V-JOB-04"], job.repairId)} />
      <Body>
        {source === "DEMO" ? <DemoReadOnlyNotice /> : null}
        {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
        <Stepper steps={["일정 확인", "작업 시작", "완료 보고"]} current={isInProgress ? 1 : 0} />
        <Card style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>
            {isInProgress ? "작업이 진행 중입니다." : "방문 전 일정을 다시 확인해 주세요."}
          </div>
          <InfoRow label="방문 일정" value={formatDateTime(job.scheduledAt)} />
          <InfoRow label="방문 위치" value={job.publicLocation} />
          <p style={{ ...mutedStyle, margin: 0 }}>
            승인된 견적 범위 안에서 작업해 주세요. 추가 비용이 예상되면 임의로 진행하지 말고
            관리자에게 변경 견적을 요청해야 합니다.
          </p>
        </Card>
        <WorkflowEstimateSummary job={job} />
        {!canStart && !isInProgress ? (
          <InlineNotice>
            {needsFinalEstimate
              ? "방문 확인 결과를 고정 견적으로 제출하고 관리자 승인을 받아야 작업을 시작할 수 있습니다."
              : "일정과 고정 견적 승인이 모두 완료된 작업만 시작할 수 있습니다."}
          </InlineNotice>
        ) : null}
      </Body>
      <Footer>
        {isInProgress ? (
          <LinkButton href={withId(ROUTES["V-JOB-06"], job.repairId)}>완료 보고하기</LinkButton>
        ) : needsFinalEstimate && source !== "DEMO" ? (
          <LinkButton href={withId(ROUTES["V-JOB-02"], job.repairId)}>
            현장 확인 후 확정 견적 작성
          </LinkButton>
        ) : (
          <form action={startJobAction}>
            <input type="hidden" name="repairId" value={job.repairId} />
            <Button type="submit" fullWidth disabled={source === "DEMO" || !canStart}>
              현장에서 작업 시작
            </Button>
          </form>
        )}
      </Footer>
    </>
  );
}
