import { HttpException, HttpStatus, Injectable } from "@nestjs/common";

const NAVER_LOCAL_SEARCH_URL = "https://openapi.naver.com/v1/search/local.json";
const JUSO_ADDRESS_SEARCH_URL = "https://business.juso.go.kr/addrlink/addrLinkApi.do";

type NaverLocalSearchItem = {
  title?: string;
  link?: string;
  category?: string;
  description?: string;
  address?: string;
  roadAddress?: string;
  mapx?: string;
  mapy?: string;
};

type JusoSearchItem = {
  admCd?: string;
  rnMgtSn?: string;
  roadAddr?: string;
  roadAddrPart1?: string;
  jibunAddr?: string;
  siNm?: string;
  sggNm?: string;
  emdNm?: string;
  rn?: string;
};

type JusoSearchResponse = {
  results?: {
    common?: {
      errorCode?: string;
      errorMessage?: string;
      totalCount?: string;
    };
    juso?: JusoSearchItem[];
  };
};

function plainText(value = "") {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function naverCoordinate(value: string | undefined, limit: number) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return null;
  const coordinate = Math.abs(raw) > limit ? raw / 10_000_000 : raw;
  return Number.isFinite(coordinate) && Math.abs(coordinate) <= limit ? coordinate : null;
}

function isRoadAddressQuery(value: string) {
  return /[가-힣a-zA-Z0-9·.-]+(?:대로|로|길)(?:\s+\d+(?:-\d+)?)?/.test(value);
}

@Injectable()
export class MapSearchService {
  async searchLocal(query: string) {
    const keyword = query.trim();
    if (!keyword || keyword.length > 100) {
      throw new HttpException(
        { configured: true, message: "검색어를 1~100자로 입력해 주세요.", items: [] },
        HttpStatus.BAD_REQUEST
      );
    }

    if (isRoadAddressQuery(keyword)) {
      return this.searchRoadAddress(keyword);
    }

    return this.searchNaverLocal(keyword);
  }

  private async searchRoadAddress(keyword: string) {
    const confirmationKey = (process.env.JUSO_SEARCH_API_KEY || "").trim();
    if (!confirmationKey) {
      throw new HttpException(
        {
          configured: false,
          provider: "juso",
          message: "도로명 검색 설정이 필요합니다. API 서버의 JUSO_SEARCH_API_KEY를 확인해 주세요.",
          items: []
        },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    const url = new URL(JUSO_ADDRESS_SEARCH_URL);
    url.searchParams.set("confmKey", confirmationKey);
    url.searchParams.set("currentPage", "1");
    url.searchParams.set("countPerPage", "30");
    url.searchParams.set("keyword", keyword);
    url.searchParams.set("resultType", "json");

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        throw new HttpException(
          { configured: true, provider: "juso", message: "도로명주소 검색 API 호출에 실패했습니다.", items: [] },
          response.status >= 500 ? HttpStatus.BAD_GATEWAY : response.status
        );
      }

      const payload = (await response.json()) as JusoSearchResponse;
      const common = payload.results?.common;
      if (common?.errorCode && common.errorCode !== "0") {
        throw new HttpException(
          {
            configured: true,
            provider: "juso",
            message: common.errorMessage || "도로명주소 검색 요청을 처리하지 못했습니다.",
            items: []
          },
          HttpStatus.BAD_GATEWAY
        );
      }

      const hasBuildingNumber = /\d+(?:-\d+)?/.test(keyword);
      const seen = new Set<string>();
      const items = (payload.results?.juso ?? []).flatMap((item) => {
        const roadAddress = plainText(item.roadAddrPart1 || item.roadAddr);
        if (!roadAddress) return [];

        const key = hasBuildingNumber
          ? roadAddress
          : [item.admCd, item.rnMgtSn].filter(Boolean).join("|") || roadAddress;
        if (seen.has(key)) return [];
        seen.add(key);

        const roadLabel = [item.sggNm, item.rn].filter(Boolean).join(" ") || roadAddress;
        return [{
          kind: "address" as const,
          title: hasBuildingNumber ? roadAddress : roadLabel,
          category: "도로명주소",
          description: [item.siNm, item.sggNm, item.emdNm].filter(Boolean).join(" "),
          address: plainText(item.jibunAddr),
          roadAddress,
          canonicalAddress: roadAddress
        }];
      }).slice(0, 5);

      return { configured: true, provider: "juso", items };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { configured: true, provider: "juso", message: "도로명주소 검색 응답이 지연되고 있습니다.", items: [] },
        HttpStatus.GATEWAY_TIMEOUT
      );
    }
  }

  private async searchNaverLocal(keyword: string) {
    const clientId = (process.env.NAVER_SEARCH_CLIENT_ID || process.env.NAVER_CLIENT_ID || "").trim();
    const clientSecret = (
      process.env.NAVER_SEARCH_CLIENT_SECRET ||
      process.env.NAVER_CLIENT_SECRET ||
      ""
    ).trim();

    if (!clientId || !clientSecret) {
      throw new HttpException(
        { configured: false, message: "네이버 지역 검색 키가 API 서버에 설정되지 않았습니다.", items: [] },
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    const url = new URL(NAVER_LOCAL_SEARCH_URL);
    url.searchParams.set("query", keyword);
    url.searchParams.set("display", "5");
    url.searchParams.set("start", "1");
    url.searchParams.set("sort", "random");

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret
        },
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new HttpException(
          { configured: true, message: "네이버 지역 검색 API 호출에 실패했습니다.", items: [] },
          response.status >= 500 ? HttpStatus.BAD_GATEWAY : response.status
        );
      }

      const payload = (await response.json()) as { items?: NaverLocalSearchItem[] };
      const items = (payload.items ?? []).flatMap((item) => {
        const lng = naverCoordinate(item.mapx, 180);
        const lat = naverCoordinate(item.mapy, 90);
        if (lat === null || lng === null) return [];

        return [{
          kind: "place" as const,
          title: plainText(item.title),
          category: plainText(item.category),
          description: plainText(item.description),
          address: plainText(item.address),
          roadAddress: plainText(item.roadAddress),
          link: item.link?.trim() ?? "",
          lat,
          lng
        }];
      });

      return { configured: true, provider: "naver", items };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { configured: true, message: "네이버 지역 검색 응답이 지연되고 있습니다.", items: [] },
        HttpStatus.GATEWAY_TIMEOUT
      );
    }
  }
}
