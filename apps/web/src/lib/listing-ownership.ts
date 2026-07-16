import { getUser } from "./session";

// 매물 소유자 판정 — 서버 전용(getUser가 next/headers 쿠키를 읽는다).
// 상세 화면의 "관리/수정" 버튼 노출 여부에 쓴다. ownerId는 직접등록(TRADE-) 매물에만 있고
// 데모 매물은 애초에 넘어오지 않으므로 여기서 걸러진다.
// 미인증/오류는 안전하게 false로 폴백한다 — 페이지를 죽이는 대신 그냥 미소유 취급.
export async function isListingOwner(ownerId: string | undefined): Promise<boolean> {
  if (!ownerId) return false;

  try {
    const user = await getUser();
    return user?.userId === ownerId;
  } catch {
    return false;
  }
}
