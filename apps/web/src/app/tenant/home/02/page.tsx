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
  const [required, setRequired] = useState(true);
  const [repairShare, setRepairShare] = useState(false);
  const [noticeShare, setNoticeShare] = useState(false);

  return (
    <>
      <header
        style={{
          flex: "none",
          padding: "12px 14px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link
          href={HOME_ROUTES["T-HOME-01"]}
          style={{ fontSize: 13, color: "var(--on-surface-variant)", textDecoration: "none" }}
        >
          ‹ 뒤로
        </Link>
        <div style={{ fontSize: 15, fontWeight: 800 }}>가입</div>
        <Badge>한국어</Badge>
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
        <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={labelStyle}>계정</div>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
            이메일
            <Input defaultValue="tenant@example.com" type="email" />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
            비밀번호
            <Input defaultValue="roomlog123" type="password" />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Button variant="secondary">Apple로 계속</Button>
            <Button variant="secondary">Google로 계속</Button>
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
          <div style={labelStyle}>필수 법정 동의</div>
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              style={{ marginTop: 3, accentColor: "var(--primary)" }}
            />
            <span>
              서비스 이용약관, 개인정보 처리방침, 전자문서 고지를 한 번에 확인했어요
              <span
                style={{
                  display: "block",
                  marginTop: 4,
                  fontSize: 12,
                  fontWeight: 400,
                  color: "var(--on-surface-variant)",
                }}
              >
                필수 동의는 가입 이탈을 줄이기 위해 묶어서 받고, 전문은 아래에서 열람해요.
              </span>
            </span>
          </label>
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
          <div style={labelStyle}>선택 데이터 전달 동의</div>
          <ConsentRow
            checked={repairShare}
            onChange={setRepairShare}
            title="수리업체 방문 조율에 연락처 전달"
            desc="하자 처리에 필요할 때만 전달돼요."
          />
          <ConsentRow
            checked={noticeShare}
            onChange={setNoticeShare}
            title="납부·계약 안내 알림 수신"
            desc="선택하지 않아도 핵심 서비스 이용은 가능해요."
          />
        </section>

        <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={labelStyle}>권한 범위</div>
          <div style={{ fontSize: 13, color: "var(--on-surface-variant)" }}>
            본인 계약, 본인 민원, 본인이 올린 사진만 조회해요. 타 호실과 타인 기록에는
            접근할 수 없어요.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge emphasis>tenant_id</Badge>
            <Badge>room_link_id</Badge>
            <Badge>번역 지원</Badge>
          </div>
        </Card>
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
        <Link href={HOME_ROUTES["T-HOME-03"]} style={linkBlockStyle}>
          <Button fullWidth disabled={!required}>
            동의하고 가입
          </Button>
        </Link>
        <Button fullWidth variant="ghost">
          약관 전문
        </Button>
      </footer>
    </>
  );
}

function ConsentRow({
  checked,
  onChange,
  title,
  desc,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  desc: string;
}) {
  return (
    <label style={{ display: "flex", gap: 10, fontSize: 13 }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 3, accentColor: "var(--primary)" }}
      />
      <span>
        <span style={{ fontWeight: 700 }}>{title}</span>
        <span
          style={{
            display: "block",
            marginTop: 3,
            color: "var(--on-surface-variant)",
            fontSize: 12,
          }}
        >
          {desc}
        </span>
      </span>
    </label>
  );
}
