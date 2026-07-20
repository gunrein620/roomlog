export type ManagerDunningTargetCandidate = {
  id: string;
  buildingName: string;
  unitId: string;
  tenantName: string;
  billingMonth: string;
  daysOverdue: number;
};

export type ManagerDunningTargetResolution =
  | {
      status: "resolved";
      candidates: ManagerDunningTargetCandidate[];
    }
  | {
      status: "ambiguous" | "not_found";
      candidates: ManagerDunningTargetCandidate[];
    };

export function resolveManagerDunningTargets(
  rawText: string,
  candidates: readonly ManagerDunningTargetCandidate[]
): ManagerDunningTargetResolution {
  const available = [...candidates];
  const normalized = rawText.normalize("NFKC").trim();
  const unit = normalized.match(/([0-9]{1,4})\s*호/u)?.[1];
  const billingMonth = extractBillingMonth(normalized);
  let matched = available;

  if (unit) {
    matched = matched.filter(
      (candidate) => normalizeUnit(candidate.unitId) === unit
    );
  } else {
    const tenantMatches = matched.filter((candidate) =>
      normalized.includes(candidate.tenantName)
    );
    if (tenantMatches.length > 0) matched = tenantMatches;
  }

  if (billingMonth) {
    matched = matched.filter(
      (candidate) => candidate.billingMonth === billingMonth
    );
  }

  if (matched.length === 0) {
    return { status: "not_found", candidates: available.slice(0, 4) };
  }

  const wantsAll =
    /(전체|전부|모두|다\s*(?:보내|발송|전송|독촉)|두\s*개|2\s*개)/u.test(
      normalized
    );
  if (wantsAll || matched.length === 1) {
    return { status: "resolved", candidates: matched };
  }

  return { status: "ambiguous", candidates: matched.slice(0, 4) };
}

function normalizeUnit(value: string) {
  return value.replace(/\s*호\s*$/u, "").trim();
}

function extractBillingMonth(text: string) {
  const full = text.match(/(20\d{2})[년.\-/\s]+(1[0-2]|0?[1-9])\s*월?/u);
  if (full) return `${full[1]}-${String(Number(full[2])).padStart(2, "0")}`;
  return undefined;
}
