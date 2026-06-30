export function initialConsultationComposerText() {
  return "";
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
