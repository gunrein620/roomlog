import Link from "next/link";
import type { ReactNode } from "react";
import { PhoneFrame } from "@roomlog/ui";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// M-VOX(모바일 Voice 비서 홈) — 폰 크롬. 관리인 주력. 각 page는 내부 콘텐츠만.
export default async function ManagerVoxLayout({ children }: { children: ReactNode }) {
  await requireUser("LANDLORD");
  return (
    <PhoneFrame
      label={
        <>
          <Link href="/shell" style={{ color: "var(--primary)", textDecoration: "none" }}>
            ← 셸 인덱스
          </Link>
          <span>M-VOX 통화비서 · 관리인 · 390×844</span>
        </>
      }
    >
      {children}
    </PhoneFrame>
  );
}
