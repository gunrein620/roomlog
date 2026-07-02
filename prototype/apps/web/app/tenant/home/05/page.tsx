import Link from "next/link";
import type { CSSProperties } from "react";
import { Badge, Button, Card } from "@roomlog/ui";
import { HOME_ROUTES } from "@/lib/home-nav";

const labelStyle: CSSProperties = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
};

const linkButtonStyle: CSSProperties = {
  minHeight: "var(--touch-target)",
  borderRadius: "var(--radius-btn)",
  border: "1.5px solid var(--primary)",
  color: "var(--primary)",
  background: "transparent",
  fontSize: "var(--fs-body)",
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  padding: "0 var(--space-md)",
  boxSizing: "border-box",
};

export default function Page() {
  return (
    <>
      <header
        style={{
          flex: "none",
          padding: "14px var(--page-margin)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-sm)",
        }}
      >
        <Link
          href={HOME_ROUTES["T-HOME-00"]}
          style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", textDecoration: "none" }}
        >
          ‹ 뒤로
        </Link>
        <div style={{ fontSize: "var(--fs-header)", fontWeight: "var(--fw-header)" }}>설정</div>
        <span style={{ width: 40 }} />
      </header>

      <main
        style={{
          flex: 1,
          overflow: "auto",
          padding: "var(--page-margin)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-lg)",
        }}
      >
        <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          <div style={labelStyle}>언어</div>
          <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-sm)" }}>
            <div>
              <div style={{ fontSize: "var(--fs-body)", fontWeight: 800 }}>한국어</div>
              <div style={{ marginTop: 4, fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)" }}>
                English로 전환할 수 있어요
              </div>
            </div>
            <Badge emphasis>선택됨</Badge>
          </Card>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          <div style={labelStyle}>알림 수신</div>
          <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
            <SettingRow label="앱 푸시" value="켜짐" />
            <SettingRow label="문자" value="중요 알림만" />
            <SettingRow label="카카오" value="준비 중" />
          </Card>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          <div style={labelStyle}>계정</div>
          <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
            <div>
              <div style={{ fontSize: "var(--fs-body)", fontWeight: 800 }}>302호 임차인</div>
              <div style={{ marginTop: 4, fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)" }}>
                tenant@example.com
              </div>
            </div>
            <Link href={HOME_ROUTES["T-HOME-07"]} style={linkButtonStyle}>
              호실 추가/재연결
            </Link>
            <Button variant="ghost" fullWidth>
              로그아웃
            </Button>
          </Card>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          <div style={labelStyle}>권한·데이터</div>
          <Link href={HOME_ROUTES["T-HOME-06"]} style={{ color: "inherit", textDecoration: "none" }}>
            <Card style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-sm)" }}>
              <div>
                <div style={{ fontSize: "var(--fs-body)", fontWeight: 800 }}>개인정보·데이터 관리</div>
                <div style={{ marginTop: 4, fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)" }}>
                  권한 범위, 마스킹, 삭제/철회 요청
                </div>
              </div>
              <span style={{ color: "var(--on-surface-variant)" }}>›</span>
            </Card>
          </Link>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          <div style={labelStyle}>문의</div>
          <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
            <a href="tel:1588-0000" style={linkButtonStyle}>
              전화 문의
            </a>
            <a href="mailto:support@roomlog.example" style={linkButtonStyle}>
              이메일 문의
            </a>
            <SettingRow label="앱 정보" value="Roomlog Tenant" />
          </Card>
        </section>
      </main>
    </>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        minHeight: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-sm)",
      }}
    >
      <span style={{ fontSize: "var(--fs-body)", fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)" }}>{value}</span>
    </div>
  );
}
