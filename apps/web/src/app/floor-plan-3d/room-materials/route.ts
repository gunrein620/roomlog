import { ApiError, serverFetch } from "@/lib/server-api";

export const dynamic = "force-dynamic";

type RoomMaterialAnalysis = {
  status: "ready" | "config-required" | "failed";
  summary: string;
  rooms?: Array<{
    confidence: number;
    label: string;
    polygon: Array<{ x: number; y: number }>;
    roomType?: string;
  }>;
};

const ROOM_MATERIAL_ANALYSIS_PROMPT = [
  "도면에 표시된 모든 실내 공간의 이름과 닫힌 polygon을 반환하세요.",
  "방 안과 도면 가장자리의 모든 글자를 회전 방향과 관계없이 빠짐없이 읽으세요.",
  "안방·침실·방=BEDROOM, 드레스룸·옷방=DRESS_ROOM, 거실=LIVING_ROOM, 주방·식당·부엌=KITCHEN_DINING, 욕실·화장실=BATHROOM, 다용도실·세탁실·보일러실·실외기실=LAUNDRY_UTILITY, 발코니·베란다=BALCONY, 현관=ENTRY로 분류하세요.",
  "변기·세면대·욕조·샤워부스가 있는 닫힌 공간은 BATHROOM으로 분류하세요.",
  "다용도실·세탁실·보일러실·실외기실 표기나 세탁기·보일러 설비가 있는 공간은 LAUNDRY_UTILITY로 분류하세요.",
  "글자가 없어도 타일 격자/해칭 패턴과 위생기구가 있으면 BATHROOM, 싱크대·조리대·가스레인지가 있으면 KITCHEN_DINING, 창문 라인 바깥쪽의 좁고 긴 공간이면 BALCONY, 침대 기호가 있는 닫힌 방은 BEDROOM으로 추정하세요.",
  "출입문 안쪽에 체크무늬 바닥이 보이면 ENTRY 후보로 보고, 체크무늬(격자/다이아몬드) 타일 패턴과 신발장 경계를 따라 세대 내부 현관 바닥만 반환하세요.",
  "세대 외부의 공용 복도, 계단실, 엘리베이터 홀은 현관 또는 실내 공간으로 반환하지 마세요. 현관은 주 출입문을 통과한 뒤 세대 내부에 있는 바닥 영역만 반환하세요.",
  "거실과 식당이 벽 없이 열린 하나의 공간이면 경계를 임의로 만들지 말고 하나의 결합 공간으로 반환하세요.",
  "각 바닥 영역은 하나의 공간에만 속하도록 polygon끼리 겹치지 마세요. 같은 열린 공간을 LIVING_ROOM과 KITCHEN_DINING으로 중복 반환하지 마세요.",
  "현관 polygon이 열린 거실 영역으로 확장되지 않도록 하고 연결된 열린 영역의 15% 이내로 제안하세요. 도면 치수를 확인할 수 있으면 현관 polygon을 6m² 이내로 제안하세요.",
  "명확한 글자 또는 강한 시각 단서가 있으면 confidence를 0.7 이상으로 제안하고, 글자도 패턴 단서도 없는 공간만 UNKNOWN으로 분류하세요.",
  "가구와 치수선·치수숫자는 polygon에서 제외하고 실제 바닥 영역만 포함하세요.",
].join(" ");

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
        prompt: ROOM_MATERIAL_ANALYSIS_PROMPT,
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
