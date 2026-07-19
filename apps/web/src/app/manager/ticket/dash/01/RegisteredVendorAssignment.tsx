import { vendorTradeLabel } from "@roomlog/types";
import type {
  ManagerVendorJobLookup,
  Ticket,
  VendorCatalogSearchResult,
} from "@roomlog/types";
import { Card } from "@roomlog/ui";
import { ManagerMutationForm } from "../../../_components/ManagerMutationForm";
import {
  EmptyState,
  StatusPill,
  styles,
} from "../../../vendor-mgmt/_components";
import { muted, row, sectionTitle } from "../../_components/ticket-manager-ui";
import { assignVendorAction } from "./actions";
import { ConfirmAssignmentButton } from "./ConfirmAssignmentButton";

export function RegisteredVendorAssignment({
  ticket,
  candidates,
  current,
}: {
  ticket: Ticket;
  candidates: VendorCatalogSearchResult[];
  current: ManagerVendorJobLookup | null;
}) {
  const directCandidates = candidates.filter(
    (candidate) => candidate.registrationStatus === "ACTIVE"
      && candidate.registrationSource === "MANAGER_DIRECT",
  );
  const assignedVendorId = current?.vendor.vendorId;
  const canReassign = !current || current.job.status === "REQUESTED";

  return (
    <Card style={{ display: "grid", gap: "var(--space-md)" }}>
      <div style={sectionTitle}>업체 배정</div>
      <div style={muted}>
        직접 등록한 업체 중 전화로 협의할 업체를 선택합니다. 견적 발송은 Gara에서 별도로 처리합니다.
      </div>
      {current ? (
        <div style={{ ...row, justifyContent: "space-between" }}>
          <div>
            <strong>{current.vendor.catalog.businessName}</strong>
            <div style={muted}>{current.vendor.catalog.phone}</div>
          </div>
          <StatusPill active>현재 배정 업체</StatusPill>
        </div>
      ) : null}

      {directCandidates.length > 0 ? directCandidates.map((candidate) => {
        const sameVendor = assignedVendorId === candidate.catalog.id;
        const assignable = candidate.canAssign && canReassign && !sameVendor;
        return (
          <ManagerMutationForm
            action={assignVendorAction}
            className={styles.formCard}
            key={candidate.catalog.id}
          >
            <input type="hidden" name="ticketId" value={ticket.id} />
            <input type="hidden" name="vendorId" value={candidate.catalog.id} />
            <div style={{ ...row, justifyContent: "space-between" }}>
              <div>
                <strong>{candidate.catalog.businessName}</strong>
                <div style={muted}>
                  {candidate.catalog.trades.map(vendorTradeLabel).join(" · ") || "담당 분야 미등록"}
                  {` · ${candidate.catalog.phone}`}
                </div>
              </div>
              <StatusPill active={assignable || sameVendor}>
                {sameVendor ? "현재 배정" : assignable ? "배정 가능" : "배정 불가"}
              </StatusPill>
            </div>
            <input
              type="hidden"
              name="requestNote"
              value={`${ticket.location} · ${ticket.description}`}
            />
            <div className={styles.actions}>
              <ConfirmAssignmentButton
                className={styles.button}
                disabled={!assignable}
                confirmMessage={current && !sameVendor
                  ? `${current.vendor.catalog.businessName} 대신 ${candidate.catalog.businessName}(으)로 재배정할까요?`
                  : undefined}
              >
                {sameVendor ? "현재 배정 업체" : current ? "이 업체로 재배정" : "이 업체에 배정"}
              </ConfirmAssignmentButton>
            </div>
          </ManagerMutationForm>
        );
      }) : (
        <EmptyState
          title="직접 등록한 업체가 없습니다"
          description="업체 관리에서 전화로 이용할 업체를 먼저 등록해 주세요."
        />
      )}
    </Card>
  );
}
