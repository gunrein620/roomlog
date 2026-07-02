import Link from "next/link";
import type { ReactNode } from "react";
import { PhoneFrame } from "@roomlog/ui";

// 커뮤니케이션 슬라이스 공용 폰 크롬. 각 page.tsx는 프레임 내부 콘텐츠만 렌더한다.
export default function MessagingLayout({ children }: { children: ReactNode }) {
  return (
    <PhoneFrame
      label={
        <>
          <Link href="/" style={{ color: "var(--primary)", textDecoration: "none" }}>
            ← 셸 인덱스
          </Link>
          <span>T-MSG 커뮤니케이션 · 임차인 · 390×844</span>
        </>
      }
    >
      {children}
    </PhoneFrame>
  );
}
