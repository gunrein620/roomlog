"use client";

import { Button, Card } from "@roomlog/ui";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <>
      <header
        style={{
          flex: "none",
          padding: 14,
          borderBottom: "1px solid var(--border)",
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        퇴실 정보를 불러오지 못했습니다
      </header>
      <div style={{ flex: 1, padding: 14 }}>
        <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>다시 시도해주세요</div>
          <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
            네트워크 상태나 권한이 바뀌었을 수 있습니다.
          </div>
          <Button type="button" fullWidth variant="secondary" onClick={reset}>
            다시 불러오기
          </Button>
        </Card>
      </div>
    </>
  );
}
