import type { ReactNode } from "react";
import { PhoneFrame } from "@roomlog/ui";

// 계약(T-DOC) 슬라이스 공용 폰 크롬. @roomlog/ui PhoneFrame(390×844)이 테두리를 제공하고,
// 각 화면 page.tsx는 프레임 "내부 콘텐츠"(헤더/본문/푸터)만 렌더한다. (하자 layout과 동일 레시피)
export default function ContractLayout({ children }: { children: ReactNode }) {
  return (
    <PhoneFrame
      label={<span>사는 집 · 계약서</span>}
    >
      {children}
    </PhoneFrame>
  );
}
