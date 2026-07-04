"use client";

import { Button, Card } from "@roomlog/ui";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ display: "grid", gap: "var(--space-md)" }}>
      <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
        <div style={{ fontSize: "var(--fs-subtitle)", fontWeight: 850 }}>퇴실/정산 정보를 불러오지 못했습니다</div>
        <div style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", lineHeight: "var(--lh-body)" }}>
          네트워크 상태, 로그인 권한, 관리 호실 스코프가 바뀌었을 수 있습니다.
        </div>
        <Button type="button" variant="secondary" onClick={reset}>
          다시 불러오기
        </Button>
      </Card>
    </div>
  );
}
