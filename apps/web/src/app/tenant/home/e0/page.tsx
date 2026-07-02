import Link from "next/link";
import { Badge, Button, Card } from "@roomlog/ui";
import { HOME_ROUTES } from "@/lib/home-nav";

const labelStyle = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
} as const;

const inviteStates = [
  ["valid", "유효하지만 다시 확인이 필요해요"],
  ["expired", "초대 유효시간이 지났어요"],
  ["used", "이미 사용된 초대예요"],
  ["revoked", "관리인이 초대를 철회했어요"],
  ["mismatch", "초대 연락처와 입력한 연락처가 달라요"],
] as const;

export default function Page() {
  return (
    <>
      <main
        style={{
          flex: 1,
          overflow: "auto",
          padding: "24px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 14,
            padding: "24px 8px 10px",
          }}
        >
          <div
            style={{
              width: 66,
              height: 66,
              border: "1.5px dashed var(--outline)",
              borderRadius: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              color: "var(--on-surface-variant)",
            }}
          >
            !
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.2 }}>초대를 확인할 수 없어요</h1>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--on-surface-variant)" }}>
              초대 상태를 확인하고 다시 시도하거나 로그인/시작 화면으로 돌아가세요.
            </p>
          </div>
        </section>

        <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={labelStyle}>초대 상태 enum</div>
          {inviteStates.map(([key, text]) => (
            <div
              key={key}
              style={{
                display: "grid",
                gridTemplateColumns: "82px 1fr",
                gap: 8,
                alignItems: "center",
                fontSize: 12,
              }}
            >
              <Badge emphasis={key === "expired"}>{key}</Badge>
              <span style={{ color: "var(--on-surface-variant)" }}>{text}</span>
            </div>
          ))}
        </Card>

        <section
          style={{
            border: "1px dashed var(--outline-variant)",
            borderRadius: "var(--radius-md)",
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={labelStyle}>복구</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>관리인에게 재발급 요청</div>
          <p style={{ margin: 0, fontSize: 12, color: "var(--on-surface-variant)" }}>
            비로그인 상태에서는 채팅 대신 전화와 이메일로 복구해요. 연결 전 홈으로 가는 버튼은
            제공하지 않아요.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Button variant="secondary">전화 요청</Button>
            <Button variant="secondary">이메일 요청</Button>
          </div>
        </section>
      </main>

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
        <Link href={HOME_ROUTES["T-HOME-01"]} style={{ display: "block", textDecoration: "none" }}>
          <Button fullWidth>다시 시도</Button>
        </Link>
        <Link href={HOME_ROUTES["T-HOME-07"]} style={{ display: "block", textDecoration: "none" }}>
          <Button fullWidth variant="secondary">
            로그인/시작
          </Button>
        </Link>
        <Button fullWidth variant="ghost">
          재발급 요청
        </Button>
      </footer>
    </>
  );
}
