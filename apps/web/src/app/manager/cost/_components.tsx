import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  Cost,
  CostReviewReason,
  CostStatus,
  CostType,
  DisclosureSetting,
  Receipt,
  ReceiptOcr,
} from "@roomlog/types";
import { Badge, Button, Card } from "@roomlog/ui";
import { MANAGER_COST_ROUTES } from "@/lib/cost-nav";

export const typeLabel: Record<CostType, string> = {
  repair: "수리비",
  maintenance: "관리비",
  common: "청소·공용설비",
  other: "기타",
};

export const statusLabel: Record<CostStatus, string> = {
  draft: "초안",
  confirmed: "확정",
  amended: "정정",
  void: "무효",
};

export const reasonLabel: Record<CostReviewReason, string> = {
  ocr_low_confidence: "OCR 저신뢰",
  classification_unclear: "분류 불확실",
  unit_unmatched: "호실 미매칭",
};

export const mutedStyle: CSSProperties = {
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  lineHeight: 1.5,
};

export function ScreenHeader({
  eyebrow,
  title,
  desc,
  actions,
}: {
  eyebrow: string;
  title: string;
  desc?: string;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "var(--space-lg)",
        flexWrap: "wrap",
      }}
    >
      <div>
        <Badge emphasis>{eyebrow}</Badge>
        <h1 style={{ margin: "var(--space-sm) 0 0", fontSize: "var(--fs-title)", lineHeight: "var(--lh-title)" }}>
          {title}
        </h1>
        {desc ? <p style={{ ...mutedStyle, margin: "var(--space-xs) 0 0", maxWidth: 760 }}>{desc}</p> : null}
      </div>
      {actions ? <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>{actions}</div> : null}
    </div>
  );
}

