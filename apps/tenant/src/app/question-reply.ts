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

export function appendQuestionAnswerPrompt(
  currentText: string,
  question: string,
  answer: string
) {
  const normalizedQuestion = question.trim();
  const normalizedAnswer = answer.trim();

  if (!normalizedQuestion || !normalizedAnswer) {
    return currentText;
  }

  if (currentText.includes(normalizedQuestion)) {
    return currentText;
  }

  const prompt = `${normalizedQuestion}\n답변: ${normalizedAnswer}`;
  const current = currentText.trimEnd();

  return current ? `${current}\n\n${prompt}` : prompt;
}

export function suggestedAnswersForQuestion(question: string) {
  const normalized = question.trim();

  if (!normalized) {
    return [];
  }

  if (/전기|가스|침수|문\s*잠김|위험|누전|불꽃|냄새/.test(normalized)) {
    return ["위험한 상황은 없습니다.", "지금도 위험해서 빠른 확인이 필요합니다."];
  }

  if (/사진|이미지|촬영|첨부/.test(normalized)) {
    return ["사진을 지금 첨부하겠습니다.", "통화 중이라 사진은 나중에 올리겠습니다."];
  }

  if (/계속|지금도|반복|언제부터|시작/.test(normalized)) {
    return ["지금도 계속되고 있습니다.", "현재는 멈췄지만 다시 반복됩니다."];
  }

  if (/몇\s*시|언제|방문|시간|가능/.test(normalized)) {
    return ["오늘 저녁 7시 이후 가능합니다.", "내일 오전 가능합니다.", "시간 조율이 필요합니다."];
  }

  return ["네, 확인해서 답변하겠습니다."];
}
