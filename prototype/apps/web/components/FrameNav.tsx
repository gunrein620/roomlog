"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/lib/nav";
import { markNav, resolveRoute } from "@/lib/frameNav";

/**
 * 프레임 HTML을 렌더하고, 안의 클릭요소(data-nav)를 이벤트 위임으로 라우팅한다.
 * 와이어 HTML은 그대로 두되, inert한 onClick만 data-nav로 치환해 콘솔 에러를 막는다.
 */
export default function FrameNav({ html }: { html: string }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const marked = useMemo(() => markNav(html), [html]);

  // 클릭투어가 매끄럽도록 모든 T-DEF 라우트를 미리 prefetch.
  useEffect(() => {
    Object.values(ROUTES).forEach((r) => router.prefetch(r));
  }, [router]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    let el = e.target as HTMLElement | null;
    while (el && el !== ref.current) {
      const handler = el.getAttribute("data-nav");
      if (handler) {
        const route = resolveRoute(handler, el.textContent ?? "");
        if (route) {
          e.preventDefault();
          router.push(route);
        }
        return; // data-nav 요소를 찾았으면 여기서 멈춘다(라우트 유무와 무관).
      }
      el = el.parentElement;
    }
  }

  return (
    <div
      ref={ref}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: marked }}
    />
  );
}
