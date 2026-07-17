"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { FurnitureDimensionsMm, TenantFurniture } from "@roomlog/types/tenant-furniture";
import { Button, Card } from "@roomlog/ui";
import { fetchTenantFurniture } from "@/lib/tenant-furniture-api";
import { DimensionEditor } from "./DimensionEditor";
import {
  TENANT_FURNITURE_CATEGORY_ICONS,
  TENANT_FURNITURE_CATEGORY_LABELS,
  tenantFurnitureName
} from "./furniture-labels";
import styles from "./furniture.module.css";

const SOURCE_LABELS: Record<TenantFurniture["source"], string> = {
  roomplan: "RoomPlan 스캔",
  "object-capture": "Object Capture",
  manual: "직접 입력",
  catalog: "카탈로그"
};

function dimensionsLabel(size: FurnitureDimensionsMm) {
  return `${size.width.toLocaleString("ko-KR")} × ${size.depth.toLocaleString("ko-KR")} × ${size.height.toLocaleString("ko-KR")} mm`;
}

export default function TenantFurniturePage() {
  const [items, setItems] = useState<TenantFurniture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchTenantFurniture());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "내 가구를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <Link className={styles.backLink} href="/" aria-label="집우집주 홈으로 돌아가기">
          ←
        </Link>
        <div className={styles.headingBlock}>
          <p className={styles.eyebrow}>이사 전 미리보기</p>
          <h1 className={styles.title}>내 가구함</h1>
        </div>
      </header>

      <main className={styles.content}>
        <section aria-labelledby="furniture-list-title">
          <div className={styles.summaryRow}>
            <h2 id="furniture-list-title" className={styles.sectionLabel}>등록된 가구</h2>
            {!loading && !error ? <span className={styles.count}>{items.length}개</span> : null}
          </div>

          {loading ? (
            <div className={styles.loadingList} aria-busy="true" aria-label="내 가구 불러오는 중">
              <div className={styles.skeleton} />
              <div className={styles.skeleton} />
            </div>
          ) : error ? (
            <div className={styles.errorState} role="alert">
              <h2>가구함을 열지 못했어요</h2>
              <p>{error}</p>
              <Button type="button" onClick={() => void load()}>다시 불러오기</Button>
            </div>
          ) : items.length === 0 ? (
            <div className={styles.emptyState} role="status">
              <span className={styles.categoryIcon} aria-hidden="true">▦</span>
              <h2>아직 등록한 가구가 없어요</h2>
              <p>집우집주 앱에서 현재 방을 스캔해<br />가구를 내 계정에 등록해 주세요.</p>
            </div>
          ) : (
            <ul className={styles.list}>
              {items.map((item) => (
                <li key={item.id}>
                  <Card className={styles.furnitureCard}>
                    <div className={styles.cardTop}>
                      <div className={styles.furnitureIdentity}>
                        <span className={styles.categoryIcon} aria-hidden="true">
                          {TENANT_FURNITURE_CATEGORY_ICONS[item.category] ?? "□"}
                        </span>
                        <div className={styles.headingBlock}>
                          <h3 className={styles.itemName}>{tenantFurnitureName(item)}</h3>
                          <p className={styles.itemMeta}>
                            {TENANT_FURNITURE_CATEGORY_LABELS[item.category]} · {SOURCE_LABELS[item.source]}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className={styles.compactButton}
                        aria-expanded={editingId === item.id}
                        onClick={() => setEditingId((current) => current === item.id ? null : item.id)}
                      >
                        치수 수정
                      </button>
                    </div>
                    <div className={styles.dimensionRow} aria-label={`가구 치수 ${dimensionsLabel(item.sizeMm)}`}>
                      <span className={styles.dimensionChip}>너비 {item.sizeMm.width.toLocaleString("ko-KR")} mm</span>
                      <span className={styles.dimensionChip}>깊이 {item.sizeMm.depth.toLocaleString("ko-KR")} mm</span>
                      <span className={styles.dimensionChip}>높이 {item.sizeMm.height.toLocaleString("ko-KR")} mm</span>
                    </div>
                    {editingId === item.id ? (
                      <DimensionEditor
                        item={item}
                        onCancel={() => setEditingId(null)}
                        onSaved={(updated) => {
                          setItems((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
                          setEditingId(null);
                        }}
                      />
                    ) : null}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.comingSoon} aria-labelledby="manual-add-title">
          <h2 id="manual-add-title">가구 직접 추가</h2>
          <p>웹에서 새 가구를 등록하는 기능은 곧 지원할게요. 지금은 앱 스캔으로 등록한 가구의 실측 치수를 수정할 수 있어요.</p>
          <Button type="button" variant="secondary" disabled>직접 추가 · 곧 지원</Button>
        </section>
      </main>
    </div>
  );
}
