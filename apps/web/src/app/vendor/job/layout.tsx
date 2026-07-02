import Link from "next/link";
import type { ReactNode } from "react";
import { PhoneFrame } from "@roomlog/ui";

export default function VendorLayout({ children }: { children: ReactNode }) {
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
