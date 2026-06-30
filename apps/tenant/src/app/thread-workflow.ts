export type ThreadWorkflowBadgeTone = "neutral" | "priority" | "warning" | "info" | "ready";

export type ThreadWorkflowBadge = {
  label: string;
  tone: ThreadWorkflowBadgeTone;
};

export type ConsultationThreadFilter = "ACTIVE" | "READY" | "FINALIZED" | "ALL";

export type ConsultationThreadFilterOption = {
  value: ConsultationThreadFilter;
  label: string;
};

export type TenantThreadWorkflowSummary = {
  statusLabel: string;
  channelLabel: string;
  priority: 1 | 2 | 3 | 4;
  attachmentCount: number;
  collectedSlotCount: number;
  openSlotCount: number;
  requiredInfoCount: number;
  unresolvedQuestionCount: number;
  readyToFinalize: boolean;
};

const intakeSlotTotal = 6;

export const consultationThreadFilterOptions: ConsultationThreadFilterOption[] = [
  { value: "ACTIVE", label: "진행 중" },
  { value: "READY", label: "접수 가능" },
  { value: "FINALIZED", label: "접수 완료" },
  { value: "ALL", label: "전체" }
];

export function consultationThreadNextAction(summary: TenantThreadWorkflowSummary) {
  if (summary.statusLabel === "접수 완료") {
    return "접수 완료됨";
  }

  if (summary.statusLabel === "취소됨") {
    return "상담 취소됨";
  }

  if (summary.readyToFinalize) {
    return "초안 확인 후 접수 확정";
  }

  if (summary.unresolvedQuestionCount > 0) {
    return `AI 질문 ${summary.unresolvedQuestionCount}개에 답변`;
  }

  if (summary.requiredInfoCount > 0) {
    return `필수 정보 ${summary.requiredInfoCount}개 보완`;
  }

  if (summary.openSlotCount > 0) {
    return `추가 확인 ${summary.openSlotCount}개 보완`;
  }

  return "상담 이어가기";
}

export function consultationThreadBadges(summary: TenantThreadWorkflowSummary) {
  const badges: ThreadWorkflowBadge[] = [
    { label: summary.channelLabel, tone: "neutral" },
    { label: `P${summary.priority}`, tone: "priority" },
    {
      label: `정보 ${summary.collectedSlotCount}/${Math.max(
        intakeSlotTotal,
        summary.collectedSlotCount + summary.openSlotCount
      )}`,
      tone: "neutral"
    }
  ];

  if (summary.attachmentCount > 0) {
    badges.push({ label: `사진 ${summary.attachmentCount}`, tone: "info" });
  }

  if (summary.readyToFinalize) {
    badges.push({ label: "접수 가능", tone: "ready" });
    return badges;
  }

  if (summary.openSlotCount > 0) {
    badges.push({ label: `추가 확인 ${summary.openSlotCount}`, tone: "warning" });
  } else if (summary.requiredInfoCount > 0) {
    badges.push({ label: `필수 ${summary.requiredInfoCount}`, tone: "warning" });
  }

  if (summary.unresolvedQuestionCount > 0) {
    badges.push({ label: `AI 질문 ${summary.unresolvedQuestionCount}`, tone: "info" });
  }

  return badges;
}

export function consultationThreadMatchesFilter(
  summary: TenantThreadWorkflowSummary,
  filter: ConsultationThreadFilter
) {
  if (filter === "ALL") {
    return true;
  }

  if (filter === "FINALIZED") {
    return summary.statusLabel === "접수 완료";
  }

  if (filter === "READY") {
    return summary.statusLabel !== "접수 완료" && summary.readyToFinalize;
  }

  return (
    summary.statusLabel !== "접수 완료" &&
    summary.statusLabel !== "취소됨" &&
    !summary.readyToFinalize
  );
}

export function filterConsultationThreads<
  T extends { threadSummary: TenantThreadWorkflowSummary }
>(threads: T[], filter: ConsultationThreadFilter) {
  return threads.filter((thread) => consultationThreadMatchesFilter(thread.threadSummary, filter));
}

export function consultationThreadFilterCountLabel(
  filter: ConsultationThreadFilter,
  count: number
) {
  const option = consultationThreadFilterOptions.find((item) => item.value === filter);

  return `${option?.label ?? "상담"} ${count}`;
}
