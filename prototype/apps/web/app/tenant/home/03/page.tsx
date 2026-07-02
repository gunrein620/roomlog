"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Button, Card } from "@roomlog/ui";
import { HOME_ROUTES } from "@/lib/home-nav";

const labelStyle = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
} as const;

const linkBlockStyle = { display: "block", textDecoration: "none" } as const;

const records = [
  { id: "contract", title: "초대 전 업로드된 계약서", meta: "PDF 1개 · 2026.06.12" },
  { id: "photos", title: "입주 전 상태 사진", meta: "사진 8장 · 거실, 욕실" },
] as const;

export default function Page() {
  const [roomDispute, setRoomDispute] = useState(false);
  const [heldRecords, setHeldRecords] = useState<string[]>([]);

  const toggleHold = (id: string) => {
    setHeldRecords((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

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
        <div style={{ display: "flex", gap: 10 }}>
          <Link
            href={HOME_ROUTES["T-HOME-02"]}
            style={{ fontSize: 13, color: "var(--on-surface-variant)", textDecoration: "none" }}
          >
            ‹ 가입
          </Link>
          <Link
            href={HOME_ROUTES["T-HOME-07"]}
            style={{ fontSize: 13, color: "var(--on-surface-variant)", textDecoration: "none" }}
          >
            재연결
          </Link>
        </div>
        <div style={{ fontSize: 15, fontWeight: 800 }}>호실 연결</div>
        <Badge>2게이트</Badge>
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
          <div style={labelStyle}>게이트 1 · 호실 연결 확인</div>
          <div>
            <h1 style={{ margin: "0 0 4px", fontSize: 21, lineHeight: 1.2 }}>
              해든빌 302호가 맞나요?
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: "var(--on-surface-variant)" }}>
              임대인 이서윤 · 계약기간 2026.07.01 - 2027.06.30
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
              <div style={labelStyle}>주소</div>
              서울시 중구 해든로 12
            </div>
            <div>
              <div style={labelStyle}>권한</div>
              본인 호실 기록만
            </div>
          </div>
          <button
            type="button"
            onClick={() => setRoomDispute(true)}
            style={{
              minHeight: 40,
              border: "1px solid var(--outline-variant)",
              borderRadius: "var(--radius-btn)",
              background: roomDispute ? "var(--surface-container-high)" : "transparent",
              color: "var(--on-surface-variant)",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            이 호실이 아니에요
          </button>
          {roomDispute && <HoldNotice text="호실 확인 이의가 접수되어 관리인 확인까지 보류돼요." />}
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
          <div style={labelStyle}>게이트 2 · 기존 기록 귀속</div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--on-surface-variant)" }}>
            초대 전 올라온 기록을 이 계정에 연결할지 기록별로 확인해요. 이의가 있으면 해당
            기록만 보류되고 감사로그에 남아요.
          </p>
          {records.map((record) => {
            const held = heldRecords.includes(record.id);
            return (
              <Card key={record.id} style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{record.title}</div>
                    <div style={{ marginTop: 3, fontSize: 12, color: "var(--on-surface-variant)" }}>
                      {record.meta}
                    </div>
                  </div>
                  <Badge emphasis={!held}>{held ? "보류" : "확인"}</Badge>
                </div>
                <button
                  type="button"
                  onClick={() => toggleHold(record.id)}
                  style={{
                    minHeight: 36,
                    border: "1px solid var(--outline-variant)",
                    borderRadius: "var(--radius-btn)",
                    background: "transparent",
                    color: "var(--on-surface-variant)",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  {held ? "이의 취소" : "이의·해제"}
                </button>
              </Card>
            );
          })}
          {heldRecords.length > 0 && (
            <HoldNotice text="기록 귀속 이의는 이 화면 안에서 보류 상태로 추적해요." />
          )}
        </section>

        <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={labelStyle}>연결 후 첫 진입</div>
          <div style={{ fontSize: 13, color: "var(--on-surface-variant)" }}>
            연결이 완료되면 홈으로 이동하고, 아직 등록되지 않은 계약서나 알림은 빈 상태로
            정직하게 표시돼요.
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
        <Link href={HOME_ROUTES["T-HOME-00"]} style={linkBlockStyle}>
          <Button fullWidth>이 호실로 연결</Button>
        </Link>
        <Link href={HOME_ROUTES["T-HOME-E0"]} style={linkBlockStyle}>
          <Button fullWidth variant="ghost">
            연결 실패 상태 보기
          </Button>
        </Link>
      </footer>
    </>
  );
}

function HoldNotice({ text }: { text: string }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "10px 12px",
        background: "var(--surface-container-lowest)",
        color: "var(--on-surface-variant)",
        fontSize: 12,
      }}
    >
      {text}
    </div>
  );
}
