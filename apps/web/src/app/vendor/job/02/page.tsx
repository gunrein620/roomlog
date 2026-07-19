import { Card } from "@roomlog/ui";
import { redirect } from "next/navigation";
import { withId } from "@/lib/nav";
import { ROUTES } from "@/lib/vendor-nav";
import { getVendorWorkflowJob } from "@/lib/vendor-workflow-api";
import { selectVendorRevisionRequestNote } from "@/lib/visit-negotiation";
import {
  Body,
  DemoReadOnlyNotice,
  InlineNotice,
  ScreenHeader,
  TenantAvailableTimes,
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
  const reviewNote = selectVendorRevisionRequestNote(latest, job.estimates);

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
        <TenantAvailableTimes value={job.tenantAvailableTimes} />
        {reviewNote ? (
          <section aria-labelledby="revision-request-title">
            <Card
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-sm)",
                border: "1px solid var(--primary)",
                background: "var(--primary-container)",
                color: "var(--on-primary-container)",
              }}
            >
              <h2
                id="revision-request-title"
                style={{ margin: 0, fontSize: "var(--fs-body)", fontWeight: 800 }}
              >
                재협의 요청
              </h2>
              <p style={{ margin: 0, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{reviewNote}</p>
            </Card>
          </section>
        ) : null}
        <EstimateResponseForm repairId={job.repairId} estimate={latest} readOnly={readOnly} />
      </Body>
    </>
  );
}
