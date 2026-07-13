"use client";

// 상세 라우트의 클라이언트 배선 — 찜(localStorage 공유)과 라우터 네비게이션을 ListingDetailView에 연결한다.
// "문자로 문의하기"는 채팅 탭의 이 매물 대화(초안)로 바로 보낸다(compose 파라미터, 당근식).
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ListingDetailView } from "@/app/_components/ListingDetailView";
import { demoListings, type Listing } from "@/lib/listing-catalog";
import { loadSavedListingNos, toggleSavedListingNo } from "@/lib/saved-listings";

export function ListingDetailRoute({ listing }: { listing: Listing }) {
  const router = useRouter();
  const [savedListingNos, setSavedListingNos] = useState<string[]>([]);

  useEffect(() => {
    // 첫 방문 기본 찜(데모 2개)은 SPA와 동일한 규칙 — 저장된 값이 있으면 그것만 쓴다.
    setSavedListingNos(loadSavedListingNos([demoListings[0].listingNo, demoListings[2].listingNo]));
  }, []);

  const goBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  };

  // 폼 없이 채팅 탭으로 — 기존 대화가 있으면 열고, 없으면 빈 대화를 연다(첫 메시지에 스레드 생성).
  const startChat = () => {
    router.push(
      `/inquiry?compose=${encodeURIComponent(listing.listingNo)}&title=${encodeURIComponent(listing.title)}`
    );
  };

  return (
    <ListingDetailView
      listing={listing}
      isSaved={savedListingNos.includes(listing.listingNo)}
      onBack={goBack}
      onToggleSaved={(listingNo) => setSavedListingNos((current) => toggleSavedListingNo(current, listingNo))}
      onStartChat={startChat}
    />
  );
}
