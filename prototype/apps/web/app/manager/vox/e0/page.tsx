import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Badge, Button, Card } from "@roomlog/ui";
import { MVOX_ROUTES } from "@/lib/manager-home-nav";

const muted: CSSProperties = {
  color: "var(--on-surface-variant)",
  fontSize: "var(--fs-body)",
  lineHeight: "var(--lh-body)",
};

export default function Page() {
  return (
    <>
      <main
        style={{
          flex: 1,
          padding: "var(--space-xl) var(--page-margin)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: "var(--space-lg)",
          textAlign: "center",
        }}
      >
        <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          <div
            aria-hidden
            style={{
              width: 72,
              height: 72,
              borderRadius: "var(--radius-full)",
              border: "1.5px dashed var(--outline)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto",
              fontSize: 30,
              fontWeight: 900,
              color: "var(--on-surface-variant)",
            }}
          >
            !
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: "var(--space-sm)" }}>
            <Badge emphasis>통화 오류</Badge>
            <Badge>로드 실패</Badge>
          </div>
          <div style={{ fontSize: 24, lineHeight: 1.3, fontWeight: 900 }}>
            연결을 이어가지 못했어요
          </div>
          <div style={{ ...muted, fontSize: 18 }}>
            음성 연결이 끊겼거나 오늘 업무 데이터를 불러오지 못했습니다. 입력한 처리 흐름은 잃지 않고 다시
            연결을 시도합니다.
          </div>
        </Card>
      </main>

      <footer
        style={{
          flex: "none",
          padding: "var(--space-md) var(--page-margin)",
          borderTop: "1px solid var(--border)",
          display: "grid",
          gap: "var(--space-sm)",
        }}
      >
        <Link href={MVOX_ROUTES["M-VOX-01"]} style={{ textDecoration: "none" }}>
          <Button fullWidth>다시 연결</Button>
        </Link>
        <LinkButton href={MVOX_ROUTES["M-VOX-00"]} variant="secondary">
          홈으로
        </LinkButton>
      </footer>
    </>
  );
}

function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  const variants: Record<typeof variant, CSSProperties> = {
    primary: { background: "var(--primary)", color: "var(--on-primary)", border: "none" },
    secondary: {
      background: "transparent",
      color: "var(--primary)",
      border: "1.5px solid var(--primary)",
    },
  };

  return (
    <Link
      href={href}
      style={{
        minHeight: "var(--touch-target)",
        borderRadius: "var(--radius-btn)",
        padding: "0 var(--space-lg)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        textDecoration: "none",
        fontSize: "var(--fs-body)",
        lineHeight: "var(--lh-body)",
        fontWeight: 800,
        ...variants[variant],
      }}
    >
      {children}
    </Link>
  );
}
