// 룸로그 인증 쿠키 — 토큰 "보관 위치"만 담당 (백엔드 토큰 로직은 불변).
// httpOnly라 JS에서 못 읽음(XSS 방어). SameSite=Lax로 크로스사이트 POST 기본 차단(CSRF).
// 브라우저는 Next(3000)하고만 통신하므로 이 쿠키는 항상 first-party로 붙는다.
export const AUTH_COOKIE = "roomlog_token";

export const authCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7 // 7일
};
