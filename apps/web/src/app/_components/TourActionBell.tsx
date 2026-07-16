"use client";

// 임대인 상단 벨 알림 — 영상 업로드 후 재구성이 끝나(정합 필요) 등록 폼으로 돌아와야만 알던 문제를
// 상단 네비에서 상시 알린다. Notification 모델 없이 자산 상태에서 파생: UPLOADED=정합 필요, FAILED=재업로드.
import { useCallback, useEffect, useRef, useState } from "react";
import { getRealtimeSocket } from "@/lib/realtime-client";
import { SPLAT_ASSET_UPDATED_EVENT, type SplatAssetUpdatedPayload } from "@roomlog/types";
import {
  deriveOwnerTourActions,
  fetchOwnerListingAssets,
  type OwnerTourAction
} from "@/lib/owner-tour-assets";

function actionLabel(action: OwnerTourAction): string {
  return action.status === "UPLOADED"
    ? `『${action.title}』 — 도면과 영상 정합을 완료해주세요!`
    : `『${action.title}』 — 3D 제작 실패, 다시 업로드해주세요`;
}

// UPLOADED → 해당 자산의 정합 화면으로 직행. FAILED → 매물등록(영상·스플랫 재접수) 화면으로.
function actionHref(action: OwnerTourAction): string {
  return action.status === "UPLOADED"
    ? `/splat-tour/register?asset=${encodeURIComponent(action.assetId)}`
    : "/sell";
}

export default function TourActionBell() {
  const [actions, setActions] = useState<OwnerTourAction[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const reload = useCallback(async () => {
    const data = await fetchOwnerListingAssets();
    if (data) setActions(deriveOwnerTourActions(data)); // null=조회 실패 → 기존 목록 유지
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 3D 자산 상태 변화를 소켓으로 받으면 재집계한다. 페이로드는 식별자만 신뢰하고 실제 상태는 REST 재조회로 확정.
  useEffect(() => {
    const socket = getRealtimeSocket();
    const onAssetUpdated = (_payload: SplatAssetUpdatedPayload) => {
      void reload();
    };
    socket.on(SPLAT_ASSET_UPDATED_EVENT, onAssetUpdated);
    return () => {
      socket.off(SPLAT_ASSET_UPDATED_EVENT, onAssetUpdated);
    };
  }, [reload]);

  // 바깥 클릭·Esc로 드롭다운을 닫는다.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const count = actions.length;

  return (
    <div className="tour-bell" ref={containerRef}>
      <button
        type="button"
        className="tour-bell-button"
        aria-label={count > 0 ? `3D 투어 조치 필요 알림 ${count}건` : "3D 투어 조치 필요 알림 없음"}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 ? <span className="tour-bell-badge">{count}</span> : null}
      </button>
      {open ? (
        <div className="tour-bell-menu" role="menu" aria-label="3D 투어 조치 필요 매물">
          <p className="tour-bell-menu-title">3D 투어 조치 필요</p>
          {count === 0 ? (
            <p className="tour-bell-empty">정합이 필요한 매물이 없어요.</p>
          ) : (
            <ul className="tour-bell-list">
              {actions.map((action) => (
                <li key={`${action.listingId}-${action.assetId}`}>
                  <a
                    className={action.status === "UPLOADED" ? "tour-bell-item is-uploaded" : "tour-bell-item is-failed"}
                    href={actionHref(action)}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                  >
                    {actionLabel(action)}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
