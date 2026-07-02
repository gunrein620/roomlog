import type {
  ChatMessage,
  FaqQuestion,
  Report,
  ReportDelivery,
  ReportRecipient,
} from "@roomlog/types";

// 관리인 리포트 슬라이스 데모 시드 — api(인메모리 리포)와 동일한 값으로 맞춘다(단일 소스).
// 화면이 api 없이도 렌더되도록 프론트 폴백으로도 쓰인다.
// 원칙 반영:
//  - D24: 리포트=임대인 보고 중심(recipient·status=delivered). 챗봇 draft=초안 제안뿐(발송 아님).
//  - D25: 섹션당 출처 1개·고지 1회(disclaimer)·드릴다운=원천 행(drilldownScreenId)·기준시점(snapshotAt).
//  - KPI 산식 범위 정직: 납부(billing)만 M-BILL 단일 산식, 그 외는 각 원천(complaint/cost/unit/metric).

export const DEMO_RECIPIENTS: ReportRecipient[] = [
  { id: "rcp_0001", name: "연남 스테이 임대인 (박○○)", role: "landlord", delivery: "external" },
  { id: "rcp_0002", name: "성수 리버뷰 임대인 (이○○)", role: "landlord", delivery: "account" },
];

export const DEMO_REPORTS: Report[] = [
  // 임대인 전달됨 — 2026년 6월 월간 종합 (연남 스테이)
  {
    id: "rpt_0001",
    period: "month",
    periodLabel: "2026년 6월",
    periodStart: "2026-06-01T00:00:00+09:00",
    periodEnd: "2026-06-30T23:59:59+09:00",
    scope: { buildingId: "bld_yeonnam", buildingName: "연남 스테이" },
    status: "delivered",
    snapshotAt: "2026-07-01T09:00:00+09:00",
    recipient: DEMO_RECIPIENTS[0],
    disclaimer: "AI 정리 스냅샷입니다 — 2026-07-01 09:00 시점 원본 기준. 발송·독촉은 원본 대조 후 진행됩니다.",
    summary:
      "6월 연남 스테이 수납률 92%(12건 중 3세대 미납), 민원 8건 중 7건 처리(처리율 88%), 지출 61.8만원. 미납 3세대와 장기 연체 1세대(302호, 34일)에 대한 후속 조치가 필요합니다.",
    nextActions: [
      {
        label: "미납 3세대 독촉 초안 검토 (302·507·1103호)",
        actionType: "dunning",
        targetScreenId: "M-BILL-05",
        payload: {
          unitIds: ["302", "507", "1103"],
          billIds: ["bill_0602_302", "bill_0602_507", "bill_0602_1103"],
          periodLabel: "2026년 6월",
          note: "발송 전 M-BILL-05에서 대상·기간·금액 원본 대조",
        },
      },
      {
        label: "정화조 청소 일정 공지 초안 (전 세대)",
        actionType: "notice",
        targetScreenId: "M-MSG-00",
        payload: { periodLabel: "2026년 7월", note: "공용 정화조 청소 사전 안내" },
      },
    ],
    sections: [
      {
        key: "billing",
        title: "납부 현황",
        summary: "청구 12건 중 실수납 9건 · 미납 3세대 · 수납률 92% · 미납 합계 246만원.",
        source: {
          kind: "billing",
          label: "M-BILL 연체 원장",
          drilldownScreenId: "M-BILL-04",
          basis: "6월 청구 12건 중 미납 3건 원장 (302·507·1103호)",
        },
        kpis: [
          { label: "수납률", value: "92%", formulaSource: "billing" },
          { label: "미납 세대", value: "3세대", formulaSource: "billing" },
          { label: "미납 합계", value: "2,460,000원", formulaSource: "billing" },
        ],
      },
      {
        key: "complaint",
        title: "민원·처리",
        summary: "접수 8건 중 처리 7건(처리율 88%) · 미해결 1건(공용 도어락).",
        source: {
          kind: "complaint",
          label: "M-DASH 민원 대시보드",
          drilldownScreenId: "M-DASH-00",
          basis: "6월 민원 8건 접수·7건 완료 기록",
        },
        kpis: [
          { label: "처리율", value: "88%", formulaSource: "complaint" },
          { label: "미해결", value: "1건", formulaSource: "complaint" },
        ],
      },
      {
        key: "cost",
        title: "지출·수리비",
        summary: "6월 확정 지출 61.8만원 · 수리비 48만원(배수관·방수) · 관리비 정산 13.8만원.",
        source: {
          kind: "cost",
          label: "M-COST 비용 원장",
          drilldownScreenId: "M-COST-03",
          basis: "6월 confirmed 비용 원장 (void·draft 제외)",
        },
        kpis: [
          { label: "총 지출", value: "618,000원", formulaSource: "cost" },
          { label: "수리비", value: "480,000원", formulaSource: "cost" },
        ],
      },
      {
        key: "unit",
        title: "호실·공실",
        summary: "총 12세대 중 입주 11 · 공실 1(804호, 7/15 입주 예정) · 공실률 8%.",
        source: {
          kind: "unit",
          label: "M-OUT 호실 원장",
          drilldownScreenId: "M-OUT-01",
          basis: "6월말 호실 원장 상태 (입주/공실)",
        },
        kpis: [{ label: "공실률", value: "8%", formulaSource: "unit" }],
      },
      {
        key: "metric",
        title: "실시간 지표 요약",
        summary: "임대 현황·차트 상세는 실시간 지표 리포트(M-HOME-02)에서 확인.",
        source: {
          kind: "metric",
          label: "M-HOME 실시간 지표",
          drilldownScreenId: "M-HOME-02",
          basis: "실시간 지표는 스냅샷이 아니라 M-HOME-02 실시간 탐색",
        },
      },
    ],
    createdAt: "2026-07-01T09:00:00+09:00",
    updatedAt: "2026-07-01T10:30:00+09:00",
    deliveredAt: "2026-07-01T10:30:00+09:00",
  },
  // 초안 — 2026년 2분기 분기 종합 (연남 스테이) · 아직 임대인 미전달
  {
    id: "rpt_0002",
    period: "quarter",
    periodLabel: "2026년 2분기",
    periodStart: "2026-04-01T00:00:00+09:00",
    periodEnd: "2026-06-30T23:59:59+09:00",
    scope: { buildingId: "bld_yeonnam", buildingName: "연남 스테이" },
    status: "draft",
    snapshotAt: "2026-07-02T08:00:00+09:00",
    disclaimer: "AI 정리 스냅샷입니다 — 2026-07-02 08:00 시점 원본 기준. 초안 상태이며 임대인 전달 전입니다.",
    summary:
      "2분기(4~6월) 평균 수납률 90%, 누적 지출 182만원, 민원 처리율 85%. 분기 리포트는 아직 초안이며 임대인 보고 전입니다.",
    nextActions: [
      {
        label: "분기 미납 누적 세대 독촉 초안",
        actionType: "dunning",
        targetScreenId: "M-BILL-05",
        payload: { unitIds: ["302"], periodLabel: "2026년 2분기", note: "장기 연체 대상 원본 대조" },
      },
    ],
    sections: [
      {
        key: "billing",
        title: "분기 납부 현황",
        summary: "4~6월 평균 수납률 90% · 분기 미납 누적 5건.",
        source: {
          kind: "billing",
          label: "M-BILL 연체 원장",
          drilldownScreenId: "M-BILL-04",
          basis: "2분기 월별 청구·수납 원장 집계",
        },
        kpis: [{ label: "평균 수납률", value: "90%", formulaSource: "billing" }],
      },
      {
        key: "cost",
        title: "분기 지출",
        summary: "누적 확정 지출 182만원 · 수리비 비중 62%.",
        source: {
          kind: "cost",
          label: "M-COST 비용 원장",
          drilldownScreenId: "M-COST-03",
          basis: "2분기 confirmed 비용 누적",
        },
        kpis: [{ label: "누적 지출", value: "1,820,000원", formulaSource: "cost" }],
      },
    ],
    createdAt: "2026-07-02T08:00:00+09:00",
    updatedAt: "2026-07-02T08:00:00+09:00",
  },
];

