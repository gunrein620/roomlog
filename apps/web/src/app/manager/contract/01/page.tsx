import { Fragment, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileText, ShieldCheck } from "lucide-react";
import {
  confirmManagerContract,
  getManagerContractDetail,
  runManagerContractOcr,
  updateManagerContractManualValues,
} from "@/lib/contract-manager-api";
import { MANAGER_CONTRACT_ROUTES } from "@/lib/contract-manager-nav";
import {
  BackLink,
  Badge,
  Card,
  ContractShell,
  PageStack,
  Section,
  StaticButton,
  captionStyle,
  formatDateTime,
} from "../_components";
import { OcrSubmitButton } from "./OcrSubmitButton";

type SearchParams = Promise<{ id?: string; source?: string }>;
type ManagerContractDetailResult = Awaited<ReturnType<typeof getManagerContractDetail>>;
type ManualValueInput = Parameters<typeof updateManagerContractManualValues>[1];

export const dynamic = "force-dynamic";

async function confirmContractAction(formData: FormData) {
  "use server";

  const contractId = String(formData.get("contractId") ?? "");
  await confirmManagerContract(contractId);
  redirect(`${MANAGER_CONTRACT_ROUTES["M-DOC-01"]}?id=${encodeURIComponent(contractId)}`);
}

async function runOcrAction(formData: FormData) {
  "use server";

  const contractId = String(formData.get("contractId") ?? "");
  await runManagerContractOcr(contractId);
  redirect(`${MANAGER_CONTRACT_ROUTES["M-DOC-01"]}?id=${encodeURIComponent(contractId)}`);
}

async function updateManualCorrectionAction(formData: FormData) {
  "use server";

  const contractId = String(formData.get("contractId") ?? "");
  await updateManagerContractManualValues(contractId, {
    deposit: textValue(formData, "deposit"),
    monthlyRent: numberValue(formData, "monthlyRent"),
    maintenanceFee: numberValue(formData, "maintenanceFee"),
    paymentDay: numberValue(formData, "paymentDay"),
    account: textValue(formData, "landlordAccount"),
    startDate: dateValue(formData, "startDate"),
    endDate: dateValue(formData, "endDate"),
  });
  redirect(`${MANAGER_CONTRACT_ROUTES["M-DOC-01"]}?id=${encodeURIComponent(contractId)}&source=manual-saved`);
}

