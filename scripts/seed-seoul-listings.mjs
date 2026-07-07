#!/usr/bin/env node
/**
 * 서울 데모 매물 시드 스크립트 — 다방/직방처럼 "살아있는" 첫인상을 위한 그럴듯한 매물 40개.
 *
 * - 전용 시드 계정(우주부동산)으로 로그인/가입 후 trade API로 등록한다.
 * - 제목 기준 멱등: 이미 있는 매물은 건너뛰므로 여러 번 실행해도 안전하다.
 * - 사진은 검증된 Pexels 인테리어 사진 풀에서 매물별로 2~3장 배정(절대 URL → next/image unoptimized 렌더).
 *
 * 사용법:
 *   node scripts/seed-seoul-listings.mjs                              # 로컬 도커 (localhost:4000)
 *   API_BASE=https://api.woo-zu.com/api node scripts/seed-seoul-listings.mjs   # 프로덕션
 *   node scripts/seed-seoul-listings.mjs --wipe                       # 시드 계정 매물 전체 삭제
 */

const API_BASE = (process.env.API_BASE ?? "http://localhost:4000/api").replace(/\/$/, "");
const SEED_EMAIL = process.env.SEED_EMAIL ?? "seoul-seed@woozu.demo";
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "password123!";
const WIPE = process.argv.includes("--wipe");

