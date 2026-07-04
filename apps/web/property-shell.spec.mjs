import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync(new URL("./src/app/page.tsx", import.meta.url), "utf8");
const floorPlanPagePath = new URL("./src/app/floor-plan-3d/page.tsx", import.meta.url);
const floorPlanPageSource = existsSync(floorPlanPagePath) ? readFileSync(floorPlanPagePath, "utf8") : "";
const floorPlanEditorPath = new URL("./src/app/floor-plan-3d/RoomlogFloorPlanEditor.tsx", import.meta.url);
const floorPlanEditorSource = existsSync(floorPlanEditorPath) ? readFileSync(floorPlanEditorPath, "utf8") : "";
const floorPlanWorkerPath = new URL("./src/app/floor-plan-3d/floor-plan-extraction.worker.ts", import.meta.url);
const floorPlanWorkerSource = existsSync(floorPlanWorkerPath) ? readFileSync(floorPlanWorkerPath, "utf8") : "";
const globalsCssSource = readFileSync(new URL("./src/app/globals.css", import.meta.url), "utf8");
const webPackageSource = readFileSync(new URL("./package.json", import.meta.url), "utf8");
const floorPlanRouteSource = `${floorPlanPageSource}\n${floorPlanEditorSource}`;
const floorPlanVisualSource = `${floorPlanRouteSource}\n${globalsCssSource}`;
const cssSource = globalsCssSource;
const layoutSource = readFileSync(new URL("./src/app/layout.tsx", import.meta.url), "utf8");
const manifestSource = readFileSync(new URL("./src/app/manifest.ts", import.meta.url), "utf8");
const pwaRegisterSource = readFileSync(new URL("./src/app/pwa-register.tsx", import.meta.url), "utf8");
const serviceWorkerSource = readFileSync(new URL("./public/sw.js", import.meta.url), "utf8");
const nextConfigSource = readFileSync(new URL("./next.config.ts", import.meta.url), "utf8");
const dockerComposeSource = readFileSync(new URL("../../docker-compose.yml", import.meta.url), "utf8");
const prodComposeSource = readFileSync(new URL("../../docker-compose.prod.yml", import.meta.url), "utf8");
const deployWorkflowSource = readFileSync(new URL("../../.github/workflows/deploy.yml", import.meta.url), "utf8");
const apiDockerfileSource = readFileSync(new URL("../api/Dockerfile", import.meta.url), "utf8");
const webDockerfileSource = readFileSync(new URL("./Dockerfile", import.meta.url), "utf8");
const googleAuthSharedSource = readFileSync(new URL("./src/app/api/auth/google/_shared.ts", import.meta.url), "utf8");
const signupPageSource = readFileSync(new URL("./src/app/signup/page.tsx", import.meta.url), "utf8");
const signupRouteSource = readFileSync(new URL("./src/app/api/auth/signup/route.ts", import.meta.url), "utf8");
const loginRouteSource = readFileSync(new URL("./src/app/api/auth/login/route.ts", import.meta.url), "utf8");
const tenantMessagingListSource = readFileSync(new URL("./src/app/tenant/messaging/00/page.tsx", import.meta.url), "utf8");
const tenantMessagingThreadSource = readFileSync(new URL("./src/app/tenant/messaging/01/page.tsx", import.meta.url), "utf8");
const tenantMessagingAnnouncementSource = readFileSync(new URL("./src/app/tenant/messaging/02/page.tsx", import.meta.url), "utf8");
const tenantMessagingApiSource = readFileSync(new URL("./src/lib/messaging-api.ts", import.meta.url), "utf8");
const messageAutoRefreshPath = new URL("./src/app/_components/MessageAutoRefresh.tsx", import.meta.url);
const messageAutoRefreshSource = existsSync(messageAutoRefreshPath)
  ? readFileSync(messageAutoRefreshPath, "utf8")
  : "";
const managerMessagingListSource = readFileSync(new URL("./src/app/manager/messaging/00/page.tsx", import.meta.url), "utf8");
const managerMessagingReviewSource = readFileSync(new URL("./src/app/manager/messaging/02/page.tsx", import.meta.url), "utf8");
const managerMessagingComposeSource = readFileSync(new URL("./src/app/manager/messaging/01/page.tsx", import.meta.url), "utf8");
const managerMessagingThreadSource = readFileSync(new URL("./src/app/manager/messaging/04/page.tsx", import.meta.url), "utf8");
const managerMessagingResultSource = readFileSync(new URL("./src/app/manager/messaging/03/page.tsx", import.meta.url), "utf8");
const managerContractPageSource = readFileSync(new URL("./src/app/manager/contract/01/page.tsx", import.meta.url), "utf8");
const managerContractApiSource = readFileSync(new URL("./src/lib/contract-manager-api.ts", import.meta.url), "utf8");
const managerMessagingApiSource = readFileSync(new URL("./src/lib/messaging-manager-api.ts", import.meta.url), "utf8");

test("serves role frontends from the single web container on port 3000", () => {
  for (const source of [dockerComposeSource, prodComposeSource]) {
    assert.match(source, /^\s{2}web:/m);
    assert.match(source, /container_name: roomlog-web/);
    assert.match(source, /"3000:3000"/);
    assert.doesNotMatch(source, /^\s{2}tenant:/m);
    assert.doesNotMatch(source, /^\s{2}manager:/m);
    assert.doesNotMatch(source, /^\s{2}vendor:/m);
    assert.doesNotMatch(source, /roomlog-tenant|roomlog-manager|roomlog-vendor/);
    assert.doesNotMatch(source, /3001:3001|3002:3002|3003:3003/);
  }

  assert.match(webDockerfileSource, /COPY assets assets/);
  assert.match(webDockerfileSource, /EXPOSE 3000/);
  assert.match(webDockerfileSource, /CMD \["pnpm", "--filter", "web", "start"\]/);
});

test("production deploy removes stale role containers before rebinding port 3000", () => {
  assert.match(deployWorkflowSource, /roomlog-web roomlog-api/);
  assert.match(deployWorkflowSource, /up -d --build --remove-orphans/);
  assert.match(deployWorkflowSource, /docker ps -a --filter "name=roomlog"/);
});

test("routes server-side web API calls to the api container in Docker", () => {
  const internalApiPattern = /API_INTERNAL_URL:\s*\$\{API_INTERNAL_URL:-http:\/\/api:4000\}/;

  assert.match(dockerComposeSource, internalApiPattern);
  assert.match(prodComposeSource, internalApiPattern);
  assert.match(deployWorkflowSource, /API_INTERNAL_URL: "\$\{\{ secrets\.API_INTERNAL_URL \}\}"/);
  assert.match(deployWorkflowSource, /API_INTERNAL_URL="\$\{API_INTERNAL_URL:-http:\/\/api:4000\}"/);
  assert.match(deployWorkflowSource, /API_INTERNAL_URL=\$\{API_INTERNAL_URL\}/);
});

test("production web container can reach the API over the Docker network for auth BFF routes", () => {
  assert.match(prodComposeSource, /API_INTERNAL_URL:\s*\$\{API_INTERNAL_URL:-http:\/\/api:4000\}/);
});

test("local Docker web container can reach the API over the Docker network for auth BFF routes", () => {
  assert.match(dockerComposeSource, /API_INTERNAL_URL:\s*\$\{API_INTERNAL_URL:-http:\/\/api:4000\}/);
});

test("production web container receives Google OAuth runtime configuration", () => {
  assert.match(prodComposeSource, /ROOMLOG_PUBLIC_ORIGIN:\s*\$\{ROOMLOG_PUBLIC_ORIGIN:-https:\/\/www\.woo-zu\.com\}/);
  assert.match(prodComposeSource, /GOOGLE_LOGIN_CLIENT_ID:\s*\$\{GOOGLE_LOGIN_CLIENT_ID:-\}/);
  assert.match(prodComposeSource, /GOOGLE_LOGIN_CALLBACK_URL:\s*\$\{GOOGLE_LOGIN_CALLBACK_URL:-\}/);
  assert.match(deployWorkflowSource, /GOOGLE_LOGIN_CLIENT_ID: "\$\{\{ secrets\.GOOGLE_LOGIN_CLIENT_ID \}\}"/);
  assert.match(deployWorkflowSource, /GOOGLE_LOGIN_CLIENT_SECRET: "\$\{\{ secrets\.GOOGLE_LOGIN_CLIENT_SECRET \}\}"/);
});

test("api image trusts the Amazon RDS certificate bundle for TLS database connections", () => {
  assert.match(apiDockerfileSource, /truststore\.pki\.rds\.amazonaws\.com\/global\/global-bundle\.pem/);
  assert.match(apiDockerfileSource, /NODE_EXTRA_CA_CERTS=\/usr\/local\/share\/ca-certificates\/aws-rds-global-bundle\.pem/);
});

