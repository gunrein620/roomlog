import { Card } from "@roomlog/ui";

export default function Loading() {
  return (
    <div style={{ display: "grid", gap: "var(--space-md)" }}>
      <Card style={{ display: "grid", gap: "var(--space-xs)" }}>
        <div style={{ fontSize: "var(--fs-subtitle)", fontWeight: 850 }}>퇴실/정산 정보를 불러오는 중</div>
        <div style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", lineHeight: "var(--lh-body)" }}>
          관리 호실, 기록 리포트, 예상 정산안, 이의 상태를 확인하고 있습니다.
        </div>
      </Card>
    </div>
  );
}
