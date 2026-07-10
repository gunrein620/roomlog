"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MANAGER_NAV_GROUPS, getManagerNavState } from "@/lib/manager-navigation";

export function ManagerSectionNav() {
  const state = getManagerNavState(usePathname());
  const item = MANAGER_NAV_GROUPS.flatMap((group) => group.items).find(
    (candidate) => candidate.id === state.activeItemId,
  );

  if (!item?.children.length) return null;

  return (
    <nav aria-label={`${item.label} 하위 메뉴`} className="manager-section-nav">
      {item.children.map((child) => (
        <Link
          key={child.href}
          href={child.href}
          aria-current={state.activeChildHref === child.href ? "page" : undefined}
        >
          <span>{child.label}</span>
          {child.demo ? <span className="manager-section-nav__demo">데모</span> : null}
        </Link>
      ))}
    </nav>
  );
}
