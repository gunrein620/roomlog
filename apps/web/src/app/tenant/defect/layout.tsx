import Link from "next/link";
import type { ReactNode } from "react";
import { PhoneFrame } from "@roomlog/ui";
import { requireUser } from "@/lib/session";

// 인증 쿠키를 읽는 서버 컴포넌트라 정적 프리렌더 대상이 아니다(요청마다 렌더).
// 명시하지 않으면 빌드가 정적 프리렌더를 시도하다 cookies()에서 DynamicServerError를 던진다.
export const dynamic = "force-dynamic";

// 하자 슬라이스 공용 폰 크롬. @roomlog/ui PhoneFrame(390×844)이 테두리를 제공하고,
// 각 화면 page.tsx는 프레임 "내부 콘텐츠"(헤더/본문/푸터)만 렌더한다.
// [레퍼런스 가드] 이 async 레이아웃이 /tenant/defect/* 전체를 인증 게이팅한다.
// 미인증(쿠키 없음/만료)이면 requireUser가 /tenant/login으로 리다이렉트.
export default async function DefectLayout({ children }: { children: ReactNode }) {
  await requireUser("/tenant/login", "TENANT");
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
          <span>T-DEF 하자 · 임차인 · 390×844</span>
        </>
      }
    >
      {children}
    </PhoneFrame>
  );
}
