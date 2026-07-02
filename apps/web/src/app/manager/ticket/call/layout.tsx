import Link from "next/link";
import type { ReactNode } from "react";
import { PhoneFrame } from "@roomlog/ui";

export default function CallLayout({ children }: { children: ReactNode }) {
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
