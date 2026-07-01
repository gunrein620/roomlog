"use client";

import Image from "next/image";
import { useState } from "react";

const socialProviders = [
  { label: "카카오로 계속하기", className: "kakao", mark: "K" },
  { label: "네이버로 계속하기", className: "naver", mark: "N" },
  { label: "Apple로 계속하기", className: "apple", mark: "A" },
  { label: "Google로 계속하기", className: "google", mark: "G" }
];

const categories = [
  { label: "원룸", count: "632" },
  { label: "투룸", count: "248" },
  { label: "오피스텔", count: "186" },
  { label: "아파트", count: "91" },
  { label: "단기임대", count: "57" }
];

const quickFilters = ["월세", "전세", "관리비 포함", "반려동물", "주차", "풀옵션"];

const listings = [
  {
    title: "방배 루미에르 402호",
    location: "방배동 · 내방역 도보 5분",
    price: "월세 1,000 / 35",
    spec: "24.5m² · 4층 · 즉시입주",
    image: "/listing-studio.jpg",
    badges: ["확인매물", "3D 투어"],
    score: "안심 92"
  },
  {
    title: "성수 어반 스튜디오",
    location: "성수동 · 서울숲 9분",
    price: "월세 800 / 80",
    spec: "32.2m² · 복층 · 반려동물",
    image: "/listing-loft.jpg",
    badges: ["현장촬영", "신축급"],
    score: "안심 88"
  },
  {
    title: "역삼 스카이 테라스",
    location: "역삼동 · 강남역 7분",
    price: "전세 4억 6,000",
    spec: "30.0m² · 14층 · 관리비 15만",
    image: "/listing-bedroom.jpg",
    badges: ["확인매물", "헛걸음 보상"],
    score: "안심 96"
  }
];

const mapListings = [
  {
    title: "방배 루미에르 402호",
    price: "월세 1,000 / 35",
    meta: "원룸 · 24.5m² · 4층",
    image: "/listing-studio.jpg"
  },
  {
    title: "역삼 스카이 테라스",
    price: "전세 4억 6,000",
    meta: "오피스텔 · 30.0m² · 14층",
    image: "/listing-building.jpg"
  }
];

const trustItems = [
  { title: "안심 리포트", body: "등기·시세·권리관계 요약" },
  { title: "주변 안전", body: "CCTV, 치안센터, 야간동선" },
  { title: "헛걸음 보상", body: "정보 불일치 신고 접수 가능" }
];

const detailFacts = [
  ["주거형태", "오픈형 원룸"],
  ["전용면적", "24.5m²"],
  ["입주가능일", "즉시"],
  ["주차", "가능"],
  ["관리비", "8만원"],
  ["층수", "4 / 7층"]
];

const amenities = ["에어컨", "세탁기", "냉장고", "인덕션", "도어락", "엘리베이터"];

function LoginScreen({ onEnter }: { onEnter: () => void }) {
  return (
    <main className="app-canvas">
      <section className="login-phone" aria-label="Roomlog Homes 로그인">
        <div className="login-map" aria-hidden="true">
          <span className="login-pin pin-a">1000/35</span>
          <span className="login-pin pin-b">4.6억</span>
          <span className="login-pin pin-c">800/80</span>
        </div>

        <div className="login-panel">
          <p className="brand-kicker">ROOMLOG HOMES</p>
          <h1>방 보러 가기 전에 먼저 걸어보세요</h1>
          <p>
            소셜 로그인으로 시작하고, 개발 중에는 아래 버튼으로 바로 데모 화면에 들어갑니다.
          </p>

          <div className="social-stack" aria-label="소셜 로그인">
            {socialProviders.map((provider) => (
              <button className={`social-button ${provider.className}`} type="button" key={provider.label}>
                <span aria-hidden="true">{provider.mark}</span>
                {provider.label}
              </button>
            ))}
          </div>

          <button className="dev-login" type="button" onClick={onEnter}>
            개발용 로그인
          </button>

          <small>일반 계정 로그인은 제공하지 않습니다.</small>
        </div>
      </section>
    </main>
  );
}

