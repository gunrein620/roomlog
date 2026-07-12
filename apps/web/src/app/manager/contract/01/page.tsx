import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileText, MessageCircleWarning, ShieldCheck } from "lucide-react";
import {
  confirmManagerContract,
  getManagerContractDetail,
  requestManagerContractInfo,
  runManagerContractOcr,
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
  formatDateTime,
} from "../_components";
import { OcrSubmitButton } from "./OcrSubmitButton";

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

async function runOcrAction(formData: FormData) {
  "use server";

  const contractId = String(formData.get("contractId") ?? "");
  await runManagerContractOcr(contractId);
  redirect(`${MANAGER_CONTRACT_ROUTES["M-DOC-01"]}?id=${encodeURIComponent(contractId)}`);
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  const detail = await getManagerContractDetail(id);
  const needsCheck = detail.extraction.items.filter((item) => item.needsCheck);
  const totalItems = detail.extraction.items.length;
  const checkedItems = Math.max(0, totalItems - needsCheck.length);
  const reviewProgress = totalItems ? Math.round((checkedItems / totalItems) * 100) : 0;
  const source = ocrSource(detail.extraction.highlights);
  const status = reviewStatus(detail.row.contract.review, needsCheck.length);
  const evidenceItems = detail.extraction.items.filter((item) => item.evidence).slice(0, 6);
  const blockingItems = needsCheck.slice(0, 5);

  return (
    <ContractShell id="M-DOC-01" title="계약서 OCR 검토·확정">
      <PageStack>
        <Card style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-lg)", alignItems: "start" }}>
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            <BackLink />
            <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
              <Badge emphasis>{detail.row.contract.unitId}호</Badge>
              <Badge>{detail.row.tenantName}</Badge>
              <Badge emphasis={status.emphasis}>{status.label}</Badge>
              <Badge emphasis={source.emphasis}>{source.label}</Badge>
              <SourceBadge origin={detail.row.origin} />
            </div>
            <h1 style={{ margin: 0, fontSize: "var(--fs-title)", lineHeight: "var(--lh-title)" }}>
              OCR 결과를 확정 가능한 계약값으로 정리
            </h1>
            <p style={{ margin: 0, color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" }}>
              {source.description} 확인 필요 항목을 원문 근거와 대조한 뒤 확정하면 납부·하자·퇴실 업무의 기준값으로 흐릅니다.
            </p>
          </div>
          <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
            <form action={runOcrAction}>
              <input type="hidden" name="contractId" value={detail.row.contract.id} />
              <OcrSubmitButton />
            </form>
            <form action={confirmContractAction}>
              <input type="hidden" name="contractId" value={detail.row.contract.id} />
              <StaticButton type="submit" style={{ gap: "var(--space-xs)" }}>
                <ShieldCheck size={16} strokeWidth={2.5} aria-hidden="true" />
                <span>검토 확정</span>
              </StaticButton>
            </form>
            <form action={requestInfoAction}>
              <input type="hidden" name="contractId" value={detail.row.contract.id} />
              <StaticButton type="submit" variant="ghost" style={{ gap: "var(--space-xs)" }}>
                <MessageCircleWarning size={16} strokeWidth={2.5} aria-hidden="true" />
                <span>보완 요청</span>
              </StaticButton>
            </form>
          </div>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--space-md)" }}>
          <StatusTile label="OCR 상태" value={source.label} note={source.note} emphasis={source.emphasis} />
          <StatusTile label="검토 진행" value={`${reviewProgress}%`} note={`${checkedItems}/${totalItems || 0}개 대조됨`} emphasis={needsCheck.length > 0} />
          <StatusTile label="확인 필요" value={`${needsCheck.length}개`} note={needsCheck.length ? "원문 대조 후 확정" : "바로 확정 가능"} emphasis={needsCheck.length > 0} />
          <StatusTile label="최근 분석" value={formatDateTime(detail.extraction.createdAt)} note="OCR/수동 추출 갱신 시각" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "var(--space-lg)", alignItems: "start" }}>
          <Section title="추출 10항목 · 인라인 수정">
            <ExtractionTable extraction={detail.extraction} />
          </Section>

          <div style={{ display: "grid", gap: "var(--space-lg)" }}>
            <Section title="검토 큐">
              <Card style={{ display: "grid", gap: "var(--space-md)" }}>
                <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "center" }}>
                    {needsCheck.length ? (
                      <AlertTriangle size={20} strokeWidth={2.5} color="var(--primary)" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 size={20} strokeWidth={2.5} color="var(--primary)" aria-hidden="true" />
                    )}
                    <strong>{needsCheck.length ? "원문 확인이 남아 있습니다" : "확정 가능한 상태입니다"}</strong>
                  </div>
                  <Badge emphasis={needsCheck.length > 0}>{needsCheck.length ? `${needsCheck.length}개 대기` : "대조 완료"}</Badge>
                </div>
                <div style={{ display: "grid", gap: "var(--space-xs)" }}>
                  {(blockingItems.length ? blockingItems : detail.extraction.items.slice(0, 3)).map((item) => (
                    <div key={item.label} style={queueItemStyle}>
                      <div>
                        <div style={{ fontWeight: 800 }}>{item.label}</div>
                        <div style={{ ...captionStyle, marginTop: 2 }}>{item.value}</div>
                      </div>
                      {item.needsCheck ? <Badge emphasis>확인 필요</Badge> : <Badge>대조됨</Badge>}
                    </div>
                  ))}
                </div>
              </Card>
            </Section>

            <Section title="원문 근거">
              <Card style={{ display: "grid", gap: "var(--space-md)", minHeight: 320 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-sm)", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "center" }}>
                    <FileText size={18} strokeWidth={2.5} color="var(--primary)" aria-hidden="true" />
                    <strong>추출 근거 문장</strong>
                  </div>
                  <Badge>{evidenceItems.length}개</Badge>
                </div>
                <div style={{ display: "grid", gap: "var(--space-sm)" }}>
                  {evidenceItems.map((item) => (
                    <div key={`${item.label}-${item.evidence}`} style={evidenceStyle}>
                      <div style={{ fontWeight: 800 }}>{item.label}</div>
                      <p style={{ margin: "var(--space-xs) 0 0", color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" }}>
                        {item.evidence}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            </Section>

            <Section title="임차인 의견·보완 요청 스레드">
              <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
                <MetaRow label="상태" value="의견접수 → 보완요청 → 재업로드 → 해결" />
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

function ocrSource(highlights: string[]) {
  const text = highlights.join(" ");

  if (/실제 OCR|OpenAI/i.test(text)) {
    return {
      label: "실제 OCR",
      note: "OpenAI 원문 분석",
      description: "OPENAI_API_KEY 기반 실제 계약서 분석 결과입니다.",
      emphasis: true,
    };
  }

  if (/mock|fallback|OPENAI_API_KEY/i.test(text)) {
    return {
      label: "mock fallback",
      note: "키 없음 또는 호출 실패",
      description: "실제 OCR을 사용할 수 없어 등록값 기반 fallback 결과를 보여줍니다.",
      emphasis: true,
    };
  }

  return {
    label: "초기 추출",
    note: "OCR 실행 전",
    description: "현재 저장된 계약 추출값입니다.",
    emphasis: false,
  };
}

function reviewStatus(review: string, needsCheckCount: number) {
  if (review === "confirmed") return { label: "확정 완료", emphasis: false };
  if (review === "info_requested") return { label: "보완 요청 중", emphasis: true };
  if (needsCheckCount > 0) return { label: `확인 필요 ${needsCheckCount}`, emphasis: true };
  return { label: "확정 가능", emphasis: false };
}

function StatusTile({
  label,
  value,
  note,
  emphasis = false,
}: {
  label: string;
  value: string;
  note: string;
  emphasis?: boolean;
}) {
  return (
    <Card
      style={{
        display: "grid",
        gap: "var(--space-xs)",
        minHeight: 104,
        alignContent: "space-between",
        borderColor: emphasis ? "var(--primary)" : undefined,
      }}
    >
      <div style={captionStyle}>{label}</div>
      <div style={{ fontSize: "var(--fs-subtitle)", lineHeight: "var(--lh-title)", fontWeight: 900, minWidth: 0, overflowWrap: "anywhere" }}>{value}</div>
      <div style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>{note}</div>
    </Card>
  );
}

const queueItemStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: "var(--space-md)",
  alignItems: "center",
  padding: "var(--space-sm) 0",
  borderTop: "1px solid var(--border)",
} as const;

const evidenceStyle = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-container-low)",
  padding: "var(--space-md)",
} as const;
