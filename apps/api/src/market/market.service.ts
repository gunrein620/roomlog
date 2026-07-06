import { Injectable } from "@nestjs/common";
import { DEFAULT_LAWD_CD } from "./lawd-codes";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type PropertyType = "apt" | "offi";

export type MarketTransaction = {
  complexName: string;
  tradeType: "월세" | "전세";
  depositManwon: number;
  monthlyRentManwon: number;
  areaM2: number;
  floor: number | null;
  buildYear: number | null;
  dong: string;
  sggCode: string;
  dealDate: string; // ISO yyyy-mm-dd
  propertyType: PropertyType;
};

export type MarketSummary = {
  lawdCd: string;
  propertyType: PropertyType;
  count: number;
  monthlyCount: number;
  jeonseCount: number;
  avgDepositManwon: number;
  avgMonthlyRentManwon: number;
  avgJeonseDepositManwon: number;
  recent: MarketTransaction[];
};

const ENDPOINTS: Record<PropertyType, string> = {
  apt: "http://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent",
  offi: "http://apis.data.go.kr/1613000/RTMSDataSvcOffiRent/getRTMSDataSvcOffiRent"
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

// --- 순수 헬퍼 (테스트 대상) --------------------------------------------------

function readTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? match[1].trim() : "";
}

function toNumber(raw: string): number {
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** MOLIT 전월세 XML 응답을 정규화된 실거래 배열로 변환한다. */
export function parseMolitXml(xml: string, propertyType: PropertyType): MarketTransaction[] {
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g);
  if (!itemBlocks) {
    return [];
  }

  return itemBlocks.map((block) => {
    const complexName = readTag(block, "aptNm") || readTag(block, "offiNm") || readTag(block, "mhouseNm");
    const depositManwon = toNumber(readTag(block, "deposit"));
    const monthlyRentManwon = toNumber(readTag(block, "monthlyRent"));
    const year = toNumber(readTag(block, "dealYear"));
    const month = toNumber(readTag(block, "dealMonth"));
    const day = toNumber(readTag(block, "dealDay"));
    const floorRaw = readTag(block, "floor");
    const buildYearRaw = readTag(block, "buildYear");

    return {
      complexName: complexName || "이름 미상",
      tradeType: monthlyRentManwon > 0 ? "월세" : "전세",
      depositManwon,
      monthlyRentManwon,
      areaM2: toNumber(readTag(block, "excluUseAr") || readTag(block, "exclUseAr")),
      floor: floorRaw ? toNumber(floorRaw) : null,
      buildYear: buildYearRaw ? toNumber(buildYearRaw) : null,
      dong: readTag(block, "umdNm"),
      sggCode: readTag(block, "sggCd"),
      dealDate: year && month && day ? `${year}-${pad2(month)}-${pad2(day)}` : "",
      propertyType
    } satisfies MarketTransaction;
  });
}

/** 정규화된 실거래 배열을 시세 집계로 요약한다. */
export function summarize(
  transactions: MarketTransaction[],
  lawdCd: string,
  propertyType: PropertyType,
  recentCount = 6
): MarketSummary {
  const monthly = transactions.filter((tx) => tx.tradeType === "월세");
  const jeonse = transactions.filter((tx) => tx.tradeType === "전세");
  const avg = (values: number[]) =>
    values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;

  const recent = [...transactions]
    .sort((a, b) => (a.dealDate < b.dealDate ? 1 : -1))
    .slice(0, recentCount);

  return {
    lawdCd,
    propertyType,
    count: transactions.length,
    monthlyCount: monthly.length,
    jeonseCount: jeonse.length,
    avgDepositManwon: avg(monthly.map((tx) => tx.depositManwon)),
    avgMonthlyRentManwon: avg(monthly.map((tx) => tx.monthlyRentManwon)),
    avgJeonseDepositManwon: avg(jeonse.map((tx) => tx.depositManwon)),
    recent
  };
}

/** 오늘 기준 직전 N개월의 YYYYMM 목록(당월은 데이터가 희박하므로 제외). */
export function recentDealMonths(count: number, now = new Date()): string[] {
  const months: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${date.getFullYear()}${pad2(date.getMonth() + 1)}`);
  }
  return months;
}

/** MOLIT 실거래가 한 달치를 조회한다. */
export async function fetchMonth({
  serviceKey,
  lawdCd,
  dealYmd,
  propertyType,
  fetchImpl = fetch
}: {
  serviceKey: string;
  lawdCd: string;
  dealYmd: string;
  propertyType: PropertyType;
  fetchImpl?: FetchLike;
}): Promise<MarketTransaction[]> {
  // serviceKey를 직접 조립한다(URLSearchParams는 이미 인코딩된 키를 이중 인코딩함).
  const query = `serviceKey=${serviceKey}&LAWD_CD=${lawdCd}&DEAL_YMD=${dealYmd}&numOfRows=100&pageNo=1`;
  const response = await fetchImpl(`${ENDPOINTS[propertyType]}?${query}`);
  if (!response.ok) {
    throw new Error(`MOLIT fetch failed: ${response.status}`);
  }

  const xml = await response.text();
  const resultCode = readTag(xml, "resultCode");
  if (resultCode && resultCode !== "00" && resultCode !== "000") {
    throw new Error(`MOLIT error ${resultCode}: ${readTag(xml, "resultMsg")}`);
  }

  return parseMolitXml(xml, propertyType);
}

// --- Nest 서비스 (캐시 + env 키) ---------------------------------------------

@Injectable()
export class MarketService {
  private readonly cache = new Map<string, { expires: number; data: MarketTransaction[] }>();

  private get serviceKey(): string {
    return process.env.MOLIT_SERVICE_KEY ?? "";
  }

  async getTransactions(params: {
    lawdCd?: string;
    propertyType?: PropertyType;
    months?: number;
  }): Promise<MarketTransaction[]> {
    const lawdCd = params.lawdCd || DEFAULT_LAWD_CD;
    const propertyType: PropertyType = params.propertyType === "offi" ? "offi" : "apt";
    const months = Math.min(Math.max(params.months ?? 3, 1), 12);

    if (!this.serviceKey) {
      return [];
    }

    const monthList = recentDealMonths(months);
    const results = await Promise.all(
      monthList.map((dealYmd) => this.fetchMonthCached(lawdCd, dealYmd, propertyType))
    );
    return results.flat();
  }

  async getSummary(params: {
    lawdCd?: string;
    propertyType?: PropertyType;
    months?: number;
  }): Promise<MarketSummary> {
    const lawdCd = params.lawdCd || DEFAULT_LAWD_CD;
    const propertyType: PropertyType = params.propertyType === "offi" ? "offi" : "apt";
    const transactions = await this.getTransactions({ ...params, lawdCd, propertyType });
    return summarize(transactions, lawdCd, propertyType);
  }

  private async fetchMonthCached(
    lawdCd: string,
    dealYmd: string,
    propertyType: PropertyType
  ): Promise<MarketTransaction[]> {
    const cacheKey = `${propertyType}:${lawdCd}:${dealYmd}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    try {
      const data = await fetchMonth({ serviceKey: this.serviceKey, lawdCd, dealYmd, propertyType });
      this.cache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, data });
      return data;
    } catch {
      // 실패 시 빈 배열 → 프론트가 하드코딩 폴백으로 처리.
      return [];
    }
  }
}
