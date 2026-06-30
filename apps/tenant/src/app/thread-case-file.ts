import type { TenantIntakeSlot } from "./intake-slot-progress";

export type ThreadCaseFileTone = "neutral" | "priority" | "warning" | "info" | "ready";

export type ThreadCaseFileFact = {
  label: string;
  value: string;
  tone: ThreadCaseFileTone;
};

export type ThreadCaseFileSummary = {
  title: string;
  channelLabel: string;
  statusLabel: string;
  priority: 1 | 2 | 3 | 4;
  attachmentCount: number;
  collectedSlotCount: number;
  openSlotCount: number;
  unresolvedQuestionCount: number;
  readyToFinalize: boolean;
};

export type ThreadCaseFileInput = {
  summary?: ThreadCaseFileSummary;
  threadSummary?: ThreadCaseFileSummary;
  draft: {
    summary: string;
    category: string;
    detailCategory: string;
    priority: 1 | 2 | 3 | 4;
    responsibilityHint: string;
    recommendedAction: string;
    location?: string;
    availableTimes?: string;
    requiredInfo: string[];
    nextQuestions: string[];
    tenantGuidance: string[];
    photoRequested: boolean;
    photoAnalysis: {
      attachmentUrls: string[];
      previousAttachmentUrls: string[];
      comparisonStatus: string;
      summary: string;
      recommendedRetake: boolean;
    };
    intakeSlots: TenantIntakeSlot[];
  };
};

function slotValue(slots: TenantIntakeSlot[], key: string) {
  const slot = slots.find((item) => item.key === key && item.status === "COLLECTED");

  return slot?.value?.trim() || slot?.evidence?.trim() || "";
}

function threadSummary(input: ThreadCaseFileInput) {
  const summary = input.summary ?? input.threadSummary;

  if (!summary) {
    throw new Error("Thread case file requires a summary");
  }

  return summary;
}

function visitTimeNeedsInfo(input: ThreadCaseFileInput) {
  return (
    input.draft.requiredInfo.some((item) => /방문|시간/.test(item)) ||
    input.draft.intakeSlots.some(
      (slot) => slot.key === "visitTime" && slot.status === "NEEDS_INFO"
    )
  );
}

function photoFact(input: ThreadCaseFileInput): ThreadCaseFileFact {
  const summary = threadSummary(input);
  const currentPhotoCount =
    summary.attachmentCount || input.draft.photoAnalysis.attachmentUrls.length;
  const previousPhotoCount = input.draft.photoAnalysis.previousAttachmentUrls.length;

  if (currentPhotoCount > 0) {
    return {
      label: "사진",
      value: previousPhotoCount
        ? `현재 ${currentPhotoCount}장 · 입주 전 ${previousPhotoCount}장`
        : `현재 ${currentPhotoCount}장`,
      tone: "info"
    };
  }

  if (
    input.draft.photoRequested ||
    input.draft.photoAnalysis.recommendedRetake ||
    input.draft.photoAnalysis.comparisonStatus === "추가 사진 필요"
  ) {
    return {
      label: "사진",
      value: "근접/전체 사진 필요",
      tone: "warning"
    };
  }

  return {
    label: "사진",
    value: "추가 사진 선택",
    tone: "neutral"
  };
}

function caseFileStatus(input: ThreadCaseFileInput) {
  const summary = threadSummary(input);

  if (summary.readyToFinalize) {
    return "접수 확정 가능";
  }

  if (summary.unresolvedQuestionCount > 0) {
    return `AI 질문 ${summary.unresolvedQuestionCount}개 답변 필요`;
  }

  if (summary.openSlotCount > 0) {
    return `추가 정보 ${summary.openSlotCount}개 확인 필요`;
  }

  return summary.statusLabel;
}

function uniqueNonEmpty(items: Array<string | undefined>) {
  return Array.from(
    new Set(items.map((item) => item?.trim()).filter((item): item is string => Boolean(item)))
  );
}

export function threadCaseFile(input: ThreadCaseFileInput) {
  const summary = threadSummary(input);
  const location =
    input.draft.location?.trim() || slotValue(input.draft.intakeSlots, "location");
  const availableTimes =
    input.draft.availableTimes?.trim() || slotValue(input.draft.intakeSlots, "visitTime");
  const facts: ThreadCaseFileFact[] = [
    { label: "채널", value: summary.channelLabel, tone: "neutral" },
    {
      label: "유형",
      value: `${input.draft.category} / ${input.draft.detailCategory}`,
      tone: "priority"
    },
    { label: "긴급도", value: `P${summary.priority}`, tone: "priority" }
  ];

  if (location) {
    facts.push({ label: "위치", value: location, tone: "info" });
  }

  if (availableTimes) {
    facts.push({ label: "방문", value: availableTimes, tone: "info" });
  } else if (visitTimeNeedsInfo(input)) {
    facts.push({ label: "방문", value: "확인 필요", tone: "warning" });
  }

  facts.push(photoFact(input));

  const findings = uniqueNonEmpty([
    input.draft.summary,
    `책임 가능성: ${input.draft.responsibilityHint}`,
    `사진 판단: ${input.draft.photoAnalysis.comparisonStatus} · ${input.draft.photoAnalysis.summary}`
  ]);
  const nextActions = uniqueNonEmpty([
    summary.readyToFinalize ? "민원 접수 확정" : undefined,
    ...input.draft.nextQuestions,
    ...input.draft.requiredInfo.map((item) => `${item} 보완`),
    input.draft.recommendedAction,
    ...input.draft.tenantGuidance
  ]).slice(0, 5);

  return {
    title: summary.title,
    status: caseFileStatus(input),
    facts,
    findings,
    nextActions
  };
}
