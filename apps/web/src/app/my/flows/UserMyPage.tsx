"use client";

// 방 찾는 중(탐색) 마이페이지 — 최근 본 방/찜/문의 요약과 저장 조건, PWA 설치 카드.
// 역할 흐름 분리(3단계)로 HomeApp에서 추출(동작 불변).
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, ChevronRight, Heart, MapPinned, MessageCircle, SlidersHorizontal, UserRound } from "lucide-react";
import type { Listing } from "@/lib/listing-catalog";
import type { InquiryItem } from "@/lib/inquiry-flow";
import { MyFlowBar, savedConditions, type MyFlow } from "./my-shared";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

// role="button" article를 키보드로도 조작할 수 있도록 Enter/Space를 실제 버튼처럼 처리
const handleActivateKey = (event: React.KeyboardEvent, action: () => void) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
};

export default function UserMyPage({
  roleLabel,
  savedCount,
  viewedListings,
  inquiries,
  onGoSaved,
  onGoInquiry,
  onOpenListing,
  onOpenFilter,
  onOpenNotifications,
  onApplyCondition,
  onSelectFlow,
  onGoHome
}: {
  roleLabel: string;
  savedCount: number;
  viewedListings: Listing[];
  inquiries: InquiryItem[];
  onGoSaved: () => void;
  onGoInquiry: () => void;
  onOpenListing: (listing: Listing) => void;
  onOpenFilter: () => void;
  onOpenNotifications: () => void;
  onApplyCondition: (condition: (typeof savedConditions)[number]) => void;
  onSelectFlow: (flow: MyFlow) => void;
  onGoHome: () => void;
}) {
  const latestInquiry = inquiries[0];
  const latestViewed = viewedListings[0];

  return (
    <section className="screen profile-screen" id="my-page" aria-labelledby="profile-title">
      <MyFlowBar activeFlow="seeking" onSelectFlow={onSelectFlow} />

      <header className="profile-account-card">
        <div className="profile-avatar" aria-hidden="true">
          <UserRound size={26} strokeWidth={2.4} />
        </div>
        <div>
          <p className="brand-kicker">내 정보</p>
          <h2 id="profile-title">마이페이지</h2>
          <p>{roleLabel} 활동에 맞춘 검색 조건과 문의 내역을 정리합니다.</p>
        </div>
        <button className="mypage-main-button profile-main-button" type="button" onClick={onGoHome}>
          메인으로
        </button>
      </header>

      <section className="my-roomlog-section" aria-labelledby="my-roomlog-title">
        <div className="my-roomlog-heading">
          <span>내 룸로그</span>
          <h3 id="my-roomlog-title">내 주거 프로세스</h3>
          <p>방을 찾고, 집을 내놓고, 계약된 집은 같은 계정에서 룸로그로 이어서 관리합니다.</p>
        </div>
        <div className="my-roomlog-grid">
          <article className="my-roomlog-card is-active">
            <header>
              <em>계약 전 · 탐색</em>
              <strong>방 찾는 중</strong>
            </header>
            <p>찜 {savedCount}개 · 문의 {inquiries.length}건 · 최근 본 방 {viewedListings.length}개</p>
            <div className="my-roomlog-actions">
              <button type="button" onClick={onGoSaved}>찜한 매물</button>
              <button type="button" onClick={onGoInquiry}>문의한 매물</button>
              <button type="button" onClick={onGoHome}>방 더 보기</button>
            </div>
          </article>

          <article className="my-roomlog-card">
            <header>
              <em>임대인 관계 · 데모</em>
              <strong>내가 내놓은 집</strong>
            </header>
            <p>방배 루미에르 302호 · 노출중 · 조회 128 · 문의 6건</p>
            <div className="my-roomlog-actions">
              <button type="button" onClick={() => onSelectFlow("listing")}>등록·문의 현황</button>
              <button type="button" onClick={() => onSelectFlow("listing")}>새 집 내놓기</button>
            </div>
            <small>계약이 연결되면 집주인으로 관리가 시작됩니다.</small>
          </article>

          <article className="my-roomlog-card">
            <header>
              <em>세입자 관계 · 데모</em>
              <strong>내가 사는 집</strong>
            </header>
            <p>방배 루미에르 402호 · 계약 중 · D-124 재계약 예정</p>
            <div className="my-roomlog-actions">
              <button type="button" onClick={() => onSelectFlow("living")}>사는 집 현황</button>
              <Link href="/tenant/home/00">룸로그 홈</Link>
              <Link href="/tenant/defect/00">하자 접수</Link>
              <Link href="/tenant/payment/00">관리비</Link>
            </div>
            <small>이 계정에 사는 집이 연결되면 이어집니다.</small>
          </article>

          <article className="my-roomlog-card">
            <header>
              <em>관리자 관계 · 연결 예정</em>
              <strong>관리 중인 집</strong>
            </header>
            <p>연남 스테이 외 2개 동 · 진행 티켓 3건 · 검토 대기 2건</p>
            <div className="my-roomlog-actions">
              <Link href="/manager/home/00">관리 콘솔</Link>
              <Link href="/manager/ticket/dash/00">하자·티켓</Link>
              <Link href="/manager/cost/00">비용 정산</Link>
              <Link href="/manager/messaging/00">메시지</Link>
            </div>
            <small>이 계정에 관리 중인 집이 연결되면 이어집니다.</small>
          </article>
        </div>
      </section>

      <section className="profile-activity-grid" aria-label="내 활동 요약">
        <article role="button" tabIndex={0} onClick={onGoSaved} onKeyDown={(event) => handleActivateKey(event, onGoSaved)}>
          <Heart size={18} strokeWidth={2.4} aria-hidden="true" />
          <span>찜한 매물</span>
          <strong>{savedCount}개</strong>
          <ChevronRight className="activity-card-chevron" size={14} strokeWidth={2.4} aria-hidden="true" />
        </article>
        <article role="button" tabIndex={0} onClick={onGoInquiry} onKeyDown={(event) => handleActivateKey(event, onGoInquiry)}>
          <MessageCircle size={18} strokeWidth={2.4} aria-hidden="true" />
          <span>문의 진행</span>
          <strong>{inquiries.length}건</strong>
          <ChevronRight className="activity-card-chevron" size={14} strokeWidth={2.4} aria-hidden="true" />
        </article>
        <article
          role="button"
          tabIndex={0}
          onClick={() => (latestViewed ? onOpenListing(latestViewed) : onGoHome())}
          onKeyDown={(event) => handleActivateKey(event, () => (latestViewed ? onOpenListing(latestViewed) : onGoHome()))}
        >
          <MapPinned size={18} strokeWidth={2.4} aria-hidden="true" />
          <span>최근 본 방</span>
          <strong>{viewedListings.length}개</strong>
          <ChevronRight className="activity-card-chevron" size={14} strokeWidth={2.4} aria-hidden="true" />
        </article>
      </section>

      <div className="profile-summary-list">
        <article
          role="button"
          tabIndex={0}
          onClick={() => onApplyCondition(savedConditions[0])}
          onKeyDown={(event) => handleActivateKey(event, () => onApplyCondition(savedConditions[0]))}
        >
          <span>저장 조건</span>
          <strong>{savedConditions[0].label}</strong>
          <p>저장 지역 조건은 누르면 지도에서 바로 확인합니다.</p>
          <ChevronRight className="activity-card-chevron" size={14} strokeWidth={2.4} aria-hidden="true" />
        </article>
        <article>
          <span>입주 체크</span>
          <strong>즉시입주 · 풀옵션 · 주차</strong>
          <p>필수 조건과 예산을 한 화면에서 관리합니다.</p>
        </article>
      </div>

      <section className="profile-inquiry-card" aria-label="최근 문의">
        <div>
          <span>최근 문의</span>
          <strong>{latestInquiry ? latestInquiry.listingTitle : "보낸 문의 없음"}</strong>
          <p>
            {latestInquiry
              ? `${latestInquiry.message} · ${latestInquiry.status}`
              : "매물 상세에서 문자문의를 보내면 여기에 표시됩니다."}
          </p>
        </div>
        <button type="button" onClick={onGoInquiry}>문의 확인</button>
      </section>

      {viewedListings.length > 0 ? (
        <section className="recent-viewed-card" aria-label="최근 본 방">
          <div className="recent-viewed-head">
            <strong>최근 본 방</strong>
            <span>{viewedListings.length}개</span>
          </div>
          {viewedListings.slice(0, 3).map((listing) => (
            <button type="button" key={listing.listingNo} onClick={() => onOpenListing(listing)}>
              <b>{listing.price}</b>
              <span>{listing.title}</span>
              <small>{listing.location}</small>
            </button>
          ))}
        </section>
      ) : null}

      <section className="profile-menu-card" aria-label="마이페이지 메뉴">
        {[
          { label: "알림 설정", value: "새 매물 · 답변 알림", Icon: Bell, action: onOpenNotifications },
          { label: "검색 조건 관리", value: "예산, 지역, 옵션", Icon: SlidersHorizontal, action: onOpenFilter },
          {
            label: "최근 본 방",
            value: latestViewed ? `${latestViewed.title} 다시 보기` : "방 둘러보러 가기",
            Icon: MapPinned,
            action: () => (latestViewed ? onOpenListing(latestViewed) : onGoHome())
          }
        ].map((item) => {
          const MenuIcon = item.Icon;

          return (
            <button type="button" key={item.label} onClick={item.action}>
              <span aria-hidden="true">
                <MenuIcon size={18} strokeWidth={2.4} />
              </span>
              <strong>{item.label}</strong>
              <small>{item.value}</small>
            </button>
          );
        })}
      </section>

      <PwaInstallCard />
    </section>
  );
}

function PwaInstallCard() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installState, setInstallState] = useState("설치 가능 확인 중");
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setInstallState("설치 가능");
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setInstallState("설치 완료");
    };
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const installApp = async () => {
    if (!installPrompt) {
      setInstallState("브라우저 메뉴에서 홈 화면에 추가");
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setInstallState(choice.outcome === "accepted" ? "설치 완료" : "나중에 설치");
  };

  return (
    <section className="pwa-install-card" aria-label="앱 설치">
      <div>
        <span>앱 설치</span>
        <h2>집우집주를 앱처럼 빠르게 열기</h2>
        <p>홈 화면에 추가하면 최근 본 방과 문의 흐름을 더 빠르게 다시 열 수 있습니다.</p>
      </div>
      <div className="pwa-status-grid" aria-label="앱 설치 상태">
        <span>
          <b>설치</b>
          {installState}
        </span>
        <span>
          <b>네트워크</b>
          {isOnline ? "온라인" : "오프라인"}
        </span>
        <span>
          <b>캐시</b>
          재방문 준비
        </span>
      </div>
      <button type="button" onClick={installApp}>
        앱 설치
      </button>
    </section>
  );
}
