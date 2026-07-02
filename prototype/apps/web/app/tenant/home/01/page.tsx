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
  const [otp, setOtp] = useState("");

  return (
    <>
      <header
        style={{
          flex: "none",
          padding: "12px 14px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }} aria-label="언어 선택">
          <Badge emphasis>한국어</Badge>
          <Badge>EN</Badge>
          <Badge>中文</Badge>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link
            href={HOME_ROUTES["T-HOME-07"]}
            style={{ fontSize: 13, color: "var(--on-surface-variant)", textDecoration: "none" }}
          >
            ‹ 로그인
          </Link>
          <div style={{ fontSize: 15, fontWeight: 800 }}>초대 받기</div>
          <Link
            href={HOME_ROUTES["T-HOME-E0"]}
            style={{ fontSize: 12, color: "var(--on-surface-variant)", textDecoration: "none" }}
          >
            초대 무효
          </Link>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          overflow: "auto",
          padding: "16px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <Card style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
          <div style={labelStyle}>초대 정보</div>
          <div>
            <h1 style={{ margin: "0 0 4px", fontSize: 21, lineHeight: 1.2 }}>
              해든빌 302호로 초대됐어요
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: "var(--on-surface-variant)" }}>
              관리인 김민재 · 임대인 이서윤
            </p>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              fontSize: 12,
              color: "var(--on-surface-variant)",
            }}
          >
            <div>
              <div style={labelStyle}>건물</div>
              해든빌
            </div>
            <div>
              <div style={labelStyle}>호실</div>
              302호
            </div>
          </div>
        </Card>

        <section
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            background: "var(--surface-container-low)",
          }}
        >
          <div style={labelStyle}>연락처 OTP</div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--on-surface-variant)" }}>
            초대에 등록된 연락처 010-****-4821로 보낸 코드만 확인해요. 한국 본인인증은
            필수가 아니며 외국인도 이 경로로 진행할 수 있어요.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <Input
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="6자리 코드"
              maxLength={6}
            />
            <Button variant="secondary">재전송</Button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge emphasis>초대 연락처 일치 필요</Badge>
            <Badge>PASS/NICE 비의무</Badge>
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
        <Link href={HOME_ROUTES["T-HOME-02"]} style={linkBlockStyle}>
          <Button fullWidth>OTP 인증하고 계속</Button>
        </Link>
        <Link href={HOME_ROUTES["T-HOME-07"]} style={linkBlockStyle}>
          <Button fullWidth variant="ghost">
            이미 계정이 있어요
          </Button>
        </Link>
      </footer>
    </>
  );
}
