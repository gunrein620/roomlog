// three.js는 SSR 대상이 아니다 — 클라 전용 동적 로드(ssr:false)는 tour-viewer-client에서 처리한다.
// (레포의 서버/클라 경계 함정은 prototype/docs/DOMAIN-RECIPE.md '함정' 절 참고.)

import TourViewerClient from "./tour-viewer-client";

export default function SplatTourPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        padding: 24,
        background: "var(--canvas)",
        color: "var(--ink)"
      }}
    >
      <header style={{ marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: 1, color: "var(--blue)" }}>ROOMLOG 3D</p>
        <h1 style={{ margin: "4px 0 0", fontSize: 22 }}>원격 매물 3D 투어</h1>
      </header>
      <TourViewerClient />
    </main>
  );
}
