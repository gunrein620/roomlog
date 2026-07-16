import { type ReactNode } from "react";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import {
  confirmManagerContract,
  getManagerContractDetail,
  updateManagerContractManualValues,
} from "@/lib/contract-manager-api";
import { MANAGER_CONTRACT_ROUTES } from "@/lib/contract-manager-nav";
import { ApiError } from "@/lib/server-api";
import {
  Badge,
  Card,
  ContractShell,
  PageStack,
  Section,
  StaticButton,
  captionStyle,
} from "../_components";
import { ContractConfirmErrorFocus } from "./ContractConfirmErrorFocus";

type SearchParams = Promise<{
  id?: string;
  source?: string;
  error?: string;
  confirmError?: string;
}>;
type ManagerContractDetailResult = Awaited<ReturnType<typeof getManagerContractDetail>>;
const DOCUMENT_ABSENT_VALUE = "문서에 없음";
const IMPORTANT_CONTRACT_LABELS = ["보증금", "특약", "자동연장", "원상복구", "수선 책임"] as const;
type ImportantContractLabel = (typeof IMPORTANT_CONTRACT_LABELS)[number];
const OPTIONAL_CONTRACT_CLAUSE_LABELS = ["특약", "자동연장", "원상복구", "수선 책임"] as const;

function isImportantContractLabel(label: string): label is ImportantContractLabel {
  return IMPORTANT_CONTRACT_LABELS.includes(label as ImportantContractLabel);
}

function isOptionalContractClauseLabel(label: string) {
  return OPTIONAL_CONTRACT_CLAUSE_LABELS.includes(label as (typeof OPTIONAL_CONTRACT_CLAUSE_LABELS)[number]);
}

function contractReviewItems(items: ManagerContractDetailResult["extraction"]["items"]) {
  return items.filter((item) => isImportantContractLabel(item.label));
}

export const dynamic = "force-dynamic";

async function confirmContractAction(formData: FormData) {
  "use server";

  const contractId = String(formData.get("contractId") ?? "");
  let failure: { message: string } | undefined;

  try {
    await confirmManagerContract(contractId);
  } catch (error) {
    const message = error instanceof ApiError && error.message.trim()
      ? error.message
      : "계약을 확정하지 못했습니다. 보증금과 특약 조항을 확인한 뒤 다시 시도해 주세요.";
    failure = { message };
  }

  if (failure) {
    redirect(confirmationFailureUrl(contractId, failure.message));
  }

  redirect(`${MANAGER_CONTRACT_ROUTES["M-DOC-00"]}?focus=${encodeURIComponent(contractId)}`);
}

function confirmationFailureUrl(contractId: string, message: string) {
  const params = new URLSearchParams({
    id: contractId,
    confirmError: message.slice(0, 240),
  });

  return `${MANAGER_CONTRACT_ROUTES["M-DOC-01"]}?${params.toString()}#contract-confirm-error`;
}

