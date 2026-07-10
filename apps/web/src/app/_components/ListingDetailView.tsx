"use client";

// 매물 상세 뷰 + 문의 시트 — /listing/[id] 라우트와 SPA(홈 카드 문자문의의 InquirySheet)가 공유.
// 상세 라우트 분리(1단계)로 page.tsx에서 추출했다(동작 불변).
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
  formatManwon,
  getMarketSummary,
  propertyTypeForRoom,
  regionForLocation,
  type MarketSummary
} from "@/lib/api";
import {
  getListingBuildingRows,
  getListingPriceRows,
  isRemotePhoto,
  listingDetailAddressLabel,
  neighborhoodItems,
  optionItems,
  safetyReportItems,
  type Listing
} from "@/lib/listing-catalog";
import type { InquiryPayload } from "@/lib/inquiry-flow";
import { NaverMapPreview } from "./NaverMapPreview";

// 상세 "3D 보기" 전용 — three.js 번들이 무거우므로 시트를 열 때만 지연 로드한다.
const ListingTourRoom3D = dynamic(() => import("./ListingTourRoom3D"), {
  ssr: false,
  loading: () => <div className="tour-room-loading">3D 도면을 불러오는 중…</div>
});

export function ListingDetailView({
  listing,
  isSaved,
  onBack,
  onToggleSaved,
  onSubmitInquiry,
  onViewInquiryCenter,
  onRequireLogin
}: {
  listing: Listing;
  isSaved: boolean;
  onBack: () => void;
  onToggleSaved: (listingNo: string) => void;
  onSubmitInquiry: (payload: InquiryPayload, listingNo?: string) => Promise<"ok" | "auth" | "error">;
  onViewInquiryCenter: () => void;
  onRequireLogin?: () => void;
}) {
  const [isTourSheetOpen, setIsTourSheetOpen] = useState(false);
  const [isInquirySheetOpen, setIsInquirySheetOpen] = useState(false);
  const [isComplexSheetOpen, setIsComplexSheetOpen] = useState(false);
  const [isAgentSheetOpen, setIsAgentSheetOpen] = useState(false);
  const [isShareSheetOpen, setIsShareSheetOpen] = useState(false);
  const [detailToast, setDetailToast] = useState("");
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [marketSummary, setMarketSummary] = useState<MarketSummary | null>(null);
  const activePhoto = listing.gallery[activePhotoIndex] ?? listing.gallery[0];
  const listingPriceRows = getListingPriceRows(listing);
  const listingBuildingRows = getListingBuildingRows(listing);
  const detailAddressLabel = listingDetailAddressLabel(listing);
  const safetyScore = listing.score.replace("안심 ", "");
  // 직접등록 매물은 점수가 "확인중" 같은 텍스트라 "점"을 붙이면 어색해진다("확인중점").
  const safetyScoreLabel = /^\d+$/.test(safetyScore) ? `${safetyScore}점` : safetyScore;
  const isDirectListing = listing.listingLabel === "집주인 직접등록";

  // 국토교통부 실거래가(시세)를 불러와 단지 시세 영역을 실데이터로 채운다.
  // 키 미설정/네트워크 오류 시 summary가 비므로 아래 폴백(하드코딩)이 그대로 유지된다.
  useEffect(() => {
    const controller = new AbortController();
    const region = regionForLocation(listing.location);
    getMarketSummary(
      { lawdCd: region.lawdCd, propertyType: propertyTypeForRoom(listing.roomType), months: 3 },
      controller.signal
    ).then((summary) => {
      if (summary && summary.count > 0) {
        setMarketSummary(summary);
      }
    });
    return () => controller.abort();
  }, [listing.location, listing.roomType]);

  const marketRecent = marketSummary?.recent[0];
  const complexRecentLabel = marketRecent
    ? marketRecent.tradeType === "월세"
      ? `${formatManwon(marketRecent.depositManwon)}/${marketRecent.monthlyRentManwon}만`
      : formatManwon(marketRecent.depositManwon)
    : listing.complexPrice;
  const complexAvgLabel =
    marketSummary && marketSummary.count > 0
      ? formatManwon(marketSummary.avgJeonseDepositManwon || marketSummary.avgDepositManwon)
      : listing.unitCount;
  const complexMonthlyAvgLabel =
    marketSummary && marketSummary.monthlyCount > 0 ? `${marketSummary.avgMonthlyRentManwon}만` : "76만";

  const copyListingNo = async () => {
    const text = listing.listingLabel;

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }

    setDetailToast("매물번호를 복사했어요");
    window.setTimeout(() => setDetailToast(""), 1600);
  };
  const scrollToSafetyReport = () => {
    document.querySelector(".detail-report-card")?.scrollIntoView({ block: "start", behavior: "smooth" });
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
        <div className="detail-address-detail">세부주소: {detailAddressLabel}</div>
        <div className="detail-quick-actions" aria-label="상세 빠른 액션">
          <button type="button" onClick={() => setIsTourSheetOpen(true)}>
            <span>3D</span>
            <strong>투어 보기</strong>
          </button>
          <button type="button" onClick={scrollToSafetyReport}>
            <span>{safetyScoreLabel}</span>
            <strong>안심 리포트</strong>
          </button>
          <button type="button" onClick={() => setIsComplexSheetOpen(true)}>
            <span>단지</span>
            <strong>정보 보기</strong>
          </button>
          <button type="button" onClick={() => setIsInquirySheetOpen(true)}>
            <span>8분 응답</span>
            <strong>문의하기</strong>
          </button>
        </div>
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

      <section className="detail-trust-list" aria-label="안심 거래 정보">
        <div className="detail-section-heading">
          <h2>안심 거래 정보</h2>
          <span>{listing.verification}</span>
        </div>
        <ul>
          <li>
            <span>거래상태</span>
            <strong>문의 가능</strong>
          </li>
          <li>
            <span>실매물 확인</span>
            <strong>{listing.verification}</strong>
          </li>
          <li>
            <span>문의 응답</span>
            <strong>{listing.response}</strong>
          </li>
          <li>
            <span>등록 사진</span>
            <strong>{listing.gallery.length}장 · 현장 촬영</strong>
          </li>
          <li>
            <span>헛걸음 보상</span>
            <strong>정보 불일치 시 보상</strong>
          </li>
        </ul>
      </section>

      <button className="complex-button" type="button" onClick={() => setIsComplexSheetOpen(true)}>
        <Building2 size={20} strokeWidth={2.4} aria-hidden="true" />
        단지 정보 보러가기
      </button>

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

      <section className="safety-analysis-card" aria-label="AI 안전분석">
        <div>
          <span>AI 안전분석</span>
          <h2>권리관계 특이사항 낮음</h2>
          <p>등기 변동, 보증금 비율, 관리비 수준을 함께 본 결과입니다.</p>
        </div>
        <strong>{safetyScoreLabel}</strong>
      </section>

      <section className="detail-report-card" aria-label="지킴 진단 리포트">
        <div className="detail-report-head">
          <div>
            <span>지킴 진단 리포트</span>
            <h2>계약 전 확인할 항목을 정리했어요</h2>
          </div>
          <strong>{safetyScore}</strong>
        </div>
        <div className="detail-report-grid">
          {safetyReportItems.map((item) => (
            <article key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.status}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="agent-summary-card" aria-label="중개사 정보">
        <div>
          <span>{isDirectListing ? "집주인 직접 거래" : "중개사 평점 4.8"}</span>
          <h2>{listing.broker}</h2>
          <p>
            {isDirectListing
              ? `${listing.response} · ${listing.verification} · 헛걸음 보상 참여`
              : `${listing.response} · 확인매물 126개 · 헛걸음 보상 참여`}
          </p>
        </div>
        <button type="button" onClick={() => setIsAgentSheetOpen(true)}>프로필</button>
      </section>

      <section className="messenger-card" aria-label="매물확인 메신저">
        <div>
          <span>매물확인 메신저</span>
          <h2>방문 전 거래 가능 여부 확인</h2>
          <p>중개사가 계약 가능, 계약 불가능, 대체 매물을 문자로 답변합니다.</p>
        </div>
        <button type="button" onClick={() => setIsInquirySheetOpen(true)}>간편문의</button>
      </section>

      <div className="detail-info-pair">
        <section className="detail-info-section" aria-label="옵션 정보">
          <div className="detail-section-heading">
            <h2>옵션 정보</h2>
            <span>현장 확인 필요</span>
          </div>
          <div className="option-chip-grid">
            {optionItems.map((option) => (
              <span key={option}>{option}</span>
            ))}
          </div>
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

      <section className="detail-neighborhood-card" aria-label="상세 주변 정보">
        <h2>주변 정보</h2>
        <div>
          {neighborhoodItems.map((item) => (
            <span key={item.label}>
              <b>{item.label}</b>
              {item.value}
            </span>
          ))}
        </div>
      </section>

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
          title={listing.title}
        />
      </section>

      <div className="detail-contact-bar" id="detail-contact">
        <span className="contact-tooltip">로그인 없이 문의 가능 · 평균 응답 8분</span>
        <button className="detail-contact-small" type="button" aria-label="전화문의" onClick={() => setIsInquirySheetOpen(true)}>
          <span aria-hidden="true"><Phone size={20} strokeWidth={2.5} /></span>
          <strong>전화</strong>
        </button>
        <button className="detail-contact-tour" type="button" onClick={() => setIsTourSheetOpen(true)}>
          <span>3D</span>
          <strong>둘러보기</strong>
        </button>
        {/* 임시 데모용 — 1인칭 체험은 splat 투어 페이지로 바로 이동한다(woo-zu.com/splat-tour) */}
        <a className="detail-contact-tour detail-contact-splat" href="/splat-tour">
          <span>1인칭</span>
          <strong>체험</strong>
        </a>
        <button className="detail-contact-primary" type="button" onClick={() => setIsInquirySheetOpen(true)}>
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
                <div className="tour-room-box tour-room-box-empty">
                  <span className="tour-wall wall-left" />
                  <span className="tour-wall wall-right" />
                  <span className="tour-bed" />
                  <span className="tour-desk" />
                  <span className="tour-window" />
                  <strong>3D 도면 미연결 매물</strong>
                  <em>집주인이 아직 3D 도면을 등록하지 않았어요</em>
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
              <div>
                <span>매물 공유</span>
                <h2 id="share-sheet-title">매물 공유하기</h2>
                <p>{listing.title} 정보를 같이 볼 사람에게 전달하세요.</p>
              </div>
              <button type="button" onClick={() => setIsShareSheetOpen(false)} aria-label="공유 닫기">×</button>
            </header>

            <div className="share-listing-preview">
              <span>{listing.price}</span>
              <strong>{listing.title}</strong>
              <p>{listing.location} · {detailAddressLabel} · {listing.spec}</p>
            </div>

            <div className="share-action-grid" aria-label="공유 방법">
              {["링크 복사", "문자 공유", "카카오 공유", "관심목록 저장"].map((label) => (
                <button
                  type="button"
                  key={label}
                  onClick={async () => {
                    if (label === "관심목록 저장" && !isSaved) {
                      onToggleSaved(listing.listingNo);
                    }

                    // 상세가 라우트가 된 덕에 링크 복사가 실제 공유 가능한 URL을 준다.
                    if (label === "링크 복사" && navigator.clipboard) {
                      await navigator.clipboard
                        .writeText(`${window.location.origin}/listing/${encodeURIComponent(listing.listingNo)}`)
                        .catch(() => undefined);
                    }

                    setDetailToast(
                      label === "관심목록 저장"
                        ? "관심목록에 저장했어요"
                        : label === "링크 복사"
                        ? "매물 링크를 복사했어요"
                        : `${label}를 선택했어요`
                    );
                    setIsShareSheetOpen(false);
                    window.setTimeout(() => setDetailToast(""), 1600);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {isComplexSheetOpen ? (
        <div className="complex-sheet-backdrop" role="presentation" onClick={() => setIsComplexSheetOpen(false)}>
          <section className="complex-sheet" role="dialog" aria-modal="true" aria-labelledby="complex-sheet-title" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" aria-hidden="true" />
            <header>
              <div>
                <span>단지 리포트</span>
                <h2 id="complex-sheet-title">단지 정보</h2>
                <p>{listing.location} 기준 건물, 시세, 주변 생활권을 요약했습니다.</p>
              </div>
              <button type="button" onClick={() => setIsComplexSheetOpen(false)} aria-label="단지 정보 닫기">×</button>
            </header>

            <div className="complex-price-summary">
              <article>
                <span>최근 실거래</span>
                <strong>{complexRecentLabel}</strong>
              </article>
              <article>
                <span>동일 면적 평균</span>
                <strong>{complexAvgLabel}</strong>
              </article>
              <article>
                <span>월세 평균</span>
                <strong>{complexMonthlyAvgLabel}</strong>
              </article>
            </div>

            {marketSummary && marketSummary.count > 0 ? (
              <p className="complex-source-note">
                국토교통부 실거래가 {marketSummary.count}건 기준 · 최근 3개월
              </p>
            ) : null}

            <section className="complex-building-card" aria-label="단지 건물 요약">
              <div>
                <strong>방배 루미에르</strong>
                <span>준공 2021년 · 총 16층 · 84세대</span>
              </div>
              <p>엘리베이터, CCTV, 무인택배함, 주차 가능 여부를 현장 확인 기준으로 정리했습니다.</p>
            </section>

            <div className="complex-score-grid" aria-label="단지 생활 점수">
              {[
                ["교통", "도보 5분"],
                ["보안", "CCTV 7곳"],
                ["관리", "관리비 보통"],
                ["소음", "큰길가"]
              ].map(([label, value]) => (
                <span key={label}>
                  <b>{label}</b>
                  {value}
                </span>
              ))}
            </div>

            <div className="complex-sheet-actions">
              <button type="button" onClick={() => setIsComplexSheetOpen(false)}>닫기</button>
              <button
                type="button"
                onClick={() => {
                  setIsComplexSheetOpen(false);
                  setIsInquirySheetOpen(true);
                }}
              >
                단지 문의하기
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isAgentSheetOpen ? (
        <div className="agent-sheet-backdrop" role="presentation" onClick={() => setIsAgentSheetOpen(false)}>
          <section className="agent-sheet" role="dialog" aria-modal="true" aria-labelledby="agent-sheet-title" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" aria-hidden="true" />
            <header>
              <div>
                <span>중개사 정보</span>
                <h2 id="agent-sheet-title">내방역 푸른공인중개사</h2>
                <p>확인매물 중심으로 운영하는 집우집주 파트너 중개사무소입니다.</p>
              </div>
              <button type="button" onClick={() => setIsAgentSheetOpen(false)} aria-label="중개사 프로필 닫기">×</button>
            </header>

            <div className="agent-profile-summary">
              <div className="agent-avatar" aria-hidden="true">푸</div>
              <div>
                <strong>대표 공인중개사 김하늘</strong>
                <span>서울 서초구 방배동 · 등록번호 9254-18-00421</span>
              </div>
            </div>

            <section className="agent-metric-grid" aria-label="중개사 신뢰 지표">
              {[
                ["응답률", "98%"],
                ["평균 응답", "8분"],
                ["확인매물", "126개"],
                ["후기 평점", "4.8"]
              ].map(([label, value]) => (
                <article key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </article>
              ))}
            </section>

            <section className="agent-review-card" aria-label="최근 중개 후기">
              <strong>최근 후기</strong>
              <p>“방문 전 사진과 실제 상태가 거의 같았고, 관리비 포함 내역을 바로 알려줬어요.”</p>
              <span>입주 상담 완료 · 2일 전</span>
            </section>

            <div className="agent-listing-row" aria-label="중개사 보유 매물">
              <span>보유 매물</span>
              <strong>방배동 원룸 42개 · 오피스텔 18개 · 3D 가능 12개</strong>
            </div>

            <div className="agent-sheet-actions">
              <button type="button" onClick={() => setIsAgentSheetOpen(false)}>닫기</button>
              <button
                type="button"
                onClick={() => {
                  setIsAgentSheetOpen(false);
                  setIsInquirySheetOpen(true);
                }}
              >
                중개사 문의하기
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isInquirySheetOpen ? (
        <InquirySheet
          listing={listing}
          onClose={() => setIsInquirySheetOpen(false)}
          onSubmitInquiry={onSubmitInquiry}
          onViewInquiryCenter={onViewInquiryCenter}
          onRequireLogin={onRequireLogin}
        />
      ) : null}
    </section>
  );
}

// 통합 문의 작성 sheet — 매물 상세 "문의하기"와 홈 카드 "문자문의"가
// 전부 이 하나의 sheet를 연다. (QA 3·4·6·7)
export function InquirySheet({
  listing,
  onClose,
  onSubmitInquiry,
  onViewInquiryCenter,
  onRequireLogin
}: {
  listing: Listing;
  onClose: () => void;
  onSubmitInquiry: (payload: InquiryPayload, listingNo?: string) => Promise<"ok" | "auth" | "error">;
  onViewInquiryCenter: () => void;
  onRequireLogin?: () => void;
}) {
  const [selectedInquiryMessage, setSelectedInquiryMessage] = useState("아직 거래 가능한가요?");
  const [selectedVisitTime, setSelectedVisitTime] = useState("오늘 3시");
  const [inquiryMemo, setInquiryMemo] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "sending" | "sent" | "auth" | "error">("idle");
  const inquirySent = submitState === "sent";
  const setInquirySent = (sent: boolean) => setSubmitState(sent ? "sent" : "idle");

  return (
    <div className="inquiry-sheet-backdrop" role="presentation" onClick={onClose}>
      <section className="inquiry-sheet" role="dialog" aria-modal="true" aria-labelledby="inquiry-sheet-title" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" aria-hidden="true" />
        <header>
          <div>
            <span>문의하기</span>
            <h2 id="inquiry-sheet-title">간편문의</h2>
            <p>문의를 보내면 집주인과 채팅으로 바로 이어집니다. (로그인 필요)</p>
          </div>
          <button type="button" onClick={onClose} aria-label="문의 닫기">×</button>
        </header>

        <div className="inquiry-listing-summary">
          <strong>{listing.price}</strong>
          <span>{listing.title}</span>
          <small>{listing.broker} · {listing.response}</small>
        </div>

        <div className="inquiry-message-group">
          <strong>문의 내용 선택</strong>
          <div className="inquiry-message-grid">
            {[
              "아직 거래 가능한가요?",
              "오늘 방문 가능한가요?",
              "관리비 포함 내역 알려주세요",
              "3D 투어 먼저 보고 싶어요"
            ].map((message) => (
              <button
                className={selectedInquiryMessage === message ? "active" : ""}
                type="button"
                key={message}
                onClick={() => {
                  setSelectedInquiryMessage(message);
                  setInquirySent(false);
                }}
              >
                {message}
              </button>
            ))}
          </div>
        </div>

        <div className="visit-time-group">
          <strong>방문 희망 시간</strong>
          <div>
            {["오늘 3시", "내일 오전", "주말 가능"].map((time) => (
              <button
                className={selectedVisitTime === time ? "active" : ""}
                type="button"
                key={time}
                onClick={() => {
                  setSelectedVisitTime(time);
                  setInquirySent(false);
                }}
              >
                {time}
              </button>
            ))}
          </div>
        </div>

        <label className="inquiry-textarea">
          <span>추가 메모</span>
          <textarea
            value={inquiryMemo}
            placeholder="예: 실매물 여부와 방문 가능한 시간을 확인하고 싶습니다."
            onChange={(event) => {
              setInquiryMemo(event.target.value);
              setInquirySent(false);
            }}
          />
        </label>

        <div className="inquiry-selected-summary" role="status">
          <strong>선택한 문의</strong>
          <p>{selectedInquiryMessage} · {selectedVisitTime}</p>
        </div>

        <div className="inquiry-agent-row">
          <span aria-hidden="true">✓</span>
          <p>48시간 안에 계약 가능, 계약 불가, 대체 매물 추천 중 하나로 답변됩니다.</p>
        </div>

        <div className="inquiry-policy-row" aria-label="허위매물 차단 정책">
          <strong>허위매물 차단</strong>
          <p>계약불가 또는 미답변 매물은 안내 배지가 함께 표시됩니다.</p>
        </div>

        <div className="inquiry-sheet-actions">
          <button type="button" onClick={onClose}>닫기</button>
          <button
            type="button"
            disabled={submitState === "sending"}
            onClick={async () => {
              if (inquirySent || submitState === "sending") return;
              setSubmitState("sending");
              const message = inquiryMemo.trim()
                ? `${selectedInquiryMessage} — ${inquiryMemo.trim()}`
                : selectedInquiryMessage;
              const result = await onSubmitInquiry(
                {
                  listingTitle: listing.title,
                  broker: listing.broker,
                  message,
                  visitTime: selectedVisitTime
                },
                listing.listingNo
              );
              setSubmitState(result === "ok" ? "sent" : result);
            }}
          >
            {submitState === "sending" ? "보내는 중…" : "문의 보내기"}
          </button>
        </div>

        {inquirySent ? (
          <div className="inquiry-submit-feedback" role="status">
            <p>문의가 접수됐습니다. 집주인이 답하면 문의센터 채팅으로 이어집니다.</p>
            <button type="button" onClick={onViewInquiryCenter}>문의센터 보기</button>
          </div>
        ) : null}
        {submitState === "auth" ? (
          <div className="inquiry-submit-feedback" role="status">
            <p>문의를 보내려면 WOOZU 계정 로그인이 필요합니다.</p>
            {onRequireLogin ? <button type="button" onClick={onRequireLogin}>로그인하기</button> : null}
          </div>
        ) : null}
        {submitState === "error" ? (
          <div className="inquiry-submit-feedback" role="status">
            <p>문의 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
