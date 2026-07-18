import Link from "next/link";
import type { VendorJobDetail, VendorJobSummary } from "@roomlog/types";
import { vendorTradeLabel } from "@roomlog/types";
import { Badge, Card } from "@roomlog/ui";
import type { VendorRoute } from "@/lib/vendor-nav";
import { resolveAssetFileUrl } from "@/lib/splat-asset-api";
import {
  canVendorSendJobMessage,
  vendorJobMessageSenderLabel,
} from "@/lib/vendor-job-chat";
import {
  estimateStatusLabel,
  paymentStatusLabel,
  vendorJobStatusLabel,
} from "@/lib/vendor-workflow-presenter";
import { sendVendorRepairMessageAction } from "./actions";

export const primaryLinkStyle = {
  height: "var(--touch-target)",
  borderRadius: "var(--radius-btn)",
  background: "var(--primary)",
  color: "var(--on-primary)",
  fontWeight: 700,
  fontSize: "var(--fs-body)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  width: "100%",
  boxSizing: "border-box",
} as const;

export const secondaryLinkStyle = {
  height: "var(--touch-target)",
  borderRadius: "var(--radius-btn)",
  background: "transparent",
  color: "var(--primary)",
  border: "1.5px solid var(--primary)",
  fontWeight: 700,
  fontSize: "var(--fs-body)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  width: "100%",
  boxSizing: "border-box",
} as const;

export const labelStyle = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  marginBottom: 8,
} as const;

export const mutedStyle = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  lineHeight: 1.55,
} as const;

export function ScreenHeader({
  title,
  backTo,
}: {
  title: string;
  backTo?: string;
}) {
  return (
    <header
      style={{
        flex: "none",
        padding: "12px 14px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
      }}
    >
      {backTo ? (
        <Link href={backTo} style={{ fontSize: 13, color: "var(--on-surface-variant)", textDecoration: "none" }}>
          ‹ 뒤로
        </Link>
      ) : (
        <div style={{ width: 34 }} />
      )}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
      </div>
      <div style={{ width: 34 }} />
    </header>
  );
}

export function Body({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        flex: 1,
        overflow: "auto",
        padding: "16px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {children}
    </main>
  );
}

