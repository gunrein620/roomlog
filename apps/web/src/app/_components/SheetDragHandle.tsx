"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";

/** 이만큼(px) 아래로 끌어 놓으면 시트를 닫는다. */
export const SHEET_DRAG_DISMISS_THRESHOLD_PX = 96;

/**
 * 바텀시트 상단 손잡이 — 아래로 끌면 시트가 손가락을 따라 내려오고, 임계치를 넘겨 놓으면 닫힌다.
 * 드래그는 손잡이 줄(전체 폭 히트존)에서만 시작해 시트 본문의 내부 스크롤과 충돌하지 않는다.
 * 시트 요소는 이 핸들의 부모(section)로 찾는다 — 모든 시트가 핸들을 첫 자식으로 두는 구조 전제.
 */
export function SheetDragHandle({ onDismiss }: { onDismiss: () => void }) {
  const dragRef = useRef<{ pointerId: number; startY: number; sheet: HTMLElement } | null>(null);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) return;
    const sheet = event.currentTarget.parentElement;
    if (!sheet) return;
    dragRef.current = { pointerId: event.pointerId, startY: event.clientY, sheet };
    event.currentTarget.setPointerCapture(event.pointerId);
    sheet.style.transition = "none";
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const offset = Math.max(0, event.clientY - drag.startY);
    drag.sheet.style.transform = offset > 0 ? `translateY(${offset}px)` : "";
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;

    const { sheet } = drag;
    const offset = Math.max(0, event.clientY - drag.startY);

    if (!cancelled && offset >= SHEET_DRAG_DISMISS_THRESHOLD_PX) {
      // 시트는 보통 dismiss로 언마운트되지만, 유지되는 경우를 위해 스타일도 원복해 둔다.
      sheet.style.transition = "";
      sheet.style.transform = "";
      onDismiss();
      return;
    }

    // 임계치 미달 — 부드럽게 원위치로 스냅백.
    sheet.style.transition = "transform 180ms ease";
    sheet.style.transform = "";
    window.setTimeout(() => {
      sheet.style.transition = "";
    }, 200);
  };

  return (
    <div
      className="sheet-drag-zone"
      aria-hidden="true"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => endDrag(event, false)}
      onPointerCancel={(event) => endDrag(event, true)}
    >
      <div className="sheet-handle" />
    </div>
  );
}
