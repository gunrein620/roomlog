"use client";

// Next 16에서 `ssr: false` 동적 로드는 클라이언트 컴포넌트 안에서만 허용된다.
// page.tsx(서버 컴포넌트)는 이 얇은 클라 경계를 렌더해 three.js SSR을 회피한다.

import dynamic from "next/dynamic";

const TourViewer = dynamic(() => import("./tour-viewer"), {
  ssr: false,
  loading: () => <p style={{ padding: 24, color: "var(--muted)" }}>불러오는 중…</p>
});

export default function TourViewerClient() {
  return <TourViewer />;
}
