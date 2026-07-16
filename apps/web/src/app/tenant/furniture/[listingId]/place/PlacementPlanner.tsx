"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TenantFurniture, TenantFurniturePlacementItem } from "@roomlog/types/tenant-furniture";
import { Button } from "@roomlog/ui";
import type { WheretoputWall3D } from "@/app/floor-plan-3d/room-model/types";
import {
  fetchTenantFurniture,
  fetchTenantFurnitureListingPlan,
  fetchTenantFurniturePlacement,
  saveTenantFurniturePlacement,
  type TenantFurnitureListingPlan
} from "@/lib/tenant-furniture-api";
import { TopDownCanvas } from "./TopDownCanvas";
import { FurnitureInventoryPanel, PlacedFurniturePanel } from "./PlacementPanels";
import { MissingFloorPlan, PlannerError, PlannerHeader, PlannerLoading } from "./PlannerStates";
import { analyzePlacements, clampPlacementIntoRoom, roomCenter } from "./placement-model";
import styles from "../../furniture.module.css";

function placementSignature(items: readonly TenantFurniturePlacementItem[]) {
  return JSON.stringify(items);
}

function normalizeRotation(rotation: number) {
  const turn = Math.PI * 2;
  return ((rotation % turn) + turn) % turn;
}

export function PlacementPlanner({ listingId }: { listingId: string }) {
  const [inventory, setInventory] = useState<TenantFurniture[]>([]);
  const [listing, setListing] = useState<TenantFurnitureListingPlan | null>(null);
  const [items, setItems] = useState<TenantFurniturePlacementItem[]>([]);
  const [savedSignature, setSavedSignature] = useState(placementSignature([]));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("가구를 배치하고 저장해 주세요.");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextInventory, nextListing, savedItems] = await Promise.all([
        fetchTenantFurniture(),
        fetchTenantFurnitureListingPlan(listingId),
        fetchTenantFurniturePlacement(listingId)
      ]);
      const knownIds = new Set(nextInventory.map((item) => item.id));
      const usableItems = savedItems.filter((item) => knownIds.has(item.furnitureId));
      setInventory(nextInventory);
      setListing(nextListing);
      setItems(usableItems);
      setSavedSignature(placementSignature(usableItems));
      setSelectedId(usableItems[0]?.furnitureId ?? null);
      setSaveMessage(usableItems.length ? "저장된 배치안을 불러왔어요." : "가구를 배치하고 저장해 주세요.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "배치 화면을 준비하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const furnitureById = useMemo(() => new Map(inventory.map((item) => [item.id, item])), [inventory]);
  const walls = useMemo<readonly WheretoputWall3D[]>(() => listing?.walls ?? [], [listing]);
  const analyses = useMemo(() => analyzePlacements(items, furnitureById, walls), [items, furnitureById, walls]);
  const hasWallCollision = [...analyses.values()].some((analysis) => analysis.touchesWall);
  const hasFurnitureCollision = [...analyses.values()].some((analysis) => analysis.overlapsFurniture);
  const invalid = hasWallCollision || hasFurnitureCollision;
  const dirty = placementSignature(items) !== savedSignature;
  const placedIds = useMemo(() => new Set(items.map((item) => item.furnitureId)), [items]);

  function updatePosition(furnitureId: string, position: [number, number]) {
    const furniture = furnitureById.get(furnitureId);
    if (!furniture) return;
    setItems((current) => current.map((item) => item.furnitureId === furnitureId
      ? clampPlacementIntoRoom({ ...item, position }, furniture, walls)
      : item));
    setSaveMessage("변경사항을 저장해 주세요.");
  }

  function rotate(furnitureId: string) {
    const furniture = furnitureById.get(furnitureId);
    if (!furniture) return;
    setItems((current) => current.map((item) => item.furnitureId === furnitureId
      ? clampPlacementIntoRoom(
          { ...item, rotation: normalizeRotation(item.rotation + Math.PI / 2) },
          furniture,
          walls
        )
      : item));
    setSelectedId(furnitureId);
    setSaveMessage("방향을 바꿨어요. 변경사항을 저장해 주세요.");
  }

  function addFurniture(furniture: TenantFurniture) {
    if (placedIds.has(furniture.id)) return;
    const center = roomCenter(walls);
    const offset = items.length * 0.12;
    const next = clampPlacementIntoRoom(
      { furnitureId: furniture.id, position: [center[0] + offset, center[1] + offset], rotation: 0 },
      furniture,
      walls
    );
    setItems((current) => [...current, next]);
    setSelectedId(furniture.id);
    setSaveMessage("가구를 끌어 원하는 자리에 놓아 보세요.");
  }

  function removeFurniture(furnitureId: string) {
    setItems((current) => current.filter((item) => item.furnitureId !== furnitureId));
    setSelectedId((current) => current === furnitureId ? null : current);
    setSaveMessage("가구를 배치안에서 뺐어요. 변경사항을 저장해 주세요.");
  }

  async function save() {
    if (invalid || saving) return;
    setSaving(true);
    setSaveMessage("배치안을 저장하고 있어요…");
    try {
      await saveTenantFurniturePlacement(listingId, items);
      setSavedSignature(placementSignature(items));
      setSaveMessage("배치안을 저장했어요.");
    } catch (reason) {
      setSaveMessage(reason instanceof Error ? reason.message : "배치안을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <PlannerLoading />;
  }

  if (error) {
    return <PlannerError error={error} onRetry={() => void load()} />;
  }

  if (!listing || walls.length === 0) {
    return <MissingFloorPlan />;
  }

  const statusText = items.length === 0
    ? "가구를 추가해 주세요"
    : hasWallCollision
      ? "벽 걸림 ✗"
      : hasFurnitureCollision
        ? "가구끼리 겹침 ✗"
        : "들어감 ✓";
  const statusState = items.length === 0 ? "empty" : invalid ? "invalid" : "valid";

  return (
    <div className={styles.screen}>
      <PlannerHeader />
      <main className={styles.plannerContent}>
        <section className={styles.planMeta} aria-labelledby="listing-title">
          <p className={styles.eyebrow}>배치할 매물</p>
          <h2 id="listing-title" className={styles.title}>{listing.title}</h2>
          {listing.location ? <p className={styles.subtitle}>{listing.location}</p> : null}
        </section>

        <div className={styles.statusRow} aria-live="polite">
          <span className={styles.sectionLabel}>실시간 확인</span>
          <span className={styles.statusChip} data-state={statusState}>{statusText}</span>
        </div>

        <TopDownCanvas
          analyses={analyses}
          furnitureById={furnitureById}
          items={items}
          onMove={updatePosition}
          onRotate={rotate}
          onSelect={setSelectedId}
          selectedId={selectedId}
          walls={walls}
        />

        <PlacedFurniturePanel
          analyses={analyses}
          furnitureById={furnitureById}
          items={items}
          onRemove={removeFurniture}
          onRotate={rotate}
          selectedId={selectedId}
        />

        <FurnitureInventoryPanel inventory={inventory} onAdd={addFurniture} placedIds={placedIds} />
      </main>

      <footer className={styles.footer}>
        <Button type="button" fullWidth disabled={saving || invalid || !dirty} onClick={() => void save()}>
          {saving ? "저장 중…" : invalid ? "겹침을 정리해 주세요" : dirty ? "배치안 저장" : "저장됨"}
        </Button>
        <p className={styles.footerMessage} aria-live="polite">{saveMessage}</p>
      </footer>
    </div>
  );
}
