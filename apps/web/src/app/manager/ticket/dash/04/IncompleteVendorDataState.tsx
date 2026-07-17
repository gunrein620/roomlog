"use client";

import { Button, Card } from "@roomlog/ui";
import { useRouter } from "next/navigation";

export function IncompleteVendorDataState() {
  const router = useRouter();

  return (
    <Card
      role="alert"
      style={{
        display: "grid",
        gap: "var(--space-md)",
        justifyItems: "start",
      }}
    >
      <h2>업체 정보를 완전히 받지 못했습니다</h2>
      <p>업체 배정은 변경되지 않았습니다. 잠시 후 상태를 다시 확인해 주세요.</p>
      <Button type="button" onClick={() => router.refresh()}>
        다시 확인
      </Button>
    </Card>
  );
}
