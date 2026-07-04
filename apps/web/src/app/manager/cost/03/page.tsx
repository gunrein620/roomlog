import { redirect } from "next/navigation";
import { Badge, Card } from "@roomlog/ui";
import { confirmCost, getCost, voidCost } from "@/lib/cost-api";
import { MANAGER_COST_ROUTES } from "@/lib/cost-nav";
import {
  LinkButton,
  PageStack,
  ScreenHeader,
  Section,
  StatusBadge,
  formatDate,
  grid2Style,
  mutedSmallStyle,
  rowStyle,
  statusLabel,
  typeLabel,
  won,
} from "../_components";

type SearchParams = Promise<{ id?: string }>;

export const dynamic = "force-dynamic";

async function confirmCostAction(formData: FormData) {
  "use server";

  const costId = String(formData.get("costId") ?? "");
  const cost = await confirmCost(costId);
  redirect(`${MANAGER_COST_ROUTES["M-COST-03"]}?id=${encodeURIComponent(cost.id)}`);
}

async function voidCostAction(formData: FormData) {
  "use server";

  const costId = String(formData.get("costId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const cost = await voidCost(costId, reason);
  redirect(`${MANAGER_COST_ROUTES["M-COST-03"]}?id=${encodeURIComponent(cost.id)}`);
}

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { id } = await searchParams;
  const cost = await getCost(id);
  const primary =
    cost.type === "repair"
      ? cost.repairPayment === "unpaid"
        ? "결제 처리"
        : "기록 연결"
      : cost.type === "maintenance"
        ? "공개 관리"
        : "검토 확인";
  const primaryHref =
    cost.type === "maintenance"
      ? MANAGER_COST_ROUTES["M-COST-04"]
      : cost.type === "repair" && cost.repairPayment === "unpaid"
        ? "/manager/ticket/dash/05"
        : MANAGER_COST_ROUTES["M-COST-03"];

  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-COST-03"
        title="비용 상세 · 원장"
        desc="비용은 지출 원장입니다. confirmed 상태만 리포트와 집계에 반영되고, 삭제 대신 void로 감사 흔적을 남깁니다."
        actions={<LinkButton href={MANAGER_COST_ROUTES["M-COST-00"]} variant="ghost">원장으로</LinkButton>}
      />

      <Card style={{ display: "grid", gap: "var(--space-md)", background: "var(--surface-container-high)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)", flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap", marginBottom: "var(--space-sm)" }}>
              <Badge emphasis>{typeLabel[cost.type]}</Badge>
              <StatusBadge status={cost.status} />
              {!cost.verified ? <Badge emphasis>미검증 라벨</Badge> : null}
            </div>
            <h1 style={{ margin: 0, fontSize: "var(--fs-title)", lineHeight: "var(--lh-title)" }}>{cost.item}</h1>
            <div style={mutedSmallStyle}>
              {formatDate(cost.date)} · {cost.scope === "unit" ? `${cost.unitId ?? "호실 미정"}호` : "건물 기록"}
            </div>
          </div>
          <div style={{ fontSize: "var(--fs-title)", fontWeight: 850 }}>{won(cost.amount)}</div>
        </div>
      </Card>

      <section style={grid2Style}>
        <Section title="원본 · 상태">
          <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
            <div style={rowStyle}><span>영수증</span><span>{cost.receiptId ?? "증빙 없음"}</span></div>
            <div style={rowStyle}><span>상태</span><span>{statusLabel[cost.status]}</span></div>
            <div style={rowStyle}><span>정정 연결</span><span>{cost.supersedesId ?? "없음"}</span></div>
          </Card>
        </Section>
        <Section title="집계 반영">
          <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
            <div style={rowStyle}><span>귀속</span><span>{cost.scope === "unit" ? `호실 ${cost.unitId ?? "미정"}` : "건물 기록"}</span></div>
            <div style={rowStyle}>
              <span>리포트 반영</span>
              <span>{cost.status === "confirmed" || cost.status === "amended" ? "반영" : "집계 제외"}</span>
            </div>
            <div style={rowStyle}><span>공개 상태</span><span>{cost.disclosure === "private" ? "비공개 예외" : cost.disclosure === "public" ? "기본 공개" : "해당 없음"}</span></div>
          </Card>
        </Section>
      </section>

      <Section title="수리비 결제 상태">
        <div style={grid2Style}>
          <Card style={{ border: cost.repairPayment === "already_paid" ? "1.5px solid var(--primary)" : "1px solid var(--border)" }}>
            <div style={{ fontWeight: 850 }}>이미 지불</div>
            <div style={mutedSmallStyle}>기록만 연결하고 결제 액션은 만들지 않습니다.</div>
          </Card>
          <Card style={{ border: cost.repairPayment === "unpaid" ? "1.5px solid var(--primary)" : "1px solid var(--border)" }}>
            <div style={{ fontWeight: 850 }}>미지불</div>
            <div style={mutedSmallStyle}>결제 큐로 넘길 수 있습니다. 연결값: {cost.paymentRef ?? "대기"}</div>
          </Card>
        </div>
      </Section>

      <Section title="append-only 감사 로그">
        <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
          <div style={rowStyle}><span>생성</span><span>{formatDate(cost.createdAt)}</span></div>
          <div style={rowStyle}><span>마지막 변경</span><span>{formatDate(cost.updatedAt)}</span></div>
          {cost.voidReason ? <div style={rowStyle}><span>무효 사유</span><span>{cost.voidReason}</span></div> : null}
        </Card>
      </Section>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-sm)", flexWrap: "wrap" }}>
        <LinkButton href={primaryHref}>{primary}</LinkButton>
        {cost.status === "draft" ? (
          <form action={confirmCostAction}>
            <input type="hidden" name="costId" value={cost.id} />
            <button type="submit" style={secondaryButtonStyle}>원장 확정</button>
          </form>
        ) : null}
        {cost.status !== "void" ? (
          <form action={voidCostAction} style={{ display: "flex", gap: "var(--space-xs)", flexWrap: "wrap" }}>
            <input type="hidden" name="costId" value={cost.id} />
            <input
              name="reason"
              aria-label="무효 사유"
              placeholder="무효 사유"
              style={reasonInputStyle}
            />
            <button type="submit" style={dangerButtonStyle}>무효(void)</button>
          </form>
        ) : null}
      </div>
    </PageStack>
  );
}

const secondaryButtonStyle = {
  minHeight: "var(--touch-target)",
  padding: "0 var(--space-lg)",
  border: "1.5px solid var(--primary)",
  borderRadius: "var(--radius-btn)",
  background: "transparent",
  color: "var(--primary)",
  font: "inherit",
  fontWeight: 800,
  cursor: "pointer",
};

const dangerButtonStyle = {
  minHeight: "var(--touch-target)",
  padding: "0 var(--space-lg)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-btn)",
  background: "var(--surface-container-lowest)",
  color: "var(--on-surface)",
  font: "inherit",
  fontWeight: 800,
  cursor: "pointer",
};

const reasonInputStyle = {
  minHeight: "var(--touch-target)",
  width: 180,
  padding: "0 var(--space-md)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-btn)",
  background: "var(--surface-container-lowest)",
  color: "var(--on-surface)",
  font: "inherit",
};
