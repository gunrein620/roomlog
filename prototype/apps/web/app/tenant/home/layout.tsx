import Link from "next/link";
import type { ReactNode } from "react";
import { PhoneFrame } from "@roomlog/ui";

// 임차인 통합 홈·온보딩(T-HOME) 공용 폰 크롬. 하단 탭(홈·하자·납부·계약)은
// 화면 00 내부에서 렌더(온보딩 화면엔 탭 없음) — layout은 프레임만 제공.
export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <PhoneFrame
      label={
        <>
          <Link href="/" style={{ color: "var(--primary)", textDecoration: "none" }}>
            ← 셸 인덱스
          </Link>
          <span>T-HOME 통합 홈 · 임차인 · 390×844</span>
        </>
      }
    >
      {children}
    </PhoneFrame>
  );
}