export function Footer({ children }: { children: React.ReactNode }) {
  return (
    <footer
      style={{
        flex: "none",
        padding: "12px 14px",
        borderTop: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {children}
    </footer>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link href={href} style={variant === "primary" ? primaryLinkStyle : secondaryLinkStyle}>
      {children}
    </Link>
  );
}

export function Stepper({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <div style={{ display: "flex", gap: 5 }}>
      {steps.map((step, index) => (
        <div
          key={step}
          title={step}
          style={{
            flex: 1,
            height: 8,
            borderRadius: "var(--radius-full)",
            background: index <= current ? "var(--primary)" : "var(--outline-variant)",
          }}
        />
      ))}
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
      <span style={{ color: "var(--on-surface-variant)" }}>{label}</span>
      <span style={{ fontWeight: 700, textAlign: "right" }}>{value}</span>
    </div>
  );
}

export function InlineNotice({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "danger" | "success";
}) {
  const color = tone === "danger"
    ? "var(--error)"
    : tone === "success"
      ? "var(--success)"
      : "var(--on-surface-variant)";
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      style={{
        padding: "10px 12px",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        background: "var(--surface-container)",
        color,
        fontSize: "var(--fs-caption)",
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

export function DemoReadOnlyNotice() {
  return (
    <InlineNotice>
      API에 연결되지 않아 예시 데이터를 읽기 전용으로 표시합니다. 저장·제출·작업 시작은
      실제 연결 후 사용할 수 있습니다.
    </InlineNotice>
  );
}

export function AttachmentGallery({
  urls,
  emptyLabel = "첨부된 사진이 없습니다.",
}: {
  urls?: string[];
  emptyLabel?: string;
}) {
  const safeUrls = Array.from(new Set((urls ?? []).filter((url) =>
    typeof url === "string" && url.trim().length > 0
  )));
  if (safeUrls.length === 0) {
    return <p style={{ ...mutedStyle, margin: 0 }}>{emptyLabel}</p>;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {safeUrls.map((url, index) => (
        <img
          key={url}
          src={resolveAssetFileUrl(url)}
          alt={`수리 자료 ${index + 1}`}
          loading="lazy"
          style={{
            display: "block",
            width: "100%",
            aspectRatio: "1 / 1",
            objectFit: "cover",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            background: "var(--surface-container)",
          }}
        />
      ))}
    </div>
  );
}

export function WorkflowJobSummary({ job }: { job: VendorJobSummary | VendorJobDetail }) {
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{job.title}</div>
          <div style={{ ...mutedStyle, marginTop: 3 }}>{job.publicLocation}</div>
        </div>
        <Badge emphasis>{vendorJobStatusLabel(job.status)}</Badge>
      </div>
      <InfoRow label="작업 분야" value={vendorTradeLabel(job.trade) || "확인 필요"} />
      {"description" in job && job.description ? (
        <p style={{ ...mutedStyle, margin: 0 }}>{job.description}</p>
      ) : null}
      <InfoRow label="최근 업데이트" value={formatDateTime(job.updatedAt)} />
    </Card>
  );
}

export function TenantAvailableTimes({ value }: { value?: string }) {
  const normalized = value?.trim();
  if (!normalized) return null;

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
      <div style={labelStyle}>세입자 방문 가능 시간</div>
      <p style={{ margin: 0, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{normalized}</p>
    </Card>
  );
}

export function VendorJobChat({
  job,
  readOnly = false,
}: {
  job: VendorJobDetail;
  readOnly?: boolean;
}) {
  const active = canVendorSendJobMessage(job.status);
  const canSend = !readOnly && active;

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
      <div>
        <div style={{ fontWeight: 800 }}>진행 메시지</div>
        <p style={{ ...mutedStyle, margin: "var(--space-xs) 0 0" }}>
          방문 시간과 현장 준비사항을 세입자·관리자와 조율할 수 있습니다.
        </p>
      </div>
      {job.messages.length === 0 ? (
        <p style={{ ...mutedStyle, margin: 0 }}>아직 진행 메시지가 없습니다.</p>
      ) : (
        <div
          style={{
            display: "flex",
            // column-reverse + 역순 렌더: 스크롤이 항상 최신(하단)에 붙고, 쌓여도 카드가 안 길어진다.
            flexDirection: "column-reverse",
            gap: "var(--space-sm)",
            maxHeight: 360,
            overflowY: "auto",
            paddingRight: "var(--space-xs)",
          }}
        >
          {[...job.messages].reverse().map((message, index) => {
            const mine = message.senderRole === "VENDOR";
            return (
              <div
                key={`${message.createdAt}-${index}`}
                style={{
                  alignSelf: mine ? "flex-end" : "stretch",
                  width: mine ? "88%" : "100%",
                  padding: "var(--space-sm)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                  background: mine ? "var(--primary-container)" : "var(--surface-container)",
                  color: mine ? "var(--on-primary-container)" : "var(--on-surface)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "var(--space-sm)",
                    fontSize: "var(--fs-caption)",
                    fontWeight: 700,
                  }}
                >
                  <span>{vendorJobMessageSenderLabel(message.senderRole)}</span>
                  <span>{formatDateTime(message.createdAt)}</span>
                </div>
                <p style={{ margin: "var(--space-xs) 0 0", whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                  {message.messageText}
                </p>
                {message.attachmentUrls.length > 0 ? (
                  <div style={{ marginTop: "var(--space-sm)" }}>
                    <AttachmentGallery urls={message.attachmentUrls} />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {canSend ? (
        <form
          action={sendVendorRepairMessageAction}
          style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}
        >
          <input type="hidden" name="repairId" value={job.repairId} />
          <label htmlFor="vendor-job-message" style={labelStyle}>
            새 메시지
          </label>
          <textarea
            id="vendor-job-message"
            name="messageText"
            required
            maxLength={1000}
            rows={3}
            placeholder="예: 화요일 오후 3시에 방문해도 될까요?"
            style={{
              width: "100%",
              boxSizing: "border-box",
              resize: "vertical",
              padding: "var(--space-sm)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              background: "var(--surface)",
              color: "var(--on-surface)",
              font: "inherit",
              lineHeight: 1.55,
            }}
          />
          <button
            type="submit"
            style={{
              minHeight: "var(--touch-target)",
              border: 0,
              borderRadius: "var(--radius-btn)",
              background: "var(--primary)",
              color: "var(--on-primary)",
              fontWeight: 700,
            }}
          >
            보내기
          </button>
        </form>
      ) : (
        <InlineNotice>
          {active
            ? "API에 연결되면 진행 메시지를 보낼 수 있습니다."
            : "완료되거나 취소된 작업은 메시지를 읽기만 할 수 있습니다."}
        </InlineNotice>
      )}
    </Card>
  );
}

export function WorkflowEstimateSummary({ job }: { job: VendorJobSummary | VendorJobDetail }) {
  const estimate = job.latestEstimate;
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={labelStyle}>견적 회신</div>
      <InfoRow label="상태" value={estimateStatusLabel(estimate?.status)} />
      {estimate ? (
        <>
          <InfoRow
            label="회신 방식"
            value={estimate.responseType === "FIXED_ESTIMATE"
              ? "고정 견적"
              : estimate.responseType === "VISIT_REQUIRED"
                ? "방문 후 견적"
                : "진행 불가"}
          />
          {estimate.totalAmount !== undefined ? (
            <InfoRow label="견적 합계" value={`${estimate.totalAmount.toLocaleString()}원`} />
          ) : null}
          {estimate.visitAvailableAt ? (
            <InfoRow label="방문 가능 시간" value={formatDateTime(estimate.visitAvailableAt)} />
          ) : null}
          {estimate.workDescription ? (
            <p style={{ ...mutedStyle, margin: 0 }}>{estimate.workDescription}</p>
          ) : null}
          {estimate.declineReason ? (
            <p style={{ ...mutedStyle, margin: 0 }}>{estimate.declineReason}</p>
          ) : null}
          {estimate.lineItems.map((line) => (
            <InfoRow
              key={line.id}
              label={line.description}
              value={`${line.lineAmount.toLocaleString()}원`}
            />
          ))}
        </>
      ) : (
        <p style={{ ...mutedStyle, margin: 0 }}>아직 저장된 견적이 없습니다.</p>
      )}
    </Card>
  );
}

export function SettlementSummary({ job }: { job: VendorJobSummary | VendorJobDetail }) {
  const payment = job.paymentRequest;
  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={labelStyle}>정산 진행</div>
      <InfoRow
        label="현재 상태"
        value={paymentStatusLabel(payment?.status, payment?.lastAttemptMode)}
      />
      {payment ? (
        <>
          <InfoRow label="정산 금액" value={`${payment.amount.toLocaleString()}원`} />
          {payment.processedAt ? (
            <InfoRow label="처리 일시" value={formatDateTime(payment.processedAt)} />
          ) : null}
          {payment.failureReason ? (
            <p style={{ ...mutedStyle, margin: 0 }}>
              지급 처리는 관리자 확인 중입니다. 세부 내부 사유는 관리자에게 문의해 주세요.
            </p>
          ) : null}
        </>
      ) : (
        <p style={{ ...mutedStyle, margin: 0 }}>
          완료 보고가 승인되면 승인된 견적 금액으로 정산 요청이 생성됩니다.
        </p>
      )}
    </Card>
  );
}

export function formatDateTime(iso?: string) {
  if (!iso) return "일정 미정";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "일정 확인 필요";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}
