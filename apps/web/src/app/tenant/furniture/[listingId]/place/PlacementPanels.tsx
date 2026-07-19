"use client";

import Link from "next/link";
import type { TenantFurniture, TenantFurniturePlacementItem } from "@roomlog/types/tenant-furniture";
import { FurniturePreview3D } from "../../FurniturePreview3D";
import { tenantFurnitureName } from "../../furniture-labels";
import type { PlacementAnalysis } from "./placement-model";
import styles from "../../furniture.module.css";

export function PlacedFurniturePanel({
  analyses,
  furnitureById,
  items,
  onRemove,
  onRotate,
  selectedId
}: {
  analyses: ReadonlyMap<string, PlacementAnalysis>;
  furnitureById: ReadonlyMap<string, TenantFurniture>;
  items: readonly TenantFurniturePlacementItem[];
  onRemove: (furnitureId: string) => void;
  onRotate: (furnitureId: string) => void;
  selectedId: string | null;
}) {
  return (
    <section aria-labelledby="placed-title">
      <div className={styles.summaryRow}>
        <h2 id="placed-title" className={styles.sectionLabel}>도면에 놓은 가구</h2>
        <span className={styles.count}>{items.length}개</span>
      </div>
      {items.length === 0 ? (
        <p className={styles.helperText}>아래 내 가구함에서 가구를 추가해 보세요.</p>
      ) : (
        <div className={styles.placementList}>
          {items.map((item, index) => {
            const furniture = furnitureById.get(item.furnitureId);
            const analysis = analyses.get(item.furnitureId);
            if (!furniture || !analysis) return null;
            const itemInvalid = analysis.touchesWall || analysis.overlapsFurniture;
            const itemStatus = analysis.touchesWall ? "벽 걸림" : analysis.overlapsFurniture ? "가구 겹침" : "들어감";
            return (
              <article key={item.furnitureId} className={styles.placementItem} data-selected={selectedId === item.furnitureId}>
                <div className={styles.cardTop}>
                  <div className={styles.placementTitle}>
                    <span className={styles.placementIndex}>{index + 1}</span>
                    <FurniturePreview3D furniture={furniture} rotationY={item.rotation} />
                    <div className={styles.headingBlock}>
                      <h3 className={styles.itemName}>{tenantFurnitureName(furniture)}</h3>
                      <p className={styles.itemMeta}>
                        {(item.rotation * 180 / Math.PI).toFixed(0)}° · x {item.position[0].toFixed(2)}m / z {item.position[1].toFixed(2)}m
                      </p>
                    </div>
                  </div>
                  <span className={styles.statusChip} data-state={itemInvalid ? "invalid" : "valid"}>{itemStatus}</span>
                </div>
                <div className={styles.actionRow}>
                  <button type="button" className={styles.compactButton} onClick={() => onRotate(item.furnitureId)}>90° 회전</button>
                  <button type="button" className={styles.compactButton} onClick={() => onRemove(item.furnitureId)}>빼기</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function FurnitureInventoryPanel({
  inventory,
  onAdd,
  placedIds
}: {
  inventory: readonly TenantFurniture[];
  onAdd: (furniture: TenantFurniture) => void;
  placedIds: ReadonlySet<string>;
}) {
  return (
    <section aria-labelledby="inventory-title">
      <div className={styles.summaryRow}>
        <h2 id="inventory-title" className={styles.sectionLabel}>내 가구함</h2>
        <Link className={styles.count} href="/tenant/furniture">가구 관리</Link>
      </div>
      {inventory.length === 0 ? (
        <div className={styles.comingSoon}>
          <h2>등록된 가구가 없어요</h2>
          <p>앱에서 방을 스캔해 가구를 먼저 등록해 주세요.</p>
        </div>
      ) : (
        <div className={styles.inventoryList}>
          {inventory.map((furniture) => {
            const placed = placedIds.has(furniture.id);
            return (
              <div key={furniture.id} className={styles.inventoryItem}>
                <div className={styles.inventoryRow}>
                  <FurniturePreview3D furniture={furniture} />
                  <div className={styles.headingBlock}>
                    <h3 className={styles.itemName}>{tenantFurnitureName(furniture)}</h3>
                    <p className={styles.itemMeta}>{furniture.sizeMm.width} × {furniture.sizeMm.depth} mm</p>
                  </div>
                  <button
                    type="button"
                    className={styles.compactButton}
                    data-emphasis={!placed}
                    disabled={placed}
                    onClick={() => onAdd(furniture)}
                  >
                    {placed ? "배치됨" : "도면에 놓기"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
