import Link from "next/link";
import { Badge, Card, Input } from "@roomlog/ui";
import { MANAGER_CROSS, MHOME_ROUTES } from "@/lib/manager-home-nav";
import { ManagerHomeShell } from "../_components";

export default function Page() {
  return (
    <ManagerHomeShell title="건물·호실 등록 / CSV" context="관리 중인 집 · 등록" demo>
      <div style={{ display: "grid", gap: "var(--space-lg)" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-lg)", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ margin: "var(--space-sm) 0", fontSize: "var(--fs-title)" }}>건물과 호실을 등록합니다</h1>
            <p style={{ margin: 0, color: "var(--on-surface-variant)" }}>
              CSV는 큰 화면에서 더 효율적이지만 단건 등록 흐름은 같은 PWA에서 완결됩니다.
            </p>
          </div>
          <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
            <Badge emphasis>개별 등록</Badge>
            <Badge>CSV 일괄</Badge>
          </div>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-lg)" }}>
          <Card style={{ display: "grid", gap: "var(--space-md)" }}>
            <strong>개별 등록</strong>
            <Field label="건물명" placeholder="예: 연남 스테이" />
            <Field label="주소" placeholder="도로명 주소" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-sm)" }}>
              <Field label="층" placeholder="2" />
              <Field label="호수" placeholder="201" />
              <Field label="면적" placeholder="23㎡" />
            </div>
            <Field label="호실 유형" placeholder="원룸 / 투룸 / 상가" />
            <LinkButton href={MHOME_ROUTES["M-HOME-04"]}>저장</LinkButton>
          </Card>

          <Card style={{ display: "grid", gap: "var(--space-md)" }}>
            <strong>CSV 일괄</strong>
            <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
              <Badge>템플릿 다운로드</Badge>
              <Badge>파일 업로드</Badge>
              <Badge emphasis>매핑 미리보기</Badge>
            </div>
            <div style={{ display: "grid", gap: "var(--space-sm)" }}>
              {[
                ["1행", "건물명·주소·호실 필수값 확인", "통과"],
                ["2행", "면적 형식 확인 필요", "검증 필요"],
                ["3행", "중복 호실 후보", "검토"],
              ].map(([row, message, state]) => (
                <div key={row} style={{ minHeight: 48, display: "grid", gridTemplateColumns: "72px 1fr auto", gap: "var(--space-md)", alignItems: "center", borderBottom: "1px solid var(--border)" }}>
                  <strong>{row}</strong>
                  <span style={{ color: "var(--on-surface-variant)" }}>{message}</span>
                  <Badge emphasis={state !== "통과"}>{state}</Badge>
                </div>
              ))}
            </div>
            <LinkButton href={MHOME_ROUTES["M-HOME-04"]}>일괄 등록</LinkButton>
          </Card>
        </div>

        <Card style={{ display: "flex", gap: "var(--space-md)", flexWrap: "wrap" }}>
          <Link href={MANAGER_CROSS.contract} style={inlineLink}>등록 후 임차인 초대</Link>
          <Link href={MHOME_ROUTES["M-HOME-03"]} style={inlineLink}>전체 건물로 돌아가기</Link>
        </Card>
      </div>
    </ManagerHomeShell>
  );
}

function Field({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <label style={{ display: "grid", gap: "var(--space-xs)", fontWeight: 800 }}>
      <span style={{ fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)" }}>{label}</span>
      <Input placeholder={placeholder} readOnly />
    </label>
  );
}

function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} style={{ minHeight: "var(--touch-target)", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "var(--radius-btn)", background: "var(--primary)", color: "var(--on-primary)", textDecoration: "none", fontWeight: 800 }}>{children}</Link>;
}

const inlineLink = { color: "var(--primary)", fontWeight: 800, textDecoration: "none" } as const;