export function PageStack({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gap: "var(--space-lg)" }}>{children}</div>;
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section style={{ display: "grid", gap: "var(--space-md)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: "var(--fs-subtitle)", fontWeight: 800 }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function MetricCard({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <Card style={{ minHeight: 112 }}>
      <div style={{ ...mutedStyle, fontWeight: 700 }}>{label}</div>
      <div style={{ marginTop: "var(--space-sm)", fontSize: "var(--fs-title)", fontWeight: 900 }}>{value}</div>
      {note ? <div style={{ ...mutedStyle, marginTop: "var(--space-xs)" }}>{note}</div> : null}
    </Card>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const style: CSSProperties = {
    minHeight: "var(--touch-target)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 var(--space-lg)",
    borderRadius: "var(--radius-btn)",
    textDecoration: "none",
    fontWeight: 800,
    whiteSpace: "nowrap",
  };
  const variants: Record<typeof variant, CSSProperties> = {
    primary: { background: "var(--primary)", color: "var(--on-primary)", border: "none" },
    secondary: { background: "transparent", color: "var(--primary)", border: "1.5px solid var(--primary)" },
    ghost: { background: "transparent", color: "var(--on-surface-variant)", border: "1px solid var(--border)" },
  };

  return (
    <Link href={href} style={{ ...style, ...variants[variant] }}>
      {children}
    </Link>
  );
}

export function CostTable({ costs }: { costs: Cost[] }) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900, background: "var(--surface-container-lowest)" }}>
        <thead>
          <tr style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", textAlign: "left" }}>
            {["날짜", "항목", "금액", "유형", "귀속", "상태", "공개", ""].map((head) => (
              <th key={head} style={thStyle}>
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {costs.map((cost) => (
            <tr key={cost.id} style={{ minHeight: "var(--list-item-min)", borderTop: "1px solid var(--border)" }}>
              <td style={tdStyle}>{formatDate(cost.date)}</td>
              <td style={tdStyle}>
                <div style={{ fontWeight: 800 }}>{cost.item}</div>
                {!cost.verified ? <div style={captionStyle}>미검증 라벨</div> : null}
              </td>
              <td style={tdStyle}>{won(cost.amount)}</td>
              <td style={tdStyle}>{typeLabel[cost.type]}</td>
              <td style={tdStyle}>{cost.scope === "unit" ? `${cost.unitId ?? "호실 미정"}호` : "건물 기록"}</td>
              <td style={tdStyle}>
                <StatusBadge status={cost.status} />
              </td>
              <td style={tdStyle}>{cost.disclosure ? disclosureText(cost.disclosure) : "해당 없음"}</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>
                <Link href={`${MANAGER_COST_ROUTES["M-COST-03"]}?id=${cost.id}`} style={linkStyle}>
                  상세
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function QueueRows({ costs }: { costs: Cost[] }) {
  const queued = costs.filter((cost) => cost.status === "draft" && cost.reviewReason);
  if (queued.length === 0) return <EmptyBox>확인 필요 큐가 없습니다. 원장 조회를 계속할 수 있습니다.</EmptyBox>;

  return (
    <div style={{ display: "grid", gap: "var(--space-sm)" }}>
      {queued.map((cost) => (
        <Link key={cost.id} href={`${MANAGER_COST_ROUTES["M-COST-02"]}?id=${cost.id}`} style={{ color: "inherit", textDecoration: "none" }}>
          <Card style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--space-md)", alignItems: "center" }}>
            <div>
              <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", marginBottom: "var(--space-xs)" }}>
                <Badge emphasis>{reasonLabel[cost.reviewReason!]}</Badge>
                <Badge>{typeLabel[cost.type]}</Badge>
                <Badge>{cost.scope === "unit" ? cost.unitId ?? "호실 미정" : "건물"}</Badge>
              </div>
              <div style={{ fontWeight: 850 }}>{cost.item}</div>
              <div style={mutedSmallStyle}>미확정 비용은 리포트와 기록 집계에서 제외됩니다.</div>
            </div>
            <div style={{ textAlign: "right", fontWeight: 850 }}>{won(cost.amount)}</div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export function OcrFieldRows({ ocr }: { ocr: ReceiptOcr }) {
  const fields = [
    ["항목", String(ocr.fields.item.value), ocr.fields.item.confidence, ocr.fields.item.needsReview],
    ["날짜", String(ocr.fields.date.value), ocr.fields.date.confidence, ocr.fields.date.needsReview],
    ["금액", won(ocr.fields.amount.value), ocr.fields.amount.confidence, ocr.fields.amount.needsReview],
    ocr.fields.unitId ? ["호실", String(ocr.fields.unitId.value), ocr.fields.unitId.confidence, ocr.fields.unitId.needsReview] : null,
  ].filter(Boolean) as [string, string, number, boolean][];

  return (
    <div style={{ display: "grid", gap: "var(--space-sm)" }}>
      {fields.map(([label, value, confidence, needsReview]) => (
        <div key={label} style={rowStyle}>
          <div>
            <div style={captionStyle}>{label}</div>
            <div style={{ fontWeight: 800 }}>{value}</div>
          </div>
          <Badge emphasis={needsReview}>{needsReview ? "확인 필요" : `자동 통과 ${Math.round(confidence * 100)}%`}</Badge>
        </div>
      ))}
    </div>
  );
}

export function ReceiptList({ receipts }: { receipts: Receipt[] }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-sm)" }}>
      {receipts.map((receipt) => (
        <div key={receipt.id} style={rowStyle}>
          <div>
            <div style={{ fontWeight: 800 }}>{receiptSourceLabel[receipt.source]}</div>
            <div style={mutedSmallStyle}>
              {formatDate(receipt.uploadedAt)} · {receipt.hasEvidence ? "증빙 있음" : "수동 입력 · 증빙 없음"}
            </div>
          </div>
          <Badge emphasis={Boolean(receipt.duplicateOfId)}>{receipt.duplicateOfId ? "중복 경고" : "중복 없음"}</Badge>
        </div>
      ))}
    </div>
  );
}

export function DisclosurePreview({ setting }: { setting: DisclosureSetting }) {
  return (
    <Card style={{ display: "grid", gap: "var(--space-md)", background: "var(--surface-container-high)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)", flexWrap: "wrap" }}>
        <div>
          <div style={captionStyle}>임차인 고지 미리보기</div>
          <div style={{ fontSize: "var(--fs-subtitle)", fontWeight: 850 }}>{setting.month} 관리비 사용내역</div>
        </div>
        <Badge emphasis={setting.hiddenCount > 0}>비공개 {setting.hiddenCount}건 존재</Badge>
      </div>
      <div style={{ display: "grid", gap: "var(--space-sm)" }}>
        {setting.entries.map((entry) => (
          <div key={entry.costId} style={rowStyle}>
            <span>{entry.disclosure === "public" ? entry.item : "비공개 항목"}</span>
            <span>{entry.disclosure === "public" ? won(entry.amount) : "숨김 고지"}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function EmptyBox({ children }: { children: ReactNode }) {
  return (
    <Card style={{ border: "1.5px dashed var(--outline-variant)", ...mutedStyle, textAlign: "center" }}>
      {children}
    </Card>
  );
}

export function StatusBadge({ status }: { status: CostStatus }) {
  return <Badge emphasis={status === "draft" || status === "void"}>{statusLabel[status]}</Badge>;
}

export function DisabledButton({ children }: { children: ReactNode }) {
  return (
    <Button disabled variant="secondary" style={{ opacity: 0.55, cursor: "not-allowed" }}>
      {children}
    </Button>
  );
}

export function won(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

export function formatDate(value: string) {
  return value.slice(0, 10);
}

export const grid3Style: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "var(--space-md)",
};

export const grid2Style: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: "var(--space-md)",
};

export const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "var(--space-md)",
};

export const actionRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "var(--space-sm)",
  flexWrap: "wrap",
};

export const captionStyle: CSSProperties = {
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  lineHeight: "var(--lh-caption)",
};

export const mutedSmallStyle: CSSProperties = {
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-caption)",
  lineHeight: "var(--lh-body)",
};

export const rowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "var(--space-md)",
  padding: "var(--space-md)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  background: "var(--surface-container-lowest)",
};

const thStyle: CSSProperties = {
  padding: "var(--space-md)",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "var(--space-md)",
  verticalAlign: "middle",
  minHeight: "var(--list-item-min)",
  fontSize: "var(--fs-caption)",
};

const linkStyle: CSSProperties = {
  color: "var(--primary)",
  fontWeight: 800,
  textDecoration: "none",
};

const receiptSourceLabel: Record<Receipt["source"], string> = {
  camera: "폰 촬영",
  file: "파일 업로드",
  online: "온라인 영수증",
  manual: "수동 입력",
};

function disclosureText(disclosure: "public" | "private") {
  return disclosure === "public" ? "기본 공개" : "비공개 예외";
}
