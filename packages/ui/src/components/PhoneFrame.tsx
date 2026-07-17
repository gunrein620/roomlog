import type { ReactNode } from "react";

export interface PhoneFrameProps {
  children: ReactNode;
  /** 상단 라벨(화면 이름 등 사용자 문구) */
  label?: ReactNode;
  /** 집우집주 홈 링크 — 룸로그 화면에서 부동산 앱으로 돌아가는 동선. null이면 숨김 */
  homeHref?: string | null;
  /** 상단 왼쪽 사용자 액션. 지정하면 기본 집우집주 홈 링크를 대체한다. */
  leadingAction?: ReactNode;
  fitViewport?: boolean;
}

/** 임차인·업체 화면용 폰 프레임 (390×844 중앙 배치, WOOZU 스킨) */
export function PhoneFrame({
  children,
  label,
  homeHref = "/",
  leadingAction,
  fitViewport = false,
}: PhoneFrameProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--surface-dim)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "20px 0",
        fontFamily: "var(--font-sans)",
      }}
    >
      {label || homeHref || leadingAction !== undefined ? (
        <div
          style={{
            width: "var(--phone-w)",
            color: "var(--on-surface-variant)",
            fontSize: "var(--fs-caption)",
            marginBottom: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          {leadingAction !== undefined ? (
            leadingAction
          ) : homeHref ? (
            <a
              href={homeHref}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: "var(--on-surface)",
                fontWeight: 800,
                textDecoration: "none",
              }}
            >
              <span aria-hidden="true">←</span>
              집우집주
              <span style={{ color: "var(--primary)", fontWeight: 800 }}>WOOZU</span>
            </a>
          ) : (
            <span />
          )}
          {label ? <span style={{ display: "inline-flex", gap: 8 }}>{label}</span> : null}
        </div>
      ) : null}
      <div
        style={{
          width: "var(--phone-w)",
          height: fitViewport ? "min(var(--phone-h), calc(100vh - 92px))" : "var(--phone-h)",
          border: "1px solid var(--border)",
          borderRadius: 22,
          background: "var(--surface-container-lowest)",
          boxShadow: "var(--shadow)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          color: "var(--on-surface)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
