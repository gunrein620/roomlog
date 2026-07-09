"use client";

// 네이버 지도 프리뷰 — 상세 라우트(/listing/[id])의 위치 지도와 SPA 지도 탭이 공유한다.
// 상세 라우트 분리(1단계)로 page.tsx에서 추출했다. 전역 window.naver 타입 선언도 이 모듈이 단일 소유.
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { mapListings } from "@/lib/listing-catalog";

type NaverLatLng = unknown;
type NaverMap = unknown;
// setMap(null) = 마커 제거 — 지도 탭에서 매물 목록이 바뀔 때 마커를 다시 그리는 데 쓴다.
type NaverMarker = { setMap: (map: NaverMap | null) => void };
type NaverPoint = unknown;
type NaverInfoWindow = {
  open: (map: NaverMap, marker: NaverMarker) => void;
};
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
  InfoWindow: new (options: { content: string }) => NaverInfoWindow;
  Point: new (x: number, y: number) => NaverPoint;
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

// geocoder 서브모듈 포함 — 주소→좌표 변환(naver.maps.Service.geocode)을 쓰기 위함.
export const naverMapScriptUrl = naverMapClientId
  ? `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${naverMapClientId}&submodules=geocoder`
  : "";

export type MapMarkerInput = {
  lat: number;
  lng: number;
  mapLabel: string;
  clusterLabel: string;
  title: string;
  price: string;
};

const mapDealMarkers = mapListings;

export function NaverMapPreview({
  className = "",
  center,
  title,
  markers
}: {
  className?: string;
  /** 특정 매물 좌표 — 있으면 그 위치를 중심으로 단일 마커를 찍는다(없으면 데모 마커). */
  center?: { lat: number; lng: number } | null;
  title?: string;
  /** 지도 탭용 동적 마커 목록 — 값이 바뀌면 마커를 다시 그린다(직접등록 매물 포함). */
  markers?: MapMarkerInput[];
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const isMapInitializedRef = useRef(false);
  const mapInstanceRef = useRef<NaverMap | null>(null);
  const dynamicMarkersRef = useRef<NaverMarker[]>([]);
  const [isScriptReady, setIsScriptReady] = useState(false);
  const [loadState, setLoadState] = useState<MapLoadState>(naverMapClientId ? "loading" : "missing-key");
  const scriptUrl = naverMapScriptUrl;
  // 좌표 배열이 실제로 달라졌을 때만 마커를 다시 그린다 (렌더마다 새 배열이 와도 무시).
  const markersKey = markers
    ? JSON.stringify(markers.map((deal) => [deal.lat, deal.lng, deal.mapLabel]))
    : "";

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
    // 매물 좌표가 주어지면 그 위치를, 아니면 기존 데모 중심(방배)을 쓴다.
    const hasCenter = center && Number.isFinite(center.lat) && Number.isFinite(center.lng);
    const centerLatLng = hasCenter
      ? new maps.LatLng(center.lat, center.lng)
      : new maps.LatLng(37.4875, 126.9931);
    const map = new maps.Map(mapRef.current, {
      center: centerLatLng,
      zoom: 16,
      zoomControl: true
    });
    mapInstanceRef.current = map;

    // markers 프롭이 있으면(지도 탭) 마커는 아래 동기화 이펙트가 그린다 — 여기서는 지도만 만든다.
    if (!hasCenter && !markers) {
      mapDealMarkers.forEach((deal, index) => {
        const position = new maps.LatLng(deal.lat, deal.lng);
        new maps.Marker({
          map,
          position,
          icon: {
            content: `<button class="naver-price-marker ${index === 0 ? "active" : ""}" type="button" aria-label="${deal.title} ${deal.price}"><b>${deal.clusterLabel}</b><strong>${deal.mapLabel}</strong></button>`,
            anchor: new maps.Point(42, 56)
          }
        });
      });
    }

    if (hasCenter || !markers) {
      const marker = new maps.Marker({
        map,
        position: centerLatLng
      });
      const infoWindow = new maps.InfoWindow({
        content: hasCenter
          ? `<div class="naver-info-window"><b>${title ? escapeHtml(title) : "이 매물"}</b><strong>현재 위치</strong></div>`
          : '<div class="naver-info-window"><b>선택 매물</b><strong>매1.4억</strong></div>'
      });
      infoWindow.open(map, marker);
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
  }, [isScriptReady, loadState]);

  // 동적 마커 동기화 — 매물 목록(직접등록 포함)이 바뀌면 기존 마커를 지우고 다시 그린다.
  useEffect(() => {
    if (!markersKey || loadState !== "ready") return;
    const maps = window.naver?.maps;
    const map = mapInstanceRef.current;
    if (!maps || !map) return;

    dynamicMarkersRef.current.forEach((marker) => marker.setMap(null));
    const parsed = JSON.parse(markersKey) as Array<[number, number, string]>;
    dynamicMarkersRef.current = parsed.map(([lat, lng, mapLabel], index) => {
      const clusterLabel = escapeHtml(String((markers ?? [])[index]?.clusterLabel ?? ""));
      const markerTitle = escapeHtml(String((markers ?? [])[index]?.title ?? ""));
      const price = escapeHtml(String((markers ?? [])[index]?.price ?? ""));
      return new maps.Marker({
        map,
        position: new maps.LatLng(lat, lng),
        icon: {
          content: `<button class="naver-price-marker ${index === 0 ? "active" : ""}" type="button" aria-label="${markerTitle} ${price}"><b>${clusterLabel}</b><strong>${escapeHtml(String(mapLabel))}</strong></button>`,
          anchor: new maps.Point(42, 56)
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- markersKey가 markers의 좌표·라벨을 대변한다
  }, [markersKey, loadState]);

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

      {loadState === "ready" ? (
        <div className="map-live-controls" aria-label="지도 도구">
          <button className="float-action shot" type="button">현장촬영</button>
          <button className="float-action draw" type="button">그리기</button>
        </div>
      ) : null}
    </div>
  );
}
