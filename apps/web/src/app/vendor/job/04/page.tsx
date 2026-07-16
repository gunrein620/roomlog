import { Button, Card, Input } from "@roomlog/ui";
import { redirect } from "next/navigation";
import { withId } from "@/lib/nav";
import { ROUTES } from "@/lib/vendor-nav";
import { getVendorWorkflowJob } from "@/lib/vendor-workflow-api";
import { scheduleJobAction } from "../actions";
import {
  Body,
  DemoReadOnlyNotice,
  Footer,
  InfoRow,
  InlineNotice,
  LinkButton,
  ScreenHeader,
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
  const alreadyScheduled = Boolean(job.scheduledAt) || job.status === "SCHEDULED";
  const canSchedule = job.status === "ESTIMATE_APPROVED" && !alreadyScheduled;
  const needsFinalEstimate = alreadyScheduled
    && job.latestEstimate?.responseType === "VISIT_REQUIRED"
    && job.latestEstimate.status === "VISIT_SCHEDULED";

  return (
    <>
      <ScreenHeader title="방문 일정" backTo={withId(ROUTES["V-JOB-03"], job.repairId)} />
      <Body>
        {source === "DEMO" ? <DemoReadOnlyNotice /> : null}
        {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
        <WorkflowEstimateSummary job={job} />
        {alreadyScheduled ? (
          <Card style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>방문 일정이 확정되었습니다.</div>
            <InfoRow label="확정 일정" value={formatDateTime(job.scheduledAt)} />
            <InfoRow label="방문 위치" value={job.publicLocation} />
            <p style={{ ...mutedStyle, margin: 0 }}>
              {needsFinalEstimate
                ? "현장을 확인한 뒤 실제 작업 범위와 금액을 고정 견적으로 제출해 주세요. 관리자 승인 전에는 작업을 시작할 수 없습니다."
                : "일정과 승인된 작업 범위를 확인한 뒤 현장에서 작업 시작을 눌러 주세요."}
            </p>
          </Card>
        ) : canSchedule ? (
          <form action={scheduleJobAction}>
            <input type="hidden" name="repairId" value={job.repairId} />
            <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>승인된 견적의 방문 일정을 정해 주세요.</div>
              <Input name="scheduledAt" type="datetime-local" disabled={source === "DEMO"} />
              <Button type="submit" fullWidth disabled={source === "DEMO"}>방문 일정 확정</Button>
            </Card>
          </form>
        ) : (
          <InlineNotice>
            관리자 견적 승인이 완료되면 방문 일정을 정할 수 있습니다. 방문 필요 견적은 관리자가
            확인한 일정이 이 화면에 자동 표시됩니다.
          </InlineNotice>
        )}
      </Body>
      {alreadyScheduled ? (
        <Footer>
          {source === "DEMO" ? (
            <Button type="button" fullWidth disabled>실제 연결 후 작업 확인 가능</Button>
          ) : needsFinalEstimate ? (
            <LinkButton href={withId(ROUTES["V-JOB-02"], job.repairId)}>
              현장 확인 후 확정 견적 작성
            </LinkButton>
          ) : (
            <LinkButton href={withId(ROUTES["V-JOB-05"], job.repairId)}>일정 확인 완료</LinkButton>
          )}
        </Footer>
      ) : null}
    </>
  );
}