// 챗봇 대화 (M-RPT-04) — 재진술·출처·드릴다운·'모름 정직'·초안 제안·기준시점(실시간/저장) 각 사례.
export const DEMO_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: "msg_0001",
    role: "user",
    text: "연남 스테이 6월 미납 세대 알려줘",
  },
  {
    id: "msg_0002",
    role: "assistant",
    text: "",
    answer: {
      id: "ans_0001",
      interpretedQuery: "연남 스테이 · 2026년 6월 · 미납 세대 조회 (금액성 → 실시간 M-BILL 기준)",
      basis: "realtime_billing",
      answer: "현재 미납은 3세대입니다 — 302호(연체 34일)·507호·1103호. 미납 합계 246만원.",
      kpis: [
        { label: "미납 세대", value: "3세대", formulaSource: "billing" },
        { label: "미납 합계", value: "2,460,000원", formulaSource: "billing" },
      ],
      sources: [
        {
          kind: "billing",
          label: "M-BILL 연체 원장",
          drilldownScreenId: "M-BILL-04",
          basis: "실시간 청구 원장 — 302·507·1103호 미납 행",
        },
      ],
      draft: {
        type: "dunning",
        targetScreenId: "M-BILL-05",
        payload: {
          unitIds: ["302", "507", "1103"],
          periodLabel: "2026년 6월",
          note: "독촉 초안 — 발송 전 M-BILL-05에서 원본 대조",
        },
      },
      createdAt: "2026-07-02T09:10:00+09:00",
    },
  },
  {
    id: "msg_0003",
    role: "user",
    text: "302호 6월 민원 몇 건이었어?",
  },
  {
    id: "msg_0004",
    role: "assistant",
    text: "",
    answer: {
      id: "ans_0002",
      interpretedQuery: "302호 · 2026년 6월 · 민원 건수 (비금전 → 저장 결과 기준)",
      disambiguation: "여러 건물에 302호가 있습니다 — 연남 스테이 302호로 조회했습니다.",
      basis: "stored_analysis",
      answer: "연남 스테이 302호는 6월 민원 2건(누수·소음), 모두 처리 완료되었습니다.",
      kpis: [{ label: "민원", value: "2건", formulaSource: "complaint" }],
      sources: [
        {
          kind: "complaint",
          label: "M-DASH 민원 대시보드",
          drilldownScreenId: "M-DASH-00",
          basis: "저장된 6월 민원 분류 결과 (302호 2건)",
        },
      ],
      createdAt: "2026-07-02T09:12:00+09:00",
    },
  },
  {
    id: "msg_0005",
    role: "user",
    text: "7월 전기요금 얼마 나올까?",
  },
  {
    id: "msg_0006",
    role: "assistant",
    text: "",
    answer: {
      id: "ans_0003",
      interpretedQuery: "2026년 7월 · 전기요금 예측",
      basis: "stored_analysis",
      answer: "",
      sources: [],
      unknownReason:
        "7월은 아직 확정 데이터가 없어 답할 수 없습니다. 미래 예측은 리포트 범위 밖입니다 — 확정된 과거 기간을 물어봐 주세요.",
      createdAt: "2026-07-02T09:15:00+09:00",
    },
  },
];

