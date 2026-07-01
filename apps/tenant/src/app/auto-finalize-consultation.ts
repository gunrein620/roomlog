export type AutoFinalizeConsultationCandidate = {
  status: string;
  draft: {
    readyToFinalize: boolean;
    requiredInfo: string[];
    duplicateCandidates?: unknown[];
    location?: string;
    availableTimes?: string;
    photoAnalysis?: {
      attachmentUrls?: unknown[];
    };
    intakeSlots?: Array<{
      key?: string;
      status?: string;
    }>;
  };
  threadSummary?: {
    readyToFinalize: boolean;
    openSlotCount: number;
    unresolvedQuestionCount: number;
  };
};

function hasCollectedSlot(session: AutoFinalizeConsultationCandidate, key: string) {
  return (
    session.draft.intakeSlots?.some((slot) => slot.key === key && slot.status === "COLLECTED") ??
    false
  );
}

function isSoftDemoFollowUp(item: string) {
  return /발생 시점|문제 부위 사진|사진/.test(item);
}

function hasPhotoBackedDemoHandoff(session: AutoFinalizeConsultationCandidate) {
  const blockingRequiredInfo = session.draft.requiredInfo.filter(
    (item) => !isSoftDemoFollowUp(item)
  );

  return (
    blockingRequiredInfo.length === 0 &&
    (session.draft.photoAnalysis?.attachmentUrls?.length ?? 0) > 0 &&
    (Boolean(session.draft.location?.trim()) || hasCollectedSlot(session, "location")) &&
    (Boolean(session.draft.availableTimes?.trim()) || hasCollectedSlot(session, "visitTime")) &&
    hasCollectedSlot(session, "symptom")
  );
}

export function shouldAutoFinalizeConsultation(
  session: AutoFinalizeConsultationCandidate
) {
  return (
    session.status === "ACTIVE" &&
    ((session.draft.readyToFinalize && session.draft.requiredInfo.length === 0) ||
      hasPhotoBackedDemoHandoff(session))
  );
}
