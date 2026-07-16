"use client";

// 매물 상세 뷰 — /listing/[id] 라우트가 쓴다.
// "문자로 문의하기"는 폼(간편문의 시트) 대신 채팅 탭의 빈 대화로 바로 보낸다(onStartChat, 당근식).
import Image from "next/image";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  Building2,
  Copy,
  Heart,
  Layers3,
  MapPinned,
  Phone,
  Ruler,
  Share2
} from "lucide-react";
import {
  getListingBuildingRows,
  getListingPriceRows,
  isRemotePhoto,
  listingMapAddress,
  optionItems,
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
  const [isShareSheetOpen, setIsShareSheetOpen] = useState(false);
  const [detailToast, setDetailToast] = useState("");
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const activePhoto = listing.gallery[activePhotoIndex] ?? listing.gallery[0];
  const listingPriceRows = getListingPriceRows(listing);
  const listingBuildingRows = getListingBuildingRows(listing);
  const mapAddress = listingMapAddress(listing);
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

  const copyListingNo = async () => {
    const text = listing.listingLabel;

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }

    setDetailToast("매물번호를 복사했어요");
    window.setTimeout(() => setDetailToast(""), 1600);
  };

  return (
    <section className="listing-detail-screen" aria-labelledby="clicked-detail-title">
      <header className="detail-top-title">
        <button className="detail-back-button" type="button" onClick={onBack} aria-label="목록으로 돌아가기">
          <ArrowLeft size={24} strokeWidth={2.5} />
        </button>
        <h1 id="clicked-detail-title">{listing.detailHeader}</h1>
        <div className="detail-header-actions">
          <button type="button" aria-label="공유하기" onClick={() => setIsShareSheetOpen(true)}>
            <Share2 size={22} strokeWidth={2.5} />
          </button>
          <button className={isSaved ? "active" : ""} type="button" aria-label="찜하기" onClick={() => onToggleSaved(listing.listingNo)}>
            <Heart size={24} fill={isSaved ? "currentColor" : "none"} strokeWidth={2.5} />
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

      <div className="detail-gallery" aria-label={`${listing.title} 사진 모음`}>
        <div className="gallery-main">
          <Image src={activePhoto} alt={`${listing.title} 대표 사진 ${activePhotoIndex + 1}`} width={760} height={880} priority unoptimized={isRemotePhoto(activePhoto)} />
          <span className="gallery-photo-count">{activePhotoIndex + 1} / {listing.gallery.length}</span>
        </div>
        <div className="gallery-stack">
          {listing.gallery.map((image, index) => (
            <button
              className={activePhotoIndex === index ? "gallery-tile active" : "gallery-tile"}
              type="button"
              key={image}
              aria-label={`${listing.title} 사진 ${index + 1} 보기`}
              onClick={() => setActivePhotoIndex(index)}
            >
              <span className="gallery-image" style={{ backgroundImage: `url(${image})` }} />
            </button>
          ))}
        </div>
      </div>

      <div className="listing-number-bar">
        <button type="button" aria-label="매물번호 복사" onClick={copyListingNo}>
          <span>{listing.listingLabel}</span>
          <Copy size={15} strokeWidth={2.4} aria-hidden="true" />
        </button>
        <span className="listing-updated">{listing.updated} 갱신 · {listing.viewCount}</span>
      </div>

      {detailToast ? <div className="detail-toast" role="status">{detailToast}</div> : null}

      <div className="detail-price-block">
        <h2>{listing.price}</h2>
        <p>{listing.headline}</p>
        <div className="detail-address-line">
          <MapPinned size={18} strokeWidth={2.4} aria-hidden="true" />
          <span>{listing.location}</span>
        </div>
        {listing.detailAddress?.trim() ? (
          <div className="detail-address-detail">세부주소: {listing.detailAddress.trim()}</div>
        ) : null}
      </div>

      <div className="listing-detail-facts" aria-label="매물 기본 정보">
        <div>
          <span aria-hidden="true"><Building2 size={20} strokeWidth={2.2} /></span>
          <strong>{listing.roomType}</strong>
        </div>
        <div>
          <span aria-hidden="true"><Ruler size={20} strokeWidth={2.2} /></span>
          <strong>{listing.sizeLabel}</strong>
        </div>
        <div>
          <span aria-hidden="true"><Layers3 size={20} strokeWidth={2.2} /></span>
          <strong>{listing.floorLabel}</strong>
        </div>
        <div>
          <span aria-hidden="true"><Banknote size={20} strokeWidth={2.2} /></span>
          <strong>{listing.maintenanceFee}</strong>
        </div>
      </div>

      <div className="detail-tags" aria-label="매물 태그">
        {listing.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>

      <section className="detail-info-section" aria-label="가격 정보">
        <div className="detail-section-heading">
          <h2>가격 정보</h2>
          <span>방문 전 필수 확인</span>
        </div>
        <dl className="detail-info-table">
          {listingPriceRows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="detail-info-pair">
        <section className="detail-info-section" aria-label="옵션 정보">
          <div className="detail-section-heading">
            <h2>옵션 정보</h2>
            <span>{isDirectListing ? "집주인 등록 기준" : "현장 확인 필요"}</span>
          </div>
          {listingOptions.length > 0 ? (
            <div className="option-chip-grid">
              {listingOptions.map((option) => (
                <span key={option}>{option}</span>
              ))}
            </div>
          ) : (
            <p className="option-empty-note">집주인이 등록한 옵션이 없습니다.</p>
          )}
        </section>

        <section className="detail-info-section" aria-label="건물 정보">
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

      {/* 3D 진입은 하단 고정 바의 "3D 둘러보기"가 담당 — 본문 중복 배너는 제거했다. */}
      <section className="detail-map-section" aria-label="상세 위치">
        <div>
          <h2>위치</h2>
          <p>정확한 위치와 주변 생활권을 지도에서 확인하세요.</p>
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

      <div className="detail-contact-bar" id="detail-contact">
        <span className="contact-tooltip">로그인 없이 문의 가능 · 평균 응답 8분</span>
        <button className="detail-contact-small" type="button" aria-label="전화문의" onClick={onStartChat}>
          <span aria-hidden="true"><Phone size={20} strokeWidth={2.5} /></span>
          <strong>전화</strong>
        </button>
        <button className="detail-contact-tour" type="button" onClick={() => setIsTourSheetOpen(true)}>
          <span>3D</span>
          <strong>둘러보기</strong>
        </button>
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

      {isTourSheetOpen ? (
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
                  <ListingTourRoom3D floorPlan={listing.floorPlan3D} />
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
