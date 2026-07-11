import type { ReactNode } from "react";

export interface ManagerShellProps {
  /** 상단 타이틀 (화면명) */
  title: ReactNode;
  /** 우상단 컨텍스트(관리 대상 건물/호실 등) */
  context?: ReactNode;
  /** 좌측 네비 영역(선택) — 없으면 콘텐츠만 */
  nav?: ReactNode;
  children: ReactNode;
}

/**
 * 관리인 데스크탑 셸 (적응형 도메인의 데스크탑 표면 공용 크롬).
 * 임차인=PhoneFrame(390×844)과 대비되는 넓은 대시보드 레이아웃.
 * topbar(타이틀·역할·컨텍스트) + (선택)좌측 네비 + max-width 콘텐츠.
 */
export function ManagerShell({ title, context, nav, children }: ManagerShellProps) {
  return (
    <div
      className="manager-shell"
      style={{
        minHeight: "100vh",
        background: "var(--surface)",
        color: "var(--on-surface)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <header
        className="manager-shell-header"
        style={{
          minHeight: "var(--header-height)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 var(--page-margin)",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-container-lowest)",
        }}
      >
        <div className="manager-shell-identity" style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", minWidth: 0 }}>
          {/* 집우집주 복귀 동선 — 관리 콘솔도 같은 WOOZU 계정의 한 표면이다 */}
          <a
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-xs)",
              color: "var(--on-surface)",
              fontSize: "var(--fs-caption)",
              fontWeight: 800,
              textDecoration: "none",
            }}
          >
            집우집주
            <span style={{ color: "var(--primary)" }}>WOOZU</span>
          </a>
          <span aria-hidden="true" style={{ color: "var(--border)" }}>|</span>
          <span
            style={{
              fontSize: "var(--fs-caption)",
              fontWeight: 700,
              color: "var(--on-primary)",
              background: "var(--primary)",
              borderRadius: "var(--radius-full)",
              padding: "3px 10px",
            }}
          >
            관리인
          </span>
          <h1
            style={{
              minWidth: 0,
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: "var(--fs-header)",
              lineHeight: "var(--lh-header)",
              fontWeight: 700,
            }}
          >
            {title}
          </h1>
        </div>
        {context ? (
          <span className="manager-shell-context" style={{ fontSize: "var(--fs-caption)", color: "var(--on-surface-variant)", whiteSpace: "nowrap" }}>
            {context}
          </span>
        ) : null}
      </header>

      <div className="manager-shell-body" style={{ display: "flex", alignItems: "stretch" }}>
        {nav ? (
          <aside
            className="manager-shell-nav"
            style={{
              width: 220,
              flex: "none",
              borderRight: "1px solid var(--border)",
              padding: "var(--space-lg)",
              minHeight: "calc(100vh - var(--header-height))",
              background: "var(--surface-container-low)",
            }}
          >
            {nav}
          </aside>
        ) : null}
        <main
          className="manager-shell-main"
          style={{
            flex: 1,
            minWidth: 0, // 넓은 표(가로 스크롤 카드)가 페이지 전체를 밀어내지 않게
            padding: "var(--space-xl)",
            maxWidth: 1200,
            width: "100%",
            margin: "0 auto",
          }}
        >
          {children}
        </main>
      </div>
      <style>{`
        .manager-shell :is(a, button, input, select, textarea):focus-visible {
          outline: 3px solid color-mix(in srgb, var(--primary) 58%, transparent);
          outline-offset: 2px;
        }

        @media (max-width: 720px) {
          .manager-shell-header {
            align-items: flex-start !important;
            gap: var(--space-sm);
            padding: var(--space-sm) var(--space-md) !important;
          }

          .manager-shell-identity {
            flex-wrap: wrap;
          }

          .manager-shell-context {
            display: none;
          }

          .manager-shell-body {
            display: block !important;
          }

          .manager-shell-nav {
            width: 100% !important;
            min-height: auto !important;
            overflow-x: auto;
            padding: var(--space-sm) var(--space-md) !important;
            border-right: 0 !important;
            border-bottom: 1px solid var(--border);
          }

          .manager-shell-nav > nav {
            display: flex !important;
            gap: var(--space-xs) !important;
            width: max-content;
          }

          .manager-shell-main {
            max-width: none !important;
            padding: var(--space-md) !important;
          }
        }
      `}</style>
    </div>
  );
}
