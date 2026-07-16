"use client";

// 네이버 지도 프리뷰 — 상세 라우트(/listing/[id])의 위치 지도와 SPA 지도 탭이 공유한다.
// 상세 라우트 분리(1단계)로 page.tsx에서 추출했다. 전역 window.naver 타입 선언도 이 모듈이 단일 소유.
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type NaverLatLng = {
  lat?: () => number;
  lng?: () => number;
  x?: number;
  y?: number;
  _lat?: number;
  _lng?: number;
};
type NaverBounds = {
  getNE?: () => NaverLatLng;
  getSW?: () => NaverLatLng;
  getMax?: () => NaverLatLng;
  getMin?: () => NaverLatLng;
  max?: NaverLatLng;
  min?: NaverLatLng;
  _max?: NaverLatLng;
  _min?: NaverLatLng;
  _ne?: NaverLatLng;
  _sw?: NaverLatLng;
};
type NaverMap = {
  getBounds?: () => NaverBounds;
  getZoom?: () => number;
  setCenter?: (center: NaverLatLng) => void;
};
// setMap(null) = 마커 제거 — 지도 탭에서 매물 목록이 바뀔 때 마커를 다시 그리는 데 쓴다.
type NaverMarker = {
  setMap: (map: NaverMap | null) => void;
  setPosition?: (position: NaverLatLng) => void;
};
type NaverPoint = unknown;
type NaverInfoWindow = {
  open: (map: NaverMap, marker: NaverMarker) => void;
  close: () => void;
};
type NaverMapListener = { remove?: () => void };
type NaverMapsApi = {
  LatLng: new (lat: number, lng: number) => NaverLatLng;
  Map: new (
    element: HTMLElement,
    options: {
      center: NaverLatLng;
      zoom: number;
      zoomControl: boolean;
    }
  ) => NaverMap;
  Marker: new (options: {
    map: NaverMap;
    position: NaverLatLng;
    icon?: {
      content: string;
      anchor?: NaverPoint;
    };
  }) => NaverMarker;
  InfoWindow: new (options: { content: string | HTMLElement }) => NaverInfoWindow;
  Point: new (x: number, y: number) => NaverPoint;
  Event?: {
    addListener: (target: unknown, eventName: string, listener: () => void) => NaverMapListener;
    removeListener?: (listener: NaverMapListener) => void;
  };
  Service?: {
    geocode: (
      options: { query: string },
      callback: (status: string, response: NaverGeocodeResponse) => void
    ) => void;
    Status: { OK: string; ERROR: string };
  };
};

export type NaverGeocodeResponse = {
  v2?: { addresses?: Array<{ x: string; y: string; roadAddress?: string; jibunAddress?: string }> };
};

type MapLoadState = "missing-key" | "loading" | "ready" | "error";

declare global {
  interface Window {
    naver?: {
      maps: NaverMapsApi;
    };
  }
}

export const naverMapClientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID ?? "";

// 지도 InfoWindow는 HTML 문자열을 받으므로 사용자 입력(매물명)은 이스케이프한다.
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

function createDismissibleInfoWindow(
  maps: NaverMapsApi,
  map: NaverMap,
  marker: NaverMarker,
  label: string,
  detail: string
) {
  const content = document.createElement("div");
  content.className = "naver-info-window";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "naver-info-window-close";
  closeButton.setAttribute("aria-label", "말풍선 닫기");
  closeButton.textContent = "×";

  const labelElement = document.createElement("b");
  labelElement.textContent = label;
  const detailElement = document.createElement("strong");
  detailElement.textContent = detail;
  content.append(closeButton, labelElement, detailElement);

  const infoWindow = new maps.InfoWindow({ content });
  closeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    infoWindow.close();
  });
  const markerListener = maps.Event?.addListener(marker, "click", () => {
    infoWindow.open(map, marker);
  });
  infoWindow.open(map, marker);
  return { infoWindow, markerListener };
}

function removeMapListener(maps: NaverMapsApi | undefined, listener: NaverMapListener | null) {
  if (!listener) return;
  if (listener.remove) {
    listener.remove();
    return;
  }
  maps?.Event?.removeListener?.(listener);
}

// geocoder 서브모듈 포함 — 주소→좌표 변환(naver.maps.Service.geocode)을 쓰기 위함.
export const naverMapScriptUrl = naverMapClientId
  ? `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${naverMapClientId}&submodules=geocoder`
  : "";

export type MapMarkerInput = {
  lat: number;
  lng: number;
  mapLabel: string;
  dealTone?: "monthly" | "jeonse";
  clusterLabel: string;
  title: string;
  price: string;
};

