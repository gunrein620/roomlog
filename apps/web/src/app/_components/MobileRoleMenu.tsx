"use client";

import { Building2, House, UserRound } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export interface MobileRoleMenuProps {
  activeTab: "living" | "sell" | null;
  onSelectTenant: () => void;
  onSelectListing: () => void;
  onSelectManager: () => void;
}

export function MobileRoleMenu({
  activeTab,
  onSelectTenant,
  onSelectListing,
  onSelectManager
}: MobileRoleMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !containerRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const selectRole = (action: () => void) => {
    setIsOpen(false);
    action();
  };

  return (
    <div className="mobile-role-menu" ref={containerRef}>
      {isOpen ? (
        <div className="mobile-role-menu__dropup" id={menuId} role="group" aria-label="역할 이동 메뉴">
          <button
            className={`mobile-role-menu__item${activeTab === "living" ? " active" : ""}`}
            type="button"
            aria-current={activeTab === "living" ? "page" : undefined}
            onClick={() => selectRole(onSelectTenant)}
          >
            <UserRound size={22} strokeWidth={2.3} aria-hidden="true" />
            <span>세입자</span>
          </button>
          <button
            className={`mobile-role-menu__item${activeTab === "sell" ? " active" : ""}`}
            type="button"
            aria-current={activeTab === "sell" ? "page" : undefined}
            onClick={() => selectRole(onSelectListing)}
          >
            <House size={22} strokeWidth={2.3} aria-hidden="true" />
            <span>매물등록</span>
          </button>
          <button className="mobile-role-menu__item" type="button" onClick={() => selectRole(onSelectManager)}>
            <Building2 size={22} strokeWidth={2.3} aria-hidden="true" />
            <span>관리</span>
          </button>
        </div>
      ) : null}

      <button
        ref={triggerRef}
        className={`mobile-role-menu__trigger${isOpen || activeTab ? " active" : ""}`}
        type="button"
        aria-label="역할 메뉴"
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-haspopup="true"
        onClick={() => setIsOpen((current) => !current)}
      >
        <svg
          className="mobile-role-menu__icon"
          width={22}
          height={22}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.3}
          strokeLinecap="round"
          aria-hidden="true"
          focusable="false"
        >
          <line x1="2.5" y1="3" x2="21.5" y2="3" />
          <line x1="2.5" y1="12" x2="21.5" y2="12" />
          <line x1="2.5" y1="21" x2="21.5" y2="21" />
        </svg>
        메뉴
      </button>
    </div>
  );
}
