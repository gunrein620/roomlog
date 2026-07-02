import Link from "next/link";
import { Badge, Button, Card } from "@roomlog/ui";
import { DEMO_MOVEOUT_ID, getMoveout, getSettlement } from "@/lib/moveout-api";
import { MOVEOUT_ROUTES } from "@/lib/moveout-nav";

const labelStyle = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  marginBottom: 8,
} as const;

const secondaryLinkStyle = {
  flex: 1,
  display: "flex",
  height: 42,
  alignItems: "center",
  justifyContent: "center",
  border: "1.5px solid var(--primary)",
  borderRadius: "var(--radius-btn)",
  color: "var(--primary)",
  fontSize: 13,
  fontWeight: 700,
  textDecoration: "none",
} as const;

function moneyRange(min?: number, max?: number) {
  if (min == null || max == null) return "계약 정보 확인 중";
  return `약 ${Math.round(min / 10000).toLocaleString("ko-KR")}만~${Math.round(
    max / 10000,
  ).toLocaleString("ko-KR")}만원`;
}

function statusLabel(progress: number) {
  if (progress >= 0.8) return "마무리 단계";
  if (progress >= 0.5) return "준비 중";
  return "시작 전";
}

export default async function Page() {
  const [moveout, settlement] = await Promise.all([
    getMoveout(DEMO_MOVEOUT_ID),
    getSettlement(DEMO_MOVEOUT_ID),
  ]);

  return (
    <>
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
          <div style={{ fontSize: 15, fontWeight: 700 }}>{moveout.unitId}호 · 퇴실 준비</div>
          <div style={{ fontSize: 11, color: "var(--on-surface-variant)", marginTop: 2 }}>
            룸로그 T-OUT
          </div>
        </div>
        <Link
          href={MOVEOUT_ROUTES["T-OUT-03"]}
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
            1
          </span>
        </Link>
      </header>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "16px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <section>
          <div style={labelStyle}>계약 종료</div>
          <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {moveout.contractConfirmed ? (
              <>
                <div style={{ fontSize: 28, fontWeight: 800 }}>D-{moveout.daysRemaining}</div>
                <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
                  종료일 {moveout.leaseEndDate?.slice(0, 10)}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 18, fontWeight: 800 }}>계약 정보 확정 후 안내</div>
                <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
                  종료일과 보증금 정보가 확정되면 예상 정산을 볼 수 있어요.
                </div>
                <Badge style={{ alignSelf: "flex-start" }}>관리자 문의 필요</Badge>
              </>
            )}
          </Card>
        </section>

        <section>
          <div style={labelStyle}>예상 정산 요약</div>
          <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>
              {moveout.contractConfirmed
                ? moneyRange(moveout.estimatedRefundMin, moveout.estimatedRefundMax)
                : "계약 정보 확인 중"}
            </span>
            <Badge emphasis>미확정</Badge>
          </Card>
        </section>

        <section>
          <div style={labelStyle}>준비 진행</div>
          <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Badge emphasis>{statusLabel(moveout.prepProgress)}</Badge>
            <span style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
              {Math.round(moveout.prepProgress * 100)}%
            </span>
          </Card>
        </section>

        <div
          style={{
            border: "1.5px solid var(--primary)",
            borderRadius: "var(--radius-md)",
            padding: 12,
            background: "var(--surface-container-high)",
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1.5,
          }}
        >
          {settlement.disclaimer}
        </div>
      </div>

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
        <Link href={MOVEOUT_ROUTES["T-OUT-01"]} style={{ textDecoration: "none", display: "block" }}>
          <Button fullWidth>내 퇴실 기록 보기</Button>
        </Link>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href={MOVEOUT_ROUTES["T-OUT-03"]} style={secondaryLinkStyle}>
            예상 정산
          </Link>
          <Link href={MOVEOUT_ROUTES["T-OUT-02"]} style={secondaryLinkStyle}>
            체크리스트
          </Link>
        </div>
      </footer>
    </>
  );
}
