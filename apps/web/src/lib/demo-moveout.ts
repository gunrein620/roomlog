import type {
  MoveoutSummary,
  MoveoutRecordItem,
  MoveoutChecklistItem,
  SettlementEstimate,
  Dispute,
} from "@roomlog/types";

// 퇴실(T-OUT) 슬라이스 데모 시드 — api(인메모리 리포)와 동일한 값으로 맞춘다.
// 화면이 api 없이도 렌더되도록 프론트 폴백으로도 쓰인다.
// 원칙: 예상 반환액 = 범위(단일 숫자 금지) · 훼손 추정 = 가능성만 · 이의 = 양방향 enum + SLA.
// 기준일(데모): 2026-07-01, 계약 종료 2026-07-31 → D-30.

export const DEMO_MOVEOUT: MoveoutSummary = {
  id: "mo_0001",
  unitId: "302",
  contractConfirmed: true, // 계약 확정 → D-day·예상 정산 노출 (미확정이면 안내로 차단)
  leaseEndDate: "2026-07-31T00:00:00+09:00",
  daysRemaining: 30,
  depositAmount: 10_000_000, // 보증금 1,000만원(참고)
  estimatedRefundMin: 9_740_000, // 예상 반환액 범위 — 단일 숫자 금지
  estimatedRefundMax: 9_850_000,
  settlementStatus: "reviewing",
  prepProgress: 0.72,
  settlementId: "st_0001",
  createdAt: "2026-07-01T09:00:00+09:00",
  updatedAt: "2026-07-02T09:00:00+09:00",
};

