import Link from "next/link";
import type { Ticket, TicketStatus } from "@roomlog/types";
import { Badge, Card } from "@roomlog/ui";
import { ROUTES } from "@/lib/nav";
import { listTickets } from "@/lib/api";

// T-DEF-00 · 내 하자 홈 (center)
// 진행 중 신고를 한눈에 + "새 하자 신고" 진입점. 빈 상태는 인-스크린.
// 원칙: 티켓 상태(접수·검토 트랙) ≠ 수리 상태(수리 트랙) — 칩 2개를 생활어로 분리 표기.

// 접수·검토 트랙(티켓 상태)의 생활어 라벨
const TICKET_TRACK_LABEL: Record<TicketStatus, string> = {
  received: "접수됨",
  reviewing: "검토 중",
  info_requested: "정보 요청됨",
  processing: "처리 중",
  resolved: "완료",
  reopened: "재요청됨",
};

const labelStyle = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  marginBottom: 8,
} as const;

export default async function Page() {
  const tickets = await listTickets();
  const inProgress = tickets.filter((t) => t.status !== "resolved");
  const completed = tickets.filter((t) => t.status === "resolved");
  const unit = tickets[0]?.unitId ?? "302";

  return (
    <>
      {/* Header: 인사/호실 + 알림 벨(→11) */}
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
          <div style={{ fontSize: 15, fontWeight: 700 }}>안녕하세요, {unit}호</div>
          <div style={{ fontSize: 11, color: "var(--on-surface-variant)", marginTop: 2 }}>
            룸로그
          </div>
        </div>
        <Link
          href={ROUTES["T-DEF-11"]}
          aria-label="알림"
          style={{
            position: "relative",
            width: 38,
            height: 38,
            border: "1.5px solid var(--outline-variant)",
            borderRadius: 10,
            background: "var(--surface-container-lowest)",
            fontSize: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
          }}
        >
          🔔
          <span
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              minWidth: 18,
              height: 18,
              border: "1.5px solid var(--primary)",
              borderRadius: "var(--radius-full)",
              background: "var(--surface-container-lowest)",
              color: "var(--on-surface)",
              fontSize: 10,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 3px",
            }}
          >
            2
          </span>
        </Link>
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
        {inProgress.length > 0 ? (
          <>
            <section>
              <div style={labelStyle}>진행 중 신고</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {inProgress.map((t) => (
                  <InProgressCard key={t.id} ticket={t} />
                ))}
              </div>
            </section>

            {completed.length > 0 && (
              <section>
                <div style={labelStyle}>최근 완료</div>
                {completed.slice(0, 1).map((t) => (
                  <Card
                    key={t.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: 12,
                    }}
                  >
                    <span style={{ fontSize: 13, color: "var(--on-surface-variant)" }}>
                      {t.title}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>완료</span>
                  </Card>
                ))}
              </section>
            )}
          </>
        ) : (
          /* 빈 상태 = 인-스크린 */
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
              진행 중인 하자가 없어요
            </div>
            <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
              아래에서 새 하자를 신고해 보세요
            </div>
          </div>
        )}
      </div>

      {/* Footer: FAB → 01 */}
      <footer
        style={{
          flex: "none",
          padding: "12px 14px",
          borderTop: "1px solid var(--border)",
        }}
      >
        <Link
          href={ROUTES["T-DEF-01"]}
          style={{
            display: "flex",
            width: "100%",
            boxSizing: "border-box",
            height: "var(--touch-target)",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            background: "var(--primary)",
            color: "var(--on-primary)",
            borderRadius: "var(--radius-btn)",
            fontSize: "var(--fs-body)",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          + 새 하자 신고
        </Link>
      </footer>
    </>
  );
}

// 진행 중 신고 카드 — 카드 탭 시 단일 허브(11)로 진입.
// 칩 2개: 접수·검토 트랙(티켓 상태) / 수리 트랙(수리 진행). 두 트랙을 섞지 않는다.
function InProgressCard({ ticket }: { ticket: Ticket }) {
  const hasRepair = Boolean(ticket.repairJobId);
  return (
    <Link href={ROUTES["T-DEF-11"]} style={{ textDecoration: "none", color: "inherit" }}>
      <Card
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          cursor: "pointer",
          padding: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{ticket.title}</div>
          <Badge>긴급도 {ticket.urgency}</Badge>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Badge emphasis>{TICKET_TRACK_LABEL[ticket.status]}</Badge>
          {hasRepair ? (
            <Badge>수리 중</Badge>
          ) : (
            <Badge style={{ color: "var(--on-surface-variant)" }}>수리 대기</Badge>
          )}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--on-surface-variant)",
            borderTop: "1px dashed var(--border)",
            paddingTop: 8,
          }}
        >
          최근 알림 · 관리자가 확인했어요
        </div>
      </Card>
    </Link>
  );
}
