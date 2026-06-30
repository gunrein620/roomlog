export function emptyConsultationState(threadCount: number) {
  if (threadCount > 0) {
    return {
      title: "상담 스레드를 선택하거나 새로 시작하세요",
      description: "기존 상담을 이어가거나 새 민원/하자를 별도 스레드로 접수할 수 있습니다.",
      actionLabel: "새 AI 상담 시작"
    };
  }

  return {
    title: "첫 AI 상담을 시작하세요",
    description:
      "가입이 끝났습니다. 하자나 민원을 입력하면 상담 스레드와 접수 초안이 분리 저장됩니다.",
    actionLabel: "새 AI 상담 시작"
  };
}
