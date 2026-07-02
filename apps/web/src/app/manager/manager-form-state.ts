export function initialManagerAssistantQuestion() {
  return "";
}

export function initialFeedbackReviewNote() {
  return "";
}

export function canSubmitManagerAssistantQuestion(question: string) {
  return question.trim().length > 0;
}
