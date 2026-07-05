import Link from "next/link";
import { redirect } from "next/navigation";
import type { DisputeStatus, TenantMoveoutDisputeAction } from "@roomlog/types";
import { Badge, Button, Card, Input } from "@roomlog/ui";
import {
  DEMO_MOVEOUT_ID,
  createMoveoutDispute,
  escalateMoveoutDispute,
  getDisputes,
  getRecords,
  getSettlement,
  updateTenantMoveoutDispute,
} from "@/lib/moveout-api";
import { MOVEOUT_ROUTES, withMoveoutId } from "@/lib/moveout-nav";

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

const inputStyle = {
  height: "var(--touch-target)",
  border: "1px solid var(--input-border)",
  borderRadius: "var(--radius-md)",
  padding: "0 12px",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--fs-body)",
  color: "var(--input-text)",
  background: "var(--surface-container-lowest)",
  width: "100%",
  boxSizing: "border-box",
} as const;

type SearchParams = Promise<{
  id?: string;
  targetItemId?: string;
  submitted?: string;
  updated?: string;
  escalated?: string;
  error?: string;
}>;

function attachmentUrlsFrom(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/[\n,]/)
    .map((url) => url.trim())
    .filter(Boolean);
}

function moveoutIdFrom(formData: FormData) {
  return String(formData.get("moveoutId") ?? DEMO_MOVEOUT_ID).trim() || DEMO_MOVEOUT_ID;
}

function disputeRedirect(moveoutId: string, flag: "submitted" | "updated" | "escalated" | "error") {
  return `${withMoveoutId(MOVEOUT_ROUTES["T-OUT-04"], moveoutId)}&${flag}=1`;
}

