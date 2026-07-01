export type ConsultationComposerGuidanceTone = "neutral" | "warning" | "ready";

export type ConsultationComposerGuidanceInput = {
  status: string;
  draft: {
    nextQuestions: string[];
    requiredInfo: string[];
    readyToFinalize: boolean;
    photoRequested: boolean;
    photoAnalysis: {
      comparisonStatus: string;
      recommendedRetake: boolean;
    };
  };
  threadSummary: {
    readyToFinalize: boolean;
    unresolvedQuestionCount: number;
    openSlotCount: number;
  };
};

export type ConsultationComposerGuidance = {
  label: string;
  prompt: string;
  placeholder: string;
  submitLabel: string;
  tone: ConsultationComposerGuidanceTone;
};

function firstNonEmpty(items: string[]) {
  return items.map((item) => item.trim()).find(Boolean);
}

function photoNeeded(input: ConsultationComposerGuidanceInput) {
  return (
    input.draft.photoRequested ||
    input.draft.photoAnalysis.recommendedRetake ||
    input.draft.photoAnalysis.comparisonStatus === "추가 사진 필요"
  );
}

export function consultationComposerGuidance(
  input?: ConsultationComposerGuidanceInput
): ConsultationComposerGuidance {
  if (!input) {
    return {
      label: "상담 대기",
      prompt: "새 AI 상담 스레드를 시작하면 답변할 내용이 여기에 표시됩니다.",
      placeholder: "새 AI 상담을 시작한 뒤 증상, 위치, 발생 시점을 입력하세요.",
      submitLabel: "보내기",
      tone: "neutral"
    };
  }

  if (input.status !== "ACTIVE") {
    return {
      label: "상담 종료됨",
      prompt: "이미 접수되었거나 닫힌 상담입니다. 새 상담을 시작하면 별도 스레드로 저장됩니다.",
      placeholder: "종료된 상담에는 새 메시지를 보낼 수 없습니다.",
      submitLabel: "상담 종료됨",
      tone: "neutral"
    };
  }

  if (input.draft.readyToFinalize || input.threadSummary.readyToFinalize) {
    return {
      label: "접수 초안 준비됨",
      prompt: "내용이 맞으면 접수 확정을 누르고, 수정할 내용이 있으면 바로 적어주세요.",
      placeholder: "예: 방문 가능 시간은 내일 오후 2시 이후로 바꿔주세요.",
      submitLabel: "추가 설명 보내기",
      tone: "ready"
    };
  }

  const question = firstNonEmpty(input.draft.nextQuestions);

  if (question) {
    return {
      label: "AI가 지금 확인할 질문",
      prompt: question,
      placeholder: question,
      submitLabel: "답변 보내기",
      tone: "warning"
    };
  }

  const missingInfo = firstNonEmpty(input.draft.requiredInfo);

  if (missingInfo) {
    const prompt = `${missingInfo}을 알려주세요.`;

    return {
      label: "필수 정보 보완",
      prompt,
      placeholder: prompt,
      submitLabel: "정보 보내기",
      tone: "warning"
    };
  }

  if (photoNeeded(input)) {
    return {
      label: "사진 보완",
      prompt: "문제 부위 근접 사진과 공간 전체 사진을 올리면 관리자 판단이 빨라집니다.",
      placeholder: "사진을 첨부하거나, 사진을 언제 올릴 수 있는지 적어주세요.",
      submitLabel: "사진/설명 보내기",
      tone: "warning"
    };
  }

  return {
    label: "상담 이어가기",
    prompt: "추가 설명을 보내면 같은 상담 스레드에 이어서 저장됩니다.",
    placeholder: "추가 증상, 방문 가능 시간, 사진 설명을 입력하세요.",
    submitLabel: "보내기",
    tone: "neutral"
  };
}
