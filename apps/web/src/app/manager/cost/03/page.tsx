import { Badge, Card } from "@roomlog/ui";
import { getCost } from "@/lib/cost-api";
import { MANAGER_COST_ROUTES } from "@/lib/cost-nav";
import {
  DisabledButton,
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
        : "귀속 확인";
  const primaryHref =
    cost.type === "maintenance"
      ? MANAGER_COST_ROUTES["M-COST-04"]
      : cost.type === "repair" && cost.repairPayment === "unpaid"
        ? "/manager/ticket/dash/05" // 수리비 미지불 결제 처리 → M-DASH-05 (스펙 전이표)
        : MANAGER_COST_ROUTES["M-COST-03"];

  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-COST-03"
        title="비용 상세·귀속"
        desc="확정 비용의 상태, 귀속, 반영 상태를 확인하고 정정·무효는 append-only로 남깁니다."
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
            <div style={mutedSmallStyle}>{formatDate(cost.date)} · {cost.scope === "unit" ? `${cost.unitId ?? "호실 미정"}호` : "공용=건물 기록"}</div>
          </div>
          <div style={{ fontSize: "var(--fs-title)", fontWeight: 850 }}>{won(cost.amount)}</div>
        </div>
      </Card>

      <section style={grid2Style}>
        <Section title="원본·필드">
          <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
            <div style={rowStyle}><span>영수증</span><span>{cost.receiptId ?? "증빙 없음"}</span></div>
            <div style={rowStyle}><span>상태</span><span>{statusLabel[cost.status]}</span></div>
            <div style={rowStyle}><span>정정 연결</span><span>{cost.supersedesId ?? "없음"}</span></div>
          </Card>
        </Section>
        <Section title="귀속·반영">
          <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
            <div style={rowStyle}><span>귀속</span><span>{cost.scope === "unit" ? `호실 ${cost.unitId ?? "미정"}` : "건물 기록"}</span></div>
            <div style={rowStyle}><span>리포트 반영</span><span>{cost.status === "confirmed" ? "반영" : "집계 제외 또는 감사 차감"}</span></div>
            <div style={rowStyle}><span>호실/건물 기록</span><span>M-DOC-03 점선 연결</span></div>
          </Card>
        </Section>
      </section>

      <Section title="수리비 결제 상태">
        <div style={grid2Style}>
          <Card style={{ border: cost.repairPayment === "already_paid" ? "1.5px solid var(--primary)" : "1px solid var(--border)" }}>
            <div style={{ fontWeight: 850 }}>이미 지불</div>
            <div style={mutedSmallStyle}>기록만 연결하고 결제 승인을 만들지 않습니다.</div>
          </Card>
          <Card style={{ border: cost.repairPayment === "unpaid" ? "1.5px solid var(--primary)" : "1px solid var(--border)" }}>
            <div style={{ fontWeight: 850 }}>미지불</div>
            <div style={mutedSmallStyle}>M-DASH-05 결제 승인으로 넘깁니다. 연결키: {cost.paymentRef ?? "대기"}</div>
          </Card>
        </div>
      </Section>

      <Section title="append-only 감사로그">
        <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
          <div style={rowStyle}><span>생성</span><span>{formatDate(cost.createdAt)}</span></div>
          <div style={rowStyle}><span>마지막 변경</span><span>{formatDate(cost.updatedAt)}</span></div>
          {cost.voidReason ? <div style={rowStyle}><span>무효 사유</span><span>{cost.voidReason}</span></div> : null}
        </Card>
      </Section>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-sm)" }}>
        <LinkButton href={primaryHref}>{primary}</LinkButton>
        <LinkButton href={MANAGER_COST_ROUTES["M-COST-02"]} variant="secondary">정정</LinkButton>
        <DisabledButton>무효(void)</DisabledButton>
      </div>
    </PageStack>
  );
}
