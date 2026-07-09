"use client";

// 마이페이지 흐름 공용 — 저장된 검색 조건.
// (역할 전환용 MyFlowBar/myFlowItems는 상단 메뉴 탭 도입으로 제거됨.)

export const savedConditions = [
  { label: "방배동 월세 1000/130 이하", area: "서초구 방배동", category: "원룸", filters: ["월세", "풀옵션"] },
  { label: "내방역 도보 10분", area: "내방역 7호선", category: "오피스텔", filters: ["월세", "주차"] },
  { label: "풀옵션 · 주차 가능", area: "강남역 오피스텔", category: "오피스텔", filters: ["월세", "주차", "풀옵션"] }
];
