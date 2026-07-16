import { redirect } from "next/navigation";
import { withId } from "@/lib/nav";
import { ROUTES } from "@/lib/vendor-nav";
import { getVendorWorkflowJob } from "@/lib/vendor-workflow-api";
import {
  Body,
  DemoReadOnlyNotice,
  InlineNotice,
  ScreenHeader,
  WorkflowJobSummary,
} from "../_components";
import { EstimateResponseForm } from "./EstimateResponseForm";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; saved?: string; error?: string }>;
}) {
  const { id, saved, error } = await searchParams;
  const { data: job, source, accessDenied } = await getVendorWorkflowJob(id);
  if (accessDenied) redirect(ROUTES["V-JOB-E0"]);
  if (!job) redirect(ROUTES["V-JOB-00"]);
  const latest = job.latestEstimate;
  const locked = latest && ![
    "DRAFT",
    "VISIT_SCHEDULED",
    "REVISION_REQUESTED",
    "REJECTED",
  ].includes(latest.status);
  const readOnly = source === "DEMO" || Boolean(locked);

  return (
    <>
      <ScreenHeader
        title="견적 회신"
        backTo={withId(ROUTES["V-JOB-01"], job.repairId)}
      />
      <Body>
        {source === "DEMO" ? <DemoReadOnlyNotice /> : null}
        {saved ? <InlineNotice tone="success">견적을 임시 저장했습니다.</InlineNotice> : null}
        {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
        {locked ? (
          <InlineNotice>제출된 견적은 관리자 검토가 끝나기 전까지 수정할 수 없습니다.</InlineNotice>
        ) : null}
        <WorkflowJobSummary job={job} />
        <EstimateResponseForm repairId={job.repairId} estimate={latest} readOnly={readOnly} />
      </Body>
    </>
  );
}
