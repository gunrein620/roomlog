export function replyPromptForQuestion(question: string) {
  const normalized = question.trim();

  return normalized ? `${normalized}\n답변: ` : "";
}

export function appendQuestionReplyPrompt(currentText: string, question: string) {
  const prompt = replyPromptForQuestion(question);

  if (!prompt) {
    return currentText;
  }

  const normalizedQuestion = question.trim();
  if (currentText.includes(normalizedQuestion)) {
    return currentText;
  }

  const current = currentText.trimEnd();

  return current ? `${current}\n\n${prompt}` : prompt;
}
