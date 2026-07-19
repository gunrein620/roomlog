"use client";

import Link from "next/link";
import { EllipsisVertical } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ticketDashHref } from "../../_components/ticket-manager-ui";
import {
  placeTicketActionMenu,
  type TicketActionMenuPosition,
} from "./ticket-action-menu-position";

type TicketActionMenuProps = {
  ticketId: string;
  ticketTitle: string;
};

export function TicketActionMenu({ ticketId, ticketTitle }: TicketActionMenuProps) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TicketActionMenuPosition | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;

    const trigger = triggerRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    const gap = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--space-xs"),
    );

    setPosition(
      placeTicketActionMenu({
        trigger: {
          top: trigger.top,
          right: trigger.right,
          bottom: trigger.bottom,
        },
        menu: { width: menu.width, height: menu.height },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        gap: Number.isFinite(gap) ? gap : 0,
      }),
    );
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function dismissMenu() {
      setOpen(false);
      setPosition(null);
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      dismissMenu();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        dismissMenu();
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", dismissMenu, true);
    window.addEventListener("resize", dismissMenu);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", dismissMenu, true);
      window.removeEventListener("resize", dismissMenu);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="manager-defect-dashboard__more-action"
        aria-label={`${ticketTitle} 작업 메뉴`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          setPosition(null);
          setOpen((current) => !current);
        }}
      >
        <EllipsisVertical aria-hidden="true" />
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className="manager-defect-dashboard__more-menu-list"
              role="menu"
              data-placement={position?.placement}
              data-positioned={position ? "true" : "false"}
              style={position ? { top: position.top, left: position.left } : undefined}
            >
              <Link role="menuitem" href={ticketDashHref("01", ticketId)}>
                상세·정보입력
              </Link>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
