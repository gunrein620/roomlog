import Link from "next/link";
import { Card } from "@roomlog/ui";
import { MessagingPhoneFrame } from "../MessagingPhoneFrame";
import { MESSAGING_ROUTES } from "@/lib/messaging-nav";

type SearchParams = Promise<{ from?: string }>;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { from } = await searchParams;
  const retryHref = from && from.startsWith("/tenant/messaging/") ? from : MESSAGING_ROUTES["T-MSG-00"];

  return (
    <MessagingPhoneFrame>
      <div
        style={{
          flex: 1,
          padding: "18px 14px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 12,
        }}
      >
        <Card
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 800 }}>불러오지 못했어요</div>
          <div style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.5 }}>
            전송 또는 로드에 실패했어요. 작성 중인 내용은 유지된 상태로 다시 시도할 수 있어요.
          </div>
        </Card>
      </div>

      <footer
        style={{
          flex: "none",
          padding: "12px 14px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <ActionLink href={retryHref} emphasis>
          다시 시도
        </ActionLink>
        <ActionLink href={MESSAGING_ROUTES["T-MSG-00"]}>받은함</ActionLink>
      </footer>
    </MessagingPhoneFrame>
  );
}

function ActionLink({
  href,
  children,
  emphasis,
}: {
  href: string;
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        width: "100%",
        boxSizing: "border-box",
        height: "var(--touch-target)",
        alignItems: "center",
        justifyContent: "center",
        border: emphasis ? "none" : "1.5px solid var(--primary)",
        background: emphasis ? "var(--primary)" : "transparent",
        color: emphasis ? "var(--on-primary)" : "var(--primary)",
        borderRadius: "var(--radius-btn)",
        fontSize: "var(--fs-body)",
        fontWeight: 700,
        textDecoration: "none",
      }}
    >
      {children}
    </Link>
  );
}
