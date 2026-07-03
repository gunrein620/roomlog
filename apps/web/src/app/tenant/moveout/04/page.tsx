import Link from "next/link";
import { redirect } from "next/navigation";
import type { DisputeStatus } from "@roomlog/types";
import { Badge, Button, Card, Input } from "@roomlog/ui";
import {
  DEMO_MOVEOUT_ID,
  createMoveoutDispute,
  getDisputes,
  getRecords,
  getSettlement,
} from "@/lib/moveout-api";
import { MOVEOUT_ROUTES } from "@/lib/moveout-nav";

export const dynamic = "force-dynamic";

const labelStyle = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
  marginBottom: 8,
} as const;

const STATUS_LABEL: Record<DisputeStatus, string> = {
  received: "접수",
  reviewing: "검토중",
  answered: "관리자 응답",
  confirmed: "임차인 확인",
  re_disputed: "재이의",
  resolved: "해소",
};

const STATUS_FLOW: DisputeStatus[] = [
  "received",
  "reviewing",
  "answered",
  "confirmed",
  "re_disputed",
  "resolved",
];

async function createDisputeAction(formData: FormData) {
  "use server";

  const targetItemId = String(formData.get("targetItemId") ?? "").trim();
  const targetLabel = String(formData.get("targetLabel") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!targetLabel || !reason) {
    redirect(MOVEOUT_ROUTES["T-OUT-04"]);
  }

  await createMoveoutDispute(DEMO_MOVEOUT_ID, {
    targetItemId: targetItemId || undefined,
    targetLabel,
    reason,
  });
  redirect(MOVEOUT_ROUTES["T-OUT-04"]);
}

export default async function Page() {
  const [records, settlement, disputes] = await Promise.all([
    getRecords(DEMO_MOVEOUT_ID),
    getSettlement(DEMO_MOVEOUT_ID),
    getDisputes(DEMO_MOVEOUT_ID),
  ]);
  const selectedTarget =
    disputes[0]?.targetLabel ??
    settlement.deductions.find((deduction) => deduction.needsConfirmation)?.label ??
    records.find((record) => record.wearVerdict)?.title ??
    "확인이 필요한 항목";

  return (
    <>
      <header
        style={{
          flex: "none",
          padding: 14,
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link
          href={MOVEOUT_ROUTES["T-OUT-01"]}
          style={{ fontSize: 13, color: "var(--on-surface-variant)", textDecoration: "none" }}
        >
          ‹ 뒤로
        </Link>
        <div style={{ fontSize: 14, fontWeight: 700 }}>이의·정정 요청</div>
        <div style={{ width: 34 }} />
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
          <div style={labelStyle}>대상 항목</div>
          <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{selectedTarget}</div>
            <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
              리포트나 예상 정산에서 확인이 필요한 항목을 선택해 정정 요청할 수 있어요.
            </div>
          </Card>
        </section>

        <section>
          <div style={labelStyle}>이의 사유</div>
          <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                minHeight: 72,
                border: "1px solid var(--outline-variant)",
                borderRadius: 8,
                padding: 10,
                fontSize: 13,
                color: "var(--on-surface-variant)",
                lineHeight: 1.5,
                background: "var(--surface-container-low)",
              }}
            >
              입주 시부터 있던 노후, 이전 신고·수리 기록, 납부 내역 등 정정 사유를 남깁니다.
            </div>
            <Badge style={{ alignSelf: "flex-start" }}>근거 첨부 선택</Badge>
          </Card>
        </section>

        <section>
          <div style={labelStyle}>진행 상태</div>
          <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {STATUS_FLOW.map((status) => (
                <Badge
                  key={status}
                  emphasis={disputes.some((dispute) => dispute.status === status)}
                >
                  {STATUS_LABEL[status]}
                </Badge>
              ))}
            </div>
            {disputes.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {disputes.map((dispute) => (
                  <div
                    key={dispute.id}
                    style={{
                      borderTop: "1px dashed var(--border)",
                      paddingTop: 10,
                      display: "flex",
                      flexDirection: "column",
                      gap: 7,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <strong style={{ fontSize: 13 }}>{dispute.targetLabel}</strong>
                      <Badge emphasis>{STATUS_LABEL[dispute.status]}</Badge>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
                      {dispute.reason}
                    </div>
                    {dispute.history.map((event) => (
                      <div
                        key={`${dispute.id}-${event.status}-${event.at}`}
                        style={{ fontSize: 11, color: "var(--on-surface-variant)" }}
                      >
                        {STATUS_LABEL[event.status]} · {event.at.slice(0, 16).replace("T", " ")}
                        {event.note ? ` · ${event.note}` : ""}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--on-surface-variant)" }}>
                아직 제출된 이의가 없어요.
              </div>
            )}
          </Card>
        </section>

        <section>
          <div style={labelStyle}>무응답 SLA</div>
          {disputes.map((dispute) => (
            <Card
              key={`${dispute.id}-sla`}
              style={{
                border: dispute.slaBreached
                  ? "1.5px solid var(--primary)"
                  : "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: 7,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 800 }}>
                  {dispute.slaBreached ? "SLA 경과" : "응답 대기"}
                </span>
                <Badge emphasis={dispute.slaBreached}>
                  {dispute.slaBreached ? "에스컬레이션 가능" : "기한 내"}
                </Badge>
              </div>
              <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
                관리자 응답 기한 {dispute.slaDeadline.slice(0, 16).replace("T", " ")}. 무응답이면 상위
                알림·채팅으로 에스컬레이션할 수 있어요.
              </div>
              <Button
                fullWidth
                variant="secondary"
                disabled={!dispute.slaBreached}
                style={
                  dispute.slaBreached
                    ? undefined
                    : {
                        background: "var(--surface-container-high)",
                        color: "var(--on-surface-variant)",
                        border: "1px solid var(--outline-variant)",
                        cursor: "not-allowed",
                      }
                }
              >
                에스컬레이션 요청
              </Button>
            </Card>
          ))}
        </section>
      </div>

      <form
        action={createDisputeAction}
        style={{
          flex: "none",
          padding: "12px 14px",
          borderTop: "1px solid var(--border)",
          display: "grid",
          gap: 8,
        }}
      >
        <input
          type="hidden"
          name="targetItemId"
          value={settlement.deductions.find((deduction) => deduction.label === selectedTarget)?.id ?? ""}
        />
        <input type="hidden" name="targetLabel" value={selectedTarget} />
        <Input name="reason" aria-label="이의 사유" placeholder="정정이 필요한 근거를 입력하세요" />
        <Button type="submit" fullWidth>
          이의 제출
        </Button>
      </form>
    </>
  );
}
