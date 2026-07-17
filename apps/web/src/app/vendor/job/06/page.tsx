import { Button, Card, Input } from "@roomlog/ui";
import { redirect } from "next/navigation";
import { withId } from "@/lib/nav";
import { ROUTES } from "@/lib/vendor-nav";
import { getVendorWorkflowJob } from "@/lib/vendor-workflow-api";
import { submitCompletionAction } from "../actions";
import {
  AttachmentGallery,
  Body,
  DemoReadOnlyNotice,
  InfoRow,
  InlineNotice,
  ScreenHeader,
  SettlementSummary,
  formatDateTime,
  labelStyle,
  mutedStyle,
} from "../_components";

const textAreaStyle = {
  width: "100%",
  minHeight: 108,
  boxSizing: "border-box",
  border: "1px solid var(--input-border)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-container-lowest)",
  color: "var(--input-text)",
  font: "inherit",
  padding: 12,
  resize: "vertical",
} as const;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; error?: string }>;
}) {
  const { id, error } = await searchParams;
  const { data: job, source, accessDenied } = await getVendorWorkflowJob(id);
  if (accessDenied) redirect(ROUTES["V-JOB-E0"]);
  if (!job) redirect(ROUTES["V-JOB-00"]);
  const latestCompletion = job.latestCompletion;
  const review = latestCompletion?.review;
  const rejected = review?.decision === "REJECTED";
  const canReport = job.status === "IN_PROGRESS" && (!latestCompletion || rejected);

  return (
    <>
      <ScreenHeader title="완료 보고" backTo={withId(ROUTES["V-JOB-05"], job.repairId)} />
      <Body>
        {source === "DEMO" ? <DemoReadOnlyNotice /> : null}
        {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
        {latestCompletion ? (
          <>
            {review?.decision === "REJECTED" ? (
              <InlineNotice tone="danger">
                완료 보고가 반려되었습니다. {review.note || "관리자 요청 내용을 확인해 다시 제출해 주세요."}
              </InlineNotice>
            ) : review?.decision === "APPROVED" ? (
              <InlineNotice tone="success">완료 보고가 승인되었습니다.</InlineNotice>
            ) : (
              <InlineNotice>
                완료 보고가 접수되었습니다. 관리자가 확인하면 정산 단계로 이어집니다.
              </InlineNotice>
            )}
            <Card style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <div style={labelStyle}>{rejected ? "이전 완료 보고" : "제출한 완료 보고"}</div>
              <AttachmentGallery
                urls={latestCompletion.attachmentUrls}
                emptyLabel="제출된 완료 사진을 불러올 수 없습니다."
              />
              <p style={{ ...mutedStyle, margin: 0 }}>{latestCompletion.workSummary}</p>
              <InfoRow label="작업 완료" value={formatDateTime(latestCompletion.completedAt)} />
              {review ? <InfoRow label="검토 일시" value={formatDateTime(review.decidedAt)} /> : null}
            </Card>
          </>
        ) : null}
        {canReport ? (
          <form
            action={submitCompletionAction}
            encType="multipart/form-data"
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
          >
            <input type="hidden" name="repairId" value={job.repairId} />
            <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={labelStyle}>완료 사진</div>
              <Input
                name="photos"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                multiple
                disabled={source === "DEMO" || !canReport}
                style={{ paddingTop: 9 }}
              />
              <p style={{ ...mutedStyle, margin: 0 }}>
                작업 결과가 보이도록 최대 6장, 파일당 10MB 이하로 첨부해 주세요.
              </p>
            </Card>
            <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={labelStyle}>작업 내용</div>
              <textarea
                name="workSummary"
                placeholder="수리한 부위, 사용한 자재와 확인 결과를 적어 주세요."
                disabled={source === "DEMO" || !canReport}
                style={textAreaStyle}
              />
              <InfoRow
                label="승인된 견적"
                value={job.latestEstimate?.totalAmount !== undefined
                  ? `${job.latestEstimate.totalAmount.toLocaleString()}원`
                  : "관리자 확인"}
              />
              <p style={{ ...mutedStyle, margin: 0 }}>
                정산 금액은 승인된 견적을 기준으로 서버에서 생성됩니다. 완료 보고에서 임의로
                금액을 바꿀 수 없습니다.
              </p>
            </Card>
            {!canReport ? (
              <InlineNotice>작업을 시작한 뒤에만 완료 보고를 제출할 수 있습니다.</InlineNotice>
            ) : null}
            <Button type="submit" fullWidth disabled={source === "DEMO" || !canReport}>
              {rejected ? "완료 보고 다시 제출" : "완료 보고 제출"}
            </Button>
          </form>
        ) : latestCompletion ? (
          <SettlementSummary job={job} />
        ) : (
          <InlineNotice>작업을 시작한 뒤에만 완료 보고를 제출할 수 있습니다.</InlineNotice>
        )}
      </Body>
    </>
  );
}
