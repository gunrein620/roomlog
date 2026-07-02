// 앱이 테마로 쓰는 지역의 법정동 시군구 코드(5자리)와 지도 근사 중심 좌표.
// MOLIT 실거래가는 좌표를 주지 않으므로, 마커를 동 중심 주변에 근사 배치할 때 사용한다.
export type RegionInfo = {
  lawdCd: string;
  sido: string;
  sigungu: string;
  dong: string;
  centerLat: number;
  centerLng: number;
};

export const REGIONS: RegionInfo[] = [
  {
    lawdCd: "11650",
    sido: "서울특별시",
    sigungu: "서초구",
    dong: "방배동",
    centerLat: 37.4816,
    centerLng: 126.9971
  },
  {
    lawdCd: "11200",
    sido: "서울특별시",
    sigungu: "성동구",
    dong: "성수동",
    centerLat: 37.5445,
    centerLng: 127.0559
  },
  {
    lawdCd: "11680",
    sido: "서울특별시",
    sigungu: "강남구",
    dong: "역삼동",
    centerLat: 37.5006,
    centerLng: 127.0366
  }
];

export const DEFAULT_LAWD_CD = REGIONS[0].lawdCd;

export function findRegion(lawdCd: string): RegionInfo | undefined {
  return REGIONS.find((region) => region.lawdCd === lawdCd);
}
