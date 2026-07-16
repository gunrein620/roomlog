import { Card } from "@roomlog/ui";
import { redirect } from "next/navigation";
import { withId } from "@/lib/nav";
import { ROUTES } from "@/lib/vendor-nav";
import {
  getVendorWorkflowJob,
  nextVendorJobRoute,
  vendorJobStatusLabel,
} from "@/lib/vendor-workflow-api";
import {
  Body,
  DemoReadOnlyNotice,
  Footer,
  InlineNotice,
  LinkButton,
  ScreenHeader,
  SettlementSummary,
  Stepper,
  WorkflowEstimateSummary,
  WorkflowJobSummary,
  mutedStyle,
} from "../_components";

function progress(status: string) {
  if (["COMPLETED", "COMPLETION_REPORTED"].includes(status)) return 4;
  if (status === "IN_PROGRESS") return 3;
  if (["ESTIMATE_APPROVED", "SCHEDULED"].includes(status)) return 2;
  if (status === "VENDOR_ASSIGNED") return 0;
  return 1;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; reported?: string }>;
}) {
  const { id, reported } = await searchParams;
  const { data: job, source, accessDenied } = await getVendorWorkflowJob(id);
  if (accessDenied) redirect(ROUTES["V-JOB-E0"]);
  if (!job) redirect(ROUTES["V-JOB-00"]);
  const nextRoute = nextVendorJobRoute(job);
  const hasNextAction = !["/vendor/job/03"].includes(nextRoute);

  return (
    <>
      <ScreenHeader title="작업 진행 상태" backTo={ROUTES["V-JOB-00"]} />
      <Body>
        {source === "DEMO" ? <DemoReadOnlyNotice /> : null}
        {reported ? (
          <InlineNotice tone="success">
            완료 보고를 제출했습니다. 관리자가 확인하면 정산 상태가 이 화면에 반영됩니다.
          </InlineNotice>
        ) : null}
        <Stepper steps={["요청", "견적", "일정", "작업", "정산"]} current={progress(job.status)} />
        <WorkflowJobSummary job={job} />
        <WorkflowEstimateSummary job={job} />
        <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{vendorJobStatusLabel(job.status)}</div>
          <p style={{ ...mutedStyle, margin: 0 }}>
            {job.status === "ESTIMATE_SUBMITTED"
              ? "관리자가 견적을 검토 중입니다. 수정 요청 또는 승인 결과가 이 화면에 표시됩니다."
              : job.status === "COMPLETION_REPORTED"
                ? "관리자가 완료 사진과 작업 내용을 확인 중입니다. 별도 승인 전에는 지급 완료로 표시하지 않습니다."
                : job.status === "COMPLETED"
                  ? "작업 확인이 완료되었습니다. 아래 정산 상태에서 지급 처리 결과를 확인하세요."
                  : "현재 상태에 맞는 다음 작업을 확인해 주세요."}
          </p>
        </Card>
        <SettlementSummary job={job} />
      </Body>
      {hasNextAction ? (
        <Footer>
          {source === "DEMO" ? (
            <button type="button" disabled style={{ minHeight: "var(--touch-target)" }}>
              실제 연결 후 다음 단계 진행 가능
            </button>
          ) : (
            <LinkButton href={withId(nextRoute, job.repairId)}>다음 단계 확인</LinkButton>
          )}
        </Footer>
      ) : null}
    </>
  );
}