export default function Home() {
  const [isSignedIn, setIsSignedIn] = useState(false);

  if (!isSignedIn) {
    return <LoginScreen onEnter={() => setIsSignedIn(true)} />;
  }

  return (
    <main className="app-canvas">
      <div className="service-frame" aria-label="Roomlog Homes property app">
        <section className="screen home-screen" aria-labelledby="home-title">
          <header className="app-header">
            <div>
              <p className="brand-kicker">ROOMLOG HOMES</p>
              <h1 id="home-title">어디에서 방을 찾으세요?</h1>
            </div>
            <button className="round-button" type="button" aria-label="알림">
              !
            </button>
          </header>

          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input defaultValue="" placeholder="지역, 지하철, 건물명 검색" />
            <button type="button" aria-label="필터">
              조정
            </button>
          </label>

          <nav className="category-strip" aria-label="매물 유형">
            {categories.map((category, index) => (
              <button className={index === 0 ? "category-card active" : "category-card"} type="button" key={category.label}>
                <span>{category.label}</span>
                <strong>{category.count}</strong>
              </button>
            ))}
          </nav>

          <div className="quick-filter-row" aria-label="빠른 필터">
            {quickFilters.map((filter, index) => (
              <button className={index === 0 ? "active" : ""} type="button" key={filter}>
                {filter}
              </button>
            ))}
          </div>

          <article className="hero-service-card">
            <Image src="/listing-studio.jpg" alt="채광 좋은 방배동 원룸" width={1200} height={800} priority />
            <div className="hero-service-copy">
              <span>DIGITAL TWIN READY</span>
              <h2>사진 보고 끝내지 말고, 3D로 동선까지 확인</h2>
              <p>VR홈투어와 3D 단지투어가 들어갈 핵심 진입점입니다.</p>
            </div>
          </article>

          <section className="trust-grid" aria-label="신뢰 정보">
            {trustItems.map((item) => (
              <article key={item.title}>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </article>
            ))}
          </section>

          <div className="section-title">
            <div>
              <h2>추천 매물</h2>
              <p>확인매물과 3D 투어 가능 매물을 먼저 보여줘요.</p>
            </div>
            <a href="#map-list">전체</a>
          </div>

          <div className="listing-feed">
            {listings.map((listing) => (
              <article className="listing-card" key={listing.title}>
                <div className="listing-photo">
                  <Image src={listing.image} alt={`${listing.title} 사진`} width={1200} height={800} />
                  <div className="badge-row">
                    {listing.badges.map((badge) => (
                      <span key={badge}>{badge}</span>
                    ))}
                  </div>
                  <button type="button" aria-label={`${listing.title} 찜하기`}>
                    ♡
                  </button>
                </div>
                <div className="listing-body">
                  <div>
                    <strong>{listing.price}</strong>
                    <span>{listing.score}</span>
                  </div>
                  <h3>{listing.title}</h3>
                  <p>{listing.spec}</p>
                  <small>{listing.location}</small>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="screen map-screen" id="map-list" aria-labelledby="map-title">
          <div className="map-topbar">
            <label>
              <span aria-hidden="true">⌕</span>
              <input defaultValue="서초구 방배동" aria-label="지도 검색어" />
            </label>
            <button type="button">필터</button>
          </div>

          <div className="map-filter-row">
            {["매물", "원룸·투룸", "보증금", "관리비", "방 크기"].map((filter, index) => (
              <button className={index === 0 ? "active" : ""} type="button" key={filter}>
                {filter}
              </button>
            ))}
          </div>

          <div className="map-stage" aria-label="지도에서 보기">
            <Image src="/map-blueprint.png" alt="서초구 방배동 지도" fill loading="eager" sizes="430px" />
            <div className="draw-area" aria-label="그리기 영역" />
            <span className="map-pin p1">1000/35</span>
            <span className="map-pin p2">800/80</span>
            <span className="map-pin p3">4.6억</span>
            <button className="float-action shot" type="button">현장촬영</button>
            <button className="float-action draw" type="button">그리기</button>
          </div>

          <div className="result-sheet">
            <div className="sheet-handle" aria-hidden="true" />
            <nav className="sheet-tabs" aria-label="지도 결과 탭">
              <button className="active" type="button">전체 방</button>
              <button type="button">단지</button>
              <button type="button">중개사무소</button>
            </nav>

            <div className="section-title compact">
              <div>
                <h2 id="map-title">방배동 매물 42개</h2>
                <p>시세 지도 · 주변 안전 · 정확도순</p>
              </div>
              <button type="button">정렬</button>
            </div>

            <div className="map-list">
              {mapListings.map((listing) => (
                <article className="map-listing" key={listing.title}>
                  <Image src={listing.image} alt={`${listing.title} 썸네일`} width={260} height={190} />
                  <div>
                    <span>확인매물</span>
                    <h3>{listing.title}</h3>
                    <strong>{listing.price}</strong>
                    <p>{listing.meta}</p>
                  </div>
                  <button type="button" aria-label={`${listing.title} 저장`}>
                    ♡
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="screen detail-screen" aria-labelledby="detail-title">
          <div className="detail-hero">
            <Image src="/listing-studio.jpg" alt="방배 루미에르 402호 대표 사진" fill loading="eager" sizes="430px" />
            <div className="detail-nav">
              <button type="button" aria-label="뒤로">←</button>
              <div>
                <button type="button" aria-label="공유">↗</button>
                <button type="button" aria-label="저장">♡</button>
              </div>
            </div>
            <span className="photo-count">1 / 18</span>
          </div>

          <div className="detail-content">
            <div className="verified-row">
              <span>확인매물</span>
              <span>헛걸음 보상</span>
              <span>안심 리포트</span>
            </div>
            <p className="trade-line">월세 · 관리비 8만</p>
            <h2 id="detail-title">1,000 / 35</h2>
            <p className="detail-address">서울특별시 서초구 방배동 · 내방역 도보 5분</p>

            <a className="tour-banner" href="#contact" aria-label="3D 가상 투어 시작하기">
              <span>
                <small>ROOMLOG 3D TOUR</small>
                <strong>3D 가상 투어 시작하기</strong>
                <em>실측 도면 기반 투어 모듈 연결 예정</em>
              </span>
              <b aria-hidden="true">3D</b>
            </a>

            <dl className="fact-grid">
              {detailFacts.map(([term, value]) => (
                <div key={term}>
                  <dt>{term}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>

            <section className="report-card">
              <div>
                <span>AI 분석</span>
                <h3>매물 거래 안전도 높음</h3>
                <p>최근 실거래가, 권리관계, 관리비, 주변 치안 데이터를 요약해 보여주는 자리입니다.</p>
              </div>
              <strong>92점</strong>
            </section>

            <section className="detail-section">
              <h3>매물 상세</h3>
              <p>
                방배역 도보 5분 거리의 채광 좋은 신축급 원룸입니다. 화이트 톤 인테리어와 넓은 창,
                풀옵션 구성, 방문 전 확인 가능한 3D 투어까지 갖춘 매물로 보여줍니다.
              </p>
            </section>

            <div className="amenity-grid">
              {amenities.map((amenity) => (
                <button type="button" key={amenity}>
                  <span aria-hidden="true">+</span>
                  {amenity}
                </button>
              ))}
            </div>

            <section className="detail-section">
              <h3>위치와 주변 안전</h3>
              <div className="mini-map">
                <Image src="/map-blueprint.png" alt="상세 위치 지도" fill loading="eager" sizes="430px" />
                <span aria-hidden="true" />
              </div>
              <p className="location-copy">상세주소는 방문 예약 확정 후 공개 · CCTV 7곳 · 치안센터 1곳</p>
            </section>

            <section className="agent-card" id="contact">
              <div>
                <span>ROOMLOG 공인중개 파트너</span>
                <h3>내방역 푸른공인중개사</h3>
                <p>최근 응답 8분 · 확인매물 126개</p>
              </div>
              <button type="button">문의</button>
            </section>
          </div>

          <div className="sticky-cta">
            <button className="ghost-cta" type="button">중개사 문의</button>
            <button className="primary-cta" type="button">3D 보기 / 투어 예약</button>
          </div>
        </section>

        <nav className="bottom-tabs" aria-label="앱 하단 메뉴">
          {["홈", "지도", "찜", "문의", "내정보"].map((item, index) => (
            <a className={index === 0 ? "active" : ""} href={index === 1 ? "#map-list" : "#home-title"} key={item}>
              <span aria-hidden="true">{index === 1 ? "⌖" : "·"}</span>
              {item}
            </a>
          ))}
        </nav>
      </div>
    </main>
  );
}
