/**
 * 룸로그 셸 — 임차인 납부(T-PAY) 화면ID → 라우트 매핑
 *
 * 컨벤션(하자 nav.ts와 동일): App Router, 화면ID 끝자리를 소문자로 세그먼트화.
 *   T-PAY-00 → /tenant/payment/00 ... T-PAY-03 → /tenant/payment/03
 *
 * 출처(단일 소스): roomlog_screens_payment.md §(3) 전이 테이블 (세트 A · 임차인 납부)
 *
 * 주의: 이 파일에 없는 화면ID로 라우팅하지 말 것. in-screen/system/cross 전이는
 * 여기 대상이 아님(같은 페이지 내 상태 변화·채팅 등 외부).
 */

export const PAYMENT_ROUTES = {
  "T-PAY-00": "/tenant/payment/00",
  "T-PAY-01": "/tenant/payment/01",
  "T-PAY-02": "/tenant/payment/02",
  "T-PAY-03": "/tenant/payment/03",
} as const;

export type PaymentScreenId = keyof typeof PAYMENT_ROUTES;
export type PaymentRoute = (typeof PAYMENT_ROUTES)[PaymentScreenId];

/** 화면ID로 라우트 문자열을 조회. 없는 ID를 넘기면 컴파일 타임에 막힘. */
export function paymentRouteFor(id: PaymentScreenId): PaymentRoute {
  return PAYMENT_ROUTES[id];
}
