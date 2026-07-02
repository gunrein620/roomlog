import type { TenantIntakeSlot } from "./intake-slot-progress";

export type ThreadContextHighlightTone = "neutral" | "priority" | "warning" | "info" | "ready";

export type ThreadContextHighlight = {
  label: string;
  value: string;
  tone: ThreadContextHighlightTone;
};

export type ConsultationThreadContextInput = {
  summary: {
    channelLabel: string;
    messageCount: number;
    attachmentCount: number;
    unresolvedQuestionCount: number;
    readyToFinalize: boolean;
  };
  draft: {
    category: string;
    detailCategory: string;
    priority: 1 | 2 | 3 | 4;
    responsibilityHint: string;
    location?: string;
    availableTimes?: string;
    photoRequested: boolean;
    requiredInfo: string[];
    nextQuestions: string[];
    intakeSlots: TenantIntakeSlot[];
    photoAnalysis: {
      attachmentUrls: string[];
      previousAttachmentUrls: string[];
      comparisonStatus: string;
      summary: string;
    };
  };
};

function collectedSlotValue(slots: TenantIntakeSlot[], key: string) {
  const slot = slots.find((item) => item.key === key && item.status === "COLLECTED");

  return slot?.value?.trim() || slot?.evidence?.trim() || "";
}

function needsInfo(slots: TenantIntakeSlot[], key: string) {
  return slots.some((slot) => slot.key === key && slot.status === "NEEDS_INFO");
}

function photoHighlight(input: ConsultationThreadContextInput): ThreadContextHighlight | undefined {
  const currentPhotoCount =
    input.summary.attachmentCount || input.draft.photoAnalysis.attachmentUrls.length;
  const previousPhotoCount = input.draft.photoAnalysis.previousAttachmentUrls.length;

  if (currentPhotoCount > 0) {
    return {
      label: "사진",
      value: previousPhotoCount
        ? `현재 ${currentPhotoCount}장 · 입주 전 ${previousPhotoCount}장 비교`
        : `현재 ${currentPhotoCount}장 연결됨`,
      tone: "info"
    };
  }

  if (
    input.draft.photoRequested ||
    input.draft.photoAnalysis.comparisonStatus === "추가 사진 필요"
  ) {
    return {
      label: "사진",
      value: "근접/전체 사진 필요",
      tone: "warning"
    };
  }

  return undefined;
}

function statusHighlight(input: ConsultationThreadContextInput): ThreadContextHighlight {
  if (input.summary.readyToFinalize) {
    return {
      label: "상태",
      value: "접수 확정 가능",
      tone: "ready"
    };
  }

  if (input.summary.unresolvedQuestionCount > 0) {
    return {
      label: "상태",
      value: `AI 질문 ${input.summary.unresolvedQuestionCount}개 답변 필요`,
      tone: "warning"
    };
  }

  if (input.draft.requiredInfo.length > 0) {
    return {
      label: "상태",
      value: `필수 정보 ${input.draft.requiredInfo.length}개 보완 필요`,
      tone: "warning"
    };
  }

  return {
    label: "상태",
    value: "상담 이어가기",
    tone: "neutral"
  };
}

export function consultationThreadContextHighlights(input: ConsultationThreadContextInput) {
  const highlights: ThreadContextHighlight[] = [
    {
      label: "상담",
      value: `${input.summary.channelLabel} · 메시지 ${input.summary.messageCount}`,
      tone: "neutral"
    },
    {
      label: "유형",
      value: `${input.draft.category} / ${input.draft.detailCategory} · P${input.draft.priority}`,
      tone: "priority"
    }
  ];
  const symptom = collectedSlotValue(input.draft.intakeSlots, "symptom");
  const location =
    input.draft.location?.trim() || collectedSlotValue(input.draft.intakeSlots, "location");
  const visitTime =
    input.draft.availableTimes?.trim() || collectedSlotValue(input.draft.intakeSlots, "visitTime");

  if (symptom) {
    highlights.push({ label: "증상", value: symptom, tone: "info" });
  }

  if (location) {
    highlights.push({ label: "위치", value: location, tone: "info" });
  }

  if (visitTime) {
    highlights.push({ label: "방문", value: visitTime, tone: "info" });
  } else if (
    input.draft.requiredInfo.some((item) => /방문|시간/.test(item)) ||
    needsInfo(input.draft.intakeSlots, "visitTime")
  ) {
    highlights.push({ label: "방문", value: "방문 가능 시간 확인 필요", tone: "warning" });
  }

  const photo = photoHighlight(input);
  if (photo) {
    highlights.push(photo);
  }

  highlights.push(statusHighlight(input));

  return highlights;
}
