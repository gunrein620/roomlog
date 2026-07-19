import { Badge, Card } from "@roomlog/ui";
import { findManagerVendorJobByTicket } from "@/lib/vendor-mgmt-api";
import { MANAGER_DEMO_TICKET_ID, getManagerTicket } from "@/lib/ticket-manager-api";
import { resolveAssetFileUrl } from "@/lib/splat-asset-api";
import { ManagerMutationForm } from "../../../_components/ManagerMutationForm";
import {
  EmptyState,
  EstimateSummary,
  formatDate,
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
import { decideCompletionAction } from "./actions";

type SearchParams = Promise<{ id?: string; repairId?: string }>;

export default async function CompletionDecisionPage({ searchParams }: { searchParams: SearchParams }) {
  const { id, repairId } = await searchParams;
  const ticketId = id ?? MANAGER_DEMO_TICKET_ID;
  const [ticket, workflowResult] = await Promise.all([
    getManagerTicket(ticketId),
    findManagerVendorJobByTicket(ticketId),
  ]);
  const selected = workflowResult.data && (!repairId || workflowResult.data.job.repairId === repairId)
    ? workflowResult.data
    : null;
  const latestCompletion = selected?.job.latestCompletion;
  const demo = workflowResult.source === "DEMO";
  const readOnly = selected?.partnership === "UNREGISTERED";
  const canDecide = selected?.job.status === "COMPLETION_REPORTED" && !demo && !readOnly;

  return (
    <div style={pageStack}>
      <TicketHeader ticket={ticket} title="수리 완료 확인" />
      {demo ? <Badge emphasis>데모 데이터</Badge> : null}
      {readOnly ? (
        <Card role="status" style={{ display: "grid", gap: "var(--space-sm)" }}>
          <Badge emphasis>세입자가 연결한 플랫폼 업체 — 조회 전용</Badge>
          <div style={muted}>업체의 완료 보고와 현재 진행 상태만 확인할 수 있습니다.</div>
        </Card>
      ) : null}
      {selected ? (
        <>
          <Card style={{ display: "grid", gap: "var(--space-md)" }}>
            <div style={sectionTitle}>개별 수리 작업</div>
            <div style={{ ...row, justifyContent: "space-between" }}>
              <div><strong>{selected.job.title}</strong><div style={muted}>{selected.vendor.catalog.businessName} · {selected.job.publicLocation}</div></div>
              <Badge>{formatVendorJobStatus(selected.job.status)}</Badge>
            </div>
            {selected.job.latestEstimate ? <EstimateSummary estimate={selected.job.latestEstimate} /> : null}
          </Card>
          <Card style={{ display: "grid", gap: "var(--space-md)" }}>
            <div style={sectionTitle}>업체 완료 보고</div>
            {latestCompletion ? (
              <>
                <div><strong>{latestCompletion.workSummary}</strong><div style={muted}>완료 {formatDate(latestCompletion.completedAt)} · 사진 {latestCompletion.attachmentIds.length}장 · 보고 v{latestCompletion.version}</div></div>
                {(latestCompletion.attachmentUrls?.length ?? 0) > 0 ? (
                  <div className={styles.photoGallery} aria-label="업체 완료 사진">
                    {latestCompletion.attachmentUrls?.map((url, index) => (
                      <a
                        className={styles.photoLink}
                        href={resolveAssetFileUrl(url)}
                        key={url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          className={styles.photo}
                          src={resolveAssetFileUrl(url)}
                          alt={`업체 완료 사진 ${index + 1}`}
                          loading="lazy"
                        />
                      </a>
                    ))}
                  </div>
                ) : null}
                {canDecide ? <div className={styles.formGrid}>
                  <ManagerMutationForm action={decideCompletionAction} className={styles.formCard}>
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <input type="hidden" name="repairId" value={selected.job.repairId} />
                    <input type="hidden" name="decision" value="APPROVED" />
                    <label className={styles.field}>승인 메모<textarea className={styles.textarea} name="note" placeholder="선택 입력" /></label>
                    <button className={styles.button} type="submit">이 수리 완료 승인</button>
                  </ManagerMutationForm>
                  <ManagerMutationForm action={decideCompletionAction} className={styles.formCard}>
                    <input type="hidden" name="ticketId" value={ticket.id} />
                    <input type="hidden" name="repairId" value={selected.job.repairId} />
                    <input type="hidden" name="decision" value="REJECTED" />
                    <label className={styles.field}>반려 사유<textarea className={styles.textarea} name="note" required placeholder="업체가 수정해야 할 내용을 적어 주세요." /></label>
                    <button className={styles.dangerButton} type="submit">완료 보고 반려</button>
                  </ManagerMutationForm>
                </div> : (
                  <div style={muted}>
                    {readOnly
                      ? "세입자가 연결한 업체의 완료 진행을 조회하고 있습니다."
                      : demo
                      ? "데모 데이터는 읽기 전용입니다."
                      : selected.job.status === "COMPLETED"
                        ? "완료 보고가 승인되어 지급 절차로 넘어갔습니다."
                        : "이 완료 보고는 이미 검토되었습니다. 업체의 후속 보고를 기다려 주세요."}
                  </div>
                )}
              </>
            ) : <EmptyState title="완료 보고 대기" description="업체가 사진과 작업 내용을 제출하면 이 repair만 확인할 수 있습니다." />}
          </Card>
        </>
      ) : <EmptyState title="확인할 수리 작업이 없습니다" description="업체 배정 화면에서 실제 repair를 선택해 주세요." />}
      <div style={row}>
        <LinkButton href={ticketDashHref("01", ticket.id)} variant="ghost">티켓 상세로</LinkButton>
      </div>
    </div>
  );
}
