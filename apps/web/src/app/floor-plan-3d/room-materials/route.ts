import { serverFetch } from "@/lib/server-api";

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

  const result = await serverFetch<RoomMaterialAnalysis>("/roomlog/floor-plans/ai-analysis", {
    body: JSON.stringify({
      analysisMode: "room-structure",
      imageDataUrl,
      model: "openai/floor-plan-vision",
      prompt:
        "도면에 표시된 모든 실내 공간의 이름과 대략적인 polygon을 반환하세요. " +
        "침실, 거실, 주방/식당, 욕실, 다용도실, 발코니를 빠뜨리지 마세요.",
    }),
    method: "POST",
  });

  return Response.json({
    rooms: result.rooms ?? [],
    status: result.status,
    summary: result.summary,
  });
}
