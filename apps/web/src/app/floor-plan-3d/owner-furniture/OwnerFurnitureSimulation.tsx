"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import ListingTourRoom3D, { type ListingFloorPlanFurniture } from "../../_components/ListingTourRoom3D";
import {
  readOwnerFurnitureDraft,
  writeOwnerFurnitureDraft,
  type OwnerFurnitureDraft
} from "../owner-furniture-handoff";

export default function OwnerFurnitureSimulation() {
  const searchParams = useSearchParams();
  const requestId = searchParams.get("requestId")?.trim() ?? "";
  const [draft, setDraft] = useState<OwnerFurnitureDraft | null>(null);
  const [error, setError] = useState("");
  const ownerSaveRequestRef = useRef<(() => void) | null>(null);

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
      setDraft(nextDraft);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "가구 배치 초안을 불러오지 못했습니다.");
    }
  }, [requestId]);

  function saveAndReturn(furnitures: ListingFloorPlanFurniture[]) {
    if (!draft) return;
    try {
      const savedAt = Date.now();
      const floorPlan = { ...draft.floorPlan, furnitures };
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
      const returnUrl = new URL("/?flow=listing", returnOrigin);
      returnUrl.searchParams.set("floorPlanRequestId", requestId);
      returnUrl.hash = "my-page";
      window.location.href = returnUrl.toString();
    } catch {
      setError("가구 배치를 저장하지 못했습니다. 브라우저 저장 공간을 확인하고 다시 시도해주세요.");
    }
  }

  if (error) {
    return (
      <main className="owner-furniture-error">
        <strong>3D 가구 배치를 열 수 없습니다</strong>
        <p>{error}</p>
        <a href="/?flow=listing#my-page">매물 등록으로 돌아가기</a>
      </main>
    );
  }

  if (!draft) return <main className="owner-furniture-loading">3D 가구 배치를 불러오는 중입니다…</main>;

  return (
    <main className="owner-furniture-page">
      <header className="owner-furniture-header">
        <div>
          <small>ROOMLOG 3D</small>
          <strong>등록 가구 배치</strong>
        </div>
        <div className="owner-furniture-header-actions">
          <span>2 가구 선택 · E 집기 · 1/3 회전 · Q 고정 · R 제거</span>
          <button className="owner-furniture-save" onClick={() => ownerSaveRequestRef.current?.()} type="button">저장하고 나오기</button>
        </div>
      </header>
      <ListingTourRoom3D
        experience="owner"
        floorPlan={draft.floorPlan}
        initialSimulationMode="furniture"
        listingId={draft.requestId}
        onOwnerFurnitureSave={saveAndReturn}
        ownerSaveRequestRef={ownerSaveRequestRef}
        simulationOpen
        variant="hero"
      />
    </main>
  );
}
