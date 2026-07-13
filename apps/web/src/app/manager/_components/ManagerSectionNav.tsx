"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import { useRef } from "react";
import { MANAGER_NAV_GROUPS, getManagerNavState } from "@/lib/manager-navigation";

export function ManagerSectionNav() {
  const pathname = usePathname();
  const state = getManagerNavState(pathname);
  const item = MANAGER_NAV_GROUPS.flatMap((group) => group.items).find(
    (candidate) => candidate.id === state.activeItemId,
  );
  // 리퀴드 글래스 호버 인디케이터 — ref로 직접 스타일을 옮겨 리렌더 없이 부드럽게 미끄러지게 한다.
  const glassRef = useRef<HTMLSpanElement>(null);

  if (!item?.children.length) return null;

  function slideGlassTo(target: HTMLElement) {
    const glass = glassRef.current;
    if (!glass) return;

    // 숨김 상태에서의 첫 등장은 미끄러지면 안 된다 — 초기 위치(x=0)에서
    // 날아오는 것처럼 보이므로, 전환 없이 제자리에 놓고 페이드인만 한다.
    if (glass.style.opacity !== "1") {
      glass.style.transition = "opacity 0.18s ease";
      glass.style.width = `${target.offsetWidth}px`;
      glass.style.transform = `translateX(${target.offsetLeft}px)`;
      void glass.offsetWidth; // 위치를 먼저 확정시키는 강제 리플로
      glass.style.transition = "";
    } else {
      glass.style.width = `${target.offsetWidth}px`;
      glass.style.transform = `translateX(${target.offsetLeft}px)`;
    }
    glass.style.opacity = "1";
  }

  function hideGlass() {
    const glass = glassRef.current;
    if (glass) glass.style.opacity = "0";
  }

  // 같은 페이지 안의 해시(#report 등)는 Next Link 기본 이동이 스크롤을 즉시 점프시키므로 직접 처리한다.
  // 다른 페이지로의 이동이거나 해시가 없거나 대상 요소가 없으면 preventDefault 전에 걸러 기본 동작에 맡긴다.
  function handleClick(event: MouseEvent<HTMLAnchorElement>, href: string) {
    const hashIndex = href.indexOf("#");
    if (hashIndex === -1) return;

    const targetPath = href.slice(0, hashIndex) || "/";
    if (targetPath !== pathname) return;

    const hash = href.slice(hashIndex + 1);
    const targetEl = document.getElementById(hash);
    if (!targetEl) return;

    event.preventDefault();
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    targetEl.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth" });
    window.history.pushState(null, "", href);
  }

  return (
    <nav aria-label={`${item.label} 하위 메뉴`} className="manager-section-nav" onMouseLeave={hideGlass}>
      <span aria-hidden="true" ref={glassRef} className="manager-section-nav__glass" />
      {item.children.map((child) => (
        <Link
          key={child.href}
          href={child.href}
          aria-current={state.activeChildHref === child.href ? "page" : undefined}
          onMouseEnter={(event) => slideGlassTo(event.currentTarget)}
          onClick={(event) => handleClick(event, child.href)}
        >
          <span>{child.label}</span>
          {child.demo ? <span className="manager-section-nav__demo">데모</span> : null}
        </Link>
      ))}
    </nav>
  );
}
