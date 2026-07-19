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
import { ContractComparisonTableClient } from "./ContractComparisonTableClient";
import { ContractConfirmErrorFocus } from "./ContractConfirmErrorFocus";
import { ContractDocumentPreviewClient } from "./ContractDocumentPreviewClient";

type SearchParams = Promise<{
  id?: string;
  source?: string;
  error?: string;
  confirmError?: string;
}>;
type ManagerContractDetailResult = Awaited<ReturnType<typeof getManagerContractDetail>>;
const DOCUMENT_ABSENT_VALUE = "문서에 없음";
const IMPORTANT_CONTRACT_LABELS = ["보증금", "월세", "납부일", "계약 시작일", "계약 종료일", "특약", "자동연장", "원상복구", "수선 책임"] as const;
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
      : "계약을 확정하지 못했습니다. 계약 핵심 항목을 확인한 뒤 다시 시도해 주세요.";
    failure = { message };
  }

  if (failure) {
    redirect(confirmationFailureUrl(contractId, failure.message));
  }

  redirect(`${MANAGER_CONTRACT_ROUTES["M-DOC-00"]}?focus=${encodeURIComponent(contractId)}&registered=1`);
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
  const startDate = dateValue(formData, "startDate");
  const endDate = dateValue(formData, "endDate");

  if (startDate && endDate && endDate < startDate) {
    redirect(`${detailUrl}&error=${encodeURIComponent("계약 종료일은 시작일보다 빠를 수 없습니다.")}`);
  }

  try {
    await updateManagerContractManualValues(contractId, {
      deposit: textValue(formData, "deposit"),
      monthlyRent: numberValue(formData, "monthlyRent"),
      maintenanceFee: numberValue(formData, "maintenanceFee"),
      paymentDay: numberValue(formData, "paymentDay"),
      startDate,
      endDate,
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
          <ContractDocumentPreview detail={detail} />
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
          <ManualCorrectionForm detail={detail} sourceKind={source.kind} valueRows={valueRows} />
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
}: {
  detail: ManagerContractDetailResult;
}) {
  const document = detail.currentDocument;
  const previewUrl = contractDocumentPreviewUrl(document);
  const previewKind = contractDocumentPreviewKind(document);
  const highlightItems = contractReviewItems(detail.extraction.items).map((item) => ({
    label: item.label,
    value: item.value,
    needsCheck: item.needsCheck,
    regions: item.regions,
  }));

  return (
    <Card style={documentPreviewCardStyle}>
      <div style={documentPreviewHeaderStyle}>
        <div>
          <h2 style={coreReviewTitleStyle}>계약서 이미지</h2>
          <p style={coreReviewCaptionStyle}>{document?.fileName ?? `${detail.row.buildingName} ${detail.row.contract.unitId}호`}</p>
        </div>
      </div>
      <ContractDocumentPreviewClient
        previewUrl={previewUrl}
        previewKind={previewKind}
        tenantName={detail.row.tenantName}
        highlights={highlightItems}
      />
    </Card>
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

function encodeFilePath(value: string) {
  return value
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function ComparisonTable({ rows }: { rows: ValueRow[] }) {
  return <ContractComparisonTableClient rows={rows} />;
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

function ManualCorrectionForm({
  detail,
  sourceKind,
  valueRows,
}: {
  detail: ManagerContractDetailResult;
  sourceKind: OcrSourceKind;
  valueRows: ValueRow[];
}) {
  const values = manualDefaults(detail, sourceKind, valueRows);

  return (
    <Card style={manualCardStyle}>
      <div style={manualHeaderStyle}>
        <div style={{ fontWeight: 900 }}>계약서 원문에서 중요한 부분만 고칩니다</div>
        <p style={mutedBodyStyle}>납부일·주소는 매물 DB 값을 사용하고, 보증금·월 임대료·관리비·계약 기간·특약성 조항만 원문 기준으로 저장하세요.</p>
      </div>
      <form action={updateManualCorrectionAction} style={{ display: "grid", gap: "var(--space-md)" }}>
        <input type="hidden" name="contractId" value={detail.row.contract.id} />
        <div style={correctionGroupGridStyle}>
          <CorrectionGroup title="보증금·월 임대료·관리비·계약 기간·납부일">
            <CorrectionField fieldId="contract-field-deposit" label="보증금">
              <textarea id="contract-field-deposit" name="deposit" defaultValue={values.deposit} placeholder="예: 기본 36,288,000원; 전환보증금 17,000,000원; 전환 후 53,288,000원" style={correctionTextareaStyle} />
            </CorrectionField>
            <div style={correctionSubsectionStyle}>
              <strong>월 임대료·관리비·계약 기간·납부일</strong>
            </div>
            <div style={twoColumnFieldStyle}>
              <CorrectionField fieldId="contract-field-monthlyRent" label="월 임대료">
                <input id="contract-field-monthlyRent" name="monthlyRent" type="text" inputMode="numeric" defaultValue={values.monthlyRent} placeholder="예: 650,000" style={correctionInputStyle} />
              </CorrectionField>
              <CorrectionField fieldId="contract-field-maintenanceFee" label="관리비">
                <input id="contract-field-maintenanceFee" name="maintenanceFee" type="text" inputMode="numeric" defaultValue={values.maintenanceFee} placeholder="예: 70,000" style={correctionInputStyle} />
              </CorrectionField>
            </div>
            <div style={twoColumnFieldStyle}>
              <CorrectionField fieldId="contract-field-startDate" label="계약 시작일">
                <input id="contract-field-startDate" name="startDate" type="date" defaultValue={values.startDate} style={correctionInputStyle} />
              </CorrectionField>
              <CorrectionField fieldId="contract-field-endDate" label="계약 종료일">
                <input id="contract-field-endDate" name="endDate" type="date" defaultValue={values.endDate} style={correctionInputStyle} />
              </CorrectionField>
            </div>
            <CorrectionField fieldId="contract-field-paymentDay" label="납부일">
              <input id="contract-field-paymentDay" name="paymentDay" type="number" inputMode="numeric" min={1} max={31} defaultValue={values.paymentDay} placeholder="예: 25" style={correctionInputStyle} />
            </CorrectionField>
          </CorrectionGroup>

          <CorrectionGroup title="특약·책임 조항">
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

function CorrectionGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={correctionGroupStyle}>
      <div style={correctionGroupHeaderStyle}>
        <strong>{title}</strong>
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
    makeValueRow(detail, "보증금", manualInputValue(detail.manualValues.deposit), sourceKind),
    makeValueRow(detail, "월세", manualInputValue(detail.manualValues.rent), sourceKind),
    makeValueRow(detail, "납부일", manualInputValue(detail.manualValues.paymentDay), sourceKind),
    makeValueRow(detail, "계약 시작일", manualInputValue(detail.manualValues.startDate), sourceKind),
    makeValueRow(detail, "계약 종료일", manualInputValue(detail.manualValues.endDate), sourceKind),
    makeValueRow(detail, "특약", manualInputValue(detail.manualValues.specialTerms), sourceKind),
    makeValueRow(detail, "자동연장", manualInputValue(detail.manualValues.autoRenewal), sourceKind),
    makeValueRow(detail, "원상복구", manualInputValue(detail.manualValues.restorationDuty), sourceKind),
    makeValueRow(detail, "수선 책임", manualInputValue(detail.manualValues.repairDuty), sourceKind),
  ];
}

function makeValueRow(
  detail: ManagerContractDetailResult,
  label: string,
  savedValue: string,
  sourceKind: OcrSourceKind,
): ValueRow {
  const item = detail.extraction.items.find((candidate) => candidate.label === label);
  const ocrFailed = sourceKind === "mock";
  const normalizedSavedValue = savedValue.trim();
  const rawItemValue = item?.value?.trim();
  const initialMissingOcrLeftover = Boolean(item && isMissingDisplayValue(rawItemValue) && !item.evidence?.trim());
  const inferredDocumentAbsent =
    sourceKind === "openai" &&
    isOptionalContractClauseLabel(label) &&
    !normalizedSavedValue &&
    (!item || initialMissingOcrLeftover);
  const rawOcrValue = inferredDocumentAbsent ? DOCUMENT_ABSENT_VALUE : rawItemValue || "해당 값 없음";
  const validationMessages = validationMessagesFromEvidence(ocrFailed ? undefined : item?.evidence);
  const hasUsableOcrValue = !isMissingDisplayValue(rawOcrValue);
  const hasSavedValue = Boolean(normalizedSavedValue);
  const finalRawValue = hasSavedValue
    ? normalizedSavedValue
    : hasUsableOcrValue
      ? rawOcrValue
      : "직접 입력 필요";
  const missingFinal = isMissingDisplayValue(finalRawValue) || finalRawValue === "직접 입력 필요";
  const documentAbsent = isDocumentAbsentValue(finalRawValue);
  const displayOcrValue = ocrFailed ? "OCR 실패 - 미추출" : summarizeContractValue(label, rawOcrValue);
  const displayDbValue = hasSavedValue ? summarizeContractValue(label, normalizedSavedValue) : "없음";
  const displayFinalValue = summarizeContractValue(label, finalRawValue);

  return {
    label,
    ocrValue: displayOcrValue,
    dbValue: displayDbValue,
    finalValue: displayFinalValue,
    status: documentAbsent ? "해당 없음" : missingFinal ? "부족" : ocrFailed ? "원문 확인" : item?.needsCheck ? "확인 필요" : "확인",
    statusEmphasis: !documentAbsent && (missingFinal || (!ocrFailed && Boolean(item?.needsCheck))),
    evidence: ocrFailed ? undefined : item?.evidence ?? (inferredDocumentAbsent ? "성공한 OCR에서 해당 조항을 찾지 못했습니다." : undefined),
    ocrDetails: ocrFailed ? [] : contractValueDetails(label, rawOcrValue),
    dbDetails: contractValueDetails(label, normalizedSavedValue),
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
  if (label === "월세") {
    return preferredMoneySummary(normalized, ["월 임대료", "월 임차료", "월 차임", "월 납입액", "월 납부액", "차임", "임대료", "월세"]);
  }
  if (label === "계약 시작일") return preferredDateSummary(normalized, "start");
  if (label === "계약 종료일") return preferredDateSummary(normalized, "end");

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

function preferredDateSummary(value: string, position: "start" | "end") {
  const dates = extractDateValues(value);
  if (dates.length === 0) return value;
  return position === "start" ? dates[0] ?? value : dates[dates.length - 1] ?? value;
}

function contractValueDetails(label: string, value: string): ValueDetail[] {
  const normalized = value.trim();
  if (!normalized || isMissingDisplayValue(normalized) || normalized === "직접 입력 필요") return [];
  if (isDocumentAbsentValue(normalized)) return [{ label: "판정", value: "원문에 해당 조항 없음" }];

  if (label === "보증금") return moneyDetails(normalized, ["기본", "전환보증금", "전환 후", "임대보증금", "보증금"]);
  if (label === "월세") return moneyDetails(normalized, ["월 임대료", "월 임차료", "월 차임", "월 납입액", "월 납부액", "차임", "임대료", "월세"]);
  if (label === "계약 시작일" || label === "계약 종료일") return dateDetails(normalized);
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

function dateDetails(value: string): ValueDetail[] {
  return extractDateValues(value).map((date, index) => ({ label: `날짜 ${index + 1}`, value: date }));
}

function extractDateValues(value: string) {
  return Array.from(value.matchAll(/\d{4}[./-]\d{1,2}[./-]\d{1,2}/g))
    .map((match) => normalizeDateValue(match[0]))
    .filter(Boolean) as string[];
}

function normalizeDateValue(value: string) {
  const match = value.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (!match) return undefined;

  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function manualDefaults(
  detail: ManagerContractDetailResult,
  sourceKind: OcrSourceKind,
  valueRows: ValueRow[],
) {
  return {
    deposit:
      storedManualValue(detail.manualValues.deposit) ||
      textInputCandidate(detail, "보증금", sourceKind),
    monthlyRent:
      moneyInputCandidate(storedManualValue(detail.manualValues.rent)) ||
      moneyInputCandidate(valueRowFinalValue(valueRows, "월세")) ||
      moneyInputCandidate(valueRowOcrValue(valueRows, "월세")),
    maintenanceFee:
      moneyInputCandidate(storedManualValue(detail.manualValues.maintenanceFee)) ||
      moneyInputCandidate(valueRowFinalValue(valueRows, "관리비")) ||
      moneyInputCandidate(valueRowOcrValue(valueRows, "관리비")),
    paymentDay:
      paymentDayInputCandidate(storedManualValue(detail.manualValues.paymentDay)) ||
      paymentDayInputCandidate(valueRowFinalValue(valueRows, "납부일")) ||
      paymentDayInputCandidate(valueRowOcrValue(valueRows, "납부일")),
    startDate:
      dateInputCandidate(storedManualValue(detail.manualValues.startDate)) ||
      dateInputCandidate(valueRowFinalValue(valueRows, "계약 시작일")) ||
      ocrDateInputCandidate(detail, "start", sourceKind),
    endDate:
      dateInputCandidate(storedManualValue(detail.manualValues.endDate)) ||
      dateInputCandidate(valueRowFinalValue(valueRows, "계약 종료일")) ||
      ocrDateInputCandidate(detail, "end", sourceKind),
    specialTerms:
      storedManualValue(detail.manualValues.specialTerms) ||
      textInputCandidate(detail, "특약", sourceKind) ||
      "",
    autoRenewal:
      storedManualValue(detail.manualValues.autoRenewal) ||
      textInputCandidate(detail, "자동연장", sourceKind),
    restorationDuty:
      storedManualValue(detail.manualValues.restorationDuty) ||
      textInputCandidate(detail, "원상복구", sourceKind),
    repairDuty:
      storedManualValue(detail.manualValues.repairDuty) ||
      textInputCandidate(detail, "수선 책임", sourceKind),
  };
}

function valueRowFinalValue(valueRows: ValueRow[], label: string) {
  const value = valueRows.find((row) => row.label === label)?.finalValue ?? "";
  return isMissingDisplayValue(value) || value === DOCUMENT_ABSENT_VALUE ? "" : value;
}

function valueRowOcrValue(valueRows: ValueRow[], label: string) {
  const value = valueRows.find((row) => row.label === label)?.ocrValue ?? "";
  return isMissingDisplayValue(value) || value === DOCUMENT_ABSENT_VALUE ? "" : value;
}

function extractionItem(detail: ManagerContractDetailResult, label: string) {
  return detail.extraction.items.find((item) => item.label === label);
}

function storedManualValue(value?: string) {
  return manualInputValue(value);
}

function textInputCandidate(detail: ManagerContractDetailResult, label: string, sourceKind: OcrSourceKind) {
  const item = extractionItem(detail, label);
  const value = item?.value?.trim() ?? "";
  if (sourceKind === "mock" && isMockOnlyExtractionItem(item)) return "";
  return isMissingDisplayValue(value) ? "" : value;
}

function moneyInputCandidate(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("ko-KR");
}

function paymentDayInputCandidate(value: string) {
  const match = value.trim().match(/^(?:매월\s*)?(\d{1,2})(?:\s*일)?$/);
  const day = match?.[1] ? Number(match[1]) : Number.NaN;
  return Number.isInteger(day) && day >= 1 && day <= 31 ? String(day) : "";
}

function dateInputCandidate(value: string) {
  return extractDateValues(value)[0] ?? "";
}

function ocrDateInputCandidate(
  detail: ManagerContractDetailResult,
  position: "start" | "end",
  sourceKind: OcrSourceKind,
) {
  const directLabel = position === "start" ? "계약 시작일" : "계약 종료일";
  const directDate = dateInputCandidate(textInputCandidate(detail, directLabel, sourceKind));
  if (directDate) return directDate;

  const periodDates = extractDateValues(textInputCandidate(detail, "계약 기간", sourceKind));
  if (periodDates.length === 0) return "";
  return position === "start" ? periodDates[0] ?? "" : periodDates[periodDates.length - 1] ?? "";
}

function isMissingDisplayValue(value?: string) {
  const normalized = value?.trim();
  return (
    !normalized ||
    normalized === "미확인" ||
    normalized === "해당 값 없음" ||
    normalized === "원문 확인 필요" ||
    normalized === "관리자 수동값 없음" ||
    normalized === "없음"
  );
}

function isDocumentAbsentValue(value?: string) {
  const normalized = value?.replace(/\s+/g, "").trim();
  return normalized === "문서에없음" || normalized === "해당없음" || normalized === "해당사항없음";
}

function textValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function numberValue(formData: FormData, name: string) {
  const digits = textValue(formData, name).replace(/[^\d]/g, "");
  if (!digits) return undefined;
  return Number(digits);
}

function dateValue(formData: FormData, name: string) {
  return normalizeDateValue(textValue(formData, name));
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
  if (sourceParam === "manual-saved") return "수정한 보증금·월 임대료·관리비·계약 기간·특약 검토값을 저장했습니다.";
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
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))",
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

const correctionGroupBodyStyle = {
  display: "grid",
  gap: "var(--space-md)",
  alignContent: "start",
} as const;

const correctionSubsectionStyle = {
  display: "grid",
  gap: 4,
  paddingTop: "var(--space-sm)",
  borderTop: "1px solid var(--border)",
  color: "var(--on-surface)",
  fontSize: "var(--fs-body)",
  lineHeight: "var(--lh-body)",
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
