import type {
  ManagerVendorJobLookup,
  VendorJobEstimateView,
} from "@roomlog/types";

export type ManagerVisitProposalLookup = {
  source: "API" | "DEMO";
  data: ManagerVendorJobLookup | null;
};

export type CurrentManagerVisitProposal = {
  repairId: string;
  estimateId: string;
  visitAvailableAt: string;
};

export function selectVendorRevisionRequestNote(
  latest: VendorJobEstimateView | undefined,
  estimates: VendorJobEstimateView[],
) {
  if (!latest) return undefined;
  if (latest.status === "REVISION_REQUESTED") {
    return latest.reviewNote?.trim() || undefined;
  }
  if (latest.status !== "DRAFT") return undefined;

  const previous = estimates.find(
    (estimate) => estimate.version === latest.version - 1,
  );
  if (previous?.status !== "REVISION_REQUESTED") return undefined;
  return previous.reviewNote?.trim() || undefined;
}

export function requireCurrentManagerVisitProposal(
  lookup: ManagerVisitProposalLookup,
  repairId: string,
  estimateId: string,
): CurrentManagerVisitProposal {
  const current = lookup.data;
  const estimate = current?.job.latestEstimate;
  const visitAvailableAt = estimate?.visitAvailableAt;
  if (
    lookup.source !== "API"
    || current?.partnership !== "REGISTERED"
    || current.job.repairId !== repairId
    || estimate?.id !== estimateId
    || estimate.status !== "SUBMITTED"
    || estimate.responseType !== "VISIT_REQUIRED"
    || !visitAvailableAt
    || Number.isNaN(new Date(visitAvailableAt).getTime())
  ) {
    throw new Error("현재 업체 방문 제안을 다시 확인해 주세요.");
  }

  return { repairId, estimateId, visitAvailableAt };
}