// FAQ 버튼 (M-RPT-05) — 어르신 오인식 방지로 음성보다 1급. 미납·민원·연체·수리비.
export const DEMO_FAQ: FaqQuestion[] = [
  { id: "faq_0001", label: "미납 호실", query: "이번 달 미납 호실 알려줘" },
  { id: "faq_0002", label: "오늘 민원", query: "오늘 들어온 민원 있어?" },
  { id: "faq_0003", label: "연체 30일↑", query: "30일 이상 연체된 세대 알려줘" },
  { id: "faq_0004", label: "이번 달 수리비", query: "이번 달 수리비 얼마 나갔어?" },
];

// 임대인 보고·내보내기 (M-RPT-03) — 외부 공유 마스킹 강제·감사 로그(D7).
export const DEMO_DELIVERY: ReportDelivery = {
  reportId: "rpt_0001",
  format: "link",
  masked: true, // 외부 공유 시 강제 — 임차인 실명·계좌·연락처 마스킹
  recipient: DEMO_RECIPIENTS[0],
  auditLog: [
    {
      action: "임대인 링크 전달",
      actor: "관리인 김병주",
      at: "2026-07-01T10:30:00+09:00",
      detail: "마스킹 적용 · 수신자 연남 스테이 임대인(박○○)",
    },
    {
      action: "PDF 내보내기",
      actor: "관리인 김병주",
      at: "2026-07-01T10:25:00+09:00",
      detail: "내부 보관용 · 마스킹 적용",
    },
  ],
};

// 데모 진입 앵커 — 목록 → 상세/보고 흐름 시작점.
export const DEMO_REPORT_ID = "rpt_0001";
export const DEMO_RECIPIENT_ID = "rcp_0001";
