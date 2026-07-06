import Link from "next/link";
import { Badge, Card } from "@roomlog/ui";
import { CONTRACT_ROUTES } from "@/lib/contract-nav";
import { listContracts } from "@/lib/contract-api";
import type { Contract } from "@roomlog/types";
import { priorityBadge, daysUntil, won } from "../status";

// T-DOC-00 · 내 계약서 홈 (center)
// 상태 배지 1개(우선순위·다차원) + 핵심 요약(마스킹) + 상태별 단일 primary.
// 원칙: '확정'은 관리자 경유에만(정직 표기). 검토 대기 = '검토 전 참고본' + 장기 미확정 시 검토 요청 출구.

const labelStyle = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  marginBottom: 8,
} as const;

export const dynamic = "force-dynamic";

export default async function Page() {
  const contract = (await listContracts())[0] ?? emptyContract();
  const registered = contract.lifecycle !== "unregistered";
  const badge = priorityBadge(contract);
  const dday = daysUntil(contract.endDate);
  const reviewPending = contract.review === "pending" && registered;

  return (
    <>
      {/* Header: 호실·임대인 + 알림 벨 */}
      <header
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "16px 14px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {contract.unitId}호 · {contract.landlordName} 임대인
          </div>
          <div style={{ fontSize: 11, color: "var(--on-surface-variant)", marginTop: 2 }}>
            내 계약서
          </div>
        </div>
        <div
          aria-label="알림"
          style={{
            width: 38,
            height: 38,
            border: "1.5px solid var(--outline-variant)",
            borderRadius: 10,
            background: "var(--surface-container-lowest)",
            fontSize: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          🔔
        </div>
      </header>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "16px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* ① 상태 배지 1개 (우선순위·다차원) */}
        <section>
          <div style={labelStyle}>계약 상태</div>
          <Badge emphasis={badge.emphasis} style={{ fontSize: 13 }}>
            {badge.label}
          </Badge>
        </section>

        {registered ? (
          <>
            {/* ② 핵심 요약 3줄 (마스킹 — 월세·관리비·납부일) */}
            <Card style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14 }}>
              <SummaryRow label="월세" value={won(contract.monthlyRent)} />
              <SummaryRow label="관리비" value={won(contract.maintenanceFee)} />
              <SummaryRow
                label="납부일"
                value={contract.paymentDay ? `매월 ${contract.paymentDay}일` : "미확인"}
              />
            </Card>

            {/* ③ 계약 기간·만료 D-day */}
            <Card style={{ display: "flex", flexDirection: "column", gap: 6, padding: 14 }}>
              <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>계약 기간</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {fmt(contract.startDate)} ~ {fmt(contract.endDate)}
              </div>
              {dday != null && dday >= 0 && (
                <Badge style={{ alignSelf: "flex-start" }}>만료 D-{dday}</Badge>
              )}
            </Card>

            {/* ④ 검토 대기 시: 참고본 안내 + 장기 미확정 검토 요청 출구(SLA) */}
            {reviewPending && (
              <div
                style={{
                  border: "1px dashed var(--outline)",
                  borderRadius: "var(--radius-md)",
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  background: "var(--surface-container-low)",
                }}
              >
                <div style={{ fontSize: 12.5, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
                  관리자 검토 대기 중이에요. 지금 보이는 내용은 <b>검토 전 참고본</b>으로, 실제와
                  다를 수 있어요.
                </div>
                <Link
                  href={CONTRACT_ROUTES["T-DOC-00"]}
                  style={{
                    alignSelf: "flex-start",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--primary)",
                    textDecoration: "none",
                  }}
                >
                  검토 요청 보내기 →
                </Link>
              </div>
            )}
          </>
        ) : (
          /* 미등록 = 인-스크린 빈 상태 */
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              textAlign: "center",
              padding: "40px 16px",
              border: "1.5px dashed var(--outline-variant)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                border: "1.5px solid var(--outline-variant)",
                borderRadius: 10,
                background: "var(--surface-container)",
              }}
            />
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--on-surface-variant)" }}>
              등록된 계약서가 없어요
            </div>
            <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
              아래에서 계약서를 등록해 보세요
            </div>
          </div>
        )}
      </div>

      {/* Footer: 상태별 단일 primary + 보조 묶음 */}
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
        <Link
          href={registered ? CONTRACT_ROUTES["T-DOC-02"] : CONTRACT_ROUTES["T-DOC-01"]}
          style={{
            display: "flex",
            width: "100%",
            boxSizing: "border-box",
            height: "var(--touch-target)",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--primary)",
            color: "var(--on-primary)",
            borderRadius: "var(--radius-btn)",
            fontSize: "var(--fs-body)",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          {registered ? "계약 내용 보기" : "+ 계약서 등록"}
        </Link>
        {registered && (
          <div style={{ display: "flex", gap: 8 }}>
            <SubLink href={CONTRACT_ROUTES["T-DOC-03"]}>내용 도움말</SubLink>
            <SubLink href={CONTRACT_ROUTES["T-DOC-04"]}>개인정보·보관</SubLink>
          </div>
        )}
      </footer>
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontSize: 13, color: "var(--on-surface-variant)" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function SubLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        flex: 1,
        display: "flex",
        height: 40,
        alignItems: "center",
        justifyContent: "center",
        border: "1.5px solid var(--outline-variant)",
        borderRadius: "var(--radius-btn)",
        fontSize: 12.5,
        fontWeight: 600,
        color: "var(--on-surface-variant)",
        textDecoration: "none",
      }}
    >
      {children}
    </Link>
  );
}

function fmt(iso?: string): string {
  if (!iso) return "미확인";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function emptyContract(): Contract {
  const now = new Date().toISOString();

  return {
    id: "unregistered",
    unitId: "-",
    landlordName: "미등록",
    lifecycle: "unregistered",
    review: "pending",
    deletion: "none",
    valueSource: "unverified",
    createdAt: now,
    updatedAt: now,
  };
}