export type NaverMapViewport = {
  north: number;
  south: number;
  east: number;
  west: number;
  zoom: number | null;
};

const DEFAULT_MAP_CENTER = { lat: 37.5665, lng: 126.9780 };

function coordinateValue(point: NaverLatLng | undefined, axis: "lat" | "lng") {
  if (!point) return NaN;
  const methodValue = point[axis]?.();
  if (typeof methodValue === "number" && Number.isFinite(methodValue)) return methodValue;
  const propertyValue = axis === "lat" ? point._lat ?? point.y : point._lng ?? point.x;
  return Number.isFinite(propertyValue) ? Number(propertyValue) : NaN;
}

function readMapViewport(map: NaverMap): NaverMapViewport | null {
  const bounds = map.getBounds?.();
  const ne = bounds?.getNE?.() ?? bounds?.getMax?.() ?? bounds?._ne ?? bounds?._max ?? bounds?.max;
  const sw = bounds?.getSW?.() ?? bounds?.getMin?.() ?? bounds?._sw ?? bounds?._min ?? bounds?.min;
  const north = coordinateValue(ne, "lat");
  const south = coordinateValue(sw, "lat");
  const east = coordinateValue(ne, "lng");
  const west = coordinateValue(sw, "lng");
  if (![north, south, east, west].every(Number.isFinite)) return null;
  const zoom = map.getZoom?.();
  return {
    north,
    south,
    east,
    west,
    zoom: Number.isFinite(zoom) ? Number(zoom) : null
  };
}