async function updateManualCorrectionAction(formData: FormData) {
  "use server";

  const contractId = String(formData.get("contractId") ?? "");
  const detailUrl = `${MANAGER_CONTRACT_ROUTES["M-DOC-01"]}?id=${encodeURIComponent(contractId)}`;

  try {
    await updateManagerContractManualValues(contractId, {
      deposit: textValue(formData, "deposit"),
      specialTerms: textValue(formData, "specialTerms"),
      autoRenewal: textValue(formData, "autoRenewal"),
      restorationDuty: textValue(formData, "restorationDuty"),
      repairDuty: textValue(formData, "repairDuty"),
    });
  } catch (error) {
    const message = error instanceof ApiError
      ? error.message
      : "수정한 계약값을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    redirect(`${detailUrl}&error=${encodeURIComponent(message)}`);
  }

  redirect(`${MANAGER_CONTRACT_ROUTES["M-DOC-01"]}?id=${encodeURIComponent(contractId)}&source=manual-saved`);
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const {
    id,
    source: sourceParam,
    error: errorParam,
    confirmError: confirmErrorParam,
  } = await searchParams;
  const detail = await getManagerContractDetail(id);
  const source = ocrSource(detail.extraction.highlights);
  const failureInfo = source.kind === "mock" ? ocrFailureInfo(detail.extraction.highlights) : undefined;
  const valueRows = buildValueRows(detail, source.kind);
  const reviewItems = contractReviewItems(detail.extraction.items);
  const needsCheckCount = reviewItems.filter((item) => item.needsCheck).length;
  const notice = pageNotice(sourceParam);
  const saveError = errorParam?.trim().slice(0, 240);
  const confirmError = confirmErrorParam?.trim().slice(0, 240);

  return (
    <ContractShell id="M-DOC-01" title="계약서 OCR 검토·확정">
      <PageStack>
        {failureInfo ? <OcrFailureCard info={failureInfo} /> : null}

        {notice ? (
          <Card style={noticeCardStyle}>
            <CheckCircle2 size={18} strokeWidth={2.5} aria-hidden="true" />
            <strong>{notice}</strong>
          </Card>
        ) : null}

        {saveError ? (
          <div role="alert" aria-live="polite">
            <Card style={saveErrorCardStyle}>
              <AlertTriangle size={18} strokeWidth={2.5} color="var(--error)" aria-hidden="true" />
              <div style={saveErrorTextStyle}>
                <strong>수정 저장 실패</strong>
                <span>{saveError}</span>
              </div>
            </Card>
          </div>
        ) : null}

        {confirmError ? (
          <>
            <ContractConfirmErrorFocus targetId="contract-confirm-error" />
            <div id="contract-confirm-error" role="alert" aria-live="assertive" tabIndex={-1}>
              <Card style={confirmErrorCardStyle}>
                <AlertTriangle size={20} strokeWidth={2.5} color="var(--error)" aria-hidden="true" />
                <div style={confirmErrorTextStyle}>
                  <strong>검토 확정 실패</strong>
                  <span>{confirmError}</span>
                  <span style={confirmErrorHintStyle}>
                    이 화면에서는 계약서 원문 확인이 필요한 보증금·특약성 조항만 확정합니다. 확인 필요 항목은 원문과 대조했다는 확인이 필요합니다.
                  </span>
                </div>
              </Card>
            </div>
          </>
        ) : null}

        <div style={ocrWorkspaceStyle}>
          <ContractDocumentPreview detail={detail} sourceLabel={source.label} />
          <Card style={coreReviewCardStyle}>
            <div style={coreReviewHeaderStyle}>
              <div>
                <h2 style={coreReviewTitleStyle}>계약서 핵심 항목 검토</h2>
                <p style={coreReviewCaptionStyle}>원문과 대조해야 하는 보증금·특약성 조항만 확인하세요.</p>
              </div>
              <Badge emphasis={needsCheckCount > 0}>{needsCheckCount ? `확인 필요 ${needsCheckCount}` : "확정 가능"}</Badge>
            </div>
            <ComparisonTable rows={valueRows} />
          </Card>
        </div>

        <Section title="보증금·특약 수정">
          <ManualCorrectionForm detail={detail} sourceKind={source.kind} />
        </Section>

        <Card style={footerCardStyle}>
          <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "center" }}>
            {needsCheckCount ? (
              <AlertTriangle size={20} strokeWidth={2.5} color="var(--primary)" aria-hidden="true" />
            ) : (
              <CheckCircle2 size={20} strokeWidth={2.5} color="var(--primary)" aria-hidden="true" />
            )}
            <div>
              <div style={{ fontWeight: 900 }}>{needsCheckCount ? "확정 전 확인이 남아 있습니다" : "확정 가능한 상태입니다"}</div>
              <div style={captionStyle}>수정 저장 후 검토 확정을 누르면 보증금·특약 검토값으로 사용됩니다.</div>
            </div>
          </div>
          <form action={confirmContractAction}>
            <input type="hidden" name="contractId" value={detail.row.contract.id} />
            <StaticButton type="submit" style={{ gap: "var(--space-xs)" }}>
              <ShieldCheck size={16} strokeWidth={2.5} aria-hidden="true" />
              <span>검토 확정</span>
            </StaticButton>
          </form>
        </Card>
      </PageStack>
    </ContractShell>
  );
}

function ContractDocumentPreview({
  detail,
  sourceLabel,
}: {
  detail: ManagerContractDetailResult;
  sourceLabel: string;
}) {
  const document = detail.currentDocument;
  const previewUrl = contractDocumentPreviewUrl(document);
  const previewKind = contractDocumentPreviewKind(document);

  return (
    <Card style={documentPreviewCardStyle}>
      <div style={documentPreviewHeaderStyle}>
        <div>
          <h2 style={coreReviewTitleStyle}>계약서 이미지</h2>
          <p style={coreReviewCaptionStyle}>{document?.fileName ?? `${detail.row.buildingName} ${detail.row.contract.unitId}호`}</p>
        </div>
        <div style={documentChipRowStyle}>
          <Badge emphasis>{sourceLabel}</Badge>
          <Badge>{previewKind === "image" ? "이미지 원문" : "PDF 원문"}</Badge>
        </div>
      </div>
      <div style={documentFrameStyle}>
        {previewUrl ? (
          previewKind === "image" ? (
            <img src={previewUrl} alt="계약서 원문 미리보기" style={documentImageStyle} />
          ) : (
            <iframe title="계약서 PDF 원문 미리보기" src={pdfPreviewSrc(previewUrl)} style={documentIframeStyle} />
          )
        ) : (
          <ContractDocumentFallback tenantName={detail.row.tenantName} />
        )}
      </div>
    </Card>
  );
}

function ContractDocumentFallback({ tenantName }: { tenantName: string }) {
  return (
    <div style={documentPageStyle} aria-label="계약서 원문 미리보기">
      <div style={documentTitleStyle}>계약(해약) 사실확인원</div>
      <div style={docLineMidStyle} />
      <div style={docLineStyle} />
      <div style={docLineShortStyle} />
      <div style={depositHighlightStyle}>
        <span>보증금 근거</span>
      </div>
      <div style={{ ...docLineStyle, marginTop: 88 }} />
      <div style={docLineMidStyle} />
      <div style={docLineShortStyle} />
      <div style={clauseHighlightStyle}>
        <span>특약성 조항 영역</span>
      </div>
      <div style={{ ...docLineStyle, marginTop: 92 }} />
      <div style={docLineMidStyle} />
      <div style={docLineStyle} />
      <div style={documentMetaStyle}>
        <strong>{tenantName}</strong>
        <span>원문 파일 없음</span>
      </div>
    </div>
  );
}

