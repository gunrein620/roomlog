import { ROUTES, type Route } from "./nav";

/**
 * 와이어프레임 프레임 안의 클릭요소(원본 onClick="{{ handler }}")를 라우트로 해석한다.
 * 대조 소스: nav-manifest.md (화면×클릭요소×목적지 전수표).
 *
 * - navXX / navE0 : 직접 네비게이션 → 해당 화면 라우트
 * - 의미 핸들러(retakeReanalyze·e0Retake·addInfoSubmit·photoBack·photoPrimary) : manifest 목적지
 * - set* / toggle* / inScreen / *Blocked : in-screen·데모 컨트롤 → 라우팅 없음(null)
 *
 * photoPrimary는 동일 핸들러가 두 버튼(분석 요청→03 / 추가 정보 제출→11)에 쓰여
 * 버튼 텍스트로 목적지를 구분한다.
 */

const R = (suffix: string): Route =>
  ROUTES[`T-DEF-${suffix}` as keyof typeof ROUTES];

export function resolveRoute(handler: string, text: string): Route | null {
  const navMatch = handler.match(/^nav(0[0-9]|1[01]|E0)$/i);
  if (navMatch) return R(navMatch[1].toUpperCase());

  switch (handler) {
    case "retakeReanalyze": // T-DEF-04 재촬영 후 재분석
    case "e0Retake": // T-DEF-E0 사진 다시 첨부
    case "addInfoSubmit": // T-DEF-09/11 추가 정보 제출
      return R("02");
    case "photoBack":
      // T-DEF-02 뒤로: 신규=01 / 추가정보·재촬영=11. 셸은 모드 미추적 → 신규 기준.
      return R("01");
    case "photoPrimary":
      return text.includes("추가 정보") ? R("11") : R("03");
    default:
      return null;
  }
}

/** 프레임 HTML의 inert한 onClick 핸들러를 data-nav로 치환(원본 소스는 불변). */
export function markNav(html: string): string {
  return html.replace(
    /onClick="\{\{\s*([a-zA-Z0-9]+)\s*\}\}"/g,
    'data-nav="$1"',
  );
}
