"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import ListingTourRoom3D, {
  type ListingFloorPlanFurniture,
  type OwnerFurnitureSaveDestination
} from "../../_components/ListingTourRoom3D";
import {
  buildOwnerFloorPlanResumePath,
  readOwnerFurnitureDraft,
  writeOwnerFurnitureDraft,
  type OwnerFurnitureEditorSnapshot,
  type OwnerFurnitureDraft
} from "../owner-furniture-handoff";

function sourcePlanImageFromEditorSnapshot(snapshot?: OwnerFurnitureEditorSnapshot) {
  const sourceImageB64 = snapshot?.review.input_image_b64;
  return typeof sourceImageB64 === "string" && sourceImageB64.length > 0
    ? sourceImageB64
    : undefined;
}

export default function OwnerFurnitureSimulation() {
  const searchParams = useSearchParams();
  const requestId = searchParams.get("requestId")?.trim() ?? "";
  const [draft, setDraft] = useState<OwnerFurnitureDraft | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [surfaceMode, setSurfaceMode] = useState<"floor" | "source">("floor");
  const ownerSaveRequestRef = useRef<((destination?: OwnerFurnitureSaveDestination) => void) | null>(null);

  useEffect(() => {
    if (!requestId) {
      setError("가구 배치 요청 정보가 없습니다. 매물 등록 화면에서 다시 열어주세요.");
      return;
    }
    try {
      const nextDraft = readOwnerFurnitureDraft(window.localStorage, requestId);
      if (!nextDraft) {
        setError("저장된 3D 도면을 찾지 못했습니다. 매물 등록 화면에서 다시 열어주세요.");
        return;
      }
      const recoveredSourceImageB64 = sourcePlanImageFromEditorSnapshot(nextDraft.editorSnapshot);
      const hydratedDraft = (
        nextDraft.floorPlan.mitunet
        && !nextDraft.floorPlan.mitunet.sourceImageB64
        && recoveredSourceImageB64
      )
        ? {
            ...nextDraft,
            floorPlan: {
              ...nextDraft.floorPlan,
              mitunet: { ...nextDraft.floorPlan.mitunet, sourceImageB64: recoveredSourceImageB64 }
            }
          }
        : nextDraft;
      setDraft(hydratedDraft);
      setSurfaceMode(hydratedDraft.floorPlan.mitunet?.surfaceMode === "source" ? "source" : "floor");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "가구 배치 초안을 불러오지 못했습니다.");
    }
  }, [requestId]);

  function saveAndReturn(
    furnitures: ListingFloorPlanFurniture[],
    destination: OwnerFurnitureSaveDestination
  ) {
    if (!draft) return;
    try {
      setActionError("");
      const savedAt = Date.now();
      const floorPlan = {
        ...draft.floorPlan,
        ...(draft.floorPlan.mitunet
          ? { mitunet: { ...draft.floorPlan.mitunet, surfaceMode } }
          : {}),
        furnitures
      };
      const nextDraft = { ...draft, floorPlan, savedAt };
      writeOwnerFurnitureDraft(window.localStorage, nextDraft);
      window.localStorage.setItem(`roomlogListingFloorPlan3D:${requestId}`, JSON.stringify({
        name: floorPlan.name,
        savedAt,
        walls3D: floorPlan.walls3D,
        furnitures,
        mitunet: floorPlan.mitunet
      }));

      const requestedOrigin = searchParams.get("returnOrigin");
      const returnOrigin = requestedOrigin === window.location.origin ? requestedOrigin : window.location.origin;
      if (destination === "listing") {
        // /sell 직행 — 루트(/?flow=listing) 경유는 홈 탭 첫 페인트 후 전환이라 홈이 깜빡인다.
        // 등록 폼(LandlordMyPage)은 경로 무관하게 useSearchParams로 floorPlanRequestId를 읽는다.
        const returnUrl = new URL("/sell", returnOrigin);
        returnUrl.searchParams.set("floorPlanRequestId", requestId);
        returnUrl.hash = "my-page";
        window.location.href = returnUrl.toString();
      } else {
        window.sessionStorage.setItem(`roomlogOwnerFurnitureResume:${requestId}`, destination);
        window.location.href = buildOwnerFloorPlanResumePath(returnOrigin, requestId, destination);
      }
    } catch {
      setActionError("가구 배치를 저장하지 못했습니다. 브라우저 저장 공간을 확인하고 다시 시도해주세요.");
    }
  }

  if (error) {
    return (
      <main className="owner-furniture-error">
        <strong>3D 가구 배치를 열 수 없습니다</strong>
        <p>{error}</p>
        <a href="/sell#my-page">매물 등록으로 돌아가기</a>
      </main>
    );
  }

  if (!draft) return <main className="owner-furniture-loading">3D 가구 배치를 불러오는 중입니다…</main>;

  const activeSurfaceView = surfaceMode === "floor" ? "floor" : "3d";
  const floorPlanForSurface = {
    ...draft.floorPlan,
    ...(draft.floorPlan.mitunet
      ? { mitunet: { ...draft.floorPlan.mitunet, surfaceMode } }
      : {})
  };

  return (
    <main className="owner-furniture-page is-3d-simulation-open">
      <header className="owner-furniture-header">
        <div>
          <small>ROOMLOG 3D</small>
          <strong>등록 가구 배치</strong>
        </div>
        <div className="owner-furniture-header-actions">
          <span>2 가구 선택 · 클릭/E 집기 · 1/3 90도 · Q/E 섬세 회전 · 클릭 고정 · R 제거</span>
          <button className="owner-furniture-save" onClick={() => ownerSaveRequestRef.current?.(activeSurfaceView)} type="button">저장하고 3D 뷰로 나가기</button>
        </div>
      </header>
      <ListingTourRoom3D
        experience="owner"
        floorPlan={floorPlanForSurface}
        initialSimulationMode="furniture"
        listingId={draft.requestId}
        onOwnerFurnitureSave={saveAndReturn}
        ownerSaveRequestRef={ownerSaveRequestRef}
        simulationOpen
        variant="hero"
      />
      {actionError ? <p className="owner-furniture-action-error" role="alert">{actionError}</p> : null}
      <div aria-label="도면 보기 전환" className="owner-floor-plan-view-toggle" role="tablist">
        <button
          aria-selected={activeSurfaceView === "3d"}
          className={activeSurfaceView === "3d" ? "active" : undefined}
          onClick={() => setSurfaceMode("source")}
          role="tab"
          type="button"
        >3D</button>
        <button
          aria-selected={activeSurfaceView === "floor"}
          className={activeSurfaceView === "floor" ? "active" : undefined}
          onClick={() => setSurfaceMode("floor")}
          role="tab"
          type="button"
        >Floor</button>
      </div>
    </main>
  );
}