function contractDocumentPreviewUrl(document: ManagerContractDetailResult["currentDocument"]) {
  const fileUrl = document?.fileUrl?.trim();
  const fileName = document?.fileName?.trim();

  if (fileUrl && /^https?:\/\//i.test(fileUrl)) return fileUrl;
  if (fileUrl?.startsWith("/api/files/")) return fileUrl;
  if (fileUrl?.startsWith("api/files/")) return `/${fileUrl}`;
  if (fileUrl?.startsWith("/uploads/")) {
    return `/api/files/${encodeFilePath(fileName || fileUrl.slice("/uploads/".length))}`;
  }
  if (fileUrl?.startsWith("/")) return fileUrl;
  if (fileUrl) return `/api/files/${encodeFilePath(fileUrl)}`;
  if (fileName) return `/api/files/${encodeFilePath(fileName)}`;

  return "";
}

function contractDocumentPreviewKind(document: ManagerContractDetailResult["currentDocument"]) {
  const value = `${document?.fileName ?? ""} ${document?.fileUrl ?? ""}`.toLowerCase();
  return /\.(png|jpe?g|webp|gif|bmp|avif)(\?|#|$)/i.test(value) ? "image" : "pdf";
}

function pdfPreviewSrc(url: string) {
  return url.includes("#") ? url : `${url}#toolbar=1&navpanes=0&view=FitH`;
}

function encodeFilePath(value: string) {
  return value
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function ComparisonTable({ rows }: { rows: ValueRow[] }) {
  return (
    <div style={coreReviewListStyle}>
      {rows.map((row) => {
        const hasDetails =
          row.ocrDetails.length > 0 ||
          row.dbDetails.length > 0 ||
          row.validationMessages.length > 0 ||
          Boolean(row.evidence?.trim());

        return (
          <article key={row.label} style={coreReviewItemStyle}>
            <div style={coreReviewItemTopStyle}>
              <span style={coreReviewItemTitleStyle}>{row.label}</span>
              <div style={coreReviewStatusStyle}>
                <Badge emphasis={row.statusEmphasis}>{row.status}</Badge>
                {row.validationMessages.length ? (
                  <span style={validationCountStyle}>검증 사유 {row.validationMessages.length}</span>
                ) : null}
              </div>
            </div>
            <div style={compareGridStyle}>
              <div style={compareBoxStyle}>
                <span style={compareLabelStyle}>OCR 요약</span>
                <ValueText value={row.ocrValue} />
              </div>
              <div style={compareBoxStyle}>
                <span style={compareLabelStyle}>저장값 요약</span>
                <ValueText value={row.dbValue} />
              </div>
              <div style={compareBoxStrongStyle}>
                <span style={compareLabelStyle}>최종값</span>
                <ValueText value={row.finalValue} strong />
                <span style={finalSourceStyle}>{row.finalSource}</span>
              </div>
            </div>
            {row.evidence ? <div style={coreEvidenceStyle}>{row.evidence}</div> : null}
            {hasDetails ? (
              <details style={coreDetailsStyle}>
                <summary style={coreDetailsSummaryStyle}>상세 보기</summary>
                <RowDetailPanel row={row} />
              </details>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function RowDetailPanel({ row }: { row: ValueRow }) {
  return (
    <div style={rowDetailWrapStyle}>
      {row.validationMessages.length ? (
        <div style={validationPanelStyle}>
          <span style={validationTitleStyle}>자동 검증 사유</span>
          <ul style={validationListStyle}>
            {row.validationMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div style={rowDetailPanelStyle}>
        <DetailGroup title="OCR 분석" summary={row.ocrValue} details={row.ocrDetails} evidence={row.evidence} />
        <DetailGroup title="저장값" summary={row.dbValue} details={row.dbDetails} />
      </div>
    </div>
  );
}

function DetailGroup({
  title,
  summary,
  details,
  evidence,
  strong = false,
}: {
  title: string;
  summary: string;
  details: ValueDetail[];
  evidence?: string;
  strong?: boolean;
}) {
  return (
    <div style={detailGroupStyle}>
      <div style={detailGroupHeaderStyle}>
        <span style={detailGroupTitleStyle}>{title}</span>
        <ValueText value={summary} strong={strong} />
      </div>
      {details.length ? (
        <dl style={detailListStyle}>
          {details.map((detail) => (
            <div key={`${detail.label}-${detail.value}`} style={detailItemStyle}>
              <dt style={detailLabelStyle}>{detail.label}</dt>
              <dd style={detailValueStyle}>{detail.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div style={emptyDetailStyle}>분리된 세부값 없음</div>
      )}
      {evidence ? (
        <div style={evidencePanelStyle}>
          <span style={detailLabelStyle}>근거 문장</span>
          <span>{evidence}</span>
        </div>
      ) : null}
    </div>
  );
}

function ValueText({ value, strong = false }: { value: string; strong?: boolean }) {
  return (
    <span
      style={{
        color: isMissingDisplayValue(value) || value === "직접 입력 필요" || isDocumentAbsentValue(value)
          ? "var(--on-surface-variant)"
          : "var(--on-surface)",
        fontWeight: strong ? 900 : 700,
      }}
    >
      {value}
    </span>
  );
}

function ManualCorrectionForm({ detail, sourceKind }: { detail: ManagerContractDetailResult; sourceKind: OcrSourceKind }) {
  const values = manualDefaults(detail, sourceKind);

  return (
    <Card style={manualCardStyle}>
      <div style={manualHeaderStyle}>
        <div style={{ fontWeight: 900 }}>계약서 원문에서 중요한 부분만 고칩니다</div>
        <p style={mutedBodyStyle}>월세·관리비·기간·납부일·주소는 매물 DB 값을 사용하고, 보증금과 특약성 조항만 원문 기준으로 저장하세요.</p>
      </div>
      <form action={updateManualCorrectionAction} style={{ display: "grid", gap: "var(--space-md)" }}>
        <input type="hidden" name="contractId" value={detail.row.contract.id} />
        <div style={correctionGroupGridStyle}>
          <CorrectionGroup title="보증금" note="기본 보증금, 전환보증금, 최종 보증금처럼 계약서에 적힌 보증금 구조를 그대로 남깁니다.">
            <CorrectionField fieldId="contract-field-deposit" label="보증금">
              <textarea id="contract-field-deposit" name="deposit" defaultValue={values.deposit} placeholder="예: 기본 36,288,000원; 전환보증금 17,000,000원; 전환 후 53,288,000원" style={correctionTextareaStyle} />
            </CorrectionField>
          </CorrectionGroup>

          <CorrectionGroup title="특약·책임 조항" note="특약, 자동연장, 원상복구, 수선 책임처럼 분쟁 기준이 되는 조항만 원문 기준으로 정리합니다.">
            <CorrectionField fieldId="contract-field-specialTerms" label="특약">
              <textarea id="contract-field-specialTerms" name="specialTerms" defaultValue={values.specialTerms} placeholder="예: 임대인·임차인 특약사항, 보증금 반환/공제 조건, 추가 약정" style={correctionTextareaStyle} />
            </CorrectionField>
            <div style={twoColumnFieldStyle}>
              <CorrectionField fieldId="contract-field-autoRenewal" label="자동연장">
                <textarea id="contract-field-autoRenewal" name="autoRenewal" defaultValue={values.autoRenewal} placeholder="예: 자동연장/갱신 여부, 통지 기한" style={correctionTextareaStyle} />
              </CorrectionField>
              <CorrectionField fieldId="contract-field-restorationDuty" label="원상복구">
                <textarea id="contract-field-restorationDuty" name="restorationDuty" defaultValue={values.restorationDuty} placeholder="예: 퇴실 시 원상복구 범위와 예외" style={correctionTextareaStyle} />
              </CorrectionField>
            </div>
            <CorrectionField fieldId="contract-field-repairDuty" label="수선 책임">
              <textarea id="contract-field-repairDuty" name="repairDuty" defaultValue={values.repairDuty} placeholder="예: 하자·수선 발생 시 비용 부담 주체" style={correctionTextareaStyle} />
            </CorrectionField>
          </CorrectionGroup>
        </div>
        <div style={manualSubmitRowStyle}>
          <StaticButton type="submit" style={{ gap: "var(--space-xs)" }}>
            <CheckCircle2 size={16} strokeWidth={2.5} aria-hidden="true" />
            <span>수정 저장</span>
          </StaticButton>
        </div>
      </form>
    </Card>
  );
}

function CorrectionGroup({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section style={correctionGroupStyle}>
      <div style={correctionGroupHeaderStyle}>
        <strong>{title}</strong>
        <span style={correctionGroupNoteStyle}>{note}</span>
      </div>
      <div style={correctionGroupBodyStyle}>{children}</div>
    </section>
  );
}

function CorrectionField({
  fieldId,
  label,
  error,
  children,
}: {
  fieldId: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={fieldId} style={correctionFieldStyle}>
      <span>{label}</span>
      {children}
      {error ? (
        <span id={`${fieldId}-error`} style={correctionFieldErrorStyle}>
          {error}
        </span>
      ) : null}
    </label>
  );
}

function OcrFailureCard({ info }: { info: OcrFailureInfo }) {
  return (
    <Card style={ocrFailureCardStyle}>
      <AlertTriangle size={20} strokeWidth={2.5} color="#dc2626" aria-hidden="true" />
      <div style={ocrFailureTextStyle}>
        <strong>실제 OCR 결과를 사용하지 못했습니다</strong>
        <span>{info.reason}</span>
        <span style={ocrFailureHintStyle}>
          현재 표의 OCR 요약은 신뢰하지 않고, 계약서 원문을 보며 보증금과 특약성 조항을 직접 정리해야 합니다.
        </span>
      </div>
    </Card>
  );
}

type ValueRow = {
  label: string;
  ocrValue: string;
  dbValue: string;
  finalValue: string;
  finalSource: string;
  status: string;
  statusEmphasis: boolean;
  evidence?: string;
  ocrDetails: ValueDetail[];
  dbDetails: ValueDetail[];
  validationMessages: string[];
};

type ValueDetail = {
  label: string;
  value: string;
};

type OcrSourceKind = "openai" | "mock" | "initial";
type OcrFailureInfo = {
  reason: string;
};

function buildValueRows(detail: ManagerContractDetailResult, sourceKind: OcrSourceKind): ValueRow[] {
  return [
    makeValueRow(detail, "보증금", storedManualValue(detail, "보증금", detail.manualValues.deposit), sourceKind),
    makeValueRow(detail, "특약", storedManualValue(detail, "특약", detail.manualValues.specialTerms), sourceKind),
    makeValueRow(detail, "자동연장", "", sourceKind),
    makeValueRow(detail, "원상복구", "", sourceKind),
    makeValueRow(detail, "수선 책임", "", sourceKind),
  ];
}

function makeValueRow(
  detail: ManagerContractDetailResult,
  label: string,
  dbValue: string,
  sourceKind: OcrSourceKind,
): ValueRow {
  const item = detail.extraction.items.find((candidate) => candidate.label === label);
  const ocrFailed = sourceKind === "mock";
  const normalizedDbValue = dbValue.trim();
  const rawItemValue = item?.value?.trim();
  const initialMissingOcrLeftover = Boolean(item && isMissingDisplayValue(rawItemValue) && !item.evidence?.trim());
  const inferredDocumentAbsent =
    sourceKind === "openai" &&
    isOptionalContractClauseLabel(label) &&
    !normalizedDbValue &&
    (!item || initialMissingOcrLeftover);
  const rawOcrValue = inferredDocumentAbsent ? DOCUMENT_ABSENT_VALUE : rawItemValue || "미확인";
  const validationMessages = validationMessagesFromEvidence(ocrFailed ? undefined : item?.evidence);
  const hasUsableOcrValue = !isMissingDisplayValue(rawOcrValue);
  const hasDbValue = Boolean(normalizedDbValue);
  const shouldPreferDbValue = hasDbValue && (ocrFailed || Boolean(item?.needsCheck) || validationMessages.length > 0);
  const finalRawValue = shouldPreferDbValue
    ? normalizedDbValue
    : hasUsableOcrValue
      ? rawOcrValue
      : normalizedDbValue || "직접 입력 필요";
  const missingFinal = isMissingDisplayValue(finalRawValue) || finalRawValue === "직접 입력 필요";
  const documentAbsent = isDocumentAbsentValue(finalRawValue);
  const finalSource = missingFinal
    ? "직접 입력 필요"
    : documentAbsent
      ? "원문에 해당 조항 없음"
    : shouldPreferDbValue
      ? ocrFailed
        ? "OCR 실패로 저장값 사용"
        : "확인 필요 OCR 대신 저장값 사용"
      : hasUsableOcrValue
        ? "OCR값 사용"
        : hasDbValue
          ? "저장값 사용"
          : "직접 입력 필요";
  const displayOcrValue = ocrFailed ? "OCR 실패 - 미추출" : summarizeContractValue(label, rawOcrValue);
  const displayDbValue = normalizedDbValue ? summarizeContractValue(label, normalizedDbValue) : "없음";
  const displayFinalValue = summarizeContractValue(label, finalRawValue);

  return {
    label,
    ocrValue: displayOcrValue,
    dbValue: displayDbValue,
    finalValue: displayFinalValue,
    finalSource,
    status: documentAbsent ? "해당 없음" : missingFinal ? "부족" : ocrFailed ? "원문 확인" : item?.needsCheck ? "확인 필요" : "확인",
    statusEmphasis: !documentAbsent && (missingFinal || (!ocrFailed && Boolean(item?.needsCheck))),
    evidence: ocrFailed ? undefined : item?.evidence ?? (inferredDocumentAbsent ? "성공한 OCR에서 해당 조항을 찾지 못했습니다." : undefined),
    ocrDetails: ocrFailed ? [] : contractValueDetails(label, rawOcrValue),
    dbDetails: contractValueDetails(label, normalizedDbValue),
    validationMessages,
  };
}

function validationMessagesFromEvidence(evidence?: string) {
  if (!evidence?.trim()) return [];

  return evidence
    .split(/\s*\/\s*/)
    .map((part) => part.trim())
    .filter((part) => part.startsWith("검증:"))
    .map((part) => part.replace(/^검증:\s*/, ""))
    .filter(Boolean);
}

function summarizeContractValue(label: string, value: string) {
  const normalized = value.trim();
  if (!normalized) return "없음";
  if (isDocumentAbsentValue(normalized)) return DOCUMENT_ABSENT_VALUE;
  if (isMissingDisplayValue(normalized) || normalized === "직접 입력 필요") return normalized;

  if (label === "보증금") {
    return preferredMoneySummary(normalized, ["전환 후", "임대보증금", "보증금", "기본"]);
  }

  return normalized;
}

function preferredMoneySummary(value: string, labels: string[]) {
  for (const label of labels) {
    const match = value.match(new RegExp(`${escapeRegExp(label)}\\s*([\\d,]+원)`));
    if (match?.[1]) return `${label} ${match[1]}`;
  }

  const amounts = value.match(/[\d,]+원/g);
  if (amounts?.length) return amounts[amounts.length - 1] ?? value;
  return value;
}

function contractValueDetails(label: string, value: string): ValueDetail[] {
  const normalized = value.trim();
  if (!normalized || isMissingDisplayValue(normalized) || normalized === "직접 입력 필요") return [];
  if (isDocumentAbsentValue(normalized)) return [{ label: "판정", value: "원문에 해당 조항 없음" }];

  if (label === "보증금") return moneyDetails(normalized, ["기본", "전환보증금", "전환 후", "임대보증금", "보증금"]);
  if (["특약", "자동연장", "원상복구", "수선 책임"].includes(label)) return [{ label: "조항 요약", value: normalized }];

  return [];
}

function moneyDetails(value: string, labels: string[]): ValueDetail[] {
  const details: ValueDetail[] = [];

  for (const label of labels) {
    const match = value.match(new RegExp(`${escapeRegExp(label)}\\s*([\\d,]+원)`));
    if (match?.[1] && !details.some((detail) => detail.label === label)) {
      details.push({ label, value: match[1] });
    }
  }

  if (details.length) return details;

  const amounts = value.match(/[\d,]+원/g) ?? [];
  return amounts.map((amount, index) => ({ label: `후보 ${index + 1}`, value: amount }));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function manualDefaults(detail: ManagerContractDetailResult, sourceKind: OcrSourceKind) {
  return {
    deposit:
      storedManualValue(detail, "보증금", detail.manualValues.deposit) ||
      textInputCandidate(detail, "보증금", sourceKind),
    specialTerms:
      storedManualValue(detail, "특약", detail.manualValues.specialTerms) ||
      textInputCandidate(detail, "특약", sourceKind),
    autoRenewal: textInputCandidate(detail, "자동연장", sourceKind),
    restorationDuty: textInputCandidate(detail, "원상복구", sourceKind),
    repairDuty: textInputCandidate(detail, "수선 책임", sourceKind),
  };
}

function extractionItem(detail: ManagerContractDetailResult, label: string) {
  return detail.extraction.items.find((item) => item.label === label);
}

function storedManualValue(detail: ManagerContractDetailResult, label: string, value?: string) {
  if (isMockOnlyExtractionItem(extractionItem(detail, label))) return "";
  return manualInputValue(value);
}

function textInputCandidate(detail: ManagerContractDetailResult, label: string, sourceKind: OcrSourceKind) {
  const item = extractionItem(detail, label);
  const value = item?.value?.trim() ?? "";
  if (sourceKind === "mock" && isMockOnlyExtractionItem(item)) return "";
  return isMissingDisplayValue(value) ? "" : value;
}

function isMissingDisplayValue(value?: string) {
  const normalized = value?.trim();
  return !normalized || normalized === "미확인" || normalized === "원문 확인 필요" || normalized === "관리자 수동값 없음" || normalized === "없음";
}

function isDocumentAbsentValue(value?: string) {
  const normalized = value?.replace(/\s+/g, "").trim();
  return normalized === "문서에없음" || normalized === "해당없음" || normalized === "해당사항없음";
}

function textValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function manualInputValue(value?: string) {
  return value && value !== "관리자 수동값 없음" ? value : "";
}

function isMockOnlyExtractionItem(item?: ManagerContractDetailResult["extraction"]["items"][number]) {
  const evidence = item?.evidence ?? "";
  if (/관리자 수동 입력|OCR 미확인으로 기존 DB 계약값 유지/i.test(evidence)) return false;
  return /mock OCR|실제 OCR 실패\/미설정/i.test(evidence);
}

function ocrSource(highlights: string[]) {
  const text = highlights.join(" ");

  if (/실제 OCR 실패|mock OCR|mock|fallback|대체|OPENAI_API_KEY|호출에 실패|실행하지 못/i.test(text)) {
    return {
      kind: "mock" as const,
      label: "실제 OCR 실패",
      note: "키 없음 또는 호출 실패",
      emphasis: true,
    };
  }

  if (/실제 OCR 완료|OpenAI 원문|OpenAI OCR 완료/i.test(text)) {
    return {
      kind: "openai" as const,
      label: "실제 OCR",
      note: "OpenAI 원문 분석",
      emphasis: true,
    };
  }

  return {
    kind: "initial" as const,
    label: "초기 추출",
    note: "OCR 실행 전",
    emphasis: false,
  };
}

function ocrFailureInfo(highlights: string[]): OcrFailureInfo {
  const text = highlights.join(" ").replace(/\s+/g, " ").trim();
  const firstHighlight = highlights.find((highlight) => highlight.trim())?.trim();

  if (/OPENAI_API_KEY/i.test(text)) {
    return { reason: "OPENAI_API_KEY가 없어서 실제 OCR을 실행하지 못했습니다." };
  }

  const statusMatch = text.match(/OpenAI contract OCR failed with\s+\d+[^·]*/i);
  if (statusMatch?.[0]) {
    return { reason: statusMatch[0].trim() };
  }

  if (/model|모델/i.test(text)) {
    return { reason: "OCR 모델 설정 또는 호출 과정에서 실패했습니다." };
  }

  if (/호출|실패|fallback|mock/i.test(text)) {
    return { reason: firstHighlight || "OpenAI OCR 호출에 실패해 mock 결과로 대체되었습니다." };
  }

  return { reason: "실제 OCR 결과가 없어 mock 또는 기존 값 기반으로 표시 중입니다." };
}

function pageNotice(sourceParam?: string) {
  if (sourceParam === "manual-saved") return "수정한 보증금·특약 검토값을 저장했습니다.";
  if (sourceParam === "ocr-first") return "계약서 입력 후 OCR 분석을 실행했습니다. 보증금과 특약성 조항만 확인해 주세요.";
  return "";
}

const ocrWorkspaceStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 520px), 1fr))",
  gap: "var(--space-lg)",
  alignItems: "stretch",
} as const;

const documentPreviewCardStyle = {
  display: "grid",
  gridTemplateRows: "auto 1fr",
  gap: "var(--space-md)",
  minHeight: 680,
  padding: "var(--space-lg)",
  background: "linear-gradient(180deg, var(--surface-container-lowest), var(--surface-container-low))",
  boxShadow: "inset 0 0 0 12px var(--surface-container-low)",
} as const;

const documentPreviewHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "var(--space-md)",
  flexWrap: "wrap",
} as const;

const documentChipRowStyle = {
  display: "flex",
  gap: "var(--space-xs)",
  flexWrap: "wrap",
  justifyContent: "flex-end",
} as const;

const documentFrameStyle = {
  display: "grid",
  minHeight: 560,
} as const;

const documentIframeStyle = {
  width: "100%",
  minHeight: 560,
  height: "100%",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--surface-container-lowest)",
} as const;

const documentImageStyle = {
  width: "100%",
  minHeight: 560,
  height: "100%",
  objectFit: "contain",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--surface-container-lowest)",
} as const;

const documentPageStyle = {
  position: "relative",
  display: "grid",
  alignContent: "start",
  minHeight: 560,
  overflow: "hidden",
  padding: "32px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--surface-container-lowest)",
  boxShadow: "0 20px 44px rgba(15, 23, 42, 0.08)",
} as const;

const documentTitleStyle = {
  margin: "4px 0 28px",
  textAlign: "center",
  color: "var(--on-surface)",
  fontSize: "var(--fs-subtitle)",
  fontWeight: 900,
  lineHeight: "var(--lh-title)",
} as const;

const docLineStyle = {
  height: 13,
  margin: "14px 0",
  borderRadius: 2,
  background: "var(--surface-container-high)",
} as const;

const docLineMidStyle = {
  ...docLineStyle,
  width: "78%",
} as const;

const docLineShortStyle = {
  ...docLineStyle,
  width: "58%",
} as const;

const depositHighlightStyle = {
  position: "absolute",
  top: 214,
  left: 58,
  right: 58,
  display: "flex",
  alignItems: "center",
  height: 48,
  padding: "0 var(--space-sm)",
  border: "2px solid var(--primary)",
  borderRadius: "var(--radius-sm)",
  color: "var(--primary)",
  background: "rgba(92, 69, 217, 0.08)",
  fontSize: "var(--fs-caption)",
  fontWeight: 900,
} as const;

const clauseHighlightStyle = {
  ...depositHighlightStyle,
  top: 384,
  borderColor: "#18a36d",
  color: "#047857",
  background: "rgba(18, 128, 92, 0.08)",
} as const;

const documentMetaStyle = {
  position: "absolute",
  right: 32,
  bottom: 28,
  display: "grid",
  gap: 4,
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  textAlign: "right",
} as const;

const coreReviewCardStyle = {
  display: "grid",
  gridTemplateRows: "auto 1fr",
  gap: "var(--space-md)",
  minHeight: 680,
  padding: "var(--space-lg)",
} as const;

const coreReviewHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "var(--space-md)",
  flexWrap: "wrap",
} as const;

const coreReviewTitleStyle = {
  margin: 0,
  color: "var(--on-surface)",
  fontSize: "var(--fs-subtitle)",
  lineHeight: "var(--lh-title)",
  fontWeight: 900,
} as const;

const coreReviewCaptionStyle = {
  margin: "var(--space-xs) 0 0",
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  lineHeight: "var(--lh-body)",
} as const;

const noticeCardStyle = {
  display: "flex",
  gap: "var(--space-sm)",
  alignItems: "center",
  color: "var(--on-primary-container)",
  background: "var(--primary-container)",
} as const;

const saveErrorCardStyle = {
  display: "flex",
  gap: "var(--space-sm)",
  alignItems: "flex-start",
  color: "var(--on-error-container)",
  background: "var(--error-container)",
  borderColor: "var(--error)",
} as const;

const saveErrorTextStyle = {
  display: "grid",
  gap: "var(--space-xs)",
  lineHeight: "var(--lh-body)",
} as const;

const confirmErrorCardStyle = {
  display: "flex",
  gap: "var(--space-sm)",
  alignItems: "flex-start",
  color: "var(--on-error-container)",
  background: "var(--error-container)",
  borderColor: "var(--error)",
} as const;

const confirmErrorTextStyle = {
  display: "grid",
  gap: "var(--space-sm)",
  width: "100%",
  lineHeight: "var(--lh-body)",
} as const;

const confirmErrorHintStyle = {
  fontSize: "var(--fs-caption)",
  fontWeight: 800,
} as const;

const ocrFailureCardStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: "var(--space-sm)",
  padding: "var(--space-md)",
  border: "1px solid rgba(220, 38, 38, 0.28)",
  background: "rgba(254, 242, 242, 0.88)",
} as const;

const ocrFailureTextStyle = {
  display: "grid",
  gap: 4,
  color: "#991b1b",
  lineHeight: "var(--lh-body)",
} as const;

const ocrFailureHintStyle = {
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  fontWeight: 800,
} as const;

const coreReviewListStyle = {
  display: "grid",
  gap: "var(--space-sm)",
  alignContent: "start",
} as const;

const coreReviewItemStyle = {
  display: "grid",
  gap: "var(--space-sm)",
  padding: "var(--space-md)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-container-lowest)",
} as const;

const coreReviewItemTopStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "var(--space-sm)",
  flexWrap: "wrap",
} as const;

const coreReviewItemTitleStyle = {
  color: "var(--on-surface)",
  fontSize: "var(--fs-body)",
  fontWeight: 900,
} as const;

const coreReviewStatusStyle = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-xs)",
  flexWrap: "wrap",
  justifyContent: "flex-end",
} as const;

const validationCountStyle = {
  color: "var(--danger, #dc2626)",
  fontSize: "var(--fs-caption)",
  fontWeight: 900,
  whiteSpace: "nowrap",
} as const;

const compareGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))",
  gap: "var(--space-xs)",
} as const;

const compareBoxStyle = {
  display: "grid",
  gap: 6,
  alignContent: "start",
  minHeight: 92,
  padding: "var(--space-sm)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--surface-container-low)",
  lineHeight: "var(--lh-body)",
} as const;

const compareBoxStrongStyle = {
  ...compareBoxStyle,
  borderColor: "rgba(92, 69, 217, 0.42)",
  background: "var(--primary-container)",
} as const;

const compareLabelStyle = {
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  fontWeight: 900,
} as const;

const finalSourceStyle = {
  width: "fit-content",
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  fontWeight: 800,
  lineHeight: "var(--lh-caption)",
} as const;

const coreEvidenceStyle = {
  padding: "var(--space-sm)",
  borderRadius: "var(--radius-sm)",
  color: "var(--on-surface-variant)",
  background: "var(--surface-container-low)",
  fontSize: "var(--fs-caption)",
  fontWeight: 800,
  lineHeight: "var(--lh-body)",
} as const;

const coreDetailsStyle = {
  display: "grid",
  gap: "var(--space-sm)",
} as const;

const coreDetailsSummaryStyle = {
  width: "fit-content",
  cursor: "pointer",
  color: "var(--primary)",
  fontSize: "var(--fs-caption)",
  fontWeight: 800,
  padding: "var(--space-xs) var(--space-sm)",
  borderRadius: "999px",
  background: "var(--primary-container)",
} as const;

const rowDetailWrapStyle = {
  display: "grid",
  gap: "var(--space-md)",
  marginTop: "var(--space-sm)",
} as const;

const rowDetailPanelStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "var(--space-md)",
} as const;

const validationPanelStyle = {
  display: "grid",
  gap: "var(--space-xs)",
  padding: "var(--space-md)",
  border: "1px solid rgba(220, 38, 38, 0.28)",
  borderRadius: "var(--radius-md)",
  background: "rgba(254, 242, 242, 0.88)",
  color: "#991b1b",
} as const;

const validationTitleStyle = {
  fontSize: "var(--fs-caption)",
  fontWeight: 900,
} as const;

const validationListStyle = {
  display: "grid",
  gap: 4,
  margin: 0,
  paddingLeft: "1.1rem",
  fontSize: "var(--fs-caption)",
  fontWeight: 800,
  lineHeight: "var(--lh-body)",
} as const;

const detailGroupStyle = {
  display: "grid",
  gap: "var(--space-sm)",
  padding: "var(--space-md)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-container-low)",
} as const;

const detailGroupHeaderStyle = {
  display: "grid",
  gap: 4,
} as const;

const detailGroupTitleStyle = {
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  fontWeight: 900,
} as const;

const detailListStyle = {
  display: "grid",
  gap: 6,
  margin: 0,
  padding: 0,
} as const;

const detailItemStyle = {
  display: "grid",
  gridTemplateColumns: "88px minmax(0, 1fr)",
  gap: "var(--space-sm)",
  alignItems: "baseline",
} as const;

const detailLabelStyle = {
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  fontWeight: 800,
} as const;

const detailValueStyle = {
  margin: 0,
  color: "var(--on-surface)",
  fontWeight: 800,
  lineHeight: "var(--lh-body)",
} as const;

const emptyDetailStyle = {
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
} as const;

const evidencePanelStyle = {
  display: "grid",
  gap: 4,
  padding: "var(--space-sm)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  color: "var(--on-surface-variant)",
  background: "var(--surface-container-lowest)",
  fontSize: "var(--fs-caption)",
  lineHeight: "var(--lh-body)",
} as const;

const manualCardStyle = {
  display: "grid",
  gap: "var(--space-lg)",
  borderColor: "var(--border)",
} as const;

const manualHeaderStyle = {
  display: "grid",
  gap: "var(--space-xs)",
} as const;

const correctionGroupGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
  gap: "var(--space-md)",
  alignItems: "stretch",
} as const;

const correctionGroupStyle = {
  display: "grid",
  gridTemplateRows: "auto 1fr",
  gap: "var(--space-md)",
  padding: "var(--space-md)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-container-low)",
} as const;

const correctionGroupHeaderStyle = {
  display: "grid",
  gap: 4,
  color: "var(--on-surface)",
} as const;

const correctionGroupNoteStyle = {
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  lineHeight: "var(--lh-body)",
} as const;

const correctionGroupBodyStyle = {
  display: "grid",
  gap: "var(--space-md)",
  alignContent: "start",
} as const;

const twoColumnFieldStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
  gap: "var(--space-sm)",
} as const;

const correctionFieldStyle = {
  display: "grid",
  gap: "var(--space-xs)",
  fontSize: "var(--fs-caption)",
  fontWeight: 800,
} as const;

const correctionInputStyle = {
  minHeight: "var(--touch-target)",
  width: "100%",
  border: "1px solid var(--input-border)",
  borderRadius: "var(--radius-md)",
  padding: "0 14px",
  color: "var(--input-text)",
  background: "var(--surface-container-lowest)",
  font: "inherit",
  fontWeight: 800,
  scrollMarginTop: "calc(var(--space-xxl) * 3)",
} as const;

function correctionInputStateStyle(hasError: boolean) {
  if (!hasError) return correctionInputStyle;

  return {
    ...correctionInputStyle,
    borderColor: "var(--error)",
  } as const;
}

const correctionFieldErrorStyle = {
  color: "var(--on-error-container)",
  fontSize: "var(--fs-caption)",
  fontWeight: 800,
  lineHeight: "var(--lh-body)",
} as const;

const correctionTextareaStyle = {
  ...correctionInputStyle,
  minHeight: 104,
  padding: "14px",
  resize: "vertical",
  lineHeight: "var(--lh-body)",
} as const;

const manualSubmitRowStyle = {
  display: "flex",
  justifyContent: "flex-end",
} as const;

const footerCardStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "var(--space-md)",
  alignItems: "center",
  flexWrap: "wrap",
  position: "sticky",
  bottom: "var(--space-md)",
  zIndex: 3,
  paddingRight: "min(132px, 24vw)",
  boxShadow: "0 16px 40px rgba(15, 23, 42, 0.12)",
} as const;

const mutedBodyStyle = {
  margin: 0,
  color: "var(--on-surface-variant)",
  lineHeight: "var(--lh-body)",
} as const;
