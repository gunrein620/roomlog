"use client";

// 가구 선택 UI 공유 컴포넌트 — ListingTourRoom3D(도면 3D 뷰)와 tour-viewer(splat 투어)가 각자의
// 3D 조작(배치·드래그·회전)은 그대로 유지한 채, "내 가구/등록 가구를 고르는" 패널만 통일한다
// (사용자 결정: "패널 UI만 통일, 조작계는 각자 유지"). 클래스명은 ListingTourRoom3D 쪽 기존
// listing-tour-furniture-* 를 그대로 쓴다 — globals.css에 정의돼 있고 특정 조상(.hero-stage 등)에
// 묶이지 않은 기본 규칙이 이미 있어 두 호출부 어디서 렌더해도 그대로 먹는다.

import type { TenantFurniture } from "@roomlog/types/tenant-furniture";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  furnitureCategoryLabel,
  furnitureImageUrl,
  listFurnitureCategoryFilters
} from "../floor-plan-3d/furniture-placement";
import type { FurnitureCatalogItem } from "../floor-plan-3d/room-model/types";
import { fetchTenantFurniture, TenantFurnitureApiError } from "@/lib/tenant-furniture-api";
import { TENANT_FURNITURE_CATEGORY_ICONS, tenantFurnitureName } from "../tenant/furniture/furniture-labels";

export type FurnitureSourceTab = "mine" | "catalog";

/** TenantFurniture(임차인 소유 가구 1점)를 FurnitureCatalogItem 형태로 변환 — 두 호스트가 각자의
 * 배치 초안 생성 함수(createFurnitureModel/createMitunetFloorFurnitureDraft)에 넘길 재료다. */
export function tenantFurnitureCatalogItem(furniture: TenantFurniture): FurnitureCatalogItem {
  return {
    brand: "내 가구",
    category: furniture.category,
    color: "lightgray",
    furniture_id: furniture.id,
    length: [furniture.sizeMm.width, furniture.sizeMm.height, furniture.sizeMm.depth],
    modelUrl: furniture.meshUrl ?? undefined,
    name: tenantFurnitureName(furniture),
    price: 0,
    source: furniture.source
  };
}

function catalogSearchText(item: FurnitureCatalogItem) {
  return `${item.name} ${item.brand} ${item.category ?? ""} ${item.furniture_id}`.toLowerCase();
}

/** 내 가구 목록 로딩 — 두 호스트가 동일하게 필요로 하던 fetch+필터+에러 처리를 여기 하나로 묶는다.
 * RoomPlan 스캔은 물체를 감지하는 즉시 meshUrl 없이 행을 만든다. Object Capture로 실물을 찍어
 * 변환까지 끝난(meshJobState === "DONE") 것만 배치 가능한 실물 모델이 있다 — 그 전 단계 항목을
 * 그대로 두면 회색 박스만 나열된다. 401(비로그인)은 흔한 정상 경로라 조용히 빈 배열로 두고,
 * 그 외 실패만 onLoadError로 알린다. */