// '내 기록' 타임라인 — 중립·안심 톤 먼저, 훼손 추정(wearVerdict)은 보조·비적대.
export const DEMO_MOVEOUT_RECORDS: MoveoutRecordItem[] = [
  {
    id: "rec_0001",
    summaryId: "mo_0001",
    source: "movein_photo",
    title: "입주 전 욕실 사진",
    description: "입주 시점 욕실 타일과 수전 사진이 있어 현재 상태와 비교할 수 있습니다.",
    occurredAt: "2024-08-01T10:10:00+09:00",
    evidenceUrls: ["/demo/moveout/bathroom-before.svg"],
    detailSections: [
      {
        label: "원천 기록",
        items: [
          { label: "촬영 시점", value: "2024-08-01 입주 체크 중 촬영" },
          { label: "연결 근거", value: "욕실 타일과 수전 기준 사진 1건" },
        ],
      },
      {
        label: "정산 영향",
        items: [
          { label: "역할", value: "현재 상태와 비교하는 기준 근거입니다." },
          { label: "차감 여부", value: "이 기록 자체는 차감 후보가 아닙니다." },
        ],
      },
      {
        label: "다음 행동",
        items: [
          { label: "관리인", value: "퇴실 사진과 나란히 비교해 추가 확인이 필요한지 봅니다." },
          { label: "임차인", value: "사진 설명이 다르면 이의·정정에서 보충할 수 있습니다." },
        ],
      },
    ],
    detail: {
      summary: "입주 시 촬영한 욕실 기준 사진입니다. 현재 퇴실 사진과 비교할 때 기준점으로만 사용합니다.",
      media: [
        {
          kind: "photo",
          label: "입주 전 욕실 기준 사진",
          url: "/demo/moveout/bathroom-before.svg",
          caption: "수전과 타일 상태가 보이는 입주 전 사진입니다.",
          capturedAt: "2024-08-01T10:10:00+09:00",
        },
      ],
      events: [
        {
          label: "입주 체크 사진 등록",
          at: "2024-08-01T10:10:00+09:00",
          status: "보관",
          note: "임차인과 관리인이 같은 기준 사진을 봅니다.",
        },
      ],
    },
    moveinComparisonAvailable: true,
  },
  {
    id: "rec_0002",
    summaryId: "mo_0001",
    source: "defect",
    title: "현관 센서등 깜빡임",
    description: "입주 중 접수된 공용 설비 문의이며 수리 완료 이력이 연결되어 있습니다.",
    occurredAt: "2026-02-11T14:20:00+09:00",
    wearVerdict: "aging_likely",
    wearNote: "소모품 노후 가능성이 높아 임차인 책임으로 단정하지 않습니다.",
    detailSections: [
      {
        label: "원천 기록",
        items: [
          { label: "접수 유형", value: "하자 문의 · 현관 센서등 깜빡임" },
          { label: "처리 상태", value: "소모품 점검 후 수리 완료 이력과 연결" },
        ],
      },
      {
        label: "정산 영향",
        items: [
          { label: "판정", value: "노후·마모 가능성이 높아 임차인 책임으로 단정하지 않습니다." },
          { label: "차감 후보", value: "현재 예상 정산안 차감 후보에는 포함하지 않았습니다." },
        ],
      },
      {
        label: "다음 행동",
        items: [
          { label: "관리인", value: "소모품 교체 내역을 확인하고 필요 시 근거를 보강합니다." },
          { label: "임차인", value: "수리 이후 같은 증상이 반복됐는지 메모를 남길 수 있습니다." },
        ],
      },
    ],
    detail: {
      summary: "입주 중 접수된 하자 문의와 처리 이력을 묶은 항목입니다.",
      events: [
        {
          label: "하자 문의 접수",
          at: "2026-02-11T14:20:00+09:00",
          status: "접수",
          note: "현관 센서등이 간헐적으로 깜빡인다는 문의가 접수되었습니다.",
        },
        {
          label: "소모품 점검",
          at: "2026-02-12T11:00:00+09:00",
          status: "노후 가능",
          note: "입주 중 사용 훼손으로 단정하지 않고 소모품 노후로 분류했습니다.",
        },
        {
          label: "처리 완료",
          at: "2026-02-13T16:30:00+09:00",
          status: "완료",
          note: "수리 완료 이력과 연결되어 차감 후보에서 제외했습니다.",
        },
      ],
    },
    moveinComparisonAvailable: false,
  },
  {
    id: "rec_0003",
    summaryId: "mo_0001",
    source: "repair",
    title: "욕실 실리콘 보수",
    description: "보수 완료 후 사진이 첨부되어 있어 차감 후보 산정 근거로만 사용됩니다.",
    occurredAt: "2026-05-12T16:00:00+09:00",
    wearVerdict: "unclear",
    wearNote: "노후와 사용 중 훼손 가능성이 함께 있어 관리인 확인이 필요합니다.",
    evidenceUrls: ["/demo/moveout/bathroom-repair-after.svg"],
    detailSections: [
      {
        label: "원천 기록",
        items: [
          { label: "작업 이력", value: "2026-05-12 욕실 실리콘 보수 완료" },
          { label: "첨부", value: "보수 완료 사진 1건과 입주 전 욕실 사진을 함께 비교" },
        ],
      },
      {
        label: "정산 영향",
        items: [
          { label: "예상 후보", value: "욕실 실리콘 보수 후보 30,000~80,000원" },
          { label: "주의", value: "관리인 검토 전 참고자료이며 최종 차감 확정 아님" },
        ],
      },
      {
        label: "다음 행동",
        items: [
          { label: "관리인", value: "노후와 사용 중 훼손 가능성을 분리해 triage 근거를 남깁니다." },
          { label: "임차인", value: "입주 전부터 있던 변색이면 이의·정정으로 설명을 보탭니다." },
        ],
      },
    ],
    detail: {
      summary: "욕실 실리콘 보수 전후 근거와 예상 정산 후보 연결을 함께 봅니다.",
      media: [
        {
          kind: "photo",
          label: "입주 전 욕실 기준 사진",
          url: "/demo/moveout/bathroom-before.svg",
          caption: "보수 후보 판정 시 기준으로 함께 비교합니다.",
          capturedAt: "2024-08-01T10:10:00+09:00",
        },
        {
          kind: "photo",
          label: "보수 완료 사진",
          url: "/demo/moveout/bathroom-repair-after.svg",
          caption: "2026년 보수 완료 후 첨부된 사진입니다.",
          capturedAt: "2026-05-12T16:00:00+09:00",
        },
      ],
      events: [
        {
          label: "보수 요청 확인",
          at: "2026-05-11T09:20:00+09:00",
          status: "확인",
          note: "노후와 사용 중 훼손 가능성을 분리해 확인하기로 했습니다.",
        },
        {
          label: "보수 완료",
          at: "2026-05-12T16:00:00+09:00",
          status: "완료",
          note: "완료 사진이 첨부되어 예상 정산 후보 근거로만 연결했습니다.",
        },
      ],
      amounts: [
        {
          label: "욕실 실리콘 보수 후보",
          min: 30_000,
          max: 80_000,
          status: "예상",
          note: "관리인 검토 전 참고 범위이며 최종 차감 확정이 아닙니다.",
        },
      ],
    },
    moveinComparisonAvailable: true,
  },
  {
    id: "rec_0004",
    summaryId: "mo_0001",
    source: "payment",
    title: "7월 관리비 정산",
    description: "관리비 일부 미납 후보가 예상 정산안에 반영되었습니다.",
    occurredAt: "2026-07-01T09:00:00+09:00",
    detailSections: [
      {
        label: "원천 기록",
        items: [
          { label: "청구 월", value: "2026년 7월 관리비" },
          { label: "연결 상태", value: "납부 확인 전 잔액 후보로 표시" },
        ],
      },
      {
        label: "정산 영향",
        items: [
          { label: "예상 후보", value: "7월 관리비 미납 후보 70,000원" },
          { label: "주의", value: "입금 확인 또는 orphan 해소 전 확정 수납액으로 보지 않습니다." },
        ],
      },
      {
        label: "다음 행동",
        items: [
          { label: "관리인", value: "입금 확인중·미연결 입금이 있는지 먼저 확인합니다." },
          { label: "임차인", value: "입금했다면 납부 확인 요청에서 증빙을 올릴 수 있습니다." },
        ],
      },
    ],
    detail: {
      summary: "7월 관리비 청구와 납부 확인 전 잔액 후보를 보여줍니다.",
      events: [
        {
          label: "관리비 청구 생성",
          at: "2026-07-01T09:00:00+09:00",
          status: "청구",
          note: "퇴실 월 관리비가 예상 정산안에 참고 후보로 연결되었습니다.",
        },
        {
          label: "입금 확인 대기",
          at: "2026-07-01T18:00:00+09:00",
          status: "확인 전",
          note: "입금 확인 또는 미연결 입금 해소 전 확정 수납액으로 보지 않습니다.",
        },
      ],
      amounts: [
        {
          label: "7월 관리비 미납 후보",
          amount: 70_000,
          status: "확인 전",
          note: "입금 확인 전 예상 정산안에만 반영된 후보입니다.",
        },
      ],
    },
    moveinComparisonAvailable: false,
  },
  {
    id: "rec_0005",
    summaryId: "mo_0001",
    source: "contract",
    title: "원상복구 특약",
    description: "계약서 원상복구 조항은 참고 근거이며 최종 차감 확정이 아닙니다.",
    occurredAt: "2024-08-01T10:00:00+09:00",
    detailSections: [
      {
        label: "원천 기록",
        items: [
          { label: "문서", value: "302호 계약서 원상복구·청소 조항" },
          { label: "확정 상태", value: "계약 확정값 기준으로만 정산 후보에 연결" },
        ],
      },
      {
        label: "정산 영향",
        items: [
          { label: "적용 범위", value: "붙박이장 손잡이 원상복구와 퇴실 청소 후보의 참고 근거" },
          { label: "주의", value: "조항 존재만으로 차감 확정하지 않습니다." },
        ],
      },
      {
        label: "다음 행동",
        items: [
          { label: "관리인", value: "실제 상태 확인과 항목별 근거를 함께 남깁니다." },
          { label: "임차인", value: "계약 조항 해석이 다르면 정정 요청을 남길 수 있습니다." },
        ],
      },
    ],
    detail: {
      summary: "계약서 원상복구·청소 조항의 원문 성격과 정산 연결 범위를 보여줍니다.",
      clauses: [
        {
          title: "원상복구 특약",
          body: "임차인은 고의 또는 과실로 훼손한 시설을 원상복구하되, 통상 사용에 따른 노후·마모는 제외합니다.",
          note: "조항 존재만으로 차감 확정하지 않고 실제 상태 근거와 함께 검토합니다.",
        },
        {
          title: "퇴실 청소 조항",
          body: "퇴실 시 기본 청소 상태를 확인하고 별도 오염이 확인되는 경우에만 비용 후보로 검토합니다.",
          note: "예상 정산안의 청소 후보는 참고 범위입니다.",
        },
      ],
      amounts: [
        {
          label: "붙박이장 손잡이 원상복구 후보",
          min: 30_000,
          max: 70_000,
          status: "예상",
          note: "체크리스트 상태와 함께 볼 때만 후보로 유지합니다.",
        },
      ],
    },
    moveinComparisonAvailable: false,
  },
  {
    id: "rec_0006",
    summaryId: "mo_0001",
    source: "chat",
    title: "퇴실 일정 문의",
    description: "임차인이 퇴실 일정과 정산 예상 범위 안내를 요청했습니다.",
    occurredAt: "2026-06-30T13:30:00+09:00",
    detailSections: [
      {
        label: "원천 기록",
        items: [
          { label: "대화 유형", value: "퇴실 일정과 예상 정산 범위 문의" },
          { label: "연결 채널", value: "임차인-관리인 공식 문의 스레드" },
        ],
      },
      {
        label: "정산 영향",
        items: [
          { label: "역할", value: "정산 금액 근거가 아니라 안내 이력입니다." },
          { label: "주의", value: "대화 내용만으로 차감 후보를 확정하지 않습니다." },
        ],
      },
      {
        label: "다음 행동",
        items: [
          { label: "관리인", value: "정산안 변경 시 같은 채널로 근거와 함께 안내합니다." },
          { label: "임차인", value: "추가 질문은 관리자 문의로 이어서 남길 수 있습니다." },
        ],
      },
    ],
    detail: {
      summary: "공식 문의 스레드에 남은 퇴실 일정과 예상 정산 범위 안내입니다.",
      chatMessages: [
        {
          sender: "tenant",
          senderLabel: "임차인",
          body: "퇴실 일정이 7월 말인데 정산 예상 범위를 먼저 확인할 수 있을까요?",
          at: "2026-06-30T13:30:00+09:00",
        },
        {
          sender: "manager",
          senderLabel: "관리인",
          body: "현재는 참고용 예상안만 가능하고 최종 정산은 퇴실 확인 후 확정됩니다.",
          at: "2026-06-30T13:42:00+09:00",
        },
        {
          sender: "tenant",
          senderLabel: "임차인",
          body: "입주 전 사진과 비교되는 항목은 따로 확인하겠습니다.",
          at: "2026-06-30T13:45:00+09:00",
        },
      ],
    },
    moveinComparisonAvailable: false,
  },
];