test("keeps tenant, manager, and vendor entry routes available", () => {
  // KAN-130 1-E: 거대 단일-page 뷰 셸은 은퇴하고, 역할 진입 인덱스는 App Router
  // 도메인 첫 화면으로 리다이렉트한다(화면 = app/<role>/<domain>/<screen>).
  const redirectTargets = {
    tenant: "/?role=tenant&tab=mypage",
    manager: "/?role=landlord&tab=mypage",
    vendor: "/vendor/job/00"
  };
  for (const route of ["tenant", "manager", "vendor"]) {
    assert.equal(existsSync(new URL(`./src/app/${route}/page.tsx`, import.meta.url)), true);
    assert.equal(existsSync(new URL(`./src/app/${route}/layout.tsx`, import.meta.url)), true);

    const routePageSource = readFileSync(new URL(`./src/app/${route}/page.tsx`, import.meta.url), "utf8");
    assert.match(routePageSource, /redirect\(/);
    assert.match(routePageSource, new RegExp(redirectTargets[route]));
  }
});

test("wires moveout screens to backend mutations instead of static links", () => {
  const tenantMoveoutHomeSource = readFileSync(
    new URL("./src/app/tenant/moveout/00/page.tsx", import.meta.url),
    "utf8",
  );
  const tenantRecordsSource = readFileSync(
    new URL("./src/app/tenant/moveout/01/page.tsx", import.meta.url),
    "utf8",
  );
  const tenantSettlementSource = readFileSync(
    new URL("./src/app/tenant/moveout/03/page.tsx", import.meta.url),
    "utf8",
  );
  const tenantDisputeSource = readFileSync(
    new URL("./src/app/tenant/moveout/04/page.tsx", import.meta.url),
    "utf8",
  );
  const tenantChecklistSource = readFileSync(
    new URL("./src/app/tenant/moveout/02/page.tsx", import.meta.url),
    "utf8",
  );
  const managerReviewSource = readFileSync(
    new URL("./src/app/manager/moveout/02/page.tsx", import.meta.url),
    "utf8",
  );
  const managerDisputeSource = readFileSync(
    new URL("./src/app/manager/moveout/03/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(tenantMoveoutHomeSource, /listMoveouts/);
  assert.match(tenantMoveoutHomeSource, /getChecklist/);
  assert.match(tenantMoveoutHomeSource, /getDisputes/);
  assert.match(tenantMoveoutHomeSource, /completionProgress/);
  assert.match(tenantMoveoutHomeSource, /notificationItems/);
  assert.doesNotMatch(tenantMoveoutHomeSource, /DEMO_MOVEOUT_ID/);
  assert.doesNotMatch(tenantMoveoutHomeSource, /<span[\s\S]*>\s*1\s*<\/span>/);
  assert.match(tenantRecordsSource, /SOURCE_ROUTE/);
  assert.match(tenantRecordsSource, /evidenceUrls/);
  assert.match(tenantRecordsSource, /targetItemId=\$\{record\.id\}/);
  assert.match(tenantRecordsSource, /근거 상세/);
  assert.doesNotMatch(tenantRecordsSource, /href=\{MOVEOUT_ROUTES\["T-OUT-04"\]\}/);
  assert.match(tenantSettlementSource, /createMoveoutInquiry/);
  assert.match(tenantSettlementSource, /action=\{createInquiryAction\}/);
  assert.match(tenantSettlementSource, /attachmentUrlsFrom/);
  assert.match(tenantSettlementSource, /targetItemId=\$\{deduction\.id\}/);
  assert.match(tenantSettlementSource, /SOURCE_ROUTE/);
  assert.match(tenantSettlementSource, /계약 정보 확정 후 예상 정산 안내/);
  assert.match(tenantDisputeSource, /createMoveoutDispute/);
  assert.match(tenantDisputeSource, /action=\{createDisputeAction\}/);
  assert.match(tenantDisputeSource, /updateTenantMoveoutDispute/);
  assert.match(tenantDisputeSource, /action=\{updateDisputeAction\}/);
  assert.match(tenantDisputeSource, /escalateMoveoutDispute/);
  assert.match(tenantDisputeSource, /action=\{escalateDisputeAction\}/);
  assert.match(tenantDisputeSource, /name="targetItemId"/);
  assert.match(tenantDisputeSource, /attachmentUrlsFrom/);
  assert.match(tenantChecklistSource, /updateMoveoutChecklist/);
  assert.match(tenantChecklistSource, /action=\{saveChecklistAction\}/);
  assert.match(managerReviewSource, /completeReview/);
  assert.match(managerReviewSource, /action=\{completeReviewAction\}/);
  assert.match(managerDisputeSource, /respondDispute/);
  assert.match(managerDisputeSource, /action=\{respondDisputeAction\}/);

  assert.doesNotMatch(tenantSettlementSource, /disabled[\s\S]*관리자 문의/);
  assert.doesNotMatch(tenantDisputeSource, /<Link href=\{MOVEOUT_ROUTES\["T-OUT-00"\]\}[\s\S]*이의 제출/);
  assert.doesNotMatch(tenantDisputeSource, /disabled=\{!dispute\.slaBreached\}/);
  assert.doesNotMatch(tenantChecklistSource, /<Link href=\{MOVEOUT_ROUTES\["T-OUT-00"\]\}[\s\S]*체크 저장/);
  assert.doesNotMatch(managerReviewSource, /<DisabledButton>정산안 저장<\/DisabledButton>/);
  assert.doesNotMatch(managerDisputeSource, /<LinkButton href=\{MANAGER_MOVEOUT_ROUTES\["M-OUT-00"\]\}>응답 발송<\/LinkButton>/);
});

test("opens tenant message compose only from real API thread ids", () => {
  assert.doesNotMatch(tenantMessagingThreadSource, /DEMO_THREAD_ID/);
  assert.doesNotMatch(tenantMessagingApiSource, /getThread\(id: string = DEMO_THREAD_ID/);
  assert.match(tenantMessagingApiSource, /deleteTenantThread/);
  assert.match(tenantMessagingThreadSource, /if \(!id\)/);
  assert.match(tenantMessagingThreadSource, /redirect\(MESSAGING_ROUTES\["T-MSG-00"\]\)/);
  assert.match(tenantMessagingListSource, /MESSAGING_ROUTES\["T-MSG-01"\][\s\S]*\?id=\$\{thread\.id\}/);
  assert.match(tenantMessagingListSource, /deleteTenantThreadAction/);
  assert.match(tenantMessagingListSource, /action=\{deleteTenantThreadAction\}/);
  assert.match(tenantMessagingThreadSource, /deleteTenantThreadAction/);
  assert.match(tenantMessagingThreadSource, /action=\{deleteTenantThreadAction\}/);
  assert.match(tenantMessagingAnnouncementSource, /createAnnouncementInquiryAction/);
  assert.match(tenantMessagingAnnouncementSource, /createTenantThread/);
  assert.match(tenantMessagingAnnouncementSource, /action=\{createAnnouncementInquiryAction\}/);
  assert.match(tenantMessagingAnnouncementSource, /context:\s*"announcement"/);
  assert.match(tenantMessagingAnnouncementSource, /redirect\(`\$\{MESSAGING_ROUTES\["T-MSG-01"\]\}\?id=\$\{encodeURIComponent\(thread\.id\)\}`\)/);
  assert.doesNotMatch(tenantMessagingListSource, /MESSAGING_ROUTES\["T-MSG-01"\][^?]*새 문의 시작/);
  assert.doesNotMatch(tenantMessagingAnnouncementSource, /MESSAGING_ROUTES\["T-MSG-01"\][^\n]*announcementId/);
});

test("opens manager message compose only from real API thread ids", () => {
  assert.doesNotMatch(managerMessagingThreadSource, /DEMO_MANAGER_THREAD_ID/);
  assert.doesNotMatch(managerMessagingApiSource, /getManagerThread\(id: string = DEMO_MANAGER_THREAD_ID/);
  assert.doesNotMatch(managerMessagingApiSource, /thread\.id === id \|\| thread\.unitId === id/);
  assert.match(managerMessagingApiSource, /deleteManagerThread/);
  assert.match(managerMessagingThreadSource, /type SearchParams = Promise<\{ id\?: string \}>/);
  assert.match(managerMessagingThreadSource, /if \(!id\)/);
  assert.match(managerMessagingThreadSource, /redirect\(MANAGER_MESSAGING_ROUTES\["M-MSG-00"\]\)/);
  assert.match(managerMessagingListSource, /deleteManagerThreadAction/);
  assert.match(managerMessagingListSource, /action=\{deleteManagerThreadAction\}/);
  assert.match(managerMessagingThreadSource, /deleteManagerThreadAction/);
  assert.match(managerMessagingThreadSource, /action=\{deleteManagerThreadAction\}/);
  assert.doesNotMatch(managerContractPageSource, /th_mgr_302/);
  assert.doesNotMatch(managerContractApiSource, /th_mgr_302/);
  assert.doesNotMatch(managerMessagingResultSource, /MESSAGING_ROUTES\["M-MSG-04"\][\s\S]*unitId=/);
});

test("redirects messaging detail auth failures instead of rendering a Next error boundary", () => {
  for (const [source, loginPath] of [
    [tenantMessagingThreadSource, "/tenant/login"],
    [tenantMessagingAnnouncementSource, "/tenant/login"],
    [managerMessagingReviewSource, "/manager/login"],
    [managerMessagingThreadSource, "/manager/login"],
    [managerMessagingResultSource, "/manager/login"]
  ]) {
    assert.match(source, /error instanceof ApiError/);
    assert.match(source, /error\.status === 401 \|\| error\.status === 403/);
    assert.match(source, new RegExp(`redirect\\("${loginPath}"\\)`));
  }
});

test("auto-refreshes open messaging thread details without infrastructure changes", () => {
  assert.equal(existsSync(messageAutoRefreshPath), true);
  assert.match(messageAutoRefreshSource, /"use client"/);
  assert.match(messageAutoRefreshSource, /useRouter/);
  assert.match(messageAutoRefreshSource, /router\.refresh\(\)/);
  assert.match(messageAutoRefreshSource, /setInterval/);
  assert.match(messageAutoRefreshSource, /document\.visibilityState/);
  assert.match(tenantMessagingThreadSource, /<MessageAutoRefresh /);
  assert.match(managerMessagingThreadSource, /<MessageAutoRefresh /);
});

test("manager announcement compose creates editable drafts before review", () => {
  assert.match(managerMessagingComposeSource, /createAnnouncementDraft/);
  assert.match(managerMessagingComposeSource, /action=\{createDraftAction\}/);
  assert.match(managerMessagingComposeSource, /name="title"/);
  assert.match(managerMessagingComposeSource, /name="body"/);
  assert.match(managerMessagingComposeSource, /name="category"/);
  assert.match(managerMessagingComposeSource, /name="scope"/);
  assert.match(managerMessagingApiSource, /createAnnouncementDraft/);
  assert.match(managerMessagingApiSource, /method: "POST"/);
  assert.doesNotMatch(managerMessagingComposeSource, /value=\{draft\.title\} readOnly/);
  assert.doesNotMatch(managerMessagingComposeSource, /<StaticButton>임시 저장<\/StaticButton>/);
});

test("renders a mobile real-estate app shell with search, map list, and listing detail sections", () => {
  for (const label of ["조건에 맞는 방", "지도 열기", "추천 매물", "매물 57804322", "전체"]) {
    assert.match(pageSource, new RegExp(label));
  }
});

test("opens the public website directly on the listing home instead of signup", () => {
  assert.match(pageSource, /useState<AppRole>\("seeker"\)/);
  assert.doesNotMatch(pageSource, /useState<AppRole \| null>\(null\)/);
});

test("promotes the future 3D room tour as a primary listing detail action", () => {
  assert.match(pageSource, /3D\s*(가상\s*)?투어/);
  assert.match(pageSource, /투어\s*예약/);
  assert.match(pageSource, /방문 전 3D로 먼저 보기/);
  assert.match(pageSource, /공간 미리보기/);
  assert.match(cssSource, /\.tour-sheet/);
  assert.match(cssSource, /\.tour-preview-stage/);
  assert.doesNotMatch(pageSource, /3D ENGINE SLOT|다른 팀의 3D 엔진|연결될 위치/);
});

test("offers a clean white social sign-in limited to Naver and Google with a developer shortcut", () => {
  for (const label of [
    "네이버",
    "Google",
    "개발용 로그인",
    "집우집주",
    "소셜 로그인으로 관심 매물과 문의 내역을 이어서 볼 수 있습니다",
    "3D투어",
    "입주관리AI",
    "업체연결"
  ]) {
    assert.match(pageSource, new RegExp(label));
  }

  assert.match(pageSource, /socialLoginNotice/);
  assert.match(pageSource, /setSocialLoginNotice/);
  assert.match(pageSource, /service-login-panel/);
  assert.match(pageSource, /submitServiceLogin/);
  assert.match(pageSource, /\/api\/auth\/login/);
  assert.match(pageSource, /expectedRole: "SEEKER"/);
  assert.match(loginRouteSource, /expectedRole/);
  assert.match(loginRouteSource, /profile\.role !== expectedRole/);
  assert.match(pageSource, /\/api\/auth\/me/);
  assert.match(pageSource, /setActiveRole/);
  assert.match(pageSource, /login-brandmark/);
  assert.match(pageSource, /brand-mark-icon/);
  assert.match(cssSource, /\.login-phone\s*{[^}]*background:\s*#ffffff/s);
  assert.match(cssSource, /\.login-feature-bar/);
  assert.match(cssSource, /\.social-login-notice/);
  assert.doesNotMatch(pageSource, /카카오로 계속하기/);
  assert.doesNotMatch(pageSource, /Apple로 계속하기/);
  assert.doesNotMatch(pageSource, /assets\/img\/image\.png/);
  assert.doesNotMatch(pageSource, /loginHeroImage/);
  assert.doesNotMatch(pageSource, /login-visual/);
  assert.doesNotMatch(pageSource, /login-hero-image/);
  assert.doesNotMatch(cssSource, /\.login-visual/);
  assert.doesNotMatch(cssSource, /\.login-hero-image/);
  assert.doesNotMatch(cssSource, /\.social-button\.kakao/);
  assert.doesNotMatch(cssSource, /\.social-button\.apple/);
  assert.doesNotMatch(pageSource, /개발 중에는/);
  assert.doesNotMatch(pageSource, /pin-a|pin-b|pin-c/);
});

test("opens the dedicated signup page from signup actions and social fallback", () => {
  assert.match(pageSource, /const \[authMode, setAuthMode\]/);
  assert.match(pageSource, /openAuthScreen/);
  assert.match(pageSource, /normalizeAuthMode/);
  assert.match(pageSource, /socialProvidersForMode/);
  assert.match(pageSource, /flow=\$\{flow\}/);
  assert.match(pageSource, /role=SEEKER/);
  assert.match(pageSource, /className="web-signup"/);
  assert.match(pageSource, /window\.location\.href = "\/signup"/);
  assert.equal(existsSync(new URL("./src/app/signup/page.tsx", import.meta.url)), true);
  assert.equal(existsSync(new URL("./src/app/signup/social/page.tsx", import.meta.url)), true);
  assert.match(googleAuthSharedSource, /roomlog\.local\/signup/);
  assert.doesNotMatch(googleAuthSharedSource, /roomlog\.local\/signup\/social/);
  assert.match(signupPageSource, /role: "SEEKER"/);
  assert.match(signupPageSource, /Google로 회원가입/);
  assert.match(signupRouteSource, /apiUrl\("\/auth\/signup"/);
  assert.match(signupRouteSource, /AUTH_COOKIE/);
  assert.match(pageSource, /className="web-login"[^>]*onClick=\{\(\) => openAuthScreen\("login"\)\}/);
  assert.match(pageSource, /className="web-cta"[^>]*onClick=\{\(\) => openAuthScreen\("broker"\)\}/);
  assert.doesNotMatch(pageSource, /className="web-signup"[^>]*activateTab\("mypage"\)/);
});

test("borrows mature Zigbang and Dabang product patterns for trust and map search", () => {
  for (const label of [
    "확인매물",
    "실매물 확인",
    "안심 리포트",
    "헛걸음 보상",
    "현장촬영",
    "그리기",
    "전체 방",
    "주변 안전",
    "조건 저장",
    "전월세 평균",
    "지도 기반 검색",
    "방배동",
    "선택 조건",
    "조건에 맞는 확인매물",
    "AI 안전분석",
    "중개사 평점",
    "48시간 안에 계약 가능",
    "허위매물 차단",
    "지도 결과 요약",
    "평균 응답",
    "오늘 현장확인",
    "3D 투어 가능",
    "어디에서 방을 찾을까요",
    "통합검색",
    "최근 검색",
    "최근 검색어가 없습니다",
    "인기 지역",
    "지하철로 찾기",
    "정렬 방식",
    "최신순",
    "낮은 월세순",
    "3D 투어 우선",
    "우선 매물",
    "찜 해제",
    "아직 찜한 매물이 없습니다",
    "조건에 맞는 추천 매물이 없습니다",
    "기본 조건으로 보기",
    "단지 18곳",
    "인근 중개사무소 9곳",
    "단지 매물 보기",
    "보유 매물",
    "낮은 월세 우선",
    "안심 점수 높은 순",
    "원룸·복층 중심",
    "실시간 지도 연동",
    "지도 생활권 요약",
    "CCTV 12곳",
    "조건 저장",
    "지도 조건 알림",
    "최근 본 방",
    "문의 대기",
    "방 내놓기",
    "알림센터",
    "새 매물",
    "답변 대기",
    "집주인 등록 매물",
    "내 조건 요약",
    "보증금 1,000만 · 월세 130만 이하",
    "실거주 체크",
    "등기·권리",
    "상세 공개",
    "방배동 생활권 요약",
    "지도에서 비교하기",
    "AI중개사 추천",
    "조건을 읽고 먼저 볼 방을 골랐어요",
    "1순위 보기",
    "대체 후보",
    "동네정보 랭킹",
    "생활 점수",
    "교통, 생활, 안전 정보를 방문 전에 빠르게 비교합니다"
  ]) {
    assert.match(pageSource, new RegExp(label));
  }

  assert.match(cssSource, /\.ai-broker-card/);
  assert.match(cssSource, /\.neighborhood-rank-card/);
  assert.match(cssSource, /\.neighborhood-rank-list/);
});

test("makes filters and saved listings behave like interactive app state", () => {
  assert.match(pageSource, /useState\(categories\[0\]\.label\)/);
  assert.match(pageSource, /useState<string\[\]>\(\[\]\)/);
  assert.match(pageSource, /activeCategory === "전체"[\s\S]*\? true/);
  assert.match(pageSource, /activeQuickFilters/);
  assert.match(pageSource, /visibleHomeListings/);
  assert.match(pageSource, /visibleHomeCount/);
  assert.ok(pageSource.indexOf("<h2>추천 매물</h2>") < pageSource.indexOf("condition-summary-card"));
  assert.ok(pageSource.indexOf("listing-feed") < pageSource.indexOf("ai-broker-card"));
  assert.match(cssSource, /\.app-header h1\s*{[^}]*font-size:\s*1\.48rem/s);
  assert.match(cssSource, /\.search-box\s*{[^}]*min-height:\s*50px/s);
  assert.match(cssSource, /\.category-card\s*{[^}]*min-height:\s*66px/s);
  assert.match(pageSource, /Icon:\s*DoorOpen/);
  assert.match(pageSource, /const CategoryIcon = category\.Icon/);
  assert.match(pageSource, /<CategoryIcon size=\{18\}/);
  assert.doesNotMatch(pageSource, /category\.icon/);
  assert.match(cssSource, /\.category-card i svg\s*{[^}]*width:\s*18px/s);
  assert.match(cssSource, /\.listing-photo img\s*{[^}]*height:\s*126px/s);
  assert.match(cssSource, /\.listing-meta-row\s*{/);
  assert.match(pageSource, /listing-status-line/);
  assert.match(pageSource, /listing-card-footer/);
  assert.match(pageSource, /listing\.listingLabel/);
  assert.match(pageSource, /listing\.updated/);
  assert.match(pageSource, /listing\.broker/);
  assert.match(pageSource, /listing\.verification/);
  assert.match(pageSource, /listing\.response/);
  assert.match(pageSource, /문자문의/);
  assert.match(cssSource, /\.listing-status-line/);
  assert.match(cssSource, /\.listing-card-footer/);
  assert.match(pageSource, /toggleQuickFilter/);
  assert.match(pageSource, /activeMapFilter/);
  assert.match(pageSource, /savedListingNos/);
  assert.match(pageSource, /toggleSavedListing/);
  assert.match(pageSource, /FilterBottomSheet/);
  assert.match(pageSource, /resultCount:\s*number/);
  assert.match(pageSource, /filter-summary-card/);
  assert.match(pageSource, /현재 필터 요약/);
  assert.match(pageSource, /거래 유형/);
  assert.match(pageSource, /filter-segment-grid/);
  assert.match(pageSource, /filter-range-panel/);
  assert.match(pageSource, /가격 범위/);
  assert.match(pageSource, /filter-priority-grid/);
  assert.match(pageSource, /입주·검수/);
  assert.match(pageSource, /조건 적용하고 \{resultCount\}개 보기/);
  assert.match(pageSource, /resultCount=\{activeTab === "map" \? visibleMapListings\.length : visibleHomeCount\}/);
  assert.doesNotMatch(pageSource, /조건 적용하고 42개 보기/);
  assert.match(pageSource, /setIsFilterSheetOpen\(true\)/);
  assert.match(pageSource, /setIsSearchSheetOpen\(true\)/);
  assert.match(pageSource, /SearchBottomSheet/);
  assert.match(pageSource, /selectSearchArea/);
  assert.match(pageSource, /const \[searchValue, setSearchValue\] = useState\(currentArea\)/);
  assert.match(pageSource, /submitSearch/);
  assert.match(pageSource, /onSubmit=\{\(event\) =>/);
  assert.match(pageSource, /setSearchValue\(event\.target\.value\)/);
  assert.match(pageSource, /button type="submit"/);
  assert.match(pageSource, /normalizedSearchValue/);
  assert.match(pageSource, /searchPreviewCount/);
  assert.match(pageSource, /search-live-preview/);
  assert.match(pageSource, /검색 결과 미리보기/);
  assert.match(pageSource, /지도에서 \{normalizedSearchValue\} 보기/);
  assert.match(pageSource, /search-condition-strip/);
  assert.match(pageSource, /recentSearches/);
  assert.match(pageSource, /setRecentSearches/);
  assert.match(pageSource, /onClearRecentSearches/);
  assert.match(pageSource, /selectedArea/);
  assert.match(pageSource, /selectedAreaTitle/);
  assert.match(pageSource, /setSelectedArea\(area\)/);
  assert.match(pageSource, /applySavedCondition/);
  assert.match(pageSource, /currentArea=\{selectedArea\}/);
  assert.match(pageSource, /value=\{selectedArea\}/);
  assert.match(pageSource, /const sortOptions/);
  assert.match(pageSource, /SortBottomSheet/);
  assert.match(pageSource, /isSortSheetOpen/);
  assert.match(pageSource, /setActiveSort\(sort\)/);
  assert.match(pageSource, /notificationItems/);
  assert.match(pageSource, /NotificationSheet/);
  assert.match(pageSource, /isNotificationSheetOpen/);
  assert.match(pageSource, /setIsNotificationSheetOpen\(true\)/);
  assert.match(pageSource, /visibleMapListings/);
  assert.match(pageSource, /activeMapFilter === "3D 가능"/);
  assert.match(pageSource, /getMapFilterSummary/);
  assert.match(pageSource, /activeMapFilter === "보증금"/);
  assert.match(pageSource, /activeMapFilter === "안전"/);
  assert.match(pageSource, /activeMapFilter === "원룸·투룸"/);
  assert.match(pageSource, /recencyRank/);
  assert.match(pageSource, /monthlyRent/);
  assert.match(pageSource, /has3DTour/);
  assert.match(pageSource, /type MapResultTab/);
  assert.match(pageSource, /mapResultTabs/);
  assert.match(pageSource, /activeMapResultTab/);
  assert.match(pageSource, /complexCards/);
  assert.match(pageSource, /agentCards/);
  assert.match(pageSource, /setActiveMapResultTab\(tab\.key\)/);
  assert.match(pageSource, /savedListingNos=\{savedListingNos\}/);
  assert.match(pageSource, /listings\.filter\(\(listing\) => savedListingNos\.includes/);
  assert.match(cssSource, /\.filter-feedback/);
  assert.match(cssSource, /\.filter-summary-card/);
  assert.match(cssSource, /\.filter-segment-grid/);
  assert.match(cssSource, /\.filter-range-panel/);
  assert.match(cssSource, /\.filter-priority-grid/);
  assert.match(cssSource, /\.filter-apply-button\s*{[^}]*position:\s*sticky/s);
  assert.match(cssSource, /\.listing-empty-card/);
  assert.match(cssSource, /\.save-listing-button\.saved/);
  assert.match(cssSource, /\.filter-sheet-backdrop/);
  assert.match(cssSource, /\.search-sheet-backdrop/);
  assert.match(cssSource, /\.search-live-preview/);
  assert.match(cssSource, /\.search-live-stats/);
  assert.match(cssSource, /\.search-condition-strip/);
  assert.match(cssSource, /\.sort-sheet-backdrop/);
  assert.match(cssSource, /\.notification-sheet-backdrop/);
  assert.match(cssSource, /\.notification-list/);
  assert.match(cssSource, /\.sort-option-list/);
  assert.match(cssSource, /\.home-action-panel/);
  assert.match(cssSource, /\.home-web-summary-card/);
  assert.match(cssSource, /\.condition-summary-card/);
  assert.match(cssSource, /\.resident-check-card/);
  assert.match(cssSource, /\.map-sort-feedback/);
  assert.match(cssSource, /\.saved-empty-card/);
  assert.match(cssSource, /\.complex-map-card/);
  assert.match(cssSource, /\.agent-map-card/);
  assert.match(cssSource, /\.district-rank-list/);
  assert.match(cssSource, /\.recent-empty/);
});

test("offers three developer login roles for seekers, tenants, and landlords", () => {
  for (const label of ["일반 집보는 사람", "세입자", "집주인"]) {
    assert.match(pageSource, new RegExp(label));
  }

  assert.match(pageSource, /type AppRole/);
  assert.match(pageSource, /roleDisplayLabels/);
  assert.match(pageSource, /seeker:\s*"방 찾기"/);
  assert.match(pageSource, /roleLabel\} 활동에 맞춘 검색 조건/);
  assert.match(pageSource, /setActiveRole\(role\.id\)/);
  assert.match(pageSource, /startRoleSession/);
  assert.match(pageSource, /setActiveTab\(role === "seeker" \? "home" : "mypage"\)/);
  assert.match(pageSource, /function LoginScreen/);
  assert.match(pageSource, /resetWindowScrollSoon/);
  assert.match(pageSource, /window\.setTimeout\(resetWindowScroll, 320\)/);
  assert.match(pageSource, /\[activeRole, activeTab, selectedListing, authMode\]/);
});

test("gives tenants a real resident dashboard instead of the generic profile", () => {
  for (const label of [
    "세입자 마이페이지",
    "계약 상태",
    "수리요청",
    "관리비",
    "방문 일정",
    "에어컨 필터 교체 방문",
    "124,000원",
    "도메인 테스트",
    "메시지 테스트",
    "퇴실 테스트"
  ]) {
    assert.match(pageSource, new RegExp(label));
  }

  assert.match(pageSource, /activeRole === "tenant"/);
  assert.match(pageSource, /href="\/tenant\/messaging\/00"/);
  assert.match(pageSource, /href="\/tenant\/moveout\/00"/);
  assert.match(pageSource, /tenant-domain-test-card/);
  assert.match(cssSource, /\.domain-test-card/);
  assert.match(cssSource, /\.domain-test-link-grid/);
  assert.match(cssSource, /\.domain-test-link/);
  assert.match(cssSource, /\.tenant-contract-card/);
  assert.match(cssSource, /\.maintenance-card/);
  assert.doesNotMatch(pageSource, /HVAC|₩124,000|2:30 PM/);
});

test("shows a landlord my page with property registration fields and media actions", () => {
  for (const label of [
    "집주인 마이페이지",
    "등록 매물 현황",
    "검수 상태",
    "매물 등록 단계",
    "내 집 등록",
    "사진 업로드",
    "3D 도면 만들기",
    "거래유형",
    "보증금",
    "월세",
    "전세금",
    "전세",
    "매물 등록하기",
    "등록 미리보기",
    "입력 계속하기",
    "검수 대기",
    "3D 방 자료가 연결된 상태",
    "3D 방 파일 또는 링크를 등록할 수 있습니다.",
    "집 내놓기 전달 범위",
    "반경 5km",
    "인근 중개사 12곳",
    "검수 준비 체크리스트",
    "등록 완료 전에 빠진 항목을 확인하세요",
    "검수 요청 요약",
    "92%",
    "예상 검수",
    "확인매물·3D 투어 배지",
    "KAN-135 비용 정산",
    "비용 원장과 영수증 검토",
    "이번 달 지출",
    "영수증 검토 큐",
    "검토 완료 처리",
    "관리비 공개 설정",
    "비공개 항목은 임차인 화면에 숨김 건수로 표시됩니다.",
    "KAN-136 업체 관리",
    "업체 주소록과 성과 게이트",
    "등록 업체",
    "신규 배지",
    "성과 게이트",
    "신규·중복 업체 게이트",
    "중복 후보 확인",
    "소표본 업체는 별점 수치와 AI 코멘트를 숨깁니다.",
    "신규 업체는 격리하지 않고 배지만 표시합니다.",
    "도메인 테스트",
    "메시지 테스트",
    "퇴실 테스트",
    "리포트 테스트"
  ]) {
    assert.match(pageSource, new RegExp(label));
  }

  assert.match(pageSource, /href="\/manager\/messaging\/00"/);
  assert.match(pageSource, /href="\/manager\/moveout\/00"/);
  assert.match(pageSource, /href="\/manager\/report\/00"/);
  assert.match(pageSource, /landlord-domain-test-card/);
  assert.match(pageSource, /ownerReviewItems/);
  assert.match(pageSource, /DEMO_COSTS/);
  assert.match(pageSource, /DEMO_MONTHLY_SUMMARY/);
  assert.match(pageSource, /DEMO_RECEIPTS/);
  assert.match(pageSource, /DEMO_VENDORS/);
  assert.match(pageSource, /DEMO_VENDOR_PERF/);
  assert.match(pageSource, /DEMO_VENDOR_DUPLICATE_CANDIDATES/);
  assert.match(pageSource, /id="kan-135-cost"/);
  assert.match(pageSource, /id="kan-136-vendor"/);
  assert.match(pageSource, /selectedVendorId/);
  assert.match(pageSource, /ownerPendingCostReviews/);
  assert.match(pageSource, /ownerOpenDuplicateCount/);
  assert.match(pageSource, /ownerCompletionRate/);
  assert.match(pageSource, /ownerCompletionRate = photoCount >= 3 && has3DRoom \? 92 : 68/);
  assert.match(pageSource, /owner-readiness-card/);
  assert.match(pageSource, /owner-submit-summary/);
  assert.match(pageSource, /ownerForm/);
  assert.match(pageSource, /setOwnerForm/);
  assert.match(pageSource, /photoCount/);
  assert.match(pageSource, /has3DRoom/);
  assert.match(pageSource, /registrationStatus/);
  assert.match(pageSource, /submitOwnerListing/);
  assert.match(pageSource, /continueOwnerRegistration/);
  assert.match(pageSource, /getElementById\("owner-registration-form"\)/);
  assert.match(pageSource, /window\.setTimeout\(scrollToOwnerForm, 360\)/);
  assert.match(pageSource, /id="owner-registration-form"/);
  assert.doesNotMatch(pageSource, /업로드 버튼 대기|전용 업로드 영역|자료 대기/);
  assert.match(cssSource, /\.owner-preview-card/);
  assert.match(cssSource, /\.owner-preview-actions/);
  assert.match(cssSource, /\.owner-preview-actions button/);
  assert.match(cssSource, /\.owner-exposure-card/);
  assert.match(cssSource, /\.owner-exposure-grid/);
  assert.match(cssSource, /\.owner-readiness-card/);
  assert.match(cssSource, /\.owner-readiness-list/);
  assert.match(cssSource, /\.owner-submit-summary/);
  assert.match(cssSource, /\.owner-submit-grid/);
  assert.match(cssSource, /\.owner-ops-grid/);
  assert.match(cssSource, /\.owner-ops-card/);
  assert.match(cssSource, /scroll-margin-top: 96px/);
  assert.match(cssSource, /\.owner-cost-breakdown/);
  assert.match(cssSource, /\.owner-review-panel/);
  assert.match(cssSource, /\.owner-ledger-list/);
  assert.match(cssSource, /\.owner-vendor-list/);
  assert.match(cssSource, /\.owner-perf-gate/);
  assert.match(cssSource, /\.owner-duplicate-strip/);
  assert.match(cssSource, /\.upload-3d-button\.active/);
});

test("adds real bottom-tab destinations for saved listings, inquiries, and profile", () => {
  for (const label of [
    "찜한 매물",
    "문의센터",
    "마이페이지",
    "저장 조건",
    "매물 상세에서 문자문의를 보내면 여기에 표시됩니다",
    "찜한 매물 비교 요약",
    "가격 변동",
    "방문 후보",
    "문의 흐름",
    "문의 채널",
    "원하는 방식으로 바로 확인",
    "로그인 없이 가능",
    "방문예약",
    "문의 진행",
    "검색 조건 관리",
    "최근 본 방",
    "문의 확인"
  ]) {
    assert.match(pageSource, new RegExp(label));
  }

  assert.match(pageSource, /from "lucide-react"/);
  assert.match(pageSource, /Icon: HomeIcon/);
  assert.match(pageSource, /Icon: MapPinned/);
  assert.match(pageSource, /Icon: Heart/);
  assert.match(pageSource, /Icon: MessageCircle/);
  assert.match(pageSource, /Icon: UserRound/);
  assert.match(pageSource, /<Bell/);
  assert.match(pageSource, /<Search/);
  assert.match(pageSource, /<SlidersHorizontal/);
  assert.match(pageSource, /<item\.Icon/);
  assert.match(pageSource, /useState<AppTab>\("home"\)/);
  assert.match(pageSource, /activeTab === item\.key/);
  assert.match(pageSource, /activeTab === "home"/);
  assert.match(pageSource, /activeTab === "map"/);
  assert.match(pageSource, /activeTab === "saved"/);
  assert.match(pageSource, /activeTab === "inquiry"/);
  assert.match(pageSource, /activeTab === "mypage"/);
  assert.match(pageSource, /window\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\)/);
  assert.match(pageSource, /querySelectorAll<HTMLElement>\("\.service-frame, \.screen, \.home-screen, \.map-screen, \.listing-detail-screen"\)/);
  assert.doesNotMatch(pageSource, /onClick=\{\(event\) => \{[\s\S]*scrollIntoView[\s\S]*activateTab\(item\.key\)/);
  assert.match(pageSource, /href: "#saved-list"/);
  assert.match(pageSource, /href: "#inquiry"/);
  assert.match(pageSource, /setInquiries/);
  assert.match(cssSource, /\.inquiry-notice/);
  assert.match(cssSource, /\.saved-compare-strip/);
  assert.match(cssSource, /\.inquiry-timeline-card/);
  assert.match(cssSource, /\.inquiry-channel-card/);
  assert.match(cssSource, /\.profile-account-card/);
  assert.match(cssSource, /\.profile-activity-grid/);
  assert.match(cssSource, /\.profile-inquiry-card/);
  assert.match(cssSource, /\.profile-menu-card/);
  assert.doesNotMatch(pageSource, /icon: "⌂"|icon: "⌖"|icon: "☎"|icon: "◎"/);
  assert.doesNotMatch(pageSource, /♥|♡|⌕/);
});

test("opens a Dabang-like listing detail view from a listing card", () => {
  for (const label of [
    "매물 57804322",
    "매물번호 57804322",
    "매물번호를 복사했어요",
    "매물 공유",
    "매물 공유하기",
    "링크 복사",
    "관심목록 저장",
    "단지 정보 보러가기",
    "단지 리포트",
    "단지 정보",
    "최근 실거래",
    "동일 면적 평균",
    "단지 문의하기",
    "가격 정보",
    "옵션 정보",
    "건물 정보",
    "매물확인 메신저",
    "중개사 정보",
    "대표 공인중개사 김하늘",
    "응답률",
    "최근 후기",
    "중개사 문의하기",
    "간편문의",
    "문자문의",
    "로그인 없이 문의 가능",
    "방문 가능 여부 바로 확인",
    "3D 투어",
    "예약",
    "안심 거래 정보",
    "실매물 확인",
    "평균 8분",
    "실측 도면",
    "헛걸음 보상",
    "지킴 진단 리포트",
    "계약 전 확인할 항목을 정리했어요",
    "등기 변동",
    "보증금 비율",
    "대출·특약",
    "주변 치안",
    "문의 내용 선택",
    "아직 거래 가능한가요",
    "3D 투어 먼저 보고 싶어요",
    "방문 희망 시간",
    "문의 보내기",
    "검수 대기 상태"
  ]) {
    assert.match(pageSource, new RegExp(label));
  }

  for (const label of ["안심 거래 정보", "문의 가능", "등록 사진", "중개사 검수", "방배동 · 내방역 도보 5분"]) {
    assert.match(pageSource, new RegExp(label));
  }

  assert.match(pageSource, /activePhotoIndex/);
  assert.match(pageSource, /setActivePhotoIndex\(index\)/);
  assert.match(pageSource, /gallery-photo-count/);
  assert.match(pageSource, /detail-address-line/);
  assert.match(pageSource, /detail-quick-actions/);
  assert.match(pageSource, /상세 빠른 액션/);
  assert.match(pageSource, /scrollToSafetyReport/);
  assert.match(pageSource, /투어 보기/);
  assert.match(pageSource, /안심 리포트/);
  assert.match(pageSource, /정보 보기/);
  assert.match(pageSource, /detail-trust-list/);
  assert.match(pageSource, /getListingPriceRows/);
  assert.match(pageSource, /getListingBuildingRows/);
  assert.match(pageSource, /listingPriceRows/);
  assert.match(pageSource, /listingBuildingRows/);
  assert.match(pageSource, /safetyScore/);
  assert.match(pageSource, /selectedInquiryMessage/);
  assert.match(pageSource, /selectedVisitTime/);
  assert.match(pageSource, /inquiryMemo/);
  assert.match(pageSource, /inquirySent/);
  assert.match(pageSource, /setSelectedListing\(listing\)/);
  assert.match(pageSource, /listing-card-action/);
  assert.match(pageSource, /setIsShareSheetOpen\(true\)/);
  assert.match(pageSource, /isSaved=\{savedListingNos\.includes\(selectedListing\.listingNo\)\}/);
  assert.match(pageSource, /onToggleSaved=\{toggleSavedListing\}/);
  assert.match(pageSource, /onToggleSaved\(listing\.listingNo\)/);
  assert.doesNotMatch(pageSource, /const \[isSaved, setIsSaved\]/);
  assert.match(pageSource, /navigator\.clipboard\.writeText/);
  assert.match(pageSource, /<Share2/);
  assert.match(pageSource, /<Copy/);
  assert.match(pageSource, /<Building2/);
  assert.match(pageSource, /<Ruler/);
  assert.match(pageSource, /<Layers3/);
  assert.match(pageSource, /<Banknote/);
  assert.match(pageSource, /<Phone/);
  assert.match(pageSource, /setIsComplexSheetOpen\(true\)/);
  assert.match(pageSource, /setIsAgentSheetOpen\(true\)/);
  assert.match(pageSource, /setIsInquirySheetOpen\(true\)/);
  assert.match(pageSource, /scrollToSafetyReport[\s\S]*detail-report-card[\s\S]*scrollIntoView/);
  assert.match(pageSource, /detail-contact-tour[\s\S]*setIsTourSheetOpen\(true\)/);
  assert.match(pageSource, /detail-contact-primary[\s\S]*setIsInquirySheetOpen\(true\)/);
  assert.match(cssSource, /\.detail-contact-bar\s*{[^}]*position:\s*fixed/s);
  assert.match(cssSource, /\.detail-quick-actions/);
  assert.match(cssSource, /\.detail-quick-actions button:first-child/);
  assert.match(cssSource, /\.detail-contact-bar\s*{[^}]*grid-template-columns:\s*56px 84px minmax\(0, 1fr\)/s);
  assert.match(cssSource, /\.detail-contact-bar\s*{[^}]*padding:\s*24px 14px 12px/s);
  assert.match(cssSource, /\.detail-contact-small,\s*[\s\S]*?\.detail-contact-tour\s*{[^}]*min-height:\s*54px/s);
  assert.match(cssSource, /\.detail-gallery\s*{[^}]*height:\s*clamp\(380px, 48vh, 440px\)/s);
  assert.match(cssSource, /\.detail-top-title\s*{[^}]*min-height:\s*74px/s);
  assert.match(cssSource, /\.detail-price-block\s*{[^}]*padding:\s*24px 18px 16px/s);
  assert.match(cssSource, /\.detail-contact-small/);
  assert.match(cssSource, /\.detail-contact-primary/);
  assert.match(cssSource, /\.detail-contact-tour/);
  assert.doesNotMatch(cssSource, /\.contact-icon-button/);
  assert.match(cssSource, /\.detail-address-line/);
  assert.match(cssSource, /\.detail-trust-list/);
  assert.match(cssSource, /\.share-sheet\s*{/);
  assert.match(cssSource, /\.share-action-grid/);
  assert.match(cssSource, /\.detail-toast/);
  assert.match(cssSource, /\.complex-sheet\s*{/);
  assert.match(cssSource, /\.complex-score-grid/);
  assert.match(cssSource, /\.agent-sheet\s*{/);
  assert.match(cssSource, /\.agent-metric-grid/);
  assert.match(cssSource, /\.detail-trust-list li/);
  assert.match(cssSource, /\.detail-report-card/);
  assert.match(cssSource, /\.inquiry-sheet\s*{/);
  assert.match(cssSource, /\.inquiry-message-grid/);
  assert.match(cssSource, /\.inquiry-message-grid button\.active/);
  assert.match(cssSource, /\.inquiry-selected-summary/);
  assert.match(cssSource, /\.inquiry-submit-feedback/);
  assert.match(cssSource, /\.inquiry-policy-row/);
  assert.match(cssSource, /\.detail-info-table/);
  assert.match(cssSource, /\.option-chip-grid/);
  assert.match(cssSource, /\.gallery-tile\.active/);
  assert.match(cssSource, /\.gallery-photo-count/);
  assert.doesNotMatch(pageSource, /gallery-watermark/);
  assert.doesNotMatch(pageSource, /SHARE LISTING|COMPLEX REPORT|BROKER PROFILE|ROOMLOG CONTACT/);
  assert.doesNotMatch(pageSource, /const detailPriceRows/);
  assert.doesNotMatch(pageSource, /const buildingInfoRows/);
  assert.doesNotMatch(pageSource, /className="screen detail-screen"/);
});

test("uses the Naver Maps SDK path instead of a mock map drawing", () => {
  assert.match(pageSource, /NEXT_PUBLIC_NAVER_MAP_CLIENT_ID/);
  assert.match(pageSource, /ncpKeyId/);
  assert.match(pageSource, /NaverMapPreview/);
  assert.match(pageSource, /new maps\.Map/);
  assert.match(pageSource, /mapDealMarkers\.forEach/);
  assert.match(pageSource, /auth_fail/);
  assert.match(pageSource, /지도 인증 확인 필요/);
  assert.match(pageSource, /서비스 도메인 허용이 완료되면 실제 지도 타일과 매물 마커가 바로 표시됩니다/);
  assert.match(pageSource, /Dynamic Map/);
  assert.match(pageSource, /Web URL 승인/);
  assert.match(pageSource, /실시간 마커 대기/);
  assert.doesNotMatch(pageSource, /dev server|localhost:3000 등록|SDK는 연결됐고/);
  assert.match(pageSource, /naver-price-marker/);
  assert.match(pageSource, /mapLabel/);
  assert.match(pageSource, /clusterLabel/);
  assert.match(pageSource, /selectedMapListingIndex/);
  assert.match(pageSource, /selectedMapListing/);
  assert.match(pageSource, /map-selected-card/);
  assert.match(pageSource, /지도 선택 매물/);
  assert.match(pageSource, /setSelectedMapListingIndex\(listing\.listingIndex\)/);
  assert.match(cssSource, /\.naver-price-marker/);
  assert.match(cssSource, /\.map-canvas-stack/);
  assert.match(cssSource, /\.map-selected-card/);
  assert.match(cssSource, /\.map-api-checklist/);
  assert.match(cssSource, /\.naver-map-shell\[data-state="error"\]/);
  assert.match(cssSource, /\.map-api-state\.error\s*{[^}]*max-width:\s*min\(280px, calc\(100% - 28px\)\)/s);
  assert.match(cssSource, /\.map-api-state\.error p\s*{[^}]*display:\s*none/s);
  assert.match(cssSource, /\.map-insight-strip/);
  assert.match(cssSource, /\.map-result-summary/);
  assert.match(cssSource, /\.map-verification-row/);
  assert.match(pageSource, /지도 설정 확인 중/);
  assert.match(pageSource, /지도 서비스/);
  assert.doesNotMatch(pageSource, />NAVER Maps API</);
  assert.doesNotMatch(pageSource, /naver-map-fallback|map-entry-visual|map-mini-pin|draw-line/);
  assert.doesNotMatch(cssSource, /naver-map-fallback|map-entry-visual|map-mini-pin|draw-line|naver-place-label/);
});

test("keeps the bottom app tabs fixed to the viewport", () => {
  assert.match(cssSource, /\.bottom-tabs\s*{[^}]*position:\s*fixed/s);
  assert.match(cssSource, /\.bottom-tabs\s*{[^}]*bottom:\s*0/s);
  assert.match(cssSource, /\.map-listing-action\s*{[^}]*grid-template-columns:\s*96px minmax\(0, 1fr\)/s);
  assert.match(cssSource, /\.result-sheet\s*{[^}]*margin-top:\s*-220px/s);
  assert.match(cssSource, /\.result-sheet\s*{[^}]*padding:\s*10px 18px 92px/s);
  assert.match(cssSource, /\.map-stage\s*{[^}]*height:\s*420px/s);
  assert.match(cssSource, /\.naver-map-shell\[data-state="error"\][\s\S]*height:\s*340px/);
  assert.match(cssSource, /\.map-card-tags/);
});

test("renders a Dabang-style desktop web portal beyond the phone frame", () => {
  assert.match(cssSource, /@media \(min-width:\s*1080px\)/);
  // 데스크톱은 전체폭 포털 셸(모바일 카드 프레임 제거)
  assert.match(cssSource, /\.service-frame\.with-bottom-tabs\s*{[^}]*display:\s*block/s);
  assert.match(cssSource, /\.service-frame\.with-bottom-tabs\s*{[^}]*width:\s*100%/s);
  // 상단 가로 네비 + 히어로는 기본(모바일) 숨김, 데스크톱에서 노출
  assert.match(cssSource, /\.web-topbar,\s*\.web-hero-head\s*{[^}]*display:\s*none/s);
  assert.match(cssSource, /\.web-topbar\s*{[^}]*position:\s*sticky/s);
  assert.match(cssSource, /\.web-hero-head\s*{[^}]*display:\s*block/s);
  assert.match(pageSource, /web-topbar/);
  assert.match(pageSource, /web-hero-head/);
  assert.match(pageSource, /web-logo-roof/);
  assert.match(pageSource, /방 구할 땐, 우주에서/);
  assert.match(pageSource, /web-hero-sub/);
  assert.match(cssSource, /web-hero-sub-shine/);
  // 카테고리 = 큰 카드 한 줄, 매물 = 넓은 3열 그리드
  assert.match(cssSource, /\.home-screen > \.category-strip\s*{[^}]*grid-template-columns:\s*repeat\(7, minmax\(0, 1fr\)\)/s);
  assert.match(cssSource, /\.home-screen > \.listing-feed\s*{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
  // 지도/상세 데스크톱 그리드는 유지
  assert.match(cssSource, /\.map-screen\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 390px/s);
  assert.match(cssSource, /\.listing-detail-screen\s*{[^}]*grid-template-columns:\s*minmax\(460px, 1fr\) 360px/s);
  // 데스크톱에서는 하단 탭 숨김(상단 네비가 대체)
  assert.match(cssSource, /@media \(min-width:\s*1080px\)[\s\S]*\.bottom-tabs\s*{\s*display:\s*none/);
});

test("is configured as an installable PWA shell", () => {
  for (const label of ["집우집주를 앱처럼 빠르게 열기", "최근 본 방과 문의 흐름", "재방문 준비", "앱 설치"]) {
    assert.match(pageSource, new RegExp(label));
  }

  assert.match(pageSource, /beforeinstallprompt/);
  assert.match(pageSource, /appinstalled/);
  assert.match(pageSource, /installPrompt\.prompt\(\)/);
  assert.match(cssSource, /\.pwa-install-card/);
  assert.match(cssSource, /\.pwa-status-grid/);
  assert.match(layoutSource, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.match(layoutSource, /appleWebApp/);
  assert.match(layoutSource, /apple-touch-icon\.png/);
  assert.match(layoutSource, /themeColor:\s*"#2f55ff"/);
  assert.match(layoutSource, /PwaRegister/);
  assert.match(manifestSource, /display:\s*"standalone"/);
  assert.match(manifestSource, /start_url:\s*"\/"/);
  assert.match(layoutSource, /applicationName:\s*"집우집주"/);
  assert.match(layoutSource, /title:\s*"집우집주"/);
  assert.match(manifestSource, /name:\s*"집우집주"/);
  assert.match(manifestSource, /short_name:\s*"집우집주"/);
  assert.match(manifestSource, /\/icon-192\.png/);
  assert.match(manifestSource, /\/icon-512\.png/);
  assert.match(manifestSource, /purpose:\s*"any"/);
  assert.match(manifestSource, /purpose:\s*"maskable"/);
  assert.match(manifestSource, /지도에서 방 찾기/);
  assert.match(pwaRegisterSource, /navigator\.serviceWorker\.register\("\/sw\.js"\)/);
  assert.match(serviceWorkerSource, /CACHE_NAME/);
  assert.match(serviceWorkerSource, /\/login-main\.png/);
  assert.match(serviceWorkerSource, /\/icon-192\.png/);
  assert.match(serviceWorkerSource, /\/icon-512\.png/);
  assert.match(serviceWorkerSource, /\/apple-touch-icon\.png/);
  assert.match(serviceWorkerSource, /caches\.open/);
  assert.match(serviceWorkerSource, /fetch\(request\)/);
  assert.doesNotMatch(pageSource, /ROOMLOG PWA|오프라인 캐시|Roomlog|ROOMLOG|룸로그/);
});

test("keeps local development free from stale service worker caches", () => {
  assert.match(pwaRegisterSource, /process\.env\.NODE_ENV !== "production"/);
  assert.match(pwaRegisterSource, /isLocalOrigin/);
  assert.match(pwaRegisterSource, /window\.location\.hostname/);
  assert.match(pwaRegisterSource, /localhost/);
  assert.match(pwaRegisterSource, /127\.0\.0\.1/);
  assert.match(pwaRegisterSource, /getRegistrations\(\)/);
  assert.match(pwaRegisterSource, /\.unregister\(\)/);
  assert.match(pwaRegisterSource, /caches\.keys\(\)/);
  assert.match(serviceWorkerSource, /url\.pathname\.startsWith\("\/_next\/"\)/);
  assert.match(serviceWorkerSource, /request\.mode === "navigate"/);
  assert.match(serviceWorkerSource, /new URL\(request\.url\)/);
  assert.match(nextConfigSource, /allowedDevOrigins:\s*\[\s*"127\.0\.0\.1"\s*\]/);
});

test("removes obvious mockup copy from the visible product shell", () => {
  assert.doesNotMatch(pageSource, /프론트 셸/);
  assert.doesNotMatch(pageSource, /연결 예정/);
  assert.doesNotMatch(pageSource, /핵심 진입점/);
  assert.doesNotMatch(pageSource, /샘플/);
  assert.doesNotMatch(pageSource, /준비중/);
  assert.doesNotMatch(pageSource, /준비 완료/);
  assert.doesNotMatch(pageSource, /문의가 준비됐습니다/);
  assert.doesNotMatch(pageSource, /인증 화면으로 이동할 준비/);
  assert.doesNotMatch(pageSource, /업로드 버튼 대기|전용 업로드 영역|자료 대기/);
  assert.doesNotMatch(pageSource, /일반 집보는 사람 모드/);
  assert.doesNotMatch(pageSource, /방 찾기에게/);
  assert.doesNotMatch(pageSource, /ROOMLOG SEARCH/);
  assert.doesNotMatch(layoutSource, /Roomlog|ROOMLOG|룸로그/);
  assert.doesNotMatch(manifestSource, /Roomlog|ROOMLOG|룸로그/);
  assert.doesNotMatch(pageSource, /<small>NEXT_PUBLIC_NAVER_MAP_CLIENT_ID<\/small>/);
  assert.doesNotMatch(pageSource, /<code>NEXT_PUBLIC_NAVER_MAP_CLIENT_ID<\/code>/);
});

test("links the landlord 3D floor plan action to the dedicated creation page", () => {
  assert.match(pageSource, /href="\/floor-plan-3d"/);
  assert.match(pageSource, /3D 도면 만들기/);

  assert.equal(existsSync(floorPlanPagePath), true, "3D 도면 생성 페이지가 있어야 합니다.");

  for (const label of ["3D 도면", "123123", "FloorPlanEditor", "저장 초안"]) {
    assert.match(floorPlanRouteSource, new RegExp(label));
  }
});

test("copies the wheretoput canvas-based 2D drawing workflow", () => {
  assert.match(floorPlanPageSource, /RoomlogFloorPlanEditor/);
  assert.equal(existsSync(floorPlanEditorPath), true, "Roomlog 도면 편집기 컴포넌트가 있어야 합니다.");

  for (const label of [
    "use client",
    "canvasRef",
    "containerRef",
    "handleMouseDown",
    "handleMouseMove",
    "handleMouseUp",
    "handleCanvasMouseLeave",
    "handleCanvasAuxClick",
    "handleWheel",
    "event.button === 1",
    "event.button === 2",
    "onAuxClick",
    "partial_eraser",
    "pixelToMmRatio",
    "viewScale",
    "viewOffset",
    "drawCanvas"
  ]) {
    assert.match(floorPlanEditorSource, new RegExp(label));
  }
});

test("offers a 3D conversion mode for the floor plan editor", () => {
  for (const label of ["3D 변환", "2D 편집", "convertWallsToWheretoputRoom3D", "floor-plan-3d-preview"]) {
    assert.match(floorPlanEditorSource, new RegExp(label));
  }
});

test("lets 3D floor plan walls be selected, erased, partially erased, and hidden", () => {
  for (const label of [
    "handle3DWallPointerDown",
    "selectedWallId",
    "splitWallByRatio",
    "hideWallById",
    "hiddenWallIds",
    "숨기기",
    "숨김 복원",
    "벽 클릭 편집"
  ]) {
    assert.match(floorPlanEditorSource, new RegExp(label));
  }
});

test("keeps the 2D floor plan canvas scrollable inside its editor shell", () => {
  for (const label of [
    "floor-plan-canvas-shell",
    "overscroll-behavior",
    "scrollbar-gutter",
    "if (!(event.ctrlKey || event.metaKey || event.altKey)) return",
    "Ctrl/Cmd/Alt 휠로 확대"
  ]) {
    assert.ok(`${floorPlanEditorSource}\n${globalsCssSource}`.includes(label));
  }
});

test("switches between landlord authoring and resident furniture placement modes", () => {
  for (const label of [
    "experienceMode",
    "landlord",
    "resident",
    "집주인 모드",
    "임차인/일반사용자 모드",
    "임대인 옵션 가구",
    "wheretoput furniture picker",
    "handleFurnitureSelect",
    "placeFurnitureAtPoint",
    "createLandlordOptionFurniture",
    "isLockedFurnitureForResident",
    "saveResidentFurnitureDesign"
  ]) {
    assert.match(floorPlanEditorSource, new RegExp(label));
  }

  assert.match(floorPlanEditorSource, /source:\s*"LANDLORD_OPTION"/);
  assert.match(floorPlanEditorSource, /locked:\s*true/);
  assert.match(floorPlanEditorSource, /editableBy:\s*\["LANDLORD"\]/);
  assert.match(floorPlanEditorSource, /visibleToTenant:\s*true/);
  assert.match(floorPlanEditorSource, /localStorage\.setItem\("residentFloorPlanDesign"/);
});

test("keeps landlord option furniture locked away from resident furniture designs", () => {
  for (const label of [
    "landlordOptionFurnitures",
    "residentDesignFurnitures",
    "lockedFurnitures",
    "세입자는 임대인 옵션 가구를 변경할 수 없습니다",
    "임대인 옵션 가구는 세입자 모드에서 고정됩니다"
  ]) {
    assert.match(floorPlanEditorSource, new RegExp(label));
  }
});

test("offers commercial candidate layers for openings and fixed fixtures", () => {
  for (const label of [
    "openingCandidates",
    "fixtureCandidates",
    "확정 문창문",
    "확정 고정설비",
    "toggleCandidateStatus",
    "moveCandidate",
    "후보 레이어",
    "CONFIRMED",
    "REJECTED"
  ]) {
    assert.match(floorPlanEditorSource, new RegExp(label));
  }
});

test("stores extraction metadata, openings, and fixtures through the floor plan API", () => {
  for (const label of [
    "extractionMeta",
    "scaleConfirmed",
    "scaleCandidates",
    "openings",
    "fixtures",
    "PUBLISHED",
    "발행"
  ]) {
    assert.match(floorPlanEditorSource, new RegExp(label));
  }
});

test("renders 3D conversion with the wheretoput React Three Fiber stack", () => {
  for (const label of [
    "@react-three/fiber",
    "@react-three/drei",
    "three",
    "Canvas",
    "OrbitControls",
    "Box3",
    "boxGeometry",
    "planeGeometry",
    "wheretoput 3D room renderer",
    "#626260",
    "#f3d9a0"
  ]) {
    assert.match(`${floorPlanVisualSource}\n${webPackageSource}`, new RegExp(label));
  }
});

test("imports wheretoput-style upload, extraction, and rotatable 3D simulator controls", () => {
  for (const label of [
    "도면 등록",
    "벽 자동 추출",
    "화면 드래그 회전",
    "배율 조절",
    "handleImageUpload",
    "WallDetector",
    "convertWallsToWheretoputSimulator",
    "convertWallsToWheretoputRoom3D"
  ]) {
    assert.match(floorPlanEditorSource, new RegExp(label));
  }
});

test("extracts uploaded image walls through a wheretoput-style pixel line pipeline", () => {
  for (const label of [
    "getImageData",
    "detectWallLinesFromImageData",
    "createWallsFromDetectedLines",
    "WallDetector",
    "이미지 벽"
  ]) {
    assert.match(floorPlanEditorSource, new RegExp(label));
  }
});

test("preloads OpenCV wall extraction in a worker and falls back to canvas extraction", () => {
  for (const label of [
    "floor-plan-extraction.worker",
    "preloadOpenCvWorker",
    "추출 엔진 준비중",
    "도면 분석중",
    "검수 후 저장",
    "opencvReady",
    "fallbackCanvasWallExtraction",
    "processingMs"
  ]) {
    assert.match(floorPlanEditorSource, new RegExp(label));
  }
});

test("uses OCR only for scale candidate extraction and keeps manual scale fallback", () => {
  for (const label of [
    "TESSERACT_OCR_URL",
    "estimateScaleCandidateFromDimensions",
    "manual-scale-required",
    "축척 확인 필요",
    "scaleConfirmed"
  ]) {
    assert.match(`${floorPlanEditorSource}\n${floorPlanWorkerSource}`, new RegExp(label));
  }
});

test("saves floor plan drafts through the API while keeping a local fallback", () => {
  for (const label of [
    "apiUrl\\(\"/floor-plans\"\\)",
    "saveFloorPlanDraft",
    "floorPlanDraftId",
    "room3d",
    "localStorage.setItem\\(\"floorPlanDraft\"",
    "저장 완료",
    "로컬 임시 저장"
  ]) {
    assert.match(floorPlanEditorSource, new RegExp(label));
  }
});

test("floor plan editor model snaps, selects, removes, and summarizes walls", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const wall = model.createWall({ x: 0, y: 0 }, { x: 130, y: 40 }, "w1");

  assert.deepEqual(wall, {
    id: "w1",
    start: { x: 0, y: 0 },
    end: { x: 120, y: 0 }
  });

  assert.equal(model.findNearestWall([wall], { x: 48, y: 5 }, 18)?.id, "w1");
  assert.deepEqual(model.removeWall([wall], "w1"), []);
  assert.deepEqual(model.summarizeWalls([wall]), {
    wallCount: 1,
    approximateMeters: 2.5,
    status: "편집중"
  });
});

test("floor plan editor model converts 2D walls into wheretoput-style 3D wall boxes", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const wall = model.createWall({ x: 0, y: 0 }, { x: 120, y: 0 }, "front");
  const converted = model.convertWallsTo3D([wall], { height: 96, depth: 8 });

  assert.equal(converted.wallPanels.length, 1);
  assert.equal(converted.wallBoxes.length, 1);
  assert.equal(converted.wallBoxes[0].id, "front");
  assert.equal(converted.wallBoxes[0].height, 96);
  assert.equal(converted.wallBoxes[0].depth, 8);
  assert.match(converted.wallBoxes[0].frontPath, /^M /);
  assert.match(converted.wallBoxes[0].topPath, /^M /);
  assert.match(converted.wallBoxes[0].endCapPath, /^M /);
  assert.notEqual(converted.wallBoxes[0].frontPath, converted.wallBoxes[0].topPath);
  assert.equal(converted.floor.path.includes("L"), true);
});

test("floor plan editor model creates wheretoput simulator wall data", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const wall = model.createWall({ x: 0, y: 0 }, { x: 120, y: 0 }, "front");
  const converted = model.convertWallsToWheretoputSimulator([wall], {
    height: 2.5,
    depth: 0.15,
    pixelToMeterRatio: 0.02
  });

  assert.equal(converted.length, 1);
  assert.equal(converted[0].id, "front");
  assert.equal(converted[0].wall_id, "front");
  assert.deepEqual(converted[0].position, [1.2, 1.25, 0]);
  assert.deepEqual(converted[0].rotation, [0, 0, 0]);
  assert.deepEqual(converted[0].dimensions, { width: 2.4, height: 2.5, depth: 0.15 });
});

test("floor plan editor model creates centered wheretoput room 3D wall data", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const walls = [
    { id: "left", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
    { id: "right", start: { x: 100, y: 0 }, end: { x: 100, y: 100 } }
  ];
  const converted = model.convertWallsToWheretoputRoom3D(walls, { pixelToMmRatio: 20 });

  assert.equal(converted.length, 2);
  assert.equal(converted[0].material, "wall");
  assert.deepEqual(converted[0].dimensions, { width: 2, height: 2.5, depth: 0.15 });
  assert.equal(converted[0].position[1], 1.25);
  assert.equal(converted[0].original2D.id, "left");
  assert.equal(Math.abs(converted[0].position[0]) > 0 || Math.abs(converted[1].position[2]) > 0, true);
});

test("floor plan editor model can extract starter walls from a registered plan", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const walls = model.createWallsFromRegisteredPlan({ width: 1600, height: 1000, name: "unit.png" });

  assert.equal(walls.length >= 5, true);
  assert.equal(walls[0].id.startsWith("upload-unit-"), true);
  assert.equal(walls.every((wall) => wall.start && wall.end), true);
});

test("floor plan editor model detects wall lines from a binary image mask", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const width = 12;
  const height = 10;
  const mask = Array.from({ length: width * height }, () => false);

  for (let x = 1; x <= 10; x += 1) mask[2 * width + x] = true;
  for (let y = 1; y <= 8; y += 1) mask[y * width + 6] = true;

  const lines = model.detectWallLinesFromMask(mask, { width, height, minRunLength: 6 });

  assert.equal(lines.some((line) => line.orientation === "horizontal" && line.y1 === 2), true);
  assert.equal(lines.some((line) => line.orientation === "vertical" && line.x1 === 6), true);
});

test("floor plan editor model extracts wall center bands and preserves open gaps", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const width = 220;
  const height = 180;
  const mask = Array.from({ length: width * height }, () => false);
  const fillRect = (x1, y1, x2, y2) => {
    for (let y = y1; y <= y2; y += 1) {
      for (let x = x1; x <= x2; x += 1) {
        mask[y * width + x] = true;
      }
    }
  };

  fillRect(24, 24, 196, 32);
  fillRect(24, 148, 84, 156);
  fillRect(126, 148, 196, 156);
  fillRect(24, 24, 32, 156);
  fillRect(188, 24, 196, 156);
  fillRect(96, 24, 104, 98);
  fillRect(96, 128, 104, 156);

  const lines = model.detectWallLinesFromMask(mask, {
    bandOverlapRatio: 0.7,
    height,
    minRunLength: 24,
    minWallThickness: 5,
    width
  });
  const bottomSegments = lines.filter((line) => line.orientation === "horizontal" && Math.abs(line.y1 - 152) <= 2);
  const dividerSegments = lines.filter((line) => line.orientation === "vertical" && Math.abs(line.x1 - 100) <= 2);

  assert.equal(lines.some((line) => line.orientation === "horizontal" && Math.abs(line.y1 - 28) <= 2), true);
  assert.equal(bottomSegments.length, 2);
  assert.equal(bottomSegments.some((line) => line.x1 <= 26 && line.x2 >= 82), true);
  assert.equal(bottomSegments.some((line) => line.x1 <= 128 && line.x2 >= 194), true);
  assert.equal(dividerSegments.length, 2);
  assert.equal(lines.some((line) => line.orientation === "horizontal" && line.x1 <= 24 && line.x2 >= 196 && Math.abs(line.y1 - 152) <= 2), false);
});

test("floor plan editor model removes small text noise before extracting wall lines", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const width = 40;
  const height = 24;
  const mask = Array.from({ length: width * height }, () => false);

  for (let y = 8; y <= 11; y += 1) {
    for (let x = 4; x <= 34; x += 1) mask[y * width + x] = true;
  }
  for (let y = 2; y <= 3; y += 1) {
    for (let x = 2; x <= 5; x += 1) mask[y * width + x] = true;
  }

  const cleaned = model.removeSmallWallComponents(mask, { width, height, minArea: 20 });
  const lines = model.detectWallLinesFromMask(cleaned, { width, height, minRunLength: 18 });

  assert.equal(cleaned[2 * width + 2], false);
  assert.equal(lines.some((line) => line.orientation === "horizontal" && line.x1 <= 4 && line.x2 >= 34), true);
});

test("floor plan editor model merges nearby wall candidates and caps noisy output", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const merged = model.mergeDetectedWallLines(
    [
      { x1: 10, y1: 20, x2: 100, y2: 20, orientation: "horizontal" },
      { x1: 95, y1: 22, x2: 180, y2: 22, orientation: "horizontal" },
      { x1: 200, y1: 20, x2: 205, y2: 20, orientation: "horizontal" }
    ],
    { axisTolerance: 4, gapTolerance: 10, minLength: 20, maxLines: 4 }
  );
  const capped = model.limitDetectedWallCandidates(
    Array.from({ length: 40 }, (_, index) => ({
      x1: index * 10,
      y1: 0,
      x2: index * 10 + 40,
      y2: 0,
      orientation: "horizontal"
    })),
    { maxLines: 24 }
  );

  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0], { x1: 10, y1: 21, x2: 180, y2: 21, orientation: "horizontal", thickness: 2 });
  assert.equal(capped.length, 24);
});

test("floor plan editor model preserves wall thickness and removes thin interior symbols", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const merged = model.mergeDetectedWallLines(
    [
      { x1: 20, y1: 100, x2: 360, y2: 100, orientation: "horizontal" },
      { x1: 20, y1: 101, x2: 360, y2: 101, orientation: "horizontal" },
      { x1: 20, y1: 102, x2: 360, y2: 102, orientation: "horizontal" },
      { x1: 20, y1: 103, x2: 360, y2: 103, orientation: "horizontal" },
      { x1: 80, y1: 180, x2: 260, y2: 180, orientation: "horizontal" }
    ],
    { axisTolerance: 4, gapTolerance: 4, minLength: 40, maxLines: 10 }
  );
  const result = model.filterCommercialWallCandidates(
    [
      { x1: 20, y1: 100, x2: 360, y2: 100, orientation: "horizontal", thickness: merged[0].thickness },
      { x1: 360, y1: 100, x2: 360, y2: 300, orientation: "vertical", thickness: 5 },
      { x1: 360, y1: 300, x2: 20, y2: 300, orientation: "horizontal", thickness: 5 },
      { x1: 20, y1: 300, x2: 20, y2: 100, orientation: "vertical", thickness: 5 },
      { x1: 80, y1: 180, x2: 260, y2: 180, orientation: "horizontal", thickness: 1 }
    ],
    { height: 420, width: 420 }
  );

  assert.equal(merged[0].thickness >= 4, true);
  assert.equal(result.walls.length, 4);
  assert.equal(result.removedNoiseCount, 1);
});

test("floor plan editor model removes contained duplicate wall fragments", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const result = model.filterCommercialWallCandidates(
    [
      { x1: 100, y1: 100, x2: 500, y2: 100, orientation: "horizontal", thickness: 6 },
      { x1: 500, y1: 100, x2: 500, y2: 360, orientation: "vertical", thickness: 6 },
      { x1: 500, y1: 360, x2: 100, y2: 360, orientation: "horizontal", thickness: 6 },
      { x1: 100, y1: 360, x2: 100, y2: 100, orientation: "vertical", thickness: 6 },
      { x1: 180, y1: 107, x2: 420, y2: 107, orientation: "horizontal", thickness: 6 },
      { x1: 507, y1: 150, x2: 507, y2: 300, orientation: "vertical", thickness: 6 }
    ],
    { containedAxisTolerance: 10, height: 520, width: 640 }
  );

  assert.equal(result.walls.length, 4);
  assert.equal(result.removedNoiseCount, 2);
});

test("floor plan editor model uses filled interior support without breaking monochrome plans", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const coloredPlan = model.filterCommercialWallCandidates(
    [
      { x1: 100, y1: 100, x2: 500, y2: 100, orientation: "horizontal", thickness: 7, fillSupport: 0.56 },
      { x1: 500, y1: 100, x2: 500, y2: 360, orientation: "vertical", thickness: 7, fillSupport: 0.42 },
      { x1: 500, y1: 360, x2: 100, y2: 360, orientation: "horizontal", thickness: 7, fillSupport: 0.52 },
      { x1: 100, y1: 360, x2: 100, y2: 100, orientation: "vertical", thickness: 7, fillSupport: 0.46 },
      { x1: 300, y1: 150, x2: 300, y2: 310, orientation: "vertical", thickness: 7, fillSupport: 0.01 },
      { x1: 230, y1: 230, x2: 370, y2: 230, orientation: "horizontal", thickness: 6, fillSupport: 0.02 }
    ],
    { height: 520, width: 760 }
  );
  const monochromePlan = model.filterCommercialWallCandidates(
    [
      { x1: 100, y1: 100, x2: 500, y2: 100, orientation: "horizontal", thickness: 7, fillSupport: 0 },
      { x1: 500, y1: 100, x2: 500, y2: 360, orientation: "vertical", thickness: 7, fillSupport: 0 },
      { x1: 500, y1: 360, x2: 100, y2: 360, orientation: "horizontal", thickness: 7, fillSupport: 0 },
      { x1: 100, y1: 360, x2: 100, y2: 100, orientation: "vertical", thickness: 7, fillSupport: 0 }
    ],
    { height: 520, width: 760 }
  );

  assert.equal(coloredPlan.walls.length, 4);
  assert.equal(coloredPlan.annotationCandidates.length, 2);
  assert.equal(monochromePlan.walls.length, 4);
});

test("floor plan editor model removes dimension candidates before wall creation", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const lines = [
    { x1: 40, y1: 40, x2: 300, y2: 40, orientation: "horizontal", thickness: 8 },
    { x1: 30, y1: 12, x2: 330, y2: 12, orientation: "horizontal", thickness: 1, markers: ["arrow-start", "arrow-end"] }
  ];

  const result = model.filterCommercialWallCandidates(lines, { height: 240, width: 360 });

  assert.equal(result.walls.length, 1);
  assert.equal(result.dimensionCandidates.length, 1);
  assert.equal(result.removedNoiseCount, 1);
});

test("floor plan editor model removes dimension lines offset from the main wall cluster", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const lines = [
    { x1: 100, y1: 120, x2: 500, y2: 120, orientation: "horizontal" },
    { x1: 500, y1: 120, x2: 500, y2: 420, orientation: "vertical" },
    { x1: 500, y1: 420, x2: 100, y2: 420, orientation: "horizontal" },
    { x1: 100, y1: 420, x2: 100, y2: 120, orientation: "vertical" },
    { x1: 100, y1: 70, x2: 500, y2: 70, orientation: "horizontal" },
    { x1: 560, y1: 120, x2: 560, y2: 420, orientation: "vertical" }
  ];

  const result = model.filterCommercialWallCandidates(lines, { height: 640, width: 760 });

  assert.equal(result.walls.length, 4);
  assert.equal(result.dimensionCandidates.length, 2);
  assert.equal(result.removedNoiseCount, 2);
});

test("floor plan editor model removes far outside dimensions without losing structural walls", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const lines = [
    { x1: 150, y1: 180, x2: 650, y2: 180, orientation: "horizontal", thickness: 9 },
    { x1: 650, y1: 180, x2: 650, y2: 560, orientation: "vertical", thickness: 9 },
    { x1: 650, y1: 560, x2: 150, y2: 560, orientation: "horizontal", thickness: 9 },
    { x1: 150, y1: 560, x2: 150, y2: 180, orientation: "vertical", thickness: 9 },
    { x1: 150, y1: 24, x2: 650, y2: 24, orientation: "horizontal", thickness: 1 },
    { x1: 790, y1: 180, x2: 790, y2: 560, orientation: "vertical", thickness: 1 }
  ];

  const result = model.filterCommercialWallCandidates(lines, { height: 720, width: 860 });

  assert.equal(result.walls.length, 4);
  assert.equal(result.dimensionCandidates.length, 2);
  assert.deepEqual(result.mainPlanBounds, { minX: 150, minY: 180, maxX: 650, maxY: 560 });
  assert.equal(result.needsReview, false);
});

test("floor plan editor model keeps crossing outer dimensions out of structural bounds", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const lines = [
    { x1: 150, y1: 140, x2: 620, y2: 140, orientation: "horizontal" },
    { x1: 620, y1: 140, x2: 620, y2: 520, orientation: "vertical" },
    { x1: 620, y1: 520, x2: 150, y2: 520, orientation: "horizontal" },
    { x1: 150, y1: 520, x2: 150, y2: 140, orientation: "vertical" },
    { x1: 700, y1: 110, x2: 700, y2: 560, orientation: "vertical" },
    { x1: 120, y1: 610, x2: 720, y2: 610, orientation: "horizontal" }
  ];

  const result = model.filterCommercialWallCandidates(lines, { height: 760, width: 860 });

  assert.deepEqual(result.mainPlanBounds, { minX: 150, minY: 140, maxX: 620, maxY: 520 });
  assert.equal(result.walls.length, 4);
  assert.equal(result.dimensionCandidates.length, 2);
});

test("floor plan editor model separates dashed annotations from wall candidates", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const lines = [
    { x1: 100, y1: 100, x2: 440, y2: 100, orientation: "horizontal", thickness: 8 },
    { x1: 440, y1: 100, x2: 440, y2: 340, orientation: "vertical", thickness: 8 },
    { x1: 440, y1: 340, x2: 100, y2: 340, orientation: "horizontal", thickness: 8 },
    { x1: 100, y1: 340, x2: 100, y2: 100, orientation: "vertical", thickness: 8 },
    { x1: 500, y1: 130, x2: 700, y2: 130, orientation: "horizontal", thickness: 2, markers: ["annotation-dashed"] },
    { x1: 700, y1: 130, x2: 700, y2: 260, orientation: "vertical", thickness: 2, markers: ["annotation-dashed"] }
  ];

  const result = model.filterCommercialWallCandidates(lines, { height: 520, width: 780 });

  assert.equal(result.walls.length, 4);
  assert.equal(result.annotationCandidates.length, 2);
  assert.equal(result.removedNoiseCount, 2);
});

test("floor plan editor model estimates scale from outside dimensions", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const candidate = model.estimateScaleCandidateFromDimensions([
    {
      line: { x1: 100, y1: 20, x2: 420, y2: 20, orientation: "horizontal" },
      text: "5.86 m",
      confidence: 0.91
    }
  ]);

  assert.equal(candidate.realLengthMm, 5860);
  assert.equal(candidate.pixelLength, 320);
  assert.equal(Number(candidate.pixelToMmRatio.toFixed(2)), 18.31);
  assert.equal(candidate.source, "outside-dimension-ocr");
});

