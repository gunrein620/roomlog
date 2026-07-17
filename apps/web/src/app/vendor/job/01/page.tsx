import { Badge, Card } from "@roomlog/ui";
import { redirect } from "next/navigation";
import { withId } from "@/lib/nav";
import { ROUTES } from "@/lib/vendor-nav";
import { getVendorWorkflowJob, nextVendorJobRoute } from "@/lib/vendor-workflow-api";
import {
  AttachmentGallery,
  Body,
  DemoReadOnlyNotice,
  Footer,
  LinkButton,
  ScreenHeader,
  TenantAvailableTimes,
  WorkflowEstimateSummary,
  WorkflowJobSummary,
  mutedStyle,
} from "../_components";

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const { data: job, source, accessDenied } = await getVendorWorkflowJob(id);
  if (accessDenied) redirect(ROUTES["V-JOB-E0"]);
  if (!job) redirect(ROUTES["V-JOB-00"]);
  const nextRoute = nextVendorJobRoute(job);

  return (
    <>
      <ScreenHeader title="수리 요청 상세" backTo={ROUTES["V-JOB-00"]} />
      <Body>
        {source === "DEMO" ? <DemoReadOnlyNotice /> : null}
        <WorkflowJobSummary job={job} />
        <TenantAvailableTimes value={job.tenantAvailableTimes} />
        <Card style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <div style={{ fontWeight: 800 }}>전달된 자료</div>
          <AttachmentGallery
            urls={job.attachmentUrls}
            emptyLabel="관리자가 공유한 하자 사진이 없습니다."
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <Badge emphasis>관리자 배정 완료</Badge>
            <Badge>개인정보 비공개</Badge>
          </div>
          <p style={{ ...mutedStyle, margin: 0 }}>
            업체에는 수리에 필요한 공개 위치와 증상만 전달됩니다. 계약서와 임차인 연락처는
            표시하지 않습니다.
          </p>
        </Card>
        <WorkflowEstimateSummary job={job} />
      </Body>
      <Footer>
        {source === "DEMO" ? (
          <button type="button" disabled style={{ minHeight: "var(--touch-target)" }}>
            실제 연결 후 견적 회신 가능
          </button>
        ) : (
          <LinkButton href={withId(nextRoute, job.repairId)}>
            {nextRoute === ROUTES["V-JOB-02"] ? "견적 회신하기" : "진행 상태 보기"}
          </LinkButton>
        )}
      </Footer>
    </>
  );
}
