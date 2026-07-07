// three.js는 SSR 대상이 아니다 — 클라 전용 동적 로드(ssr:false)는 tour-viewer-client에서 처리한다.
// (레포의 서버/클라 경계 함정은 prototype/docs/DOMAIN-RECIPE.md '함정' 절 참고.)

import TourViewerClient from "./tour-viewer-client";
import TourTuningPanel from "./tour-tuning-panel";

type SplatTourPageProps = {
  searchParams?: Promise<{
    tune?: string | string[];
  }>;
};

export default async function SplatTourPage({ searchParams }: SplatTourPageProps) {
  const params = await searchParams;
  const tuneParam = params?.tune;
  const shouldRenderTuningPanel = Array.isArray(tuneParam) ? tuneParam.includes("1") : tuneParam === "1";

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
      {shouldRenderTuningPanel ? <TourTuningPanel /> : null}
    </main>
  );
}
