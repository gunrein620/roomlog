import Link from "next/link";
import type { ReactNode } from "react";
import { PhoneFrame } from "@roomlog/ui";

// 입주기록 슬라이스 공용 폰 크롬. @roomlog/ui PhoneFrame(390×844)이 테두리를 제공하고,
// 각 화면 page.tsx는 프레임 "내부 콘텐츠"(헤더/본문/푸터)만 렌더한다.
export default function MoveinLayout({ children }: { children: ReactNode }) {
  return (
    <PhoneFrame
      label={
        <>
          <Link
            href="/shell"
            style={{ color: "var(--primary)", textDecoration: "none" }}
          >
            ← 셸 인덱스
          </Link>
          <span>T-IN 입주기록 · 임차인 · 390×844</span>
        </>
      }
    >
      {children}
    </PhoneFrame>
  );
}
