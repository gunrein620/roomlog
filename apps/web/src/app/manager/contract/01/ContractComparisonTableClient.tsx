"use client";

import { useState } from "react";

export type ContractValueDetail = {
  label: string;
  value: string;
};

export type ContractValueRow = {
  label: string;
  ocrValue: string;
  dbValue: string;
  finalValue: string;
  status: string;
  statusEmphasis: boolean;
  evidence?: string;
  ocrDetails: ContractValueDetail[];
  dbDetails: ContractValueDetail[];
  validationMessages: string[];
};

type DetailSource = "ocr" | "db" | "final";

type OpenDetail = {
  rowLabel: string;
  source: DetailSource;
};

const CLAUSE_LABELS = new Set(["특약", "자동연장", "원상복구", "수선 책임"]);

const DETAIL_LABELS: Record<DetailSource, string> = {
  ocr: "OCR 요약",
  db: "저장값 요약",
  final: "최종값",
};

export function ContractComparisonTableClient({ rows }: { rows: ContractValueRow[] }) {
  return (
    <div style={coreReviewListStyle}>
      {rows.map((row) => (
        <ContractComparisonRow key={row.label} row={row} />
      ))}
    </div>
  );
}

function ContractComparisonRow({ row }: { row: ContractValueRow }) {
  const [openDetail, setOpenDetail] = useState<OpenDetail | null>(null);
  const isClause = CLAUSE_LABELS.has(row.label);
  const selectedValue = openDetail ? valueForSource(row, openDetail.source) : "";
  const selectedDetails = openDetail ? detailsForSource(row, openDetail.source) : [];

  function toggleDetail(source: DetailSource) {
    setOpenDetail((current) =>
      current?.rowLabel === row.label && current.source === source ? null : { rowLabel: row.label, source },
    );
  }

  return (
    <article style={coreReviewItemStyle}>
      <div style={coreReviewItemTopStyle}>
        <span style={coreReviewItemTitleStyle}>{row.label}</span>
        <div style={coreReviewStatusStyle}>
          <BadgeLike emphasis={row.statusEmphasis}>{row.status}</BadgeLike>
          {row.validationMessages.length ? (
            <span style={validationCountStyle}>검증 사유 {row.validationMessages.length}</span>
          ) : null}
        </div>
      </div>

      <div style={compareGridStyle}>
        <ComparisonBox
          label="OCR 요약"
          value={row.ocrValue}
          active={openDetail?.rowLabel === row.label && openDetail.source === "ocr"}
          compact={isClause}
          onDetail={() => toggleDetail("ocr")}
        />
        <ComparisonBox
          label="저장값 요약"
          value={row.dbValue}
          active={openDetail?.rowLabel === row.label && openDetail.source === "db"}
          compact={isClause}
          onDetail={() => toggleDetail("db")}
        />
        <ComparisonBox
          label="최종값"
          value={row.finalValue}
          active={openDetail?.rowLabel === row.label && openDetail.source === "final"}
          compact={isClause}
          strong
          onDetail={() => toggleDetail("final")}
        />
      </div>

      {openDetail ? (
        <div style={expandedDetailBoxStyle}>
          <div style={expandedDetailHeaderStyle}>
            <span style={expandedDetailTitleStyle}>
              {row.label} · {DETAIL_LABELS[openDetail.source]}
            </span>
            <button type="button" onClick={() => setOpenDetail(null)} style={collapseButtonStyle}>
              접기
            </button>
          </div>
          <div style={expandedDetailTextStyle}>{selectedValue}</div>
          {selectedDetails.length ? (
            <dl style={expandedDetailListStyle}>
              {selectedDetails.map((detail) => (
                <div key={`${detail.label}-${detail.value}`} style={expandedDetailItemStyle}>
                  <dt>{detail.label}</dt>
                  <dd>{detail.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {openDetail.source === "ocr" && row.evidence?.trim() ? (
            <div style={expandedEvidenceStyle}>
              <span>근거 문장</span>
              <p>{row.evidence}</p>
            </div>
          ) : null}
          {row.validationMessages.length ? (
            <ul style={validationListStyle}>
              {row.validationMessages.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function ComparisonBox({
  label,
  value,
  active,
  compact,
  strong = false,
  onDetail,
}: {
  label: string;
  value: string;
  active: boolean;
  compact: boolean;
  strong?: boolean;
  onDetail: () => void;
}) {
  return (
    <div style={strong ? compareBoxStrongStyle : compareBoxStyle}>
      <span style={compareLabelStyle}>{label}</span>
      <ValueText value={compact ? compactValue(value) : value} strong={strong} />
      <button
        type="button"
        aria-pressed={active}
        onClick={onDetail}
        style={active ? detailButtonActiveStyle : detailButtonStyle}
      >
        상세보기
      </button>
    </div>
  );
}

function valueForSource(row: ContractValueRow, source: DetailSource) {
  if (source === "ocr") return row.ocrValue;
  if (source === "db") return row.dbValue;
  return row.finalValue;
}

function detailsForSource(row: ContractValueRow, source: DetailSource) {
  if (source === "ocr") return row.ocrDetails;
  if (source === "db") return row.dbDetails;
  return [];
}

function compactValue(value: string) {
  if (isMissingDisplayValue(value) || isDocumentAbsentValue(value)) return value;
  return value.length > 34 ? `${value.slice(0, 34)}...` : value;
}

function ValueText({ value, strong = false }: { value: string; strong?: boolean }) {
  return (
    <span
      style={{
        ...valueTextStyle,
        color: isMissingDisplayValue(value) || value === "직접 입력 필요" || isDocumentAbsentValue(value)
          ? "var(--on-surface-variant)"
          : "var(--on-surface)",
        fontWeight: strong ? 900 : 800,
      }}
    >
      {value}
    </span>
  );
}

function BadgeLike({ children, emphasis = false }: { children: string; emphasis?: boolean }) {
  return <span style={emphasis ? badgeEmphasisStyle : badgeStyle}>{children}</span>;
}

function isMissingDisplayValue(value?: string) {
  const normalized = value?.trim();
  return !normalized || normalized === "미확인" || normalized === "원문 확인 필요" || normalized === "관리자 수동값 없음" || normalized === "없음";
}

function isDocumentAbsentValue(value?: string) {
  const normalized = value?.replace(/\s+/g, "").trim();
  return normalized === "문서에없음" || normalized === "해당없음" || normalized === "해당사항없음";
}

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

const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 30,
  padding: "0 var(--space-md)",
  borderRadius: "var(--radius-full)",
  color: "var(--on-surface-variant)",
  background: "var(--surface-container)",
  fontSize: "var(--fs-caption)",
  fontWeight: 800,
  whiteSpace: "nowrap",
} as const;

const badgeEmphasisStyle = {
  ...badgeStyle,
  border: "1px solid var(--primary)",
  color: "var(--primary)",
  background: "var(--primary-container)",
} as const;

const validationCountStyle = {
  color: "var(--danger, #dc2626)",
  fontSize: "var(--fs-caption)",
  fontWeight: 900,
  whiteSpace: "nowrap",
} as const;

const compareGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "var(--space-xs)",
} as const;

const compareBoxStyle = {
  display: "grid",
  gridTemplateRows: "auto minmax(26px, 1fr) auto",
  gap: 8,
  alignContent: "start",
  minHeight: 112,
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

const valueTextStyle = {
  minWidth: 0,
  overflowWrap: "anywhere",
  fontSize: "var(--fs-body)",
  lineHeight: "var(--lh-body)",
} as const;

const detailButtonStyle = {
  width: "fit-content",
  minHeight: 30,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid transparent",
  borderRadius: "999px",
  padding: "0 var(--space-sm)",
  color: "var(--primary)",
  background: "var(--primary-container)",
  font: "inherit",
  fontSize: "var(--fs-caption)",
  fontWeight: 900,
  cursor: "pointer",
} as const;

const detailButtonActiveStyle = {
  ...detailButtonStyle,
  borderColor: "var(--primary)",
  background: "var(--surface-container-lowest)",
} as const;

const expandedDetailBoxStyle = {
  display: "grid",
  gap: "var(--space-sm)",
  padding: "var(--space-md)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  color: "var(--on-surface)",
  background: "var(--surface-container-low)",
  lineHeight: "var(--lh-body)",
} as const;

const expandedDetailHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-sm)",
  flexWrap: "wrap",
} as const;

const expandedDetailTitleStyle = {
  color: "var(--on-surface)",
  fontSize: "var(--fs-body)",
  fontWeight: 900,
} as const;

const collapseButtonStyle = {
  minHeight: 32,
  border: "1px solid var(--border)",
  borderRadius: "999px",
  padding: "0 var(--space-md)",
  color: "var(--on-surface-variant)",
  background: "var(--surface-container-lowest)",
  font: "inherit",
  fontSize: "var(--fs-caption)",
  fontWeight: 900,
  cursor: "pointer",
} as const;

const expandedDetailTextStyle = {
  minHeight: 88,
  padding: "var(--space-md)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--surface-container-lowest)",
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  fontWeight: 800,
} as const;

const expandedDetailListStyle = {
  display: "grid",
  gap: 6,
  margin: 0,
  padding: 0,
} as const;

const expandedDetailItemStyle = {
  display: "grid",
  gridTemplateColumns: "90px minmax(0, 1fr)",
  gap: "var(--space-sm)",
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  fontWeight: 800,
} as const;

const expandedEvidenceStyle = {
  display: "grid",
  gap: 4,
  padding: "var(--space-sm)",
  borderRadius: "var(--radius-sm)",
  color: "var(--on-surface-variant)",
  background: "var(--surface-container-lowest)",
  fontSize: "var(--fs-caption)",
  fontWeight: 800,
} as const;

const validationListStyle = {
  display: "grid",
  gap: 4,
  margin: 0,
  paddingLeft: "1.1rem",
  color: "#991b1b",
  fontSize: "var(--fs-caption)",
  fontWeight: 800,
  lineHeight: "var(--lh-body)",
} as const;