async function prefillStoredContractValuesAction(formData: FormData) {
  "use server";

  const contractId = String(formData.get("contractId") ?? "");
  const detail = await getManagerContractDetail(contractId);
  const input = storedContractPrefillInput(detail);
  const hasInput = hasPrefillInput(input);

  if (hasInput) {
    await updateManagerContractManualValues(contractId, input);
  }

  redirect(
    `${MANAGER_CONTRACT_ROUTES["M-DOC-01"]}?id=${encodeURIComponent(contractId)}&source=${hasInput ? "db-prefill" : "db-prefill-empty"}`,
  );
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id, source: sourceParam } = await searchParams;
  const detail = await getManagerContractDetail(id);
  const source = ocrSource(detail.extraction.highlights);
  const valueRows = buildValueRows(detail, source.kind);
  const needsCheckCount = detail.extraction.items.filter((item) => item.needsCheck).length;
  const readItemCount =
    source.kind === "mock"
      ? 0
      : detail.extraction.items.filter((item) => !isMissingDisplayValue(item.value)).length;
  const notice = pageNotice(sourceParam);

  return (
    <ContractShell id="M-DOC-01" title="계약서 OCR 검토·확정">
      <PageStack>
        <Card style={headerCardStyle}>
          <div style={{ display: "grid", gap: "var(--space-md)" }}>
            <BackLink />
            <div style={stepRowStyle}>
              <StepPill>1 계약서 입력</StepPill>
              <StepPill active>2 OCR 분석</StepPill>
              <StepPill active={sourceParam === "db-prefill"}>3 값 보강</StepPill>
              <StepPill active={detail.row.contract.review === "confirmed"}>4 확정</StepPill>
            </div>
            <div style={{ display: "grid", gap: "var(--space-xs)" }}>
              <h1 style={titleStyle}>OCR 결과를 계약값으로 확정</h1>
              <p style={mutedBodyStyle}>
                OCR 값, 기존 DB 값, 최종 입력값을 한 표에서 비교한 뒤 필요한 부분만 수정하세요.
              </p>
            </div>
            <div style={badgeRowStyle}>
              <Badge emphasis>{detail.row.contract.unitId}호</Badge>
              <Badge>{detail.row.tenantName}</Badge>
              <Badge emphasis={source.emphasis}>{source.label}</Badge>
              <Badge emphasis={needsCheckCount > 0}>{needsCheckCount ? `확인 필요 ${needsCheckCount}` : "확인 완료"}</Badge>
            </div>
          </div>

          <div style={headerActionStyle}>
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
          </div>
        </Card>

        <div style={summaryGridStyle}>
          <SummaryTile label="OCR 상태" value={source.label} note={source.note} emphasis={source.emphasis} />
          <SummaryTile label="읽은 항목" value={`${readItemCount}개`} note={`최근 분석 ${formatDateTime(detail.extraction.createdAt)}`} />
          <SummaryTile label="확인 필요" value={`${needsCheckCount}개`} note={needsCheckCount ? "최종 수정 후 확정" : "바로 확정 가능"} emphasis={needsCheckCount > 0} />
        </div>

        {notice ? (
          <Card style={noticeCardStyle}>
            <CheckCircle2 size={18} strokeWidth={2.5} aria-hidden="true" />
            <strong>{notice}</strong>
          </Card>
        ) : null}

        <Section
          title="OCR 결과 · DB값 비교"
          action={
            <form action={prefillStoredContractValuesAction}>
              <input type="hidden" name="contractId" value={detail.row.contract.id} />
              <StaticButton type="submit" variant="secondary" style={{ gap: "var(--space-xs)" }}>
                <FileText size={16} strokeWidth={2.5} aria-hidden="true" />
                <span>기존 DB 계약값 불러오기</span>
              </StaticButton>
            </form>
          }
        >
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <ComparisonTable rows={valueRows} />
          </Card>
        </Section>

        <Section title="최종 계약값 수정">
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
              <div style={captionStyle}>수정 저장 후 검토 확정을 누르면 납부·하자·퇴실 기준값으로 사용됩니다.</div>
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

function ComparisonTable({ rows }: { rows: ValueRow[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>항목</th>
            <th style={thStyle}>OCR 요약</th>
            <th style={thStyle}>기존 DB 요약</th>
            <th style={thStyle}>최종값</th>
            <th style={thStyle}>상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const hasDetails = row.ocrDetails.length > 0 || row.dbDetails.length > 0 || row.finalDetails.length > 0 || Boolean(row.evidence?.trim());

            return (
              <Fragment key={row.label}>
                <tr>
                  <td style={tdStrongStyle}>
                    <span style={rowLabelStyle}>{row.label}</span>
                  </td>
                  <td style={tdStyle}>
                    <ValueText value={row.ocrValue} />
                  </td>
                  <td style={tdStyle}>
                    <ValueText value={row.dbValue} />
                  </td>
                  <td style={tdStrongStyle}>
                    <ValueText value={row.finalValue} strong />
                  </td>
                  <td style={tdStyle}>
                    <div style={statusCellStyle}>
                      <Badge emphasis={row.statusEmphasis}>{row.status}</Badge>
                    </div>
                  </td>
                </tr>
                {hasDetails ? (
                  <tr>
                    <td colSpan={5} style={detailRowCellStyle}>
                      <details style={detailsStyle}>
                        <summary style={detailsSummaryStyle}>상세 보기</summary>
                        <RowDetailPanel row={row} />
                      </details>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RowDetailPanel({ row }: { row: ValueRow }) {
  return (
    <div style={rowDetailPanelStyle}>
      <DetailGroup title="OCR 분석" summary={row.ocrValue} details={row.ocrDetails} evidence={row.evidence} />
      <DetailGroup title="기존 DB" summary={row.dbValue} details={row.dbDetails} />
      <DetailGroup title="최종 반영" summary={row.finalValue} details={row.finalDetails} strong />
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
        color: isMissingDisplayValue(value) || value === "직접 입력 필요" ? "var(--on-surface-variant)" : "var(--on-surface)",
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
}: {
  detail: ManagerContractDetailResult;
  sourceKind: OcrSourceKind;
}) {
  const values = manualDefaults(detail, sourceKind);

  return (
    <Card style={manualCardStyle}>
      <div style={manualHeaderStyle}>
        <div style={{ fontWeight: 900 }}>최종값은 여기서 손으로 고칠 수 있습니다</div>
        <p style={mutedBodyStyle}>OCR 값과 DB 값이 다르면 실제 원문 기준으로 수정한 뒤 저장하세요.</p>
      </div>
      <form action={updateManualCorrectionAction} style={{ display: "grid", gap: "var(--space-md)" }}>
        <input type="hidden" name="contractId" value={detail.row.contract.id} />
        <div style={correctionGroupGridStyle}>
          <CorrectionGroup title="계약 기간" note="계약서 원문 기준 시작일과 종료일을 확인하세요.">
            <div style={twoColumnFieldStyle}>
              <CorrectionField label="계약 시작일">
                <input name="startDate" type="date" defaultValue={values.startDate} style={correctionInputStyle} />
              </CorrectionField>
              <CorrectionField label="계약 종료일">
                <input name="endDate" type="date" defaultValue={values.endDate} style={correctionInputStyle} />
              </CorrectionField>
            </div>
          </CorrectionGroup>

          <CorrectionGroup title="금액" note="보증금은 복합 조건이 길 수 있어 그대로 보관합니다. 월세와 관리비는 숫자만 저장됩니다.">
            <CorrectionField label="보증금">
              <textarea name="deposit" defaultValue={values.deposit} placeholder="예: 기본 36,288,000원; 전환보증금 17,000,000원; 전환 후 53,288,000원" style={correctionTextareaStyle} />
            </CorrectionField>
            <div style={twoColumnFieldStyle}>
              <CorrectionField label="월세">
                <input name="monthlyRent" inputMode="numeric" defaultValue={formatNumberInput(values.monthlyRent)} placeholder="예: 650,000" style={correctionInputStyle} />
              </CorrectionField>
              <CorrectionField label="관리비">
                <input name="maintenanceFee" inputMode="numeric" defaultValue={formatNumberInput(values.maintenanceFee)} placeholder="예: 70,000" style={correctionInputStyle} />
              </CorrectionField>
            </div>
          </CorrectionGroup>

          <CorrectionGroup title="납부·계좌" note="납부일은 매월 기준 일자만 입력하고, 계좌는 은행명과 계좌번호를 함께 적습니다.">
            <div style={twoColumnFieldStyle}>
              <CorrectionField label="납부일">
                <input name="paymentDay" inputMode="numeric" defaultValue={values.paymentDay} placeholder="예: 25" style={correctionInputStyle} />
              </CorrectionField>
              <CorrectionField label="임대인 계좌">
                <input name="landlordAccount" defaultValue={values.landlordAccount} placeholder="은행명 계좌번호" style={correctionInputStyle} />
              </CorrectionField>
            </div>
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

function CorrectionField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: "var(--space-xs)", fontSize: "var(--fs-caption)", fontWeight: 800 }}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function StepPill({ active = false, children }: { active?: boolean; children: ReactNode }) {
  return <Badge emphasis={active}>{children}</Badge>;
}

function SummaryTile({
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
    <Card style={{ display: "grid", gap: "var(--space-xs)", minHeight: 104, alignContent: "space-between", borderColor: emphasis ? "var(--primary)" : undefined }}>
      <div style={captionStyle}>{label}</div>
      <div style={{ fontSize: "var(--fs-subtitle)", lineHeight: "var(--lh-title)", fontWeight: 900 }}>{value}</div>
      <div style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)" }}>{note}</div>
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
  finalDetails: ValueDetail[];
};

type ValueDetail = {
  label: string;
  value: string;
};

type OcrSourceKind = "openai" | "mock" | "initial";

function buildValueRows(detail: ManagerContractDetailResult, sourceKind: OcrSourceKind): ValueRow[] {
  const contract = detail.row.contract;
  const termDb = contract.startDate || contract.endDate ? `${dateInputValue(contract.startDate) || "시작일 미등록"} ~ ${dateInputValue(contract.endDate) || "종료일 미등록"}` : "";
  const detailAddressDb = `${detail.row.buildingName} ${detail.row.contract.unitId}호`.trim();

  return [
    makeValueRow(detail, "계약 기간", termDb, sourceKind),
    makeValueRow(detail, "보증금", storedManualValue(detail, "보증금", detail.manualValues.deposit), sourceKind),
    makeValueRow(detail, "월세", contract.monthlyRent !== undefined ? `${contract.monthlyRent.toLocaleString("ko-KR")}원` : "", sourceKind),
    makeValueRow(detail, "관리비", contract.maintenanceFee !== undefined ? `${contract.maintenanceFee.toLocaleString("ko-KR")}원` : "", sourceKind),
    makeValueRow(detail, "납부일", contract.paymentDay !== undefined ? `매월 ${contract.paymentDay}일` : "", sourceKind),
    makeValueRow(detail, "임대인 계좌", storedManualValue(detail, "임대인 계좌", detail.manualValues.account), sourceKind),
    makeValueRow(detail, "상세 주소", detailAddressDb, sourceKind),
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
  const rawOcrValue = item?.value?.trim() || "미확인";
  const normalizedDbValue = dbValue.trim();
  const finalRawValue = ocrFailed
    ? normalizedDbValue || "직접 입력 필요"
    : !isMissingDisplayValue(rawOcrValue)
      ? rawOcrValue
      : normalizedDbValue || "직접 입력 필요";
  const missingFinal = isMissingDisplayValue(finalRawValue) || finalRawValue === "직접 입력 필요";
  const displayOcrValue = ocrFailed ? "실제 OCR 미추출" : summarizeContractValue(label, rawOcrValue);
  const displayDbValue = normalizedDbValue ? summarizeContractValue(label, normalizedDbValue) : "없음";
  const displayFinalValue = summarizeContractValue(label, finalRawValue);

  return {
    label,
    ocrValue: displayOcrValue,
    dbValue: displayDbValue,
    finalValue: displayFinalValue,
    status: missingFinal ? "부족" : ocrFailed ? "DB값" : item?.needsCheck ? "확인 필요" : "확인",
    statusEmphasis: missingFinal || (!ocrFailed && Boolean(item?.needsCheck)),
    evidence: ocrFailed ? undefined : item?.evidence,
    ocrDetails: ocrFailed ? [] : contractValueDetails(label, rawOcrValue),
    dbDetails: contractValueDetails(label, normalizedDbValue),
    finalDetails: contractValueDetails(label, finalRawValue),
  };
}

function summarizeContractValue(label: string, value: string) {
  const normalized = value.trim();
  if (!normalized) return "없음";
  if (isMissingDisplayValue(normalized) || normalized === "직접 입력 필요") return normalized;

  if (label === "보증금") {
    return preferredMoneySummary(normalized, ["전환 후", "임대보증금", "보증금", "기본"]);
  }

  if (label === "월세") {
    return preferredMoneySummary(normalized, ["전환 후", "월임대료", "월세", "기본"]);
  }

  if (label === "납부일" && /확인되지 않음/.test(normalized)) {
    return "정기 납부일 확인 필요";
  }

  if (label === "임대인 계좌" && /확인되지 않음/.test(normalized)) {
    return "계좌 확인 필요";
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

  if (label === "계약 기간") return termDetails(normalized);
  if (label === "보증금") return moneyDetails(normalized, ["기본", "전환보증금", "전환 후", "임대보증금", "보증금"]);
  if (label === "월세") return moneyDetails(normalized, ["기본", "전환 후", "월임대료", "월세"]);
  if (label === "관리비") return maintenanceDetails(normalized);
  if (label === "납부일") return paymentDayDetails(normalized);
  if (label === "임대인 계좌") return accountDetails(normalized);
  if (label === "상세 주소") return addressDetails(normalized);
  if (["자동연장", "원상복구", "수선 책임"].includes(label)) return [{ label: "조항 요약", value: normalized }];

  return [];
}

function termDetails(value: string): ValueDetail[] {
  const match = value.match(/(\d{4}[.-]\d{2}[.-]\d{2})\s*~\s*(\d{4}[.-]\d{2}[.-]\d{2})/);
  if (!match) return [];

  return [
    { label: "시작일", value: match[1] ?? "" },
    { label: "종료일", value: match[2] ?? "" },
  ].filter((detail) => detail.value);
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

function maintenanceDetails(value: string): ValueDetail[] {
  const details = moneyDetails(value, ["관리비", "등록값", "월 관리비"]);
  if (/확인되지 않음/.test(value)) details.unshift({ label: "OCR 상태", value: "확인되지 않음" });
  return details;
}

function paymentDayDetails(value: string): ValueDetail[] {
  const details: ValueDetail[] = [];
  const recurring = value.match(/매월\s*\d{1,2}일/);
  const dates = value.match(/\d{4}[.-]\d{2}[.-]\d{2}/g);

  if (recurring?.[0]) details.push({ label: "정기 납부일", value: recurring[0] });
  if (/확인되지 않음/.test(value)) details.push({ label: "OCR 상태", value: "정기 납부일 확인되지 않음" });
  if (dates?.length) details.push({ label: "납부현황 기재일", value: dates.join(", ") });

  return details;
}

function accountDetails(value: string): ValueDetail[] {
  if (/확인되지 않음/.test(value)) return [{ label: "OCR 상태", value: "계좌 확인 필요" }];

  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return [];

  return [
    { label: "은행/예금주", value: parts.slice(0, -1).join(" ") },
    { label: "계좌번호", value: parts[parts.length - 1] ?? "" },
  ];
}

function addressDetails(value: string): ValueDetail[] {
  const match = value.match(/^(.+)\s+([^\s]+호)$/);
  if (!match) return [];

  return [
    { label: "건물", value: match[1] ?? "" },
    { label: "호실", value: match[2] ?? "" },
  ].filter((detail) => detail.value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function manualDefaults(detail: ManagerContractDetailResult, sourceKind: OcrSourceKind) {
  const contract = detail.row.contract;
  const rentCandidate = sourceKind === "mock" ? "" : extractionValue(detail, "월세");
  const maintenanceFeeCandidate = sourceKind === "mock" ? "" : extractionValue(detail, "관리비");
  const paymentDayCandidate = sourceKind === "mock" ? "" : extractionValue(detail, "납부일");

  return {
    startDate: dateInputValue(contract.startDate),
    endDate: dateInputValue(contract.endDate),
    deposit:
      storedManualValue(detail, "보증금", detail.manualValues.deposit) ||
      textInputCandidate(detail, "보증금", sourceKind),
    monthlyRent: String(contract.monthlyRent ?? parseMoneyNumber(rentCandidate) ?? ""),
    maintenanceFee: String(contract.maintenanceFee ?? parseMoneyNumber(maintenanceFeeCandidate) ?? ""),
    paymentDay: String(contract.paymentDay ?? parsePaymentDay(paymentDayCandidate) ?? ""),
    landlordAccount:
      storedManualValue(detail, "임대인 계좌", detail.manualValues.account) ||
      textInputCandidate(detail, "임대인 계좌", sourceKind),
  };
}

function storedContractPrefillInput(detail: ManagerContractDetailResult): ManualValueInput {
  const contract = detail.row.contract;
  const input: ManualValueInput = {};

  if (termNeedsPrefill(detail)) {
    if (contract.startDate) input.startDate = contract.startDate;
    if (contract.endDate) input.endDate = contract.endDate;
  }

  if (needsStoredPrefill(detail, "월세") && contract.monthlyRent !== undefined) {
    input.monthlyRent = contract.monthlyRent;
  }

  if (needsStoredPrefill(detail, "관리비") && contract.maintenanceFee !== undefined) {
    input.maintenanceFee = contract.maintenanceFee;
  }

  if (needsStoredPrefill(detail, "납부일") && contract.paymentDay !== undefined) {
    input.paymentDay = contract.paymentDay;
  }

  const storedDeposit = manualInputValue(detail.manualValues.deposit);
  if (needsStoredPrefill(detail, "보증금") && storedDeposit) {
    input.deposit = storedDeposit;
  }

  const storedAccount = manualInputValue(detail.manualValues.account);
  if (needsStoredPrefill(detail, "임대인 계좌") && storedAccount) {
    input.account = storedAccount;
  }

  return input;
}

function hasPrefillInput(input: ManualValueInput) {
  return Boolean(
    input.deposit ||
      input.account ||
      input.startDate ||
      input.endDate ||
      input.monthlyRent !== undefined ||
      input.maintenanceFee !== undefined ||
      input.paymentDay !== undefined,
  );
}

function needsStoredPrefill(detail: ManagerContractDetailResult, label: string) {
  const item = extractionItem(detail, label);
  return isMockOnlyExtractionItem(item) || isMissingDisplayValue(item?.value);
}

function termNeedsPrefill(detail: ManagerContractDetailResult) {
  const item = extractionItem(detail, "계약 기간");
  const value = item?.value?.trim() ?? "";
  if (isMockOnlyExtractionItem(item)) return true;
  return !value || value.includes("미확인") || value === "원문 확인 필요";
}

function extractionItem(detail: ManagerContractDetailResult, label: string) {
  return detail.extraction.items.find((item) => item.label === label);
}

function extractionValue(detail: ManagerContractDetailResult, label: string) {
  return extractionItem(detail, label)?.value?.trim() ?? "";
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

function parseMoneyNumber(value?: string) {
  const digits = value?.replace(/[^\d]/g, "");
  if (!digits) return undefined;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatNumberInput(value?: string) {
  const digits = value?.replace(/[^\d]/g, "");
  if (!digits) return "";

  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed.toLocaleString("ko-KR") : value ?? "";
}

function parsePaymentDay(value?: string) {
  const match = value?.match(/\d{1,2}/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return parsed >= 1 && parsed <= 31 ? parsed : undefined;
}

function textValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function numberValue(formData: FormData, name: string) {
  const raw = textValue(formData, name).replaceAll(",", "").replace(/[^\d]/g, "");
  if (!raw) return undefined;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.floor(parsed) : undefined;
}

function dateValue(formData: FormData, name: string) {
  const value = textValue(formData, name);
  return value ? `${value}T00:00:00+09:00` : undefined;
}

function dateInputValue(iso?: string) {
  return iso?.slice(0, 10) ?? "";
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

function pageNotice(sourceParam?: string) {
  if (sourceParam === "db-prefill") return "기존 DB 계약값을 부족한 항목에 반영했습니다. 최종값을 확인해 주세요.";
  if (sourceParam === "db-prefill-empty") return "추가로 채울 기존 DB 계약값이 없습니다. 직접 입력해 주세요.";
  if (sourceParam === "manual-saved") return "수정한 최종 계약값을 저장했습니다.";
  if (sourceParam === "ocr-first") return "계약서 입력 후 OCR 분석을 실행했습니다. 부족한 값은 DB값으로 보강할 수 있습니다.";
  return "";
}

const headerCardStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: "var(--space-lg)",
  alignItems: "start",
} as const;

const stepRowStyle = {
  display: "flex",
  gap: "var(--space-sm)",
  flexWrap: "wrap",
} as const;

const badgeRowStyle = {
  display: "flex",
  gap: "var(--space-sm)",
  flexWrap: "wrap",
} as const;

const titleStyle = {
  margin: 0,
  fontSize: "var(--fs-title)",
  lineHeight: "var(--lh-title)",
} as const;

const headerActionStyle = {
  display: "flex",
  gap: "var(--space-sm)",
  flexWrap: "wrap",
  justifyContent: "flex-end",
} as const;

const summaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "var(--space-md)",
} as const;

const noticeCardStyle = {
  display: "flex",
  gap: "var(--space-sm)",
  alignItems: "center",
  color: "var(--on-primary-container)",
  background: "var(--primary-container)",
} as const;

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 1040,
} as const;

const thStyle = {
  padding: "var(--space-md)",
  textAlign: "left",
  borderBottom: "1px solid var(--border)",
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  fontWeight: 900,
  background: "var(--surface-container-low)",
} as const;

const tdStyle = {
  padding: "var(--space-md)",
  borderBottom: "1px solid var(--border)",
  verticalAlign: "top",
  fontSize: "var(--fs-caption)",
  lineHeight: "var(--lh-body)",
} as const;

const tdStrongStyle = {
  ...tdStyle,
  fontWeight: 900,
} as const;

const rowLabelStyle = {
  display: "inline-block",
  minWidth: 70,
} as const;

const statusCellStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
} as const;

const detailRowCellStyle = {
  padding: "0 var(--space-md) var(--space-md)",
  borderBottom: "1px solid var(--border)",
  background: "var(--surface-container-lowest)",
} as const;

const detailsStyle = {
  display: "grid",
  gap: "var(--space-xs)",
  marginTop: "calc(var(--space-xs) * -1)",
} as const;

const detailsSummaryStyle = {
  width: "fit-content",
  cursor: "pointer",
  color: "var(--primary)",
  fontSize: "var(--fs-caption)",
  fontWeight: 800,
  marginLeft: "auto",
  padding: "var(--space-xs) var(--space-sm)",
  borderRadius: "999px",
  background: "var(--primary-container)",
} as const;

const rowDetailPanelStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "var(--space-md)",
  marginTop: "var(--space-sm)",
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
