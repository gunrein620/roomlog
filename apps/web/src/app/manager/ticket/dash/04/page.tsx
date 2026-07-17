import { vendorTradeLabel } from "@roomlog/types";
import { Badge, Card } from "@roomlog/ui";
import {
  findManagerVendorJobByTicket,
  searchAssignableVendorCandidates,
} from "@/lib/vendor-mgmt-api";
import { ApiPayloadError } from "@/lib/server-api";
import { MANAGER_DEMO_TICKET_ID, getManagerTicket } from "@/lib/ticket-manager-api";
import { ManagerMutationForm } from "../../../_components/ManagerMutationForm";
import {
  EmptyState,
  EstimateSummary,
  StatusPill,
  assignmentBlockLabel,
  formatVendorJobStatus,
  styles,
} from "../../../vendor-mgmt/_components";
import {
  LinkButton,
  TicketHeader,
  muted,
  pageStack,
  row,
  sectionTitle,
  ticketDashHref,
} from "../../_components/ticket-manager-ui";
import { assignVendorAction, confirmVisitAction, reviewEstimateAction } from "./actions";
import { ConfirmAssignmentButton } from "./ConfirmAssignmentButton";
import { IncompleteVendorDataState } from "./IncompleteVendorDataState";

type SearchParams = Promise<{ id?: string }>;

