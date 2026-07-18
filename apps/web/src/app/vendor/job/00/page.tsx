import Link from "next/link";
import { vendorTradeLabel } from "@roomlog/types";
import { Badge, Card } from "@roomlog/ui";
import { withId } from "@/lib/nav";
import {
  listVendorWorkflowJobs,
  vendorJobStatusLabel,
} from "@/lib/vendor-workflow-api";
import { ROUTES } from "@/lib/vendor-nav";
import {
  Body,
  DemoReadOnlyNotice,
  InfoRow,
  ScreenHeader,
  formatDateTime,
  mutedStyle,
  primaryLinkStyle,
} from "../_components";

export default async function Page() {
  const { data: jobs, source } = await listVendorWorkflowJobs();

  return (
    <>
      <ScreenHeader title="배정된 수리 작업" />
      <Body>
        {source === "DEMO" ? <DemoReadOnlyNotice /> : null}
        {jobs.length === 0 ? (
          <Card style={{ display: "flex", flexDirection: "column", gap: 8, textAlign: "center" }}>
            <div style={{ fontWeight: 800 }}>현재 배정된 작업이 없습니다.</div>
            <p style={{ ...mutedStyle, margin: 0 }}>
              관리자가 협력업체로 배정하면 이 목록에서 견적 요청을 확인할 수 있습니다.
            </p>
          </Card>
        ) : jobs.map((job) => (
          <Card key={job.repairId} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{job.title}</div>
                <div style={{ ...mutedStyle, marginTop: 3 }}>{job.publicLocation}</div>
              </div>
              <Badge emphasis>{vendorJobStatusLabel(job.status)}</Badge>
            </div>
            <InfoRow label="작업 분야" value={vendorTradeLabel(job.trade) || "확인 필요"} />
            <InfoRow label="최근 업데이트" value={formatDateTime(job.updatedAt)} />
            <Link
              href={withId(ROUTES["V-JOB-01"], job.repairId)}
              style={primaryLinkStyle}
            >
              작업 상세 보기
            </Link>
          </Card>
        ))}
      </Body>
    </>
  );
}