export function NaverMapPreview({
  className = "",
  center,
  showCenterMarker = true,
  address,
  title,
  markers,
  onViewportChange
}: {
  className?: string;
  /** 특정 매물 좌표 — 있으면 그 위치를 중심으로 단일 마커를 찍는다(없으면 데모 마커). */
  center?: { lat: number; lng: number } | null;
  /** 지도 탭은 중심 이동만 필요할 수 있어 현재 위치/상세 마커 표시를 분리한다. */
  showCenterMarker?: boolean;
  address?: string | null;
  title?: string;
  /** 지도 탭용 동적 마커 목록 — 값이 바뀌면 마커를 다시 그린다(직접등록 매물 포함). */
  markers?: MapMarkerInput[];
  /** 현재 지도 화면 범위를 부모에 알려 매물 팝업 노출 범위를 제한한다. */
  onViewportChange?: (viewport: NaverMapViewport | null) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const isMapInitializedRef = useRef(false);
  const mapInstanceRef = useRef<NaverMap | null>(null);
  const centerMarkerRef = useRef<NaverMarker | null>(null);
  const centerInfoWindowRef = useRef<NaverInfoWindow | null>(null);
  const centerInfoWindowListenerRef = useRef<NaverMapListener | null>(null);
  const dynamicMarkersRef = useRef<NaverMarker[]>([]);
  const viewportListenersRef = useRef<NaverMapListener[]>([]);
  const viewportPollTimerRef = useRef<number | null>(null);
  const onViewportChangeRef = useRef(onViewportChange);
  const [isScriptReady, setIsScriptReady] = useState(false);
  const [loadState, setLoadState] = useState<MapLoadState>(naverMapClientId ? "loading" : "missing-key");
  const scriptUrl = naverMapScriptUrl;
  // 좌표 배열이 실제로 달라졌을 때만 마커를 다시 그린다 (렌더마다 새 배열이 와도 무시).
  const markersKey = markers
    ? JSON.stringify(markers.map((deal) => [deal.lat, deal.lng, deal.mapLabel, deal.dealTone ?? "", deal.clusterLabel, deal.title, deal.price]))
    : "";
  const centerKey =
    center && Number.isFinite(center.lat) && Number.isFinite(center.lng)
      ? `${center.lat}:${center.lng}`
      : "";
  const addressKey = typeof address === "string" ? address.trim() : "";

  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  useEffect(() => {
    return () => {
      const maps = window.naver?.maps;
      centerInfoWindowRef.current?.close();
      centerInfoWindowRef.current = null;
      removeMapListener(maps, centerInfoWindowListenerRef.current);
      centerInfoWindowListenerRef.current = null;
      viewportListenersRef.current.forEach((listener) => {
        if (listener.remove) {
          listener.remove();
          return;
        }
        maps?.Event?.removeListener?.(listener);
      });
      viewportListenersRef.current = [];
      if (viewportPollTimerRef.current !== null) {
        window.clearInterval(viewportPollTimerRef.current);
        viewportPollTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (window.naver?.maps) {
      setIsScriptReady(true);
    }
  }, []);

  useEffect(() => {
    if (loadState !== "loading" || !isScriptReady || !naverMapClientId || !mapRef.current) {
      return;
    }

    if (!window.naver?.maps) {
      setLoadState("error");
      return;
    }

    if (isMapInitializedRef.current) {
      return;
    }

    isMapInitializedRef.current = true;
    const maps = window.naver.maps;
    // 매물 좌표가 주어지면 그 위치를 쓰고, 좌표가 없으면 주소 지오코딩 결과로 이동한다.
    const hasCenter = center && Number.isFinite(center.lat) && Number.isFinite(center.lng);
    const hasAddressFallback = Boolean(addressKey);
    const centerLatLng = hasCenter
      ? new maps.LatLng(center.lat, center.lng)
      : new maps.LatLng(DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng);
    const map = new maps.Map(mapRef.current, {
      center: centerLatLng,
      zoom: 16,
      zoomControl: true
    });
    mapInstanceRef.current = map;
    const emitViewport = () => {
      onViewportChangeRef.current?.(readMapViewport(map));
    };
    emitViewport();
    const viewportListeners = ["idle", "dragend", "zoom_changed", "bounds_changed"]
      .map((eventName) => maps.Event?.addListener(map, eventName, emitViewport))
      .filter((listener): listener is NaverMapListener => Boolean(listener));
    viewportListenersRef.current = viewportListeners;
    viewportPollTimerRef.current = window.setInterval(emitViewport, 500);

    const shouldShowCenterMarker = hasCenter ? showCenterMarker : false;
    if (shouldShowCenterMarker) {
      const marker = new maps.Marker({
        map,
        position: centerLatLng
      });
      centerMarkerRef.current = marker;
      const infoWindowHandle = createDismissibleInfoWindow(
        maps,
        map,
        marker,
        hasCenter ? title || "이 매물" : "선택 매물",
        hasCenter ? addressKey || "현재 위치" : "매1.4억"
      );
      centerInfoWindowRef.current = infoWindowHandle.infoWindow;
      centerInfoWindowListenerRef.current = infoWindowHandle.markerListener ?? null;
    }
    setLoadState("ready");

    window.setTimeout(() => {
      const mapBackground = [
        mapRef.current?.style.background,
        mapRef.current ? window.getComputedStyle(mapRef.current).backgroundImage : ""
      ].join(" ");

      if (mapBackground.includes("auth_fail")) {
        setLoadState("error");
      }
    }, 600);
  }, [addressKey, center, isScriptReady, loadState, markers, showCenterMarker, title]);

  // 동적 마커 동기화 — 매물 목록(직접등록 포함)이 바뀌면 기존 마커를 지우고 다시 그린다.
  useEffect(() => {
    if (!markersKey || loadState !== "ready") return;
    const maps = window.naver?.maps;
    const map = mapInstanceRef.current;
    if (!maps || !map) return;

    dynamicMarkersRef.current.forEach((marker) => marker.setMap(null));
    const parsed = JSON.parse(markersKey) as Array<[number, number, string, string]>;
    dynamicMarkersRef.current = parsed.map(([lat, lng, mapLabel, dealTone], index) => {
      const clusterLabel = escapeHtml(String((markers ?? [])[index]?.clusterLabel ?? ""));
      const markerTitle = escapeHtml(String((markers ?? [])[index]?.title ?? ""));
      const price = escapeHtml(String((markers ?? [])[index]?.price ?? ""));
      const markerClassName = `naver-price-marker${dealTone === "jeonse" ? " is-jeonse" : ""}${index === 0 ? " active" : ""}`;
      return new maps.Marker({
        map,
        position: new maps.LatLng(lat, lng),
        icon: {
          content: `<button class="${markerClassName}" type="button" aria-label="${markerTitle} ${price}"><b>${clusterLabel}</b><strong>${escapeHtml(String(mapLabel))}</strong></button>`,
          anchor: new maps.Point(42, 56)
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- markersKey가 markers의 좌표·라벨을 대변한다
  }, [markersKey, loadState]);

  // 지도 탭에서 사용자 위치가 뒤늦게 들어오면 이미 생성된 네이버 지도 중심을 이동한다.
  useEffect(() => {
    if (!centerKey || loadState !== "ready") return;
    const maps = window.naver?.maps;
    const map = mapInstanceRef.current;
    if (!maps || !map?.setCenter) return;

    const [lat, lng] = centerKey.split(":").map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const nextCenter = new maps.LatLng(lat, lng);
    map.setCenter(nextCenter);
    onViewportChangeRef.current?.(readMapViewport(map));

    if (!showCenterMarker) {
      centerInfoWindowRef.current?.close();
      centerInfoWindowRef.current = null;
      removeMapListener(maps, centerInfoWindowListenerRef.current);
      centerInfoWindowListenerRef.current = null;
      centerMarkerRef.current?.setMap(null);
      centerMarkerRef.current = null;
      return;
    }

    if (centerMarkerRef.current?.setPosition) {
      centerMarkerRef.current.setPosition(nextCenter);
      return;
    }

    centerMarkerRef.current?.setMap(null);
    const marker = new maps.Marker({
      map,
      position: nextCenter
    });
    centerMarkerRef.current = marker;
    const infoWindowHandle = createDismissibleInfoWindow(
      maps,
      map,
      marker,
      title || "이 매물",
      addressKey || "현재 위치"
    );
    centerInfoWindowRef.current = infoWindowHandle.infoWindow;
    centerInfoWindowListenerRef.current = infoWindowHandle.markerListener ?? null;
  }, [addressKey, centerKey, loadState, showCenterMarker, title]);

  useEffect(() => {
    if (centerKey || !addressKey || loadState !== "ready") return;
    const maps = window.naver?.maps;
    const map = mapInstanceRef.current;
    if (!maps || !map?.setCenter || !maps.Service?.geocode) return;
    const setMapCenter = map.setCenter.bind(map);

    maps.Service.geocode({ query: addressKey }, (status, response) => {
      if (status !== maps.Service?.Status.OK) return;
      const firstAddress = response.v2?.addresses?.[0];
      const lat = Number(firstAddress?.y);
      const lng = Number(firstAddress?.x);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const nextCenter = new maps.LatLng(lat, lng);
      setMapCenter(nextCenter);
      onViewportChangeRef.current?.(readMapViewport(map));

      if (!showCenterMarker) {
        centerInfoWindowRef.current?.close();
        centerInfoWindowRef.current = null;
        removeMapListener(maps, centerInfoWindowListenerRef.current);
        centerInfoWindowListenerRef.current = null;
        centerMarkerRef.current?.setMap(null);
        centerMarkerRef.current = null;
        return;
      }

      if (centerMarkerRef.current?.setPosition) {
        centerMarkerRef.current.setPosition(nextCenter);
        return;
      }

      centerMarkerRef.current?.setMap(null);
      const marker = new maps.Marker({
        map,
        position: nextCenter
      });
      centerMarkerRef.current = marker;
      const infoWindowHandle = createDismissibleInfoWindow(maps, map, marker, "매물 위치", addressKey);
      centerInfoWindowRef.current = infoWindowHandle.infoWindow;
      centerInfoWindowListenerRef.current = infoWindowHandle.markerListener ?? null;
    });
  }, [addressKey, centerKey, loadState, showCenterMarker]);

  const handleScriptReady = () => {
    requestAnimationFrame(() => {
      if (window.naver?.maps) {
        setIsScriptReady(true);
        return;
      }

      setLoadState("error");
    });
  };

  return (
    <div className={`naver-map-shell ${className}`} aria-label="네이버 지도 서비스로 보기" data-state={loadState}>
      {scriptUrl ? (
        <Script
          id="naver-map-script"
          src={scriptUrl}
          strategy="afterInteractive"
          onError={() => setLoadState("error")}
          onLoad={handleScriptReady}
          onReady={handleScriptReady}
        />
      ) : null}
      <div ref={mapRef} className="naver-real-map" aria-label="네이버 지도 영역" data-state={loadState} />

      {loadState === "missing-key" ? (
        <div className="map-api-state" role="status">
          <span>지도 서비스</span>
          <strong>지도 설정 확인 중</strong>
          <p>
            지도 연동 정보가 확인되면 주변 매물과 시세 마커가 표시됩니다.
          </p>
        </div>
      ) : null}

      {loadState === "loading" ? (
        <div className="map-api-state loading" role="status">
          <span>지도 서비스</span>
          <strong>네이버 지도 불러오는 중</strong>
        </div>
      ) : null}

      {loadState === "error" ? (
        <div className="map-api-state error" role="alert">
          <span>네이버 지도</span>
          <strong>지도 인증 확인 필요</strong>
          <p>서비스 도메인 허용이 완료되면 실제 지도 타일과 매물 마커가 바로 표시됩니다.</p>
          <div className="map-api-checklist" aria-label="네이버 지도 인증 점검 항목">
            <small>Dynamic Map</small>
            <small>Web URL 승인</small>
            <small>실시간 마커 대기</small>
          </div>
        </div>
      ) : null}

    </div>
  );
}
