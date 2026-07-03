import Link from "next/link";
import type { CSSProperties } from "react";
import { Badge, Button, Card, Input } from "@roomlog/ui";
import { HOME_ROUTES } from "@/lib/home-nav";

const labelStyle: CSSProperties = {
  fontSize: "var(--fs-caption)",
  color: "var(--on-surface-variant)",
  fontWeight: 700,
  letterSpacing: "0.04em",
};

const requestTypes = ["계약서", "하자 사진", "민원 기록"];

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
          href={HOME_ROUTES["T-HOME-05"]}
          style={{ color: "var(--on-surface-variant)", fontSize: "var(--fs-caption)", textDecoration: "none" }}
        >
          ‹ 뒤로
        </Link>
        <div style={{ fontSize: "var(--fs-header)", fontWeight: "var(--fw-header)" }}>개인정보·데이터</div>
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
        <Card
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-sm)",
            background: "var(--surface-container)",
          }}
        >
          <Badge emphasis style={{ alignSelf: "flex-start" }}>
            안심 요약
          </Badge>
          <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.5 }}>
            본인 계약·민원·사진만 보여요. 타 호실·타인 기록엔 접근할 수 없어요.
          </div>
        </Card>

        <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          <div style={labelStyle}>권한 상태</div>
          <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
            <StatusRow label="조회 범위" value="tenant_id + room_link_id" active />
            <StatusRow label="호실 연결" value="연결됨" active />
            <StatusRow label="이의 상태" value="진행 중인 이의 없음" active />
            <StatusRow label="권한 없음" value="타 호실 기록 차단" />
          </Card>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          <div style={labelStyle}>마스킹·동의 현황</div>
          <Card style={{ display: "grid", gap: "var(--space-sm)" }}>
            <StatusRow label="계좌·연락처" value="일부 마스킹" active />
            <StatusRow label="업체 전달 동의" value="방문 일정에 필요한 정보만" active />
            <StatusRow label="사진 접근" value="내가 올린 사진과 연결 기록" active />
          </Card>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          <div style={labelStyle}>변경 이력·다운로드</div>
          <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
            <div style={{ fontSize: "var(--fs-body)", fontWeight: 800 }}>최근 변경 이력</div>
            <div style={{ fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)", lineHeight: 1.6 }}>
              2026.06.30 · 호실 연결 완료
              <br />
              2026.06.30 · 필수 동의 기록 저장
            </div>
            <Button variant="secondary" fullWidth>
              내 데이터 다운로드
            </Button>
          </Card>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          <div style={labelStyle}>삭제/철회 요청</div>
          <Card style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            <div style={{ fontSize: "var(--fs-body)", fontWeight: 800 }}>요청 유형 선택</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {requestTypes.map((type, index) => (
                <Badge key={type} emphasis={index === 0} style={{ justifyContent: "center", padding: "8px 4px" }}>
                  {type}
                </Badge>
              ))}
            </div>
            <div style={{ display: "grid", gap: "var(--space-xs)" }}>
              <label style={{ fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)", fontWeight: 700 }}>
                요청 사유
              </label>
              <Input placeholder="예: 더 이상 보관을 원하지 않아요" />
            </div>
            <Card
              style={{
                borderStyle: "dashed",
                background: "var(--surface-container-lowest)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-xs)",
              }}
            >
              <div style={{ fontSize: "var(--fs-caption)", fontWeight: 800 }}>확인</div>
              <div style={{ fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)", lineHeight: 1.6 }}>
                법정 보관기간이 남은 기록은 즉시 삭제 대신 마스킹 또는 보관 예외로 처리될 수 있어요.
                결과는 알림으로 알려드립니다.
              </div>
            </Card>
            <Button fullWidth>삭제/철회 요청 제출</Button>
          </Card>
        </section>
      </main>
    </>
  );
}

function StatusRow({ label, value, active }: { label: string; value: string; active?: boolean }) {
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
      <Badge emphasis={active}>{value}</Badge>
    </div>
  );
}
