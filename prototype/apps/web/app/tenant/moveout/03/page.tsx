import Link from "next/link";
import type { DeductionKind, SettlementStatus } from "@roomlog/types";
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

const KIND_LABEL: Record<DeductionKind, string> = {
  unpaid: "미납",
  repair: "수리비 후보",
  restoration: "원상복구",
  cleaning: "청소",
};

const STATUS_LABEL: Record<SettlementStatus, string> = {
  estimate: "예상 · 미확정",
  reviewing: "검토 중",
  review_done: "검토 완료(예상안)",
  re_review: "재검토 중",
};

function money(amount: number) {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function moneyRange(min: number, max: number) {
  return `약 ${Math.round(min / 10000).toLocaleString("ko-KR")}만~${Math.round(
    max / 10000,
  ).toLocaleString("ko-KR")}만원`;
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
          padding: 14,
          borderBottom: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link
            href={MOVEOUT_ROUTES["T-OUT-00"]}
            style={{ fontSize: 13, color: "var(--on-surface-variant)", textDecoration: "none" }}
          >
            ‹ 뒤로
          </Link>
          <div style={{ fontSize: 14, fontWeight: 700 }}>예상 정산 안내</div>
          <div style={{ width: 34 }} />
        </div>
        <div
          style={{
            border: "1.5px solid var(--primary)",
            borderRadius: 10,
            padding: 10,
            background: "var(--surface-container-high)",
            fontSize: 11,
            fontWeight: 700,
            lineHeight: 1.5,
          }}
        >
          {settlement.disclaimer}
        </div>
      </header>

      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <section>
          <div style={labelStyle}>요약</div>
          <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 13, color: "var(--on-surface-variant)" }}>남은 기간</span>
              <strong style={{ fontSize: 14 }}>D-{moveout.daysRemaining ?? "확인 중"}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 13, color: "var(--on-surface-variant)" }}>보증금(참고)</span>
              <strong style={{ fontSize: 14 }}>{money(settlement.depositAmount)}</strong>
            </div>
            <Badge emphasis style={{ alignSelf: "flex-start" }}>
              {STATUS_LABEL[settlement.status]}
            </Badge>
          </Card>
        </section>

        <section>
          <div style={labelStyle}>차감 후보</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {settlement.deductions.map((deduction) => (
              <Card key={deduction.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{deduction.label}</div>
                    <div style={{ fontSize: 11, color: "var(--on-surface-variant)", marginTop: 2 }}>
                      {KIND_LABEL[deduction.kind]}
                    </div>
                  </div>
                  {deduction.needsConfirmation && <Badge emphasis>확인 필요</Badge>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  예상 {money(deduction.estimatedMin)}~{money(deduction.estimatedMax)}
                </div>
                <details>
                  <summary
                    style={{
                      color: "var(--primary)",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    근거 보기
                  </summary>
                  <div
                    style={{
                      marginTop: 8,
                      borderTop: "1px dashed var(--border)",
                      paddingTop: 8,
                      fontSize: 12,
                      color: "var(--on-surface-variant)",
                      lineHeight: 1.5,
                    }}
                  >
                    {deduction.evidenceNote}
                  </div>
                </details>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <div style={labelStyle}>예상 반환액</div>
          <Card
            style={{
              border: "1.5px solid var(--primary)",
              display: "flex",
              flexDirection: "column",
              gap: 7,
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 800 }}>
              {moneyRange(settlement.refundMin, settlement.refundMax)}
            </div>
            <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
              줄 수도 늘 수도, 확정 아님
            </div>
          </Card>
        </section>
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
        <Link href={MOVEOUT_ROUTES["T-OUT-04"]} style={{ textDecoration: "none", display: "block" }}>
          <Button fullWidth variant="secondary">
            이의·정정 요청
          </Button>
        </Link>
        <Button
          fullWidth
          variant="ghost"
          disabled
          style={{
            background: "var(--surface-container-high)",
            color: "var(--on-surface-variant)",
            cursor: "not-allowed",
          }}
        >
          관리자 문의
        </Button>
      </footer>
    </>
  );
}