export function useTenantFurnitureCatalog(onLoadError?: (message: string) => void): TenantFurniture[] {
  const [tenantFurnitures, setTenantFurnitures] = useState<TenantFurniture[]>([]);
  // effect 재실행 없이 최신 콜백을 읽기 위한 ref — onLoadError를 deps에 넣으면 인라인 함수
  // 전달 시 매 렌더 refetch가 도는 함정이 생긴다.
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;

  useEffect(() => {
    let cancelled = false;

    fetchTenantFurniture()
      .then((furnitures) => {
        if (!cancelled) setTenantFurnitures(furnitures.filter((furniture) => furniture.meshJobState === "DONE"));
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setTenantFurnitures([]);
        if (reason instanceof TenantFurnitureApiError && reason.status === 401) return;
        onLoadErrorRef.current?.("내 가구를 불러오지 못했습니다. 기본 가구는 계속 이용할 수 있습니다.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return tenantFurnitures;
}

export type FurnitureCatalogPanelProps = {
  sourceTab: FurnitureSourceTab;
  onSourceTabChange: (tab: FurnitureSourceTab) => void;

  tenantFurnitures: TenantFurniture[];
  onSelectTenantFurniture: (furniture: TenantFurniture) => void;
  /** 내 가구가 없을 때 안내 문구. 생략하면 ListingTourRoom3D 기존 관례("등록한 내 가구가
   * 없습니다.")를 쓴다 — 401(비로그인)과 진짜 빈 상태를 구분하지 않고 같은 빈 안내를 보여준다. */
  emptyMineMessage?: string;

  catalogItems: FurnitureCatalogItem[];
  onSelectCatalogItem: (item: FurnitureCatalogItem) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  categoryFilter: string;
  onCategoryChange: (category: string) => void;
  /** 카테고리 가로 스크롤 슬라이더 노출 — hero variant처럼 좁은 폭에서는 숨긴다. 기본 노출. */
  showCategoryScrollbar?: boolean;

  /** 카탈로그/내 가구 그리드에서 "고르고 있는 항목" 강조(active 클래스) 비교 대상 —
   * 보통 호스트의 pendingFurniture?.furniture_id. */
  activeFurnitureId?: string | null;

  /** 패널 하단에 호스트별 부가 UI(저장/취소 버튼, 배치 힌트 등)를 끼워 넣는 슬롯. */
  children?: ReactNode;
};

export default function FurnitureCatalogPanel({
  activeFurnitureId,
  categoryFilter,
  catalogItems,
  children,
  emptyMineMessage,
  onCategoryChange,
  onSearchChange,
  onSelectCatalogItem,
  onSelectTenantFurniture,
  onSourceTabChange,
  searchQuery,
  showCategoryScrollbar = true,
  sourceTab,
  tenantFurnitures
}: FurnitureCatalogPanelProps) {
  const [catalogLimit, setCatalogLimit] = useState(30);
  const categoryTabsRef = useRef<HTMLDivElement>(null);
  const [categoryScroll, setCategoryScroll] = useState({ left: 0, max: 0 });

  const categoryFilters = useMemo(() => listFurnitureCategoryFilters(catalogItems), [catalogItems]);
  const categoryCounts = useMemo(
    () =>
      catalogItems.reduce<Record<string, number>>((counts, item) => {
        const category = furnitureCategoryLabel(item);
        counts[category] = (counts[category] ?? 0) + 1;
        return counts;
      }, {}),
    [catalogItems]
  );
  const filteredCatalog = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return catalogItems.filter((item) => {
      const matchesCategory = categoryFilter === "전체" || furnitureCategoryLabel(item) === categoryFilter;
      const matchesQuery = !normalizedQuery || catalogSearchText(item).includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [catalogItems, categoryFilter, searchQuery]);
  const visibleCatalog = useMemo(() => filteredCatalog.slice(0, catalogLimit), [filteredCatalog, catalogLimit]);

  // 검색어·카테고리가 바뀌면 "더 보기" 진행분을 리셋 — 안 그러면 새 필터 결과인데 이전 한도가
  // 남아 필터링 직후 목록이 부자연스럽게 짧아 보인다.
  useEffect(() => {
    setCatalogLimit(30);
  }, [categoryFilter, searchQuery]);

  const syncCategoryScroll = useCallback(() => {
    const tabList = categoryTabsRef.current;
    if (!tabList) return;
    const max = Math.max(0, Math.round(tabList.scrollWidth - tabList.clientWidth));
    const left = Math.max(0, Math.min(max, Math.round(tabList.scrollLeft)));
    setCategoryScroll((current) => (current.left === left && current.max === max ? current : { left, max }));
  }, []);

  useEffect(() => {
    if (sourceTab !== "catalog") return;
    const tabList = categoryTabsRef.current;
    if (!tabList) return;

    syncCategoryScroll();
    const resizeObserver = new ResizeObserver(syncCategoryScroll);
    resizeObserver.observe(tabList);
    Array.from(tabList.children).forEach((child) => resizeObserver.observe(child));

    return () => resizeObserver.disconnect();
  }, [categoryFilters, sourceTab, syncCategoryScroll]);

  function handleCategoryScrollInput(left: number) {
    const tabList = categoryTabsRef.current;
    if (!tabList) return;
    tabList.scrollLeft = left;
    setCategoryScroll((current) => ({ ...current, left }));
  }

  return (
    <>
      <div aria-label="가구 목록 종류" className="listing-tour-furniture-source-tabs" role="tablist">
        <button
          aria-selected={sourceTab === "mine"}
          className={sourceTab === "mine" ? "active" : ""}
          onClick={() => onSourceTabChange("mine")}
          role="tab"
          type="button"
        >
          내 가구 <small>{tenantFurnitures.length}</small>
        </button>
        <button
          aria-selected={sourceTab === "catalog"}
          className={sourceTab === "catalog" ? "active" : ""}
          onClick={() => onSourceTabChange("catalog")}
          role="tab"
          type="button"
        >
          등록 가구 <small>{catalogItems.length}</small>
        </button>
      </div>

      {sourceTab === "mine" ? (
        <section aria-label="내 가구" className="listing-tour-furniture-source-panel">
          <p className="listing-tour-furniture-source-copy">등록한 가구를 이 방에 놓아보세요.</p>
          {tenantFurnitures.length > 0 ? (
            <div className="hero-furniture-catalog-scroll">
              <div className="listing-tour-furniture-grid">
                {tenantFurnitures.map((furniture) => {
                  const item = tenantFurnitureCatalogItem(furniture);

                  return (
                    <button
                      className={activeFurnitureId === item.furniture_id ? "active" : ""}
                      key={item.furniture_id}
                      onClick={() => onSelectTenantFurniture(furniture)}
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className="listing-tour-furniture-thumb"
                        style={{ backgroundColor: "var(--surface-container-high)" }}
                      >
                        {furniture.thumbnailUrl ? (
                          <img alt="" decoding="async" loading="lazy" src={furniture.thumbnailUrl} />
                        ) : (
                          TENANT_FURNITURE_CATEGORY_ICONS[furniture.category] ?? "◇"
                        )}
                      </span>
                      <strong>{item.name}</strong>
                      <small>
                        {furniture.sizeMm.width} × {furniture.sizeMm.depth} mm
                      </small>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="listing-tour-furniture-source-empty">
              <p>{emptyMineMessage ?? "등록한 내 가구가 없습니다."}</p>
              <button onClick={() => onSourceTabChange("catalog")} type="button">
                등록 가구 보기
              </button>
            </div>
          )}
        </section>
      ) : (
        <section aria-label="등록 가구" className="listing-tour-furniture-source-panel">
          <div className="listing-tour-furniture-search">
            <input
              aria-label="가구 검색"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="침대, 책상, 의자 검색"
              type="search"
              value={searchQuery}
            />
          </div>
          <div
            aria-label="가구 카테고리"
            className="listing-tour-furniture-category-tabs"
            onScroll={syncCategoryScroll}
            ref={categoryTabsRef}
            role="tablist"
          >
            {categoryFilters.map((category) => (
              <button
                aria-selected={categoryFilter === category}
                className={categoryFilter === category ? "active" : ""}
                key={category}
                onClick={() => onCategoryChange(category)}
                role="tab"
                type="button"
              >
                {category}
                <small>{category === "전체" ? catalogItems.length : categoryCounts[category] ?? 0}</small>
              </button>
            ))}
          </div>
          {showCategoryScrollbar && categoryScroll.max > 0 ? (
            <input
              aria-label="가구 카테고리 가로 스크롤"
              className="listing-tour-furniture-category-scrollbar"
              max={categoryScroll.max}
              min={0}
              onInput={(event) => handleCategoryScrollInput(Number(event.currentTarget.value))}
              step={1}
              type="range"
              value={categoryScroll.left}
            />
          ) : null}
          <div className="hero-furniture-catalog-scroll">
            <div className="listing-tour-furniture-grid">
              {visibleCatalog.map((item) => {
                const imageUrl = furnitureImageUrl(item);

                return (
                  <button
                    className={activeFurnitureId === item.furniture_id ? "active" : ""}
                    key={item.furniture_id}
                    onClick={() => onSelectCatalogItem(item)}
                    type="button"
                  >
                    <span className="listing-tour-furniture-thumb" style={{ backgroundColor: item.color }}>
                      {imageUrl ? (
                        <img
                          alt=""
                          decoding="async"
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                          src={imageUrl}
                        />
                      ) : null}
                    </span>
                    <strong>{item.name}</strong>
                    <small>{item.brand}</small>
                  </button>
                );
              })}
            </div>
            {visibleCatalog.length < filteredCatalog.length ? (
              <button className="listing-tour-furniture-more" onClick={() => setCatalogLimit((limit) => limit + 30)} type="button">
                가구 더 보기 ({visibleCatalog.length}/{filteredCatalog.length})
              </button>
            ) : null}
          </div>
        </section>
      )}

      {children}
    </>
  );
}
