import Link from "next/link";
import type { ReactNode } from "react";
import { PhoneFrame } from "@roomlog/ui";
import { requireUser } from "@/lib/session";

// M-CALL 화면도 ticket-manager-api(쿠키)를 읽으므로 요청마다 렌더(정적 프리렌더 제외).
export const dynamic = "force-dynamic";

export default async function CallLayout({ children }: { children: ReactNode }) {
  // dash와 동일하게 관리인(LANDLORD) 가드 — 미인증/타역할 접근 차단.
  await requireUser("LANDLORD");
  return (
    <PhoneFrame
      label={
        <>
          <Link href="/manager/ticket/dash/00" style={{ color: "var(--primary)", textDecoration: "none" }}>
            데스크탑에서 보기
          </Link>
          <span>M-CALL · 관리인 Voice · 390×844</span>
        </>
      }
    >
      {children}
    </PhoneFrame>
  );
}
