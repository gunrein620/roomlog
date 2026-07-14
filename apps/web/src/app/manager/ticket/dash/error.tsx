"use client";

import { Button, Card } from "@roomlog/ui";

export default function TicketDashboardError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <Card
      role="alert"
      style={{
        display: "grid",
        gap: "var(--space-4)",
        justifyItems: "start",
      }}
    >
      <h2>민원/하자 데이터를 불러오지 못했습니다</h2>
      <p>잠시 후 다시 시도해주세요.</p>
      <Button type="button" onClick={reset}>
        다시 시도
      </Button>
    </Card>
  );
}
