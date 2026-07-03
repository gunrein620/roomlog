import type { DeletionState } from "@roomlog/types";
import { redirect } from "next/navigation";
import { decideManagerContractDeletion, getManagerContractDetail } from "@/lib/contract-manager-api";
import { MANAGER_CONTRACT_ROUTES } from "@/lib/contract-manager-nav";
import {
  BackLink,
  Badge,
  Card,
  ContractShell,
  LinkButton,
  MetaRow,
  PageStack,
  Section,
  StaticButton,
  deletionLabel,
  formatDateTime,
} from "../_components";

export const dynamic = "force-dynamic";

async function decideDeletionAction(formData: FormData) {
  "use server";

  const contractId = String(formData.get("contractId") ?? "");
  const state = String(formData.get("state") ?? "") as Extract<DeletionState, "completed" | "limited" | "denied">;
  const retentionNote = String(formData.get("retentionNote") ?? "");
  await decideManagerContractDeletion(contractId, state, retentionNote);
  redirect(MANAGER_CONTRACT_ROUTES["M-DOC-05"]);
}

export default async function Page() {
  const detail = await getManagerContractDetail();

  return (
    <ContractShell id="M-DOC-05" title="보관기간·삭제 처리·감사로그">
      <PageStack>
        <Card style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--space-lg)", alignItems: "center" }}>
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            <BackLink />
            <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
              <Badge emphasis>삭제 요청 {detail.deletionRequests.length}</Badge>
              <Badge emphasis>SLA 경과 점검</Badge>
              <Badge>마스킹·권한</Badge>
            </div>
            <h1 style={{ margin: 0, fontSize: "var(--fs-title)", lineHeight: "var(--lh-title)" }}>
              삭제 3상태와 보관 사유를 정직하게 처리
            </h1>
          </div>
          <LinkButton href={MANAGER_CONTRACT_ROUTES["M-DOC-00"]}>대시보드 확인</LinkButton>
        </Card>

        <Section title="삭제 요청 큐">
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            {detail.deletionRequests.map((request) => (
              <Card key={request.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--space-md)", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
                    <Badge emphasis={request.state === "requested"}>{deletionLabel[request.state]}</Badge>
                    <Badge>{request.unitId}호</Badge>
                    <Badge>SLA {request.slaHours}시간</Badge>
                  </div>
                  <div style={{ marginTop: "var(--space-sm)", fontWeight: 800 }}>{request.tenantName}</div>
                  <div style={{ marginTop: "var(--space-xs)", color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>
                    요청 {formatDateTime(request.requestedAt)} · {request.retentionNote}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <form action={decideDeletionAction}>
                    <input type="hidden" name="contractId" value={request.contractId} />
                    <input type="hidden" name="state" value="completed" />
                    <input type="hidden" name="retentionNote" value="삭제 완료 처리" />
                    <StaticButton type="submit" variant="secondary">완료</StaticButton>
                  </form>
                  <form action={decideDeletionAction}>
                    <input type="hidden" name="contractId" value={request.contractId} />
                    <input type="hidden" name="state" value="limited" />
                    <input type="hidden" name="retentionNote" value="정산·분쟁 대비 제한 보관" />
                    <StaticButton type="submit" variant="secondary">제한 보관</StaticButton>
                  </form>
                  <form action={decideDeletionAction}>
                    <input type="hidden" name="contractId" value={request.contractId} />
                    <input type="hidden" name="state" value="denied" />
                    <input type="hidden" name="retentionNote" value="법정 보관 사유로 삭제 불가" />
                    <StaticButton type="submit" variant="secondary">삭제 불가</StaticButton>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        </Section>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)", alignItems: "start" }}>
          <Section title="보관기간 정책">
            <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
              {detail.privacy.retention.map((item) => (
                <MetaRow key={item.label} label={item.label} value={`${item.until} · ${item.reason}`} />
              ))}
              <StaticButton variant="secondary">보관 사유 기록</StaticButton>
            </Card>
          </Section>

          <Section title="마스킹·접근 권한">
            <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
              <MetaRow label="상세주소·계좌·연락처" value={detail.privacy.maskingEnabled ? "기본 마스킹" : "공개"} />
              <MetaRow label="업체 전달 동의" value={detail.privacy.forwardingConsent ? "동의됨" : "동의 없음"} />
              <MetaRow label="단계 공개" value="사유와 감사로그 기록 후 공개" />
              <MetaRow label="삭제 결과 고지" value="완료·제한 보관·불가를 분리 고지" />
            </Card>
          </Section>
        </div>

        <Section title="감사로그">
          <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
            {detail.auditLogs.map((log) => (
              <div key={`${log.at}-${log.action}`} style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "var(--space-md)", borderBottom: "1px solid var(--border)", paddingBottom: "var(--space-sm)" }}>
                <div style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>{formatDateTime(log.at)}</div>
                <div>
                  <div style={{ fontWeight: 800 }}>{log.actor} · {log.action}</div>
                  <div style={{ marginTop: "var(--space-xs)", color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>{log.detail}</div>
                </div>
              </div>
            ))}
          </Card>
        </Section>

        <Card style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)", alignItems: "center" }}>
          <div style={{ color: "var(--on-surface-variant)" }}>
            처리 결과는 임차인에게 정직하게 고지되며, 보관 예외 항목·기간·사유가 함께 남습니다.
          </div>
          <LinkButton href={MANAGER_CONTRACT_ROUTES["M-DOC-00"]}>대시보드로</LinkButton>
        </Card>
      </PageStack>
    </ContractShell>
  );
}
