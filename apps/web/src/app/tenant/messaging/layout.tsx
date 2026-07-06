import type { ReactNode } from "react";
import { PhoneFrame } from "@roomlog/ui";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// 커뮤니케이션 슬라이스 공용 폰 크롬. 각 page.tsx는 프레임 내부 콘텐츠만 렌더한다.
export default async function MessagingLayout({ children }: { children: ReactNode }) {
  await requireUser("TENANT");
  return (
    <PhoneFrame
      label={<span>사는 집 · 메시지</span>}
    >
      {children}
    </PhoneFrame>
  );
}
