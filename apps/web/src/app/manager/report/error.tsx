"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Button, Card } from "@roomlog/ui";
import { MANAGER_REPORT_ROUTES } from "@/lib/report-nav";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const recoveryHref = reportRecoveryHref(pathname, searchParams.toString());

  return (
    <Card style={{ display: "grid", gap: "var(--space-md)", maxWidth: 720 }}>
      <div>
        <div style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", fontWeight: 800 }}>
          M-RPT-E0
        </div>
        <h1 style={{ margin: "4px 0 0", fontSize: "var(--fs-title)", lineHeight: "var(--lh-title)" }}>
          관리 리포트를 다시 불러오지 못했습니다
        </h1>
      </div>
      <p style={{ margin: 0, color: "var(--on-surface-variant)", lineHeight: "var(--lh-body)" }}>
        리포트 생성·조회 중 일부 원천 데이터가 응답하지 않았습니다. 같은 화면에서 다시 시도하거나 복구 화면으로 이동하세요.
      </p>
      <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
        <Button type="button" onClick={() => reset()}>
          다시 시도
        </Button>
        <Link href={recoveryHref} style={{ color: "var(--primary)", fontWeight: 800 }}>
          복구 화면
        </Link>
      </div>
    </Card>
  );
}

function reportRecoveryHref(pathname: string, query: string) {
  const from = query ? `${pathname}?${query}` : pathname;
  return `${MANAGER_REPORT_ROUTES["M-RPT-E0"]}?from=${encodeURIComponent(from)}`;
}
