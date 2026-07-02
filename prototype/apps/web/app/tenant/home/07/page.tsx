"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, Input } from "@roomlog/ui";
import { HOME_ROUTES } from "@/lib/home-nav";

const labelStyle = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
} as const;

const linkBlockStyle = { display: "block", textDecoration: "none" } as const;

export default function Page() {
  const [inviteCode, setInviteCode] = useState("");

  return (
    <>
      <header
        style={{
          flex: "none",
          padding: "16px 14px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>룸로그 시작</div>
            <div style={{ marginTop: 3, fontSize: 12, color: "var(--on-surface-variant)" }}>
              임차인 온보딩
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }} aria-label="언어 선택">
            <Badge emphasis>한국어</Badge>
            <Badge>EN</Badge>
          </div>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          overflow: "auto",
          padding: "18px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <Card style={{ display: "flex", flexDirection: "column", gap: 14, padding: 16 }}>
          <div>
            <div style={labelStyle}>기존 사용자</div>
            <h1 style={{ margin: "6px 0 4px", fontSize: 22, lineHeight: 1.2 }}>
              내 호실로 바로 들어가기
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: "var(--on-surface-variant)" }}>
              로그인 후 연결 완료자는 홈으로, 아직 연결이 남은 계정은 호실 연결로 이어져요.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Link href={HOME_ROUTES["T-HOME-00"]} style={linkBlockStyle}>
              <Button fullWidth>로그인</Button>
            </Link>
            <Link href={HOME_ROUTES["T-HOME-03"]} style={linkBlockStyle}>
              <Button fullWidth variant="secondary">
                미연결 로그인
              </Button>
            </Link>
          </div>
        </Card>

        <section
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            background: "var(--surface-container-low)",
          }}
        >
          <div style={labelStyle}>초대코드</div>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
            초대 링크를 잃어버렸다면 코드를 입력하세요
            <Input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="예: RLOG-302-8K"
            />
          </label>
          <Link href={HOME_ROUTES["T-HOME-01"]} style={linkBlockStyle}>
            <Button fullWidth variant={inviteCode.trim() ? "primary" : "secondary"}>
              초대코드로 계속
            </Button>
          </Link>
        </section>

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
          <div style={labelStyle}>초대를 못 받았어요</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>관리인에게 초대 재발급 요청</div>
          <p style={{ margin: 0, fontSize: 12, color: "var(--on-surface-variant)" }}>
            재발급 요청은 관리인 초대 관리로 전달돼요. 연결 전에는 홈으로 이동하지 않아요.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="secondary" style={{ flex: 1 }}>
              재발급 요청
            </Button>
            <Link href={HOME_ROUTES["T-HOME-E0"]} style={{ ...linkBlockStyle, flex: 1 }}>
              <Button fullWidth variant="ghost">
                오류 보기
              </Button>
            </Link>
          </div>
        </section>

        <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={labelStyle}>비로그인 도움</div>
          <div style={{ fontSize: 13, color: "var(--on-surface-variant)" }}>
            채팅 상담 없이 전화와 이메일로 복구를 도와드려요.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Button variant="secondary">전화 요청</Button>
            <Button variant="secondary">이메일 요청</Button>
          </div>
        </Card>
      </main>
    </>
  );
}