// 전부 HTTP 200 확인된 Pexels 인테리어 사진(원룸/거실/침실/주방).
const PHOTO_IDS = [
  1571460, 1643383, 271624, 1918291, 2062426, 2029731, 1743229, 2089698,
  1428348, 2251247, 3316924, 2724749, 3555615, 4857776, 6969831, 6585757, 6316065
];
const photoUrl = (id) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=900`;

// 결정적 RNG — 재실행해도 같은 좌표 지터/사진 배정이 나온다.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 동네별 실제 중심좌표. 매물은 이 주변 ±250m 지터로 흩뿌린다.
const HOODS = {
  연남동: [37.5623, 126.9255], 망원동: [37.5556, 126.9019], 합정동: [37.5496, 126.9139],
  상수동: [37.5478, 126.9227], 성수동: [37.5446, 127.0559], 옥수동: [37.5405, 127.0177],
  한남동: [37.5347, 127.0016], 이태원동: [37.5345, 126.9946], 창천동: [37.5598, 126.9425],
  대현동: [37.5575, 126.946], 봉천동: [37.4784, 126.9516], 신림동: [37.4842, 126.9297],
  노량진동: [37.5133, 126.9425], 잠실동: [37.5133, 127.1001], 방이동: [37.5145, 127.1261],
  행당동: [37.5577, 127.029], 회기동: [37.5896, 127.0575], 이문동: [37.601, 127.0621],
  역삼동: [37.5006, 127.0364], 논현동: [37.5109, 127.0227], 마곡동: [37.5602, 126.8253],
  불광동: [37.6106, 126.9299], 목동: [37.5262, 126.8644], 자양동: [37.5404, 127.07],
  문래동: [37.5177, 126.8955], 돈암동: [37.6019, 127.0165], 홍제동: [37.5891, 126.9436],
  천호동: [37.5384, 127.1238]
};

const GU = {
  연남동: "마포구", 망원동: "마포구", 합정동: "마포구", 상수동: "마포구",
  성수동: "성동구", 옥수동: "성동구", 행당동: "성동구",
  한남동: "용산구", 이태원동: "용산구",
  창천동: "서대문구", 대현동: "서대문구", 홍제동: "서대문구",
  봉천동: "관악구", 신림동: "관악구", 노량진동: "동작구",
  잠실동: "송파구", 방이동: "송파구",
  회기동: "동대문구", 이문동: "동대문구",
  역삼동: "강남구", 논현동: "강남구",
  마곡동: "강서구", 불광동: "은평구", 목동: "양천구",
  자양동: "광진구", 문래동: "영등포구", 돈암동: "성북구", 천호동: "강동구"
};

// [제목, 동네, 거래형, 보증금(만), 월세(만), 방종류, 전용m², 층, 입주]
const LISTINGS = [
  ["연남동 감성 인테리어 원룸, 채광 최고", "연남동", "월세", 1000, 68, "원룸", 23, 3, "즉시"],
  ["연남동 경의선숲길 도보 2분 신축 투룸", "연남동", "전세", 32000, 0, "투룸", 42, 5, "2026-08-01"],
  ["망원동 조용한 주택가 리모델링 원룸", "망원동", "월세", 500, 55, "원룸", 20, 2, "즉시"],
  ["망원시장 앞 풀옵션 오피스텔, 주차 가능", "망원동", "월세", 1000, 72, "오피스텔", 26, 7, "2026-07-20"],
  ["합정역 도보 4분 복층 원룸, 분리형 주방", "합정동", "월세", 1000, 75, "원룸", 25, 4, "즉시"],
  ["상수동 한강뷰 오피스텔, 신축 첫 입주", "상수동", "월세", 2000, 88, "오피스텔", 29, 12, "2026-08-10"],
  ["성수동 카페거리 인접 복층 오피스텔", "성수동", "월세", 1000, 78, "오피스텔", 27, 8, "즉시"],
  ["성수 서울숲 인근 신축 투룸, 반려동물 협의", "성수동", "전세", 38000, 0, "투룸", 45, 6, "2026-09-01"],
  ["옥수동 한강 조망 빌라, 조용한 언덕길", "옥수동", "전세", 31000, 0, "빌라", 40, 3, "2026-08-15"],
  ["한남동 UN빌리지 인근 프리미엄 원룸", "한남동", "월세", 3000, 110, "원룸", 30, 2, "즉시"],
  ["이태원역 3분 이국적인 감성 원룸", "이태원동", "월세", 1000, 85, "원룸", 24, 5, "즉시"],
  ["신촌역 초역세권 대학가 원룸, 풀옵션", "창천동", "월세", 500, 52, "원룸", 19, 6, "즉시"],
  ["이대 앞 보안 좋은 여성전용 원룸", "대현동", "월세", 500, 48, "원룸", 18, 4, "2026-07-25"],
  ["봉천동 가성비 풀옵션 원룸, 관리비 저렴", "봉천동", "월세", 300, 42, "원룸", 17, 3, "즉시"],
  ["서울대입구역 10분 넓은 분리형 원룸", "봉천동", "월세", 500, 48, "원룸", 22, 5, "즉시"],
  ["신림역 먹자골목 뒤 조용한 원룸", "신림동", "월세", 300, 40, "원룸", 18, 2, "즉시"],
  ["신림 고시촌 리모델링 원룸, 즉시 입주", "신림동", "월세", 200, 35, "원룸", 15, 4, "즉시"],
  ["노량진 학원가 도보 5분 원룸, 책상 옵션", "노량진동", "월세", 500, 46, "원룸", 18, 6, "즉시"],
  ["잠실새내역 신축 오피스텔, 헬스장 포함", "잠실동", "월세", 1000, 85, "오피스텔", 28, 15, "2026-08-01"],
  ["잠실 리센츠 인근 투룸 전세, 학군 좋아요", "잠실동", "전세", 42000, 0, "투룸", 49, 9, "2026-09-10"],
  ["방이동 먹자골목 인근 깔끔한 원룸", "방이동", "월세", 500, 58, "원룸", 21, 3, "즉시"],
  ["왕십리역 트리플 역세권 오피스텔", "행당동", "월세", 1000, 74, "오피스텔", 25, 11, "즉시"],
  ["행당동 신혼부부 추천 투룸 전세", "행당동", "전세", 29000, 0, "투룸", 44, 7, "2026-08-20"],
  ["회기역 경희대 도보 3분 대학가 원룸", "회기동", "월세", 300, 38, "원룸", 16, 2, "즉시"],
  ["외대앞 이문동 넓은 원룸, 옥탑 아님", "이문동", "월세", 300, 36, "원룸", 19, 3, "즉시"],
  ["역삼역 도보 3분 신축 오피스텔, 출퇴근 최적", "역삼동", "월세", 1000, 95, "오피스텔", 27, 14, "즉시"],
  ["역삼동 테헤란로 이면 조용한 원룸", "역삼동", "월세", 1000, 88, "원룸", 23, 4, "2026-07-30"],
  ["논현동 가로수길 인근 감각적인 원룸", "논현동", "월세", 2000, 98, "원룸", 26, 5, "즉시"],
  ["마곡나루역 5분 신축 오피스텔, LG 출퇴근", "마곡동", "월세", 1000, 70, "오피스텔", 26, 10, "2026-08-05"],
  ["불광역 인근 넓은 빌라 전세, 주차 1대", "불광동", "전세", 19000, 0, "빌라", 38, 2, "즉시"],
  ["연신내 상권 도보권 아늑한 원룸", "불광동", "월세", 500, 45, "원룸", 19, 3, "즉시"],
  ["목동 학원가 인근 투룸 전세, 초품아", "목동", "전세", 26000, 0, "투룸", 43, 8, "2026-09-01"],
  ["건대입구역 5분 젊은 감성 원룸", "자양동", "월세", 500, 55, "원룸", 20, 6, "즉시"],
  ["자양동 뚝섬유원지 인근 리버뷰 오피스텔", "자양동", "월세", 1000, 72, "오피스텔", 25, 13, "2026-08-01"],
  ["문래창작촌 감성 로프트 원룸", "문래동", "월세", 500, 50, "원룸", 22, 2, "즉시"],
  ["성신여대입구 도보 4분 여성 추천 원룸", "돈암동", "월세", 300, 40, "원룸", 17, 5, "즉시"],
  ["홍제천 산책로 앞 조용한 원룸", "홍제동", "월세", 300, 42, "원룸", 18, 3, "즉시"],
  ["천호역 로데오 인근 풀옵션 오피스텔", "천호동", "월세", 500, 60, "오피스텔", 23, 9, "즉시"],
  ["옥수역 3분 금호산 자락 전세 원룸", "옥수동", "전세", 21000, 0, "원룸", 24, 4, "2026-08-25"],
  ["한남더힐 인근 하이엔드 투룸", "한남동", "월세", 5000, 150, "투룸", 52, 3, "협의"]
];

async function api(path, init = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) }
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, ok: res.ok, json };
}

async function loginOrSignup() {
  const login = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: SEED_EMAIL, password: SEED_PASSWORD })
  });
  if (login.ok && login.json?.accessToken) return login.json.accessToken;

  const signup = await api("/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      email: SEED_EMAIL,
      password: SEED_PASSWORD,
      passwordConfirm: SEED_PASSWORD,
      name: "우주부동산",
      phone: "010-5555-0100",
      role: "LANDLORD",
      buildingName: "우주부동산 서울지점",
      roomNo: "101",
      address: "서울 마포구 양화로 45"
    })
  });
  if (signup.json?.accessToken) return signup.json.accessToken;

  const retry = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: SEED_EMAIL, password: SEED_PASSWORD })
  });
  if (retry.ok && retry.json?.accessToken) return retry.json.accessToken;
  throw new Error(`시드 계정 로그인 실패: ${JSON.stringify(retry.json)}`);
}

async function main() {
  console.log(`API_BASE = ${API_BASE}`);
  const token = await loginOrSignup();
  const auth = { Authorization: `Bearer ${token}` };

  const existing = await api("/trade/listings");
  if (!existing.ok || !Array.isArray(existing.json)) {
    throw new Error(`매물 목록 조회 실패: ${existing.status}`);
  }

  if (WIPE) {
    const mine = existing.json.filter((l) => l.ownerName === "우주부동산");
    for (const listing of mine) {
      const res = await api(`/trade/listings/${listing.id}`, { method: "DELETE", headers: auth });
      console.log(`  삭제 ${res.ok ? "OK" : res.status}: ${listing.title}`);
    }
    console.log(`완료 — ${mine.length}개 삭제`);
    return;
  }

  const existingTitles = new Set(existing.json.map((l) => l.title));
  let created = 0;
  let skipped = 0;

  for (let i = 0; i < LISTINGS.length; i += 1) {
    const [title, hood, tradeType, deposit, monthly, roomType, area, floor, moveIn] = LISTINGS[i];
    if (existingTitles.has(title)) { skipped += 1; continue; }

    const rand = mulberry32(1000 + i);
    const [baseLat, baseLng] = HOODS[hood];
    const photoStart = Math.floor(rand() * PHOTO_IDS.length);
    const photoCount = 2 + Math.floor(rand() * 2);
    const images = Array.from({ length: photoCount }, (_, k) =>
      photoUrl(PHOTO_IDS[(photoStart + k) % PHOTO_IDS.length])
    );

    const payload = {
      title,
      roomType,
      tradeType,
      depositManwon: deposit,
      monthlyRentManwon: monthly,
      location: `서울 ${GU[hood]} ${hood}`,
      description: `전용 ${area}m² · ${floor}층 · 입주 ${moveIn}`,
      images,
      lat: baseLat + (rand() - 0.5) * 0.0045,
      lng: baseLng + (rand() - 0.5) * 0.0045
    };

    const res = await api("/trade/listings", { method: "POST", headers: auth, body: JSON.stringify(payload) });
    if (res.ok) {
      created += 1;
      console.log(`  등록: ${title}`);
    } else {
      console.error(`  실패 ${res.status}: ${title} → ${JSON.stringify(res.json)}`);
    }
  }

  console.log(`완료 — 등록 ${created}개, 건너뜀(기존) ${skipped}개`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