// 퇴실 체크리스트 — 호실 옵션 인벤토리(M-DOC-03) 기반. 노후/마모 vs 훼손 구분.
export const DEMO_MOVEOUT_CHECKLIST: MoveoutChecklistItem[] = [
  { id: "ck_0001", summaryId: "mo_0001", label: "현관 카드키 2개", present: true, condition: "normal", note: "반납 예정" },
  { id: "ck_0002", summaryId: "mo_0001", label: "에어컨 리모컨", present: true, condition: "normal" },
  { id: "ck_0003", summaryId: "mo_0001", label: "욕실 환풍기", present: true, condition: "aging", note: "소음이 있으나 노후로 보입니다." },
  { id: "ck_0004", summaryId: "mo_0001", label: "붙박이장 손잡이", present: true, condition: "damage_check", note: "헐거움 확인 필요" },
  {
    id: "ck_0005",
    summaryId: "mo_0001",
    label: "우편함 열쇠",
    present: false,
    condition: "damage_check",
    note: "분실 여부 확인 중",
  },
];

// 예상 정산 안내 — 참고 전용. 예상 반환액 = 범위. 보증금 1,000만 − 차감 후보 합.
export const DEMO_MOVEOUT_SETTLEMENT: SettlementEstimate = {
  id: "st_0001",
  summaryId: "mo_0001",
  depositAmount: 10_000_000,
  deductions: [
    {
      id: "de_0001",
      kind: "unpaid",
      label: "7월 관리비 미납 후보",
      estimatedMin: 70_000,
      estimatedMax: 70_000,
      needsConfirmation: false,
      evidenceNote: "납부 내역 기준 7월 관리비 잔액 후보입니다.",
      source: "payment",
    },
    {
      id: "de_0002",
      kind: "repair",
      label: "욕실 실리콘 보수 후보",
      estimatedMin: 30_000,
      estimatedMax: 80_000,
      needsConfirmation: false,
      evidenceNote: "입주 전 사진과 2026년 보수 이력을 함께 비교합니다.",
      source: "repair",
    },
    {
      id: "de_0003",
      kind: "restoration",
      label: "붙박이장 손잡이 원상복구 후보",
      estimatedMin: 30_000,
      estimatedMax: 70_000,
      needsConfirmation: false,
      evidenceNote: "체크리스트 손잡이 헐거움과 계약서 원상복구 조항을 참고합니다.",
      source: "contract",
    },
    {
      id: "de_0004",
      kind: "cleaning",
      label: "퇴실 기본 청소 후보",
      estimatedMin: 20_000,
      estimatedMax: 40_000,
      needsConfirmation: false,
      evidenceNote: "퇴실 청소 조항 기준 예상 후보이며 실제 상태 확인 전 확정하지 않습니다.",
      source: "contract",
    },
  ],
  refundMin: 9_740_000, // 보증금 − 차감 최대 합
  refundMax: 9_850_000, // 보증금 − 차감 최소 합
  status: "reviewing",
  disclaimer: "참고자료이며 최종 정산은 관리자 확인 후 확정됩니다.",
  createdAt: "2026-07-01T09:00:00+09:00",
};

// 이의·정정 요청 — 양방향 상태머신 + 무응답 SLA·에스컬레이션 출구.
export const DEMO_MOVEOUT_DISPUTES: Dispute[] = [
  {
    id: "dp_0001",
    summaryId: "mo_0001",
    targetItemId: "de_0002",
    targetLabel: "욕실 실리콘 보수 후보",
    reason: "입주 전부터 있던 변색이라 차감 대상이 아니라고 봅니다.",
    status: "received",
    slaDeadline: "2026-07-01T09:00:00+09:00",
    slaBreached: true,
    history: [
      { status: "received", at: "2026-06-28T09:00:00+09:00", note: "입주 전부터 있던 변색입니다." },
    ],
    createdAt: "2026-06-28T09:00:00+09:00",
    updatedAt: "2026-06-28T09:00:00+09:00",
  },
];

/** 현재 데모 퇴실 요약 id (셸 슬라이스는 단일 흐름) */
export const DEMO_MOVEOUT_ID = DEMO_MOVEOUT.id;