test("floor plan editor model creates opening candidates as editable layers", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const candidates = model.detectOpeningCandidates({
    arcs: [{ x: 120, y: 140, radius: 36 }],
    gaps: [{ x1: 100, y1: 140, x2: 150, y2: 140 }]
  });
  const confirmed = model.updateCandidateStatus(candidates, candidates[0].id, "CONFIRMED");
  const moved = model.moveCandidate(confirmed, candidates[0].id, { x: 12, y: -4 });

  assert.equal(candidates[0].type, "DOOR");
  assert.equal(confirmed[0].status, "CONFIRMED");
  assert.equal(moved[0].position.x, candidates[0].position.x + 12);
});

test("floor plan editor model creates fixed fixture candidates separately from movable furniture", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const candidates = model.detectFixtureCandidates({
    labels: [{ text: "싱크대", x: 220, y: 320, confidence: 0.86 }],
    shapes: [{ kind: "cabinet", x: 210, y: 300, width: 120, height: 36 }]
  });

  assert.equal(candidates[0].type, "SINK");
  assert.equal(candidates[0].status, "CANDIDATE");
  assert.equal(candidates[0].movable, false);
});

test("floor plan editor model scales detected image lines into editor walls", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const walls = model.createWallsFromDetectedLines(
    [{ x1: 100, y1: 50, x2: 900, y2: 50, orientation: "horizontal" }],
    { width: 1000, height: 500, name: "scan.png" }
  );

  assert.equal(walls.length, 1);
  assert.equal(walls[0].id, "scan-wall-1");
  assert.equal(walls[0].start.y, walls[0].end.y);
  assert.equal(walls[0].end.x > walls[0].start.x, true);
});

test("floor plan editor model keeps small detected openings instead of snapping them closed", async () => {
  const model = await import("./src/app/floor-plan-3d/floor-plan-editor-model.mjs");
  const walls = model.createWallsFromDetectedLines(
    [
      { x1: 120, y1: 100, x2: 420, y2: 100, orientation: "horizontal" },
      { x1: 432, y1: 100, x2: 820, y2: 100, orientation: "horizontal" }
    ],
    { width: 1000, height: 600, name: "scan.png" }
  );

  assert.equal(walls.length, 2);
  assert.equal(walls[1].start.x > walls[0].end.x, true);
  assert.equal(walls[1].start.x - walls[0].end.x < 16, true);
});
