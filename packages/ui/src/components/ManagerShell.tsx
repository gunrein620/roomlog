import type { ReactNode } from "react";

export interface ManagerShellProps {
  title: ReactNode;
  context?: ReactNode;
  nav?: ReactNode;
  subnav?: ReactNode;
  headerActions?: ReactNode;
  rightRail?: ReactNode;
  /** 데스크톱에서 사이드바를 접은 상태로 렌더 (토글 상태는 호출측이 관리). */
  navCollapsed?: boolean;
  children: ReactNode;
}

export function ManagerShell({
  title,
  context,
  nav,
  subnav,
  headerActions,
  rightRail,
  navCollapsed = false,
  children,
}: ManagerShellProps) {
  const rootClassName = [
    "manager-workspace",
    rightRail ? "manager-workspace--with-rail" : "",
    navCollapsed ? "manager-workspace--nav-collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClassName}>
      {nav ? <aside className="manager-workspace__sidebar">{nav}</aside> : null}
      <section className="manager-workspace__content">
        <header className="manager-workspace__header">
          <div className="manager-workspace__heading">
            <h1 className="manager-workspace__title">{title}</h1>
            {context ? <div className="manager-workspace__context">{context}</div> : null}
          </div>
          {headerActions ? <div className="manager-workspace__header-actions">{headerActions}</div> : null}
        </header>
        {subnav ? <div className="manager-workspace__subnav">{subnav}</div> : null}
        <div className="manager-workspace__body">
          <main className="manager-workspace__main">{children}</main>
          {rightRail ? <aside className="manager-workspace__rail">{rightRail}</aside> : null}
        </div>
      </section>
    </div>
  );
}
