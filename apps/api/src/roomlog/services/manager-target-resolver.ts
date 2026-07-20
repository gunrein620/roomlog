export type ManagerTargetCandidate = {
  id: string;
  buildingName: string;
  unitId: string;
};

export type ManagerTargetResolution =
  | { status: "resolved"; candidate: ManagerTargetCandidate }
  | { status: "ambiguous"; candidates: ManagerTargetCandidate[] }
  | { status: "not_found"; candidates: ManagerTargetCandidate[] };

const MINIMUM_MATCH_SCORE = 0.72;
const MINIMUM_LEAD = 0.04;

export function resolveManagerTarget(
  rawTarget: string,
  candidates: readonly ManagerTargetCandidate[],
  followupText?: string
): ManagerTargetResolution {
  const available = [...candidates];
  const ordinalCandidate = resolveOrdinalCandidate(followupText, available);
  if (ordinalCandidate) {
    return { status: "resolved", candidate: ordinalCandidate };
  }

  const unit = rawTarget.match(/([0-9]{1,4})\s*호/u)?.[1];
  const unitMatches = unit
    ? available.filter((candidate) => normalizeUnit(candidate.unitId) === unit)
    : available;

  if (unit && unitMatches.length === 0) {
    return { status: "not_found", candidates: available.slice(0, 3) };
  }

  if (unitMatches.length === 1 && unit) {
    return { status: "resolved", candidate: unitMatches[0] };
  }

  const targetBuilding = compactBuilding(
    rawTarget.replace(/[0-9]{1,4}\s*호/gu, "")
  );
  if (!targetBuilding) {
    return unitMatches.length
      ? { status: "ambiguous", candidates: unitMatches.slice(0, 3) }
      : { status: "not_found", candidates: available.slice(0, 3) };
  }

  const ranked = unitMatches
    .map((candidate) => ({
      candidate,
      score: buildingSimilarity(
        targetBuilding,
        compactBuilding(candidate.buildingName)
      )
    }))
    .sort((left, right) => right.score - left.score);
  const [first, second] = ranked;

  if (
    first &&
    first.score >= MINIMUM_MATCH_SCORE &&
    (!second || first.score - second.score >= MINIMUM_LEAD)
  ) {
    return { status: "resolved", candidate: first.candidate };
  }

  if (first && first.score >= MINIMUM_MATCH_SCORE && ranked.length === 1) {
    return { status: "resolved", candidate: first.candidate };
  }

  return ranked.some((item) => item.score >= MINIMUM_MATCH_SCORE)
    ? {
        status: "ambiguous",
        candidates: ranked.slice(0, 3).map((item) => item.candidate)
      }
    : { status: "not_found", candidates: available.slice(0, 3) };
}

function resolveOrdinalCandidate(
  followupText: string | undefined,
  candidates: readonly ManagerTargetCandidate[]
) {
  const normalized = followupText
    ?.normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/gu, "");

  if (!normalized || candidates.length < 2) return undefined;

  if (/(뒤(에|쪽)?거|마지막|끝(에|쪽)?거|두번째|2번째|둘째)/u.test(normalized)) {
    return candidates[Math.min(1, candidates.length - 1)];
  }

  if (/(앞(에|쪽)?거|첫번째|1번째|첫째)/u.test(normalized)) {
    return candidates[0];
  }

  const numbered = normalized.match(/([1-9])번/u);
  if (numbered) {
    return candidates[Number(numbered[1]) - 1];
  }

  return undefined;
}

function normalizeUnit(value: string) {
  return value.replace(/\s*호\s*$/u, "").trim();
}

function compactBuilding(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(
      /(미납|연체|월세|납부|독촉|문자|메시지|공지|보내\s*줘|보내|발송|전송|해\s*줘|진행해)/gu,
      ""
    )
    .replace(/[\s\-_.,!?()[\]{}'"]/gu, "");
}

function buildingSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left.includes(right) || right.includes(left)) return 1;
  return 1 - levenshtein(left, right) / Math.max(left.length, right.length);
}

function levenshtein(left: string, right: string) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost
      );
    }

    previous = current;
  }

  return previous[right.length];
}
