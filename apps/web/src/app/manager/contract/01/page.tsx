import Link from "next/link";
import { redirect } from "next/navigation";
import {
  confirmManagerContract,
  getManagerContractDetail,
  requestManagerContractInfo,
} from "@/lib/contract-manager-api";
import { MANAGER_CONTRACT_ROUTES } from "@/lib/contract-manager-nav";
import { MANAGER_MESSAGING_ROUTES } from "@/lib/messaging-manager-nav";
import {
  BackLink,
  Badge,
  Card,
  ContractShell,
  ExtractionTable,
  LinkButton,
  MetaRow,
  PageStack,
  Section,
  SourceBadge,
  StaticButton,
  captionStyle,
} from "../_components";

type SearchParams = Promise<{ id?: string }>;

export const dynamic = "force-dynamic";

async function confirmContractAction(formData: FormData) {
  "use server";

  const contractId = String(formData.get("contractId") ?? "");
  await confirmManagerContract(contractId);
  redirect(`${MANAGER_CONTRACT_ROUTES["M-DOC-01"]}?id=${encodeURIComponent(contractId)}`);
}

async function requestInfoAction(formData: FormData) {
  "use server";

  const contractId = String(formData.get("contractId") ?? "");
  await requestManagerContractInfo(contractId);
  redirect(`${MANAGER_CONTRACT_ROUTES["M-DOC-01"]}?id=${encodeURIComponent(contractId)}`);
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  const detail = await getManagerContractDetail(id);
  const needsCheck = detail.extraction.items.filter((item) => item.needsCheck);

  return (
    <ContractShell id="M-DOC-01" title="계약서 OCR 검토·확정">
      <PageStack>
        <Card style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--space-lg)", alignItems: "start" }}>
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            <BackLink />
            <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
              <Badge emphasis>{detail.row.contract.unitId}호</Badge>
              <Badge>{detail.row.tenantName}</Badge>
              <Badge emphasis={needsCheck.length > 0}>확인 필요 {needsCheck.length}</Badge>
              <SourceBadge origin={detail.row.origin} />
            </div>
            <h1 style={{ margin: 0, fontSize: "var(--fs-title)", lineHeight: "var(--lh-title)" }}>
              원문 대조 정밀 검토 모드
            </h1>
            <p style={{ margin: 0, color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" }}>
              AI 추출은 확정하지 않습니다. 확인 필요 항목을 원문 근거와 대조하고, 잔존 항목이 있으면 확정 게이트에서 재확인합니다.
            </p>
          </div>
          <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <form action={confirmContractAction}>
              <input type="hidden" name="contractId" value={detail.row.contract.id} />
              <StaticButton type="submit">검토 확정</StaticButton>
            </form>
            <form action={requestInfoAction}>
              <input type="hidden" name="contractId" value={detail.row.contract.id} />
              <StaticButton type="submit" variant="secondary">임차인에게 보완 요청</StaticButton>
            </form>
          </div>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(360px, 0.85fr)", gap: "var(--space-lg)", alignItems: "start" }}>
          <Section title="추출 10항목 · 인라인 수정">
            <ExtractionTable extraction={detail.extraction} />
          </Section>

          <div style={{ display: "grid", gap: "var(--space-lg)" }}>
            <Section title="원본·OCR 전문">
              <Card style={{ display: "grid", gap: "var(--space-md)", minHeight: 360 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-sm)" }}>
                  <Badge>원본 뷰어</Badge>
                  <Badge>근거 하이라이트 동기화</Badge>
                </div>
                <div
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    background: "var(--surface-container-low)",
                    padding: "var(--space-lg)",
                    lineHeight: "var(--lh-body)",
                    color: "var(--on-surface-variant)",
                  }}
                >
                  {detail.extraction.items.slice(0, 5).map((item) => (
                    <p key={item.label} style={{ margin: "0 0 var(--space-sm)" }}>
                      {item.evidence}
                    </p>
                  ))}
                </div>
              </Card>
            </Section>

            <Section title="임차인 의견·보완 요청 스레드">
              <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
                <MetaRow label="상태" value="의견접수 -> 보완요청 -> 재업로드 -> 해결" />
                <MetaRow label="최근 의견" value="자동연장 특약 문구가 실제 계약서와 다른지 확인 요청" />
                <MetaRow label="SLA" value="보완 요청 후 임차인 알림 및 무응답 출구 유지" />
                <Link href={MANAGER_MESSAGING_ROUTES["M-MSG-00"]} style={{ color: "var(--primary)", fontWeight: 800, textDecoration: "none" }}>
                  메시징 허브 열기
                </Link>
              </Card>
            </Section>

            <Section title="병합 충돌 후보">
              <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
                {detail.conflictCandidates.map((candidate) => (
                  <div key={`${candidate.source}-${candidate.uploadedAt}`} style={{ borderBottom: "1px solid var(--border)", paddingBottom: "var(--space-sm)" }}>
                    <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
                      <Badge>{candidate.source === "tenant" ? "임차인본" : "관리자본"}</Badge>
                      <span style={captionStyle}>{candidate.uploadedAt}</span>
                    </div>
                    <div style={{ marginTop: "var(--space-xs)", fontWeight: 800 }}>{candidate.summary}</div>
                    <div style={{ marginTop: "var(--space-xs)", color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>{candidate.decision}</div>
                  </div>
                ))}
              </Card>
            </Section>
          </div>
        </div>

        <Card style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)", alignItems: "center" }}>
          <div style={{ color: "var(--on-surface-variant)" }}>
            확정하면 T-DOC 확정본과 납부·하자·퇴실의 선택 prefill 근거로 흐릅니다.
          </div>
          <LinkButton href={MANAGER_CONTRACT_ROUTES["M-DOC-03"]} variant="secondary">확정 후 타임라인</LinkButton>
        </Card>
      </PageStack>
    </ContractShell>
  );
}
