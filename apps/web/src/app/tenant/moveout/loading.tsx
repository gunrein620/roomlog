import { Card } from "@roomlog/ui";

export default function Loading() {
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
        퇴실 정보 불러오는 중
      </header>
      <div style={{ flex: 1, padding: 14 }}>
        <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>잠시만 기다려주세요</div>
          <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
            퇴실 기록, 체크리스트, 정산 상태를 불러오고 있습니다.
          </div>
        </Card>
      </div>
    </>
  );
}
