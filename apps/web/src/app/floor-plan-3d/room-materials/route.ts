import { ApiError, serverFetch } from "@/lib/server-api";

export const dynamic = "force-dynamic";

type RoomMaterialAnalysis = {
  status: "ready" | "config-required" | "failed";
  summary: string;
  rooms?: Array<{
    confidence: number;
    label: string;
    polygon: Array<{ x: number; y: number }>;
  }>;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { imageDataUrl?: unknown } | null;
  const imageDataUrl = typeof body?.imageDataUrl === "string" ? body.imageDataUrl.trim() : "";

  if (!imageDataUrl.startsWith("data:image/")) {
    return Response.json({ message: "A floor-plan image data URL is required." }, { status: 400 });
  }

  let result: RoomMaterialAnalysis;
  try {
    result = await serverFetch<RoomMaterialAnalysis>("/floor-plans/ai-analysis", {
      body: JSON.stringify({
        analysisMode: "room-structure",
        imageDataUrl,
        model: "openai/floor-plan-vision",
        prompt:
          "도면에 표시된 모든 실내 공간의 이름과 닫힌 polygon을 반환하세요. " +
          "침실, 거실, 주방/식당, 화장실, 다용도실, 현관, 발코니나 베란다를 망라하세요. " +
          "공간명이 없어도 주 출입문 위치, 현관문과 주방 싱크대 바닥 패턴을 근거로 공간 용도를 추정하세요. " +
          "특히 주 출입문 근처의 현관 polygon을 반환하되 불확실하면 confidence를 낮추세요. " +
          "가구와 치수선은 polygon에서 제외하고 실제 바닥 영역만 포함하세요.",
      }),
      method: "POST",
    });
  } catch (error) {
    if (error instanceof ApiError) {
      const message = error.status === 401
        ? "방별 바닥재를 만들려면 임대인 로그인이 필요합니다."
        : error.message;
      return Response.json({ message }, { status: error.status });
    }
    throw error;
  }

  return Response.json({
    rooms: result.rooms ?? [],
    status: result.status,
    summary: result.summary,
  });
}