async function createDisputeAction(formData: FormData) {
  "use server";

  const moveoutId = moveoutIdFrom(formData);
  const targetItemId = String(formData.get("targetItemId") ?? "").trim();
  const targetLabel = String(formData.get(`targetLabel-${targetItemId}`) ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const attachmentUrls = attachmentUrlsFrom(formData.get("attachmentUrls"));

  if (!targetLabel || !reason) {
    redirect(disputeRedirect(moveoutId, "error"));
  }

  await createMoveoutDispute(moveoutId, {
    targetItemId: targetItemId || undefined,
    targetLabel,
    reason,
    attachmentUrls,
  });
  redirect(disputeRedirect(moveoutId, "submitted"));
}

async function updateDisputeAction(formData: FormData) {
  "use server";

  const moveoutId = moveoutIdFrom(formData);
  const disputeId = String(formData.get("disputeId") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim() as TenantMoveoutDisputeAction;
  const reason = String(formData.get("reason") ?? "").trim();
  const attachmentUrls = attachmentUrlsFrom(formData.get("attachmentUrls"));

  if (!disputeId || !action) {
    redirect(disputeRedirect(moveoutId, "error"));
  }

  await updateTenantMoveoutDispute(moveoutId, {
    disputeId,
    action,
    reason: reason || undefined,
    attachmentUrls,
  });
  redirect(disputeRedirect(moveoutId, "updated"));
}

async function escalateDisputeAction(formData: FormData) {
  "use server";

  const moveoutId = moveoutIdFrom(formData);
  const disputeId = String(formData.get("disputeId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!disputeId) {
    redirect(disputeRedirect(moveoutId, "error"));
  }

  await escalateMoveoutDispute(moveoutId, {
    disputeId,
    reason: reason || undefined,
  });
  redirect(disputeRedirect(moveoutId, "escalated"));
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const moveoutId = params.id?.trim() || DEMO_MOVEOUT_ID;
  const [records, settlement, disputes] = await Promise.all([
    getRecords(moveoutId),
    getSettlement(moveoutId),
    getDisputes(moveoutId),
  ]);
  const targetOptions = [
    ...settlement.deductions.map((deduction) => ({
      id: deduction.id,
      label: deduction.label,
      meta: "예상 정산",
    })),
    ...records
      .filter((record) => record.wearVerdict)
      .map((record) => ({
        id: record.id,
        label: record.title,
        meta: "퇴실 기록",
      })),
  ];
  const selectedTarget =
    targetOptions.find((option) => option.id === params.targetItemId) ??
    targetOptions[0] ?? { id: "", label: "확인이 필요한 항목", meta: "직접 입력" };

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
          href={withMoveoutId(MOVEOUT_ROUTES["T-OUT-01"], moveoutId)}
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
        {(params.submitted || params.updated || params.escalated || params.error) && (
          <Card
            style={{
              border: "1.5px solid var(--primary)",
              background: "var(--surface-container-high)",
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1.5,
            }}
          >
            {params.error
              ? "필수 항목을 입력해주세요."
              : params.escalated
                ? "에스컬레이션 요청을 보냈습니다."
                : params.updated
                  ? "이의 상태를 갱신했습니다."
                  : "이의·정정 요청을 제출했습니다."}
          </Card>
        )}

        <section>
          <div style={labelStyle}>대상 항목</div>
          <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{selectedTarget.label}</div>
            <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
              리포트나 예상 정산에서 확인이 필요한 항목을 선택해 정정 요청할 수 있어요. 현재 선택은
              {` ${selectedTarget.meta}`} 항목입니다.
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
                    {dispute.managerResponse && (
                      <div style={{ fontSize: 12, color: "var(--on-surface)", lineHeight: 1.5 }}>
                        관리자 응답 · {dispute.managerResponse}
                      </div>
                    )}
                    {(dispute.attachmentUrls ?? []).length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {dispute.attachmentUrls?.map((url) => (
                          <Badge key={`${dispute.id}-${url}`}>증빙 {url.split("/").at(-1)}</Badge>
                        ))}
                      </div>
                    )}
                    {dispute.history.map((event) => (
                      <div
                        key={`${dispute.id}-${event.status}-${event.at}`}
                        style={{ fontSize: 11, color: "var(--on-surface-variant)" }}
                      >
                        {STATUS_LABEL[event.status]} · {event.at.slice(0, 16).replace("T", " ")}
                        {event.note ? ` · ${event.note}` : ""}
                      </div>
                    ))}
                    {dispute.status === "answered" && (
                      <form action={updateDisputeAction} style={{ display: "grid", gap: 6 }}>
                        <input type="hidden" name="moveoutId" value={moveoutId} />
                        <input type="hidden" name="disputeId" value={dispute.id} />
                        <input type="hidden" name="action" value="confirm" />
                        <Button type="submit" fullWidth variant="secondary">
                          관리자 응답 확인
                        </Button>
                      </form>
                    )}
                    {["answered", "confirmed", "reviewing"].includes(dispute.status) && (
                      <form action={updateDisputeAction} style={{ display: "grid", gap: 6 }}>
                        <input type="hidden" name="moveoutId" value={moveoutId} />
                        <input type="hidden" name="disputeId" value={dispute.id} />
                        <input type="hidden" name="action" value="re_dispute" />
                        <Input name="reason" aria-label="재이의 사유" placeholder="재이의 사유" />
                        <Input
                          name="attachmentUrls"
                          aria-label="재이의 증빙 URL"
                          placeholder="증빙 URL(선택, 쉼표로 구분)"
                        />
                        <Button type="submit" fullWidth variant="ghost">
                          재이의 제출
                        </Button>
                      </form>
                    )}
                    {["answered", "confirmed", "re_disputed", "reviewing"].includes(dispute.status) && (
                      <form action={updateDisputeAction} style={{ display: "grid", gap: 6 }}>
                        <input type="hidden" name="moveoutId" value={moveoutId} />
                        <input type="hidden" name="disputeId" value={dispute.id} />
                        <input type="hidden" name="action" value="resolve" />
                        <Button type="submit" fullWidth variant="secondary">
                          해소 처리
                        </Button>
                      </form>
                    )}
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
          <div style={labelStyle}>관리자 응답 기한</div>
          {disputes.length === 0 ? (
            <Card style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
              제출된 이의가 생기면 관리자 응답 기한이 이곳에 표시됩니다.
            </Card>
          ) : (
            disputes.map((dispute) => (
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
                    {dispute.slaBreached ? "답변 지연" : "응답 대기"}
                  </span>
                  <Badge emphasis={dispute.slaBreached}>
                    {dispute.slaBreached ? "에스컬레이션 가능" : "기한 내"}
                  </Badge>
                </div>
                <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
                  관리자 응답 기한 {dispute.slaDeadline.slice(0, 16).replace("T", " ")}. 무응답이면 상위
                  알림·채팅으로 에스컬레이션할 수 있어요.
                </div>
                {dispute.slaBreached ? (
                  <form action={escalateDisputeAction} style={{ display: "grid", gap: 6 }}>
                    <input type="hidden" name="moveoutId" value={moveoutId} />
                    <input type="hidden" name="disputeId" value={dispute.id} />
                    <Input name="reason" aria-label="에스컬레이션 사유" placeholder="에스컬레이션 사유(선택)" />
                    <Button type="submit" fullWidth variant="secondary">
                      에스컬레이션 요청
                    </Button>
                  </form>
                ) : (
                  <Badge>기한 전</Badge>
                )}
              </Card>
            ))
          )}
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
        <input type="hidden" name="moveoutId" value={moveoutId} />
        <select name="targetItemId" aria-label="이의 대상 항목" defaultValue={selectedTarget.id} style={inputStyle}>
          {targetOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label} · {option.meta}
            </option>
          ))}
        </select>
        {targetOptions.map((option) => (
          <input key={option.id} type="hidden" name={`targetLabel-${option.id}`} value={option.label} />
        ))}
        <Input name="reason" aria-label="이의 사유" placeholder="정정이 필요한 근거를 입력하세요" />
        <Input name="attachmentUrls" aria-label="증빙 URL" placeholder="증빙 URL(선택, 쉼표로 구분)" />
        <Button type="submit" fullWidth>
          이의 제출
        </Button>
      </form>
    </>
  );
}
