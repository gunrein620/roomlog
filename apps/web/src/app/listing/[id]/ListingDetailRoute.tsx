"use client";

// 상세 라우트의 클라이언트 배선 — 찜(localStorage 공유), 문의 전송, 라우터 네비게이션을
// ListingDetailView 프롭에 연결한다. SPA(page.tsx)와 동일한 저장 키·전송 로직을 쓴다.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ListingDetailView } from "@/app/_components/ListingDetailView";
import { demoListings, type Listing } from "@/lib/listing-catalog";
import { loadSavedListingNos, toggleSavedListingNo } from "@/lib/saved-listings";
import { submitTradeInquiry } from "@/lib/trade-inquiry";
import type { InquiryPayload } from "@/lib/inquiry-flow";

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

  const submitInquiry = async (payload: InquiryPayload, listingNo?: string): Promise<"ok" | "auth" | "error"> => {
    const result = await submitTradeInquiry(payload, listingNo);
    if (result.status === "ok" && result.threadId) {
      // 문의 성공 → 문의센터 채팅으로 바로 진입(당근식). SPA가 thread 파라미터로 대화를 연다.
      router.push(`/?tab=inquiry&thread=${encodeURIComponent(result.threadId)}`);
    }
    return result.status;
  };

  return (
    <ListingDetailView
      listing={listing}
      isSaved={savedListingNos.includes(listing.listingNo)}
      onBack={goBack}
      onToggleSaved={(listingNo) => setSavedListingNos((current) => toggleSavedListingNo(current, listingNo))}
      onSubmitInquiry={submitInquiry}
      onViewInquiryCenter={() => router.push("/?tab=inquiry")}
      onRequireLogin={() => router.push(`/login?redirectTo=${encodeURIComponent(`/listing/${listing.listingNo}`)}`)}
    />
  );
}
