"use client";

// 매물 상세 뷰 — /listing/[id] 라우트가 쓴다.
// "문자로 문의하기"는 폼(간편문의 시트) 대신 채팅 탭의 빈 대화로 바로 보낸다(onStartChat, 당근식).
import Image from "next/image";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import {
  Armchair,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  Maximize2,
  Minimize2,
  Play,
  Star,
  MapPinned,
  Phone,
  Share2,
  X
} from "lucide-react";
import {
  getListingBuildingRows,
  isRemotePhoto,
  listingMapAddress,
  optionItems,
  shouldShow3DTourControls,
  TRADE_LISTING_NO_PREFIX,
  type Listing
} from "@/lib/listing-catalog";
import { listSplatAssetsByListing } from "@/lib/splat-asset-api";
import { NaverMapPreview } from "./NaverMapPreview";

// 상세 "3D 보기" 전용 — three.js 번들이 무거우므로 시트를 열 때만 지연 로드한다.
const ListingTourRoom3D = dynamic(() => import("./ListingTourRoom3D"), {
  ssr: false,
  loading: () => <div className="tour-room-loading">3D 도면을 불러오는 중…</div>
});

export function ListingDetailView({
  listing,
  isSaved,
  isOwner = false,
  onBack,
  onToggleSaved,
  onStartChat
}: {
  listing: Listing;
  isSaved: boolean;
  /** 현재 로그인 사용자가 이 매물(직접등록)의 집주인인지 — 서버 페이지가 판정해 내려준다. */
  isOwner?: boolean;
  onBack: () => void;
  onToggleSaved: (listingNo: string) => void;
  /** "문자로 문의하기" 등 문의 진입점 — 채팅 탭의 이 매물 대화로 바로 보낸다. */
  onStartChat: () => void;
}) {
  const [isTourSheetOpen, setIsTourSheetOpen] = useState(false);
  const [is3DSimulationOpen, setIs3DSimulationOpen] = useState(false);
  const [isShareSheetOpen, setIsShareSheetOpen] = useState(false);
  const [detailToast, setDetailToast] = useState("");
  // 무대 레이아웃 통합으로 갤러리 탭 상태는 사라짐 — 대표 사진은 첫 장, 나머지는 라이트박스가 담당.
  // 사진 라이트박스 — 3D 히어로에선 필름스트립 클릭, 사진 히어로에선 대표 사진 클릭으로 연다.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // 라이트박스 확대 단계 — 3D 히어로에선 먼저 무대(스테이지) 크기로 열리고, 헤더의 확대를 누르면 풀스크린으로 승격.
  // 사진 히어로(도면 없음)는 무대가 곧 큰 사진이라 처음부터 풀스크린으로 열고 이 토글을 노출하지 않는다.
  const [lightboxFullscreen, setLightboxFullscreen] = useState(false);
  // 사진 히어로(도면 없음)의 큰 사진 인덱스 — 필름스트립·양옆 화살표가 이 자리에서 사진을 넘긴다(라이트박스 아님).
  const [heroPhotoIndex, setHeroPhotoIndex] = useState(0);
  // 3D 도면이 있으면 3D가 히어로(사진은 필름스트립), 없으면 기존 사진 갤러리가 히어로.
  const has3DHero = Boolean(listing.floorPlan3D);
  const activePhoto = listing.gallery[heroPhotoIndex] ?? listing.gallery[0];
  const listingBuildingRows = getListingBuildingRows(listing);
  const mapAddress = listingMapAddress(listing);
  // 3D 도면이 실제로 연결된 매물에만 3D 진입점을 노출한다(없는 매물에 빈 시트를 띄우지 않음).
  const has3DTour = shouldShow3DTourControls(listing);
  const isDirectListing = listing.listingLabel === "집주인 직접등록";
  // 매물별 3D 게이트 대상은 직접등록(TRADE-) 매물뿐 — 정적(하드코딩) 매물은 기존 데모 링크를 그대로 둔다(곧 삭제 예정).
  const isTradeDirectListing = isDirectListing && listing.listingNo.startsWith(TRADE_LISTING_NO_PREFIX);
  // 직접등록 매물의 대표 3D 자산 id — 있으면 "1인칭 체험"이 이 매물 전용 투어로 연결된다.
  const [splatAssetId, setSplatAssetId] = useState<string | null>(null);
  // 자산 조회 완료 여부 — 조회 중엔 "준비 안 됨"을 성급히 띄우지 않는다(로딩과 없음을 구분).
  const [splatChecked, setSplatChecked] = useState(false);

  // 직접등록 매물이면 연결된 splat 자산을 조회해 대표 하나를 고른다(REGISTERED > UPLOADED > PROCESSING).
  // 자산이 없거나(또는 FAILED뿐) 조회가 실패하면 splatAssetId는 null로 남고, 아래에서 매물별 게이트("준비 안 됨")를 노출한다.
  useEffect(() => {
    if (!isTradeDirectListing) {
      setSplatAssetId(null);
      setSplatChecked(false);
      return;
    }
    const listingId = listing.listingNo.slice(TRADE_LISTING_NO_PREFIX.length);
    let cancelled = false;
    setSplatChecked(false);
    listSplatAssetsByListing(listingId)
      .then((assets) => {
        if (cancelled) return;
        const priority: Record<string, number> = { REGISTERED: 3, UPLOADED: 2, PROCESSING: 1 };
        const pick = assets
          .filter((asset) => asset.status in priority)
          .sort((a, b) => priority[b.status] - priority[a.status])[0];
        setSplatAssetId(pick?.id ?? null);
        setSplatChecked(true);
      })
      .catch(() => {
        // 조회 실패 — 자산 없음으로 간주하고 게이트를 정직하게 노출한다(데모로 은폐하지 않음).
        if (cancelled) return;
        setSplatChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isTradeDirectListing, listing.listingNo]);

  // 직접등록 매물은 집주인이 등록 시 고른 옵션만, 데모 매물(options 없음)은 기존 고정 목록을 보여준다.
  const listingOptions = listing.options ?? optionItems;

  // 가격 헤더용 파생값 — 보증금/월세형(월세·반전세)만 숫자 조합, 전세·매매는 카드 문자열에서 유형만 뗀다.
  const priceTypeLabel = listing.price.match(/^(반전세|월세|전세|매매)/)?.[1] ?? "월세";
  const isMonthlyPrice = priceTypeLabel === "월세" || priceTypeLabel === "반전세";
  // 입주 가능일 — 가격 정보 테이블(getListingPriceRows)과 같은 규칙을 쓴다.
  const moveInLabel = listing.floorLabel.includes("고층") ? "즉시입주" : "협의 가능";

  return (
    /* has-3d 클래스는 이제 "무대 레이아웃" 스위치 — 도면 유무와 무관하게 항상 적용(레이아웃 통합).
       도면이 없으면 스테이지에 3D 대신 대표 사진이 뜬다. photo-hero는 라이트 무대(밤하늘 배경 제거 + 다크 헤더) 변형. */
    <section className={`listing-detail-screen has-3d${has3DHero ? "" : " photo-hero"}`} aria-labelledby="clicked-detail-title">
      <header className="detail-top-title">
        <button className="detail-back-button" type="button" onClick={onBack} aria-label="목록으로 돌아가기">
          <ArrowLeft size={24} strokeWidth={2.5} />
        </button>
        <div className="detail-title-stack">
          {/* 무대 레이아웃 공통 — 라벨(매물번호/직접등록) + 매물 이름 */}
          <span className="detail-title-caption">{listing.listingLabel}</span>
          <h1 id="clicked-detail-title">{listing.title}</h1>
        </div>
        <div className="detail-header-actions">
          <button type="button" aria-label="공유하기" onClick={() => setIsShareSheetOpen(true)}>
            <Share2 size={22} strokeWidth={2.5} />
          </button>
          <button className={isSaved ? "active" : ""} type="button" aria-label="찜하기" onClick={() => onToggleSaved(listing.listingNo)}>
            <Star size={24} fill={isSaved ? "currentColor" : "none"} strokeWidth={2.5} />
          </button>
        </div>
      </header>

      {isOwner ? (
        <div
          className="detail-owner-bar"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "10px 18px",
            background: "var(--surface-container)",
            borderBottom: "1px solid var(--border)"
          }}
        >
          <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--on-surface-variant)" }}>
            내가 등록한 매물이에요
          </span>
          <a
            href={`/sell?listingId=${encodeURIComponent(listing.listingNo.slice(TRADE_LISTING_NO_PREFIX.length))}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 32,
              padding: "0 14px",
              borderRadius: 999,
              background: "var(--primary)",
              color: "var(--on-primary)",
              fontSize: "0.82rem",
              fontWeight: 800
            }}
          >
            관리/수정
          </a>
        </div>
      ) : null}

      {/* 시안 구조 — 좌 스테이지 + 우 고정폭 패널이 한 행(데스크톱), 모바일은 자연 스택. */}
      <div className="detail-hero-row">
      <div className="detail-hero-stage">
      {has3DHero && listing.floorPlan3D ? (
        /* 3D 히어로 스테이지 — 도면이 주인공, 사진은 하단 필름스트립(클릭 → 라이트박스). */
        <div
          aria-label={is3DSimulationOpen ? `${listing.title} 3D 시뮬레이션` : `${listing.title} 3D 도면 미리보기`}
          aria-modal={is3DSimulationOpen ? "true" : undefined}
          className={`detail-3d-hero${is3DSimulationOpen ? " is-3d-simulation-open" : ""}`}
          id="detail-3d-hero"
          role={is3DSimulationOpen ? "dialog" : undefined}
        >
          <ListingTourRoom3D
            floorPlan={listing.floorPlan3D}
            simulationOpen={is3DSimulationOpen}
            listingId={listing.listingNo}
            variant="hero"
          />
          {is3DSimulationOpen ? (
            <button
              aria-label="3D 시뮬레이션 닫기"
              className="simulation-close"
              type="button"
              onClick={() => setIs3DSimulationOpen(false)}
            >
              <X aria-hidden size={18} strokeWidth={2.5} />
              닫기
            </button>
          ) : null}
          <div className="hero-filmstrip" aria-label={`${listing.title} 사진 모음`}>
            {listing.gallery.slice(0, 4).map((image, index) => (
              <button
                type="button"
                key={image}
                aria-label={`${listing.title} 사진 ${index + 1} 크게 보기`}
                onClick={() => setLightboxIndex(index)}
              >
                <span className="gallery-image" style={{ backgroundImage: `url(${image})` }} />
              </button>
            ))}
            {listing.gallery.length > 4 ? (
              <button className="hero-filmstrip-more" type="button" aria-label="사진 전체 보기" onClick={() => setLightboxIndex(4)}>
                +{listing.gallery.length - 4}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        /* 도면 없는 매물 — 라이트 무대에 라운드 프레임 사진. 필름스트립·양옆 화살표는 큰 사진을 그 자리에서
           넘기고(슬라이드), 라이트박스는 큰 사진 클릭으로만 연다. */
        <div className="detail-3d-hero photo-stage" id="detail-3d-hero" aria-label={`${listing.title} 사진 모음`}>
          <div className="photo-stage-frame">
            <button
              className="photo-stage-main"
              type="button"
              aria-label={`${listing.title} 사진 크게 보기`}
              onClick={() => setLightboxIndex(heroPhotoIndex)}
            >
              <Image src={activePhoto} alt={`${listing.title} 대표 사진`} width={1200} height={800} priority unoptimized={isRemotePhoto(activePhoto)} />
            </button>
            {listing.gallery.length > 1 ? (
              <>
                <button
                  className="photo-stage-nav prev"
                  type="button"
                  aria-label="이전 사진"
                  onClick={() =>
                    setHeroPhotoIndex((index) => (index - 1 + listing.gallery.length) % listing.gallery.length)
                  }
                >
                  <ChevronLeft size={24} strokeWidth={2.6} />
                </button>
                <button
                  className="photo-stage-nav next"
                  type="button"
                  aria-label="다음 사진"
                  onClick={() => setHeroPhotoIndex((index) => (index + 1) % listing.gallery.length)}
                >
                  <ChevronRight size={24} strokeWidth={2.6} />
                </button>
              </>
            ) : null}
          </div>
          <div className="hero-filmstrip" aria-label={`${listing.title} 사진 모음`}>
            {listing.gallery.slice(0, 4).map((image, index) => (
              <button
                type="button"
                key={image}
                className={index === heroPhotoIndex ? "is-active" : undefined}
                aria-label={`${listing.title} 사진 ${index + 1} 보기`}
                aria-current={index === heroPhotoIndex}
                onClick={() => setHeroPhotoIndex(index)}
              >
                <span className="gallery-image" style={{ backgroundImage: `url(${image})` }} />
              </button>
            ))}
            {listing.gallery.length > 4 ? (
              <button className="hero-filmstrip-more" type="button" aria-label="사진 전체 보기" onClick={() => setLightboxIndex(4)}>
                +{listing.gallery.length - 4}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* 사진 라이트박스 — 3D 히어로에선 먼저 무대(스테이지) 크기로 열리고(부모 .detail-hero-stage 기준),
          헤더 확대 버튼으로 풀스크린 승격. 사진 히어로(도면 없음)는 무대가 곧 큰 사진이라 처음부터 풀스크린. */}
      {lightboxIndex !== null ? (
        <div
          className={`photo-lightbox-backdrop${!has3DHero || lightboxFullscreen ? " is-fullscreen" : ""}`}
          role="presentation"
          onClick={() => {
            setLightboxIndex(null);
            setLightboxFullscreen(false);
          }}
        >
          <div
            className="photo-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={`${listing.title} 사진 크게 보기`}
            onClick={(event) => event.stopPropagation()}
          >
            {/* 매물 이름은 헤더 오버레이에 이미 있다 — 카운터 + (3D 히어로 한정) 무대↔풀스크린 확대 토글 */}
            <header>
              <strong>{lightboxIndex + 1} / {listing.gallery.length}</strong>
              <div className="photo-lightbox-actions">
                {has3DHero ? (
                  <button
                    type="button"
                    aria-label={lightboxFullscreen ? "무대 크기로 줄이기" : "전체화면으로 크게 보기"}
                    onClick={() => setLightboxFullscreen((value) => !value)}
                  >
                    {lightboxFullscreen ? (
                      <Minimize2 size={18} strokeWidth={2.6} />
                    ) : (
                      <Maximize2 size={18} strokeWidth={2.6} />
                    )}
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label="사진 닫기"
                  onClick={() => {
                    setLightboxIndex(null);
                    setLightboxFullscreen(false);
                  }}
                >
                  <X size={20} strokeWidth={2.6} />
                </button>
              </div>
            </header>
            <div className="photo-lightbox-stage">
              <Image
                src={listing.gallery[lightboxIndex]}
                alt={`${listing.title} 사진 ${lightboxIndex + 1}`}
                width={1200}
                height={800}
                unoptimized={isRemotePhoto(listing.gallery[lightboxIndex])}
              />
              {listing.gallery.length > 1 ? (
                <>
                  <button
                    className="photo-lightbox-nav prev"
                    type="button"
                    aria-label="이전 사진"
                    onClick={() =>
                      setLightboxIndex((index) =>
                        index === null ? null : (index - 1 + listing.gallery.length) % listing.gallery.length
                      )
                    }
                  >
                    <ChevronLeft size={26} strokeWidth={2.6} />
                  </button>
                  <button
                    className="photo-lightbox-nav next"
                    type="button"
                    aria-label="다음 사진"
                    onClick={() =>
                      setLightboxIndex((index) => (index === null ? null : (index + 1) % listing.gallery.length))
                    }
                  >
                    <ChevronRight size={26} strokeWidth={2.6} />
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      </div>

      <aside className="detail-side-panel" aria-label="가격·문의 정보">

      {/* 매물번호 줄 제거 — 헤더 캡션이 이미 번호를 보여준다. 공유·찜은 헤더 오버레이 우상단 고정. */}
      {detailToast ? <div className="detail-toast" role="status">{detailToast}</div> : null}

      <div className="detail-price-block">
        {/* 시안 문법 — 작은 캡션(유형·갱신) 위, 세리프 큰 가격 아래. 숫자는 카드 문자열이 아닌 원본 수치. */}
        <span className="detail-price-caption">
          {priceTypeLabel} · {listing.updated} 갱신 · {listing.viewCount}
        </span>
        <h2 className="detail-price-main">
          {isMonthlyPrice ? (
            <>
              {listing.depositManwon.toLocaleString("ko-KR")}
              <span className="detail-price-sep"> / </span>
              {listing.monthlyRentManwon.toLocaleString("ko-KR")}
            </>
          ) : (
            listing.price.replace(/^(전세|매매)\s*/, "")
          )}
        </h2>
        <div className="detail-address-line">
          <MapPinned size={18} strokeWidth={2.4} aria-hidden="true" />
          <span>{listing.location}</span>
        </div>
        {listing.detailAddress?.trim() ? (
          <div className="detail-address-detail">세부주소: {listing.detailAddress.trim()}</div>
        ) : null}
      </div>

      {/* 시안의 구분선 테이블 — 아이콘 그리드 대신 라벨/값 행. */}
      <dl className="detail-spec-table" aria-label="매물 기본 정보">
        <div><dt>매물 유형</dt><dd>{listing.roomType}</dd></div>
        <div><dt>전용면적</dt><dd>{listing.sizeLabel}</dd></div>
        <div><dt>해당층</dt><dd>{listing.floorLabel}</dd></div>
        <div><dt>관리비</dt><dd>{listing.maintenanceFee}</dd></div>
        <div><dt>입주 가능일</dt><dd>{moveInLabel}</dd></div>
      </dl>

      {/* 옵션 — 시안처럼 우측 패널(모바일은 본문 흐름) 소프트 칩. */}
      <div className="detail-panel-options" aria-label="옵션">
        <strong>옵션</strong>
        {listingOptions.length > 0 ? (
          <div className="detail-panel-option-chips">
            {listingOptions.map((option) => (
              <span key={option}>{option}</span>
            ))}
          </div>
        ) : (
          <p>집주인이 등록한 옵션이 없습니다.</p>
        )}
      </div>

      {has3DHero ? (
        <div className="detail-panel-tour-actions" aria-label="3D 둘러보기">
          {splatAssetId ? (
            <a href={`/splat-tour?asset=${splatAssetId}`}>
              <Play aria-hidden size={18} strokeWidth={2.4} />
              1인칭 투어
            </a>
          ) : isTradeDirectListing ? (
            <span className="disabled" role="note" title="이 매물은 1인칭 투어가 준비되어 있지 않습니다">
              <Play aria-hidden size={18} strokeWidth={2.4} />
              1인칭 투어 {splatChecked ? "준비 안 됨" : "확인 중"}
            </span>
          ) : (
            <a href="/splat-tour">
              <Play aria-hidden size={18} strokeWidth={2.4} />
              1인칭 투어
            </a>
          )}
          <button
            type="button"
            onClick={() => setIs3DSimulationOpen(true)}
          >
            <Armchair aria-hidden size={18} strokeWidth={2.4} />
            3D 시뮬레이션
          </button>
        </div>
      ) : null}

      {/* 태그 줄 제거 — 등록 폼에 특징 태그 입력이 없다. 데모는 하드코딩 더미였고,
          직접등록은 거래유형·방종류·옵션의 재조합이라 캡션·스펙표·옵션 칩과 전부 중복. */}

      {/* 패널 하단 묶음 — 데스크톱에서 margin-top:auto로 바닥 정렬(시안).
          집주인 카드는 하단 건물 정보 위로 이동(패널 내부 스크롤 제거). */}
      <div className="detail-panel-bottom">
      {/* 데스크톱 우측 패널 하단 CTA — 시안 배치. 모바일은 기존 하단 고정 바가 담당(CSS로 숨김). */}
      <div className="detail-panel-cta">
        <span className="detail-panel-cta-note">로그인 없이 문의 가능 · 채팅으로 바로 연결</span>
        <div className="detail-panel-cta-buttons">
          <button className="detail-panel-primary" type="button" onClick={onStartChat}>문자로 문의하기</button>
          <button className="detail-panel-ghost" type="button" onClick={onStartChat}>전화</button>
        </div>
      </div>
      </div>

      </aside>
      </div>

      {/* 하단 2단(시안) — 좌: 상세 설명+위치, 우: 건물 정보. 모바일은 자연 스택.
          가격 정보 카드는 패널 중복/더미라 제거, 비슷한 매물은 팀 결정으로 제거. */}
      <div className="detail-lower-duo">
      <div className="detail-lower-main">
      <section className="detail-info-section detail-description-section" aria-label="상세 설명">
        <div className="detail-section-heading">
          <h2>상세 설명</h2>
          <span>{isDirectListing ? "집주인 등록 문구" : "게시 문구"}</span>
        </div>
        <p className="detail-description-text">{listing.headline}</p>
      </section>

      <section className="detail-map-section" aria-label="상세 위치">
        <div>
          <h2>위치</h2>
        </div>
        <NaverMapPreview
          className="detail-naver-map"
          center={
            typeof listing.lat === "number" && typeof listing.lng === "number"
              ? { lat: listing.lat, lng: listing.lng }
              : null
          }
          address={mapAddress}
          title={listing.title}
        />
      </section>
      </div>

      <div className="detail-lower-side">
      {/* 등록 주체 카드 — 시안의 중개사 카드. 우리 스코프는 개인 임대인이라
          직접등록은 "OO (집주인)", 데모 매물은 기존 broker 문자열을 그대로 쓴다. */}
      <div className="detail-owner-card" aria-label="등록 주체 정보">
        <span className="detail-owner-avatar" aria-hidden="true">{listing.broker.slice(0, 1)}</span>
        <div>
          <strong>{listing.broker}</strong>
          <span>{listing.verification} · {listing.response}</span>
        </div>
      </div>

      <section className="detail-info-section detail-building-section" aria-label="건물 정보">
        <div className="detail-section-heading">
          <h2>건물 정보</h2>
          <span>등기·현장 기준</span>
        </div>
        <dl className="detail-info-table">
          {listingBuildingRows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      </div>
      </div>

      <div className={has3DHero ? "detail-contact-bar has-3d" : "detail-contact-bar"} id="detail-contact">
        <span className="contact-tooltip">로그인 없이 문의 가능 · 채팅으로 바로 연결</span>
        <button className="detail-contact-small" type="button" aria-label="전화문의" onClick={onStartChat}>
          <span aria-hidden="true"><Phone size={20} strokeWidth={2.5} /></span>
          <strong>전화</strong>
        </button>
        {/* 3D가 히어로인 매물은 시트 버튼이 중복 — 히어로로 스크롤하는 앵커로 바꾼다.
            히어로가 아니면 dev의 게이트를 따라 3D 투어가 있을 때만 시트 버튼을 노출한다. */}
        {has3DHero ? (
          <a className="detail-contact-tour" href="#detail-3d-hero">
            <span>3D</span>
            <strong>도면 보기</strong>
          </a>
        ) : has3DTour ? (
          <button className="detail-contact-tour" type="button" onClick={() => setIsTourSheetOpen(true)}>
            <span>3D</span>
            <strong>둘러보기</strong>
          </button>
        ) : null}
        {/* 1인칭 체험 — 매물별 정직 게이트.
            · 직접등록(TRADE-) + 대표 자산 있음 → 이 매물 전용 splat 투어(?asset=)
            · 직접등록 + 자산 없음/FAILED뿐 → 비활성 "준비 안 됨"(링크 아님, 없는 상태를 그대로 노출)
            · 정적(하드코딩) 매물 → 기존 공통 데모 투어(/splat-tour) 유지(곧 삭제 예정) */}
        {splatAssetId ? (
          <a className="detail-contact-tour detail-contact-splat" href={`/splat-tour?asset=${splatAssetId}`}>
            <span>1인칭</span>
            <strong>체험</strong>
          </a>
        ) : isTradeDirectListing ? (
          <span
            className="detail-contact-tour detail-contact-splat detail-contact-splat-empty"
            role="note"
            aria-label="이 매물은 3D 투어가 준비되어 있지 않습니다"
            title="이 매물은 3D 투어가 준비되어 있지 않습니다"
            style={{
              background: "var(--surface-container)",
              borderColor: "var(--border)",
              color: "var(--on-surface-variant)",
              cursor: "default"
            }}
          >
            <span style={{ color: "var(--on-surface-variant)" }}>1인칭</span>
            <strong>{splatChecked ? "준비 안 됨" : "확인 중"}</strong>
          </span>
        ) : (
          <a className="detail-contact-tour detail-contact-splat" href="/splat-tour">
            <span>1인칭</span>
            <strong>체험 (데모)</strong>
          </a>
        )}
        <button className="detail-contact-primary" type="button" onClick={onStartChat}>
          <strong>문자로 문의하기</strong>
          <span>방문 가능 여부 바로 확인</span>
        </button>
      </div>

      {has3DTour && isTourSheetOpen ? (
        <div className="tour-sheet-backdrop" role="presentation" onClick={() => setIsTourSheetOpen(false)}>
          <section className="tour-sheet" role="dialog" aria-modal="true" aria-labelledby="tour-sheet-title" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" aria-hidden="true" />
            <header>
              <div>
                <span>3D 공간 미리보기</span>
                <h2 id="tour-sheet-title">방문 전 3D로 먼저 보기</h2>
                <p>방문 전에 구조와 옵션 위치를 3D로 미리 확인할 수 있습니다.</p>
              </div>
              <button type="button" onClick={() => setIsTourSheetOpen(false)} aria-label="3D 투어 닫기">×</button>
            </header>

            <div className="tour-preview-stage" aria-label="3D 투어 미리보기">
              {listing.floorPlan3D ? (
                <div className="tour-room-3d">
                  <ListingTourRoom3D floorPlan={listing.floorPlan3D} listingId={listing.listingNo} />
                </div>
              ) : (
                <div className="tour-room-empty-wrap">
                  {/* 안내 텍스트는 3D 변형 밖에 둔다 — 박스 안에 두면 회전된 채 서로 겹쳐 읽기 어렵다 */}
                  <div className="tour-room-box tour-room-box-empty">
                    <span className="tour-wall wall-left" />
                    <span className="tour-wall wall-right" />
                    <span className="tour-bed" />
                    <span className="tour-desk" />
                    <span className="tour-window" />
                  </div>
                  <div className="tour-room-empty-copy">
                    <strong>3D 도면 미연결 매물</strong>
                    <em>집주인이 아직 3D 도면을 등록하지 않았어요</em>
                  </div>
                </div>
              )}
            </div>

            <div className="tour-sheet-actions">
              <button type="button" onClick={() => setIsTourSheetOpen(false)}>닫기</button>
              <a href="#detail-contact" onClick={() => setIsTourSheetOpen(false)}>문의하기</a>
            </div>
          </section>
        </div>
      ) : null}

      {isShareSheetOpen ? (
        <div className="share-sheet-backdrop" role="presentation" onClick={() => setIsShareSheetOpen(false)}>
          <section className="share-sheet" role="dialog" aria-modal="true" aria-labelledby="share-sheet-title" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" aria-hidden="true" />
            <header>
              <h2 id="share-sheet-title">매물 공유하기</h2>
              <button type="button" onClick={() => setIsShareSheetOpen(false)} aria-label="공유 닫기">×</button>
            </header>

            <p className="share-listing-line">{listing.title} · {listing.price}</p>

            <button
              className="share-copy-button"
              type="button"
              onClick={async () => {
                // 상세가 라우트가 된 덕에 링크 복사가 실제 공유 가능한 URL을 준다.
                if (navigator.clipboard) {
                  await navigator.clipboard
                    .writeText(`${window.location.origin}/listing/${encodeURIComponent(listing.listingNo)}`)
                    .catch(() => undefined);
                }
                setDetailToast("매물 링크를 복사했어요");
                setIsShareSheetOpen(false);
                window.setTimeout(() => setDetailToast(""), 1600);
              }}
            >
              <Copy size={17} strokeWidth={2.4} aria-hidden="true" />
              링크 복사
            </button>
          </section>
        </div>
      ) : null}

    </section>
  );
}
