export function initialConsultationComposerText() {
  return "";
}

export function canSubmitConsultationComposer(text: string, photoCount: number) {
  return text.trim().length > 0 || photoCount > 0;
}

export type ConsultationComposerState = {
  text: string;
  photoCount: number;
  photoInputKey: number;
};

export function resetConsultationComposerState(
  current: ConsultationComposerState
): ConsultationComposerState {
  return {
    text: initialConsultationComposerText(),
    photoCount: 0,
    photoInputKey: current.photoInputKey + 1
  };
}
