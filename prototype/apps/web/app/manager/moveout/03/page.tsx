import { Card } from "@roomlog/ui";
import { getManagerSettlement } from "@/lib/moveout-manager-api";
import { DEMO_MOVEOUT_ID } from "@/lib/demo-moveout";
import { MANAGER_MOVEOUT_ROUTES } from "@/lib/moveout-manager-nav";
import {
  DisputeQueue,
  InputLike,
  LinkButton,
  MetricCard,
  PageStack,
  ScreenHeader,
  Section,
  grid2Style,
  grid3Style,
  mutedSmallStyle,
  rowStyle,
} from "../_components";

export default async function Page() {
  const review = await getManagerSettlement(DEMO_MOVEOUT_ID);
  const waiting = review.disputes.filter((dispute) => dispute.status !== "resolved" && dispute.status !== "confirmed").length;
  const breached = review.disputes.filter((dispute) => dispute.slaBreached).length;
  const selected = review.disputes[0];

  return (
    <PageStack>
      <ScreenHeader
        eyebrow="M-OUT-03"
        title="이의·정정 처리 큐"
        desc="임차인 이의를 수신, 원본과 대조, 응답하고 리포트 또는 예상 정산안에 반영합니다."
        actions={<LinkButton href={MANAGER_MOVEOUT_ROUTES["M-OUT-00"]} variant="ghost">대시보드로</LinkButton>}
      />

      <section style={grid3Style}>
        <MetricCard label="대기" value={`${waiting}건`} note="응답 또는 반영 필요" />
        <MetricCard label="SLA 경과" value={`${breached}건`} note="무응답 출구 안내 필요" />
        <MetricCard label="모바일 허용" value="응답 가능" note="금액 조정은 데스크탑에서 처리" />
      </section>

      <Section title="이의 큐">
        <DisputeQueue disputes={review.disputes} />
      </Section>

      <Section title="원본 대조">
        <div style={grid2Style}>
          <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
            <div style={{ fontWeight: 850 }}>대상 항목</div>
            <div style={rowStyle}>
              <span>{selected?.targetLabel ?? "미해소 이의 없음"}</span>
              <span>{selected ? (selected.slaBreached ? "SLA 경과" : "SLA 정상") : "—"}</span>
            </div>
            <div style={mutedSmallStyle}>{selected?.reason ?? "현재 대조할 미해소 이의가 없습니다."}</div>
          </Card>
          <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
            <div style={{ fontWeight: 850 }}>원본 근거</div>
            <div style={mutedSmallStyle}>
              리포트 근거와 예상 정산안 근거를 같은 출처로 대조합니다. 관리인이 보는 근거는 임차인도 동일하게 열람합니다.
            </div>
          </Card>
        </div>
      </Section>

      <Section title="응답 작성">
        <Card style={{ display: "grid", gap: "var(--space-md)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-sm)" }}>
            <InputLike label="판단" value="인정 / 조정 / 사유 회신" />
            <InputLike label="반영 옵션" value="리포트 / 정산 / 없음" />
            <InputLike label="다음 상태" value="관리자 응답 → 임차인 확인" />
          </div>
          <div style={mutedSmallStyle}>
            사유 없이 거절하지 않습니다. 인정 또는 조정 시 어떤 근거를 반영했는지 함께 남기고 감사로그에 연결합니다.
          </div>
        </Card>
      </Section>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-sm)", flexWrap: "wrap" }}>
        <LinkButton href={MANAGER_MOVEOUT_ROUTES["M-OUT-00"]}>응답 발송</LinkButton>
        <LinkButton href={MANAGER_MOVEOUT_ROUTES["M-OUT-01"]} variant="secondary">리포트 반영</LinkButton>
        <LinkButton href={MANAGER_MOVEOUT_ROUTES["M-OUT-02"]} variant="secondary">정산 반영</LinkButton>
      </div>
    </PageStack>
  );
}
