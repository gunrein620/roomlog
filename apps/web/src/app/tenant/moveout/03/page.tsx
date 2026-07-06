import Link from "next/link";
import { redirect } from "next/navigation";
import type { DeductionKind, MoveoutRecordSource, SettlementStatus } from "@roomlog/types";
import { Badge, Button, Card, Input } from "@roomlog/ui";
import { DEMO_MOVEOUT_ID, createMoveoutInquiry, getMoveout, getSettlement } from "@/lib/moveout-api";
import { CONTRACT_ROUTES } from "@/lib/contract-nav";
import { MESSAGING_ROUTES } from "@/lib/messaging-nav";
import { ROUTES as DEFECT_ROUTES } from "@/lib/nav";
import { ROUTES as MOVEIN_ROUTES } from "@/lib/movein-nav";
import { MOVEOUT_ROUTES, withMoveoutId } from "@/lib/moveout-nav";
import { PAYMENT_ROUTES } from "@/lib/payment-nav";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ id?: string }>;

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

const SOURCE_ROUTE: Record<MoveoutRecordSource, string> = {
  movein_photo: MOVEIN_ROUTES["T-IN-00"],
  defect: DEFECT_ROUTES["T-DEF-00"],
  repair: DEFECT_ROUTES["T-DEF-00"],
  payment: PAYMENT_ROUTES["T-PAY-00"],
  chat: MESSAGING_ROUTES["T-MSG-00"],
  contract: CONTRACT_ROUTES["T-DOC-00"],
};

const SOURCE_LABEL: Record<MoveoutRecordSource, string> = {
  movein_photo: "입주 기록",
  defect: "하자 기록",
  repair: "수리 기록",
  payment: "납부 기록",
  chat: "채팅",
  contract: "계약 정보",
};

function money(amount: number) {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function moneyRange(min: number, max: number) {
  return `약 ${Math.round(min / 10000).toLocaleString("ko-KR")}만~${Math.round(
    max / 10000,
  ).toLocaleString("ko-KR")}만원`;
}

function disputeHref(moveoutId: string, targetItemId?: string) {
  const targetQuery = targetItemId ? `&targetItemId=${encodeURIComponent(targetItemId)}` : "";
  return `${withMoveoutId(MOVEOUT_ROUTES["T-OUT-04"], moveoutId)}${targetQuery}&from=settlement`;
}

function attachmentUrlsFrom(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function createInquiryAction(formData: FormData) {
  "use server";

  const moveoutId = String(formData.get("moveoutId") ?? DEMO_MOVEOUT_ID).trim() || DEMO_MOVEOUT_ID;
  const body = String(formData.get("body") ?? "").trim();
  if (!body) {
    redirect(withMoveoutId(MOVEOUT_ROUTES["T-OUT-03"], moveoutId));
  }

  const attachmentUrls = attachmentUrlsFrom(formData.get("attachmentUrls"));
  const result = await createMoveoutInquiry(moveoutId, { body, attachmentUrls });
  redirect(`${MESSAGING_ROUTES["T-MSG-01"]}?id=${encodeURIComponent(result.thread.id)}`);
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const moveoutId = params.id?.trim() || DEMO_MOVEOUT_ID;
  const [moveout, settlement] = await Promise.all([
    getMoveout(moveoutId),
    getSettlement(moveoutId),
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
            href={withMoveoutId(MOVEOUT_ROUTES["T-OUT-00"], moveout.id)}
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
              <strong style={{ fontSize: 14 }}>
                {moveout.contractConfirmed ? money(settlement.depositAmount) : "계약 정보 확인 중"}
              </strong>
            </div>
            <Badge emphasis style={{ alignSelf: "flex-start" }}>
              {STATUS_LABEL[settlement.status]}
            </Badge>
          </Card>
        </section>

        {!moveout.contractConfirmed ? (
          <section>
            <div style={labelStyle}>정산 안내</div>
            <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>계약 정보 확정 후 예상 정산 안내</div>
              <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
                계약 종료일과 보증금이 확정되면 차감 후보와 예상 반환 범위를 다시 계산합니다.
                현재 화면의 정산 금액은 확정값으로 보지 않습니다.
              </div>
              <Link href={CONTRACT_ROUTES["T-DOC-00"]} style={{ color: "var(--primary)", fontSize: 12, fontWeight: 800 }}>
                계약 정보 확인
              </Link>
            </Card>
          </section>
        ) : (
          <>
            <section>
              <div style={labelStyle}>차감 후보</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {settlement.deductions.map((deduction) => (
                  <Card key={deduction.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
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
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Link
                        href={disputeHref(moveout.id, deduction.id)}
                        style={{ color: "var(--primary)", fontSize: 12, fontWeight: 800 }}
                      >
                        이의 제기
                      </Link>
                      <Link
                        href={SOURCE_ROUTE[deduction.source]}
                        style={{ color: "var(--on-surface-variant)", fontSize: 12, fontWeight: 800 }}
                      >
                        {SOURCE_LABEL[deduction.source]} 보기
                      </Link>
                    </div>
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
          </>
        )}
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
        <Link href={disputeHref(moveout.id)} style={{ textDecoration: "none", display: "block" }}>
          <Button fullWidth variant="secondary">
            이의·정정 요청
          </Button>
        </Link>
        <form
          action={createInquiryAction}
          style={{
            display: "grid",
            gap: 8,
            background: "var(--surface-container-high)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: 10,
          }}
        >
          <input type="hidden" name="moveoutId" value={moveout.id} />
          <Input name="body" aria-label="관리자 문의 내용" placeholder="관리자에게 물어볼 내용을 입력하세요" />
          <Input name="attachmentUrls" aria-label="문의 증빙 URL" placeholder="증빙 URL(선택, 쉼표로 구분)" />
          <Button type="submit" fullWidth variant="ghost">
            관리자 문의
          </Button>
        </form>
      </footer>
    </>
  );
}