export default async function VendorAssignmentPage({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  const ticketId = id ?? MANAGER_DEMO_TICKET_ID;
  const loaded = await Promise.all([
    getManagerTicket(ticketId),
    searchAssignableVendorCandidates(ticketId),
    findManagerVendorJobByTicket(ticketId),
  ]).catch((error: unknown) => {
    if (error instanceof ApiPayloadError) return null;
    throw error;
  });
  if (!loaded) return <IncompleteVendorDataState />;
  const [ticket, candidatesResult, workflowResult] = loaded;
  const registeredCandidates = candidatesResult.data.filter(
    (candidate) => candidate.registrationStatus === "ACTIVE",
  );
  const assigned = workflowResult.data;
  const estimate = assigned?.job.latestEstimate;
  const demo = candidatesResult.source === "DEMO" || workflowResult.source === "DEMO";
  const canReassign = !assigned
    || assigned.job.status === "REQUESTED"
    || assigned.job.status === "COMPLETED";
  const startsNewRepair = assigned?.job.status === "COMPLETED";

  return (
    <div style={pageStack}>
      <TicketHeader ticket={ticket} title="업체 배정·견적 검토" />
      {demo ? <Badge emphasis>데모 데이터</Badge> : null}
      <Card style={{ display: "grid", gap: "var(--space-md)" }}>
        <div style={sectionTitle}>등록된 업체 후보</div>
        <div style={muted}>내 업체로 등록된 후보만 표시합니다. 검증·활성·계정 연결 조건을 통과해야 배정할 수 있습니다.</div>
        {assigned ? (
          <div style={muted}>
            다른 업체로 재배정하면 현재 요청은 취소됩니다. 견적 또는 작업이 시작된 뒤에는 먼저 기존 작업을 정리해야 합니다.
          </div>
        ) : null}
        {registeredCandidates.length > 0 ? registeredCandidates.map((candidate) => {
          const sameVendor = assigned?.vendor.vendorId === candidate.catalog.id;
          const sameActiveVendor = sameVendor && !startsNewRepair;
          const assignable = candidate.canAssign && canReassign && !demo;
          return (
          <ManagerMutationForm action={assignVendorAction} className={styles.formCard} key={candidate.catalog.id}>
            <input type="hidden" name="ticketId" value={ticket.id} />
            <input type="hidden" name="vendorId" value={candidate.catalog.id} />
            <div style={{ ...row, justifyContent: "space-between" }}>
              <div>
                <strong>{candidate.catalog.businessName}</strong>
                <div style={muted}>{candidate.catalog.trades.map(vendorTradeLabel).join(" · ")} · {candidate.catalog.serviceAreas.join(", ")}</div>
              </div>
              <StatusPill active={assignable || sameActiveVendor}>
                {sameActiveVendor
                  ? "현재 배정 업체"
                  : !canReassign
                    ? "진행 중 작업 정리 필요"
                    : candidate.canAssign
                      ? "배정 가능"
                      : candidate.assignmentBlockReasons.map((reason) => assignmentBlockLabel[reason]).join(" · ")}
              </StatusPill>
            </div>
            <label className={styles.field}>
              업체 전달 요청
              <textarea
                className={styles.textarea}
                name="requestNote"
                required
                defaultValue={`${ticket.location} · ${ticket.description}`}
                disabled={demo || sameActiveVendor || !canReassign}
              />
            </label>
            <div className={styles.actions}>
              <ConfirmAssignmentButton
                className={styles.button}
                disabled={!assignable || sameActiveVendor}
                confirmMessage={assigned && !sameVendor && !startsNewRepair
                  ? `${assigned.vendor.catalog.businessName}의 현재 요청을 취소하고 ${candidate.catalog.businessName}(으)로 재배정할까요?`
                  : undefined}
              >
                {sameActiveVendor
                  ? "현재 배정 업체"
                  : startsNewRepair
                    ? "새 수리 요청"
                    : assigned
                      ? "이 업체로 재배정"
                      : "이 업체에 배정"}
              </ConfirmAssignmentButton>
            </div>
          </ManagerMutationForm>
        );
        }) : <EmptyState title="배정 가능한 등록 업체가 없습니다" description="업체 관리의 업체 찾기에서 먼저 내 업체로 등록해 주세요." />}
      </Card>

      <Card style={{ display: "grid", gap: "var(--space-md)" }}>
        <div style={sectionTitle}>현재 작업·견적</div>
        {assigned ? (
          <>
            <div style={{ ...row, justifyContent: "space-between" }}>
              <div><strong>{assigned.vendor.catalog.businessName}</strong><div style={muted}>{assigned.job.title} · {assigned.job.publicLocation}</div></div>
              <Badge>{formatVendorJobStatus(assigned.job.status)}</Badge>
            </div>
            {estimate ? <EstimateSummary estimate={estimate} /> : <EmptyState title="견적 회신 대기" description="업체가 견적을 제출하면 이곳에서 전체 견적을 검토할 수 있습니다." />}
            {estimate?.status === "SUBMITTED" && estimate.responseType === "FIXED_ESTIMATE" ? (
              <div className={styles.formGrid}>
                <ManagerMutationForm action={reviewEstimateAction} className={styles.formCard}>
                  <input type="hidden" name="ticketId" value={ticket.id} />
                  <input type="hidden" name="repairId" value={assigned.job.repairId} />
                  <input type="hidden" name="estimateId" value={estimate.id} />
                  <input type="hidden" name="action" value="APPROVE" />
                  <label className={styles.field}>비용 부담 주체<select className={styles.select} name="costBearer" defaultValue="LANDLORD"><option value="LANDLORD">관리자</option><option value="TENANT">세입자</option></select></label>
                  <label className={styles.field}>승인 메모<textarea className={styles.textarea} name="note" /></label>
                  <button className={styles.button} type="submit" disabled={demo}>견적 전체 승인</button>
                </ManagerMutationForm>
                {(["REQUEST_REVISION", "REJECT"] as const).map((action) => (
                  <ManagerMutationForm action={reviewEstimateAction} className={styles.formCard} key={action}>
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <input type="hidden" name="repairId" value={assigned.job.repairId} />
                    <input type="hidden" name="estimateId" value={estimate.id} />
                    <input type="hidden" name="action" value={action} />
                    <label className={styles.field}>{action === "REJECT" ? "반려 사유" : "수정 요청"}<textarea className={styles.textarea} name="note" required /></label>
                    <button className={action === "REJECT" ? styles.dangerButton : styles.secondaryButton} type="submit" disabled={demo}>{action === "REJECT" ? "견적 반려" : "전체 견적 수정 요청"}</button>
                  </ManagerMutationForm>
                ))}
              </div>
            ) : null}
            {estimate?.status === "SUBMITTED" && estimate.responseType === "VISIT_REQUIRED" ? (
              <ManagerMutationForm action={confirmVisitAction} className={styles.formCard}>
                <input type="hidden" name="ticketId" value={ticket.id} />
                <input type="hidden" name="repairId" value={assigned.job.repairId} />
                <input type="hidden" name="estimateId" value={estimate.id} />
                <label className={styles.field}>방문 일정<input className={styles.input} type="datetime-local" name="scheduledAt" required /></label>
                <button className={styles.button} type="submit" disabled={demo}>방문 일정 확정</button>
              </ManagerMutationForm>
            ) : null}
          </>
        ) : <EmptyState title="아직 배정된 작업이 없습니다" description="위 후보에서 한 업체를 선택해 요청 내용을 전달해 주세요." />}
      </Card>

      <div style={row}>
        {assigned ? <LinkButton href={`${ticketDashHref("05", ticket.id)}&repairId=${encodeURIComponent(assigned.job.repairId)}`}>수리 완료 확인</LinkButton> : null}
        <LinkButton href={ticketDashHref("01", ticket.id)} variant="ghost">티켓 상세로</LinkButton>
      </div>
    </div>
  );
}
