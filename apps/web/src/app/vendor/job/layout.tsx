import Link from "next/link";
import type { ReactNode } from "react";
import { PhoneFrame } from "@roomlog/ui";
import { requireUser } from "@/lib/session";

// 인증 쿠키를 읽는 서버 컴포넌트라 정적 프리렌더 제외.
export const dynamic = "force-dynamic";

export default async function VendorLayout({ children }: { children: ReactNode }) {
  // [레퍼런스 가드] 수리업체(VENDOR) 전용.
  await requireUser("/vendor/login", "VENDOR");
  return (
    <PhoneFrame
      label={
        <>
          <Link href="/shell" style={{ color: "var(--primary)", textDecoration: "none" }}>
            ← 셸 인덱스
          </Link>
          <span>V-JOB 수리업체 · 390×844</span>
        </>
      }
    >
      {children}
    </PhoneFrame>
  );
}
