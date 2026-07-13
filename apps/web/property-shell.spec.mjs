import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

// 라우트 분리 1·2단계 — 상세는 /listing/[id], 탭은 /map /saved /inquiry /my 라우트가 됐고
// 소비자 SPA 본체는 HomeApp.tsx(page.tsx들은 진입 래퍼)다. 검증은 합산 코퍼스로 본다.
const homeAppSource = readFileSync(new URL("./src/app/HomeApp.tsx", import.meta.url), "utf8");
const mobileRoleMenuSource = readFileSync(new URL("./src/app/_components/MobileRoleMenu.tsx", import.meta.url), "utf8");
const spaSource = [
  homeAppSource,
  mobileRoleMenuSource,
  // 역할 흐름은 my/flows/로 물리 분리됐다(분업 단위). 세입자(living)=TenantMyPage, 매물등록(sell)=LandlordMyPage.
  "./src/app/my/flows/my-shared.tsx",
  "./src/app/my/flows/TenantMyPage.tsx",
  "./src/app/my/flows/LandlordMyPage.tsx"
]
  .map((sourceOrPath) =>
    sourceOrPath.startsWith("./")
      ? readFileSync(new URL(sourceOrPath, import.meta.url), "utf8")
      : sourceOrPath
  )
  .join("\n");
const listingDetailViewSource = readFileSync(new URL("./src/app/_components/ListingDetailView.tsx", import.meta.url), "utf8");
const naverMapPreviewSource = readFileSync(new URL("./src/app/_components/NaverMapPreview.tsx", import.meta.url), "utf8");
const listingCatalogSource = readFileSync(new URL("./src/lib/listing-catalog.ts", import.meta.url), "utf8");
const listingRoutePageSource = readFileSync(new URL("./src/app/listing/[id]/page.tsx", import.meta.url), "utf8");
const listingRouteClientSource = readFileSync(new URL("./src/app/listing/[id]/ListingDetailRoute.tsx", import.meta.url), "utf8");
const pageSource = [
  spaSource,
  listingDetailViewSource,
  naverMapPreviewSource,
  listingCatalogSource,
  listingRoutePageSource,
  listingRouteClientSource
].join("\n");
const floorPlanPagePath = new URL("./src/app/floor-plan-3d/page.tsx", import.meta.url);
const floorPlanPageSource = existsSync(floorPlanPagePath) ? readFileSync(floorPlanPagePath, "utf8") : "";
const floorPlanEditorPath = new URL("./src/app/floor-plan-3d/RoomlogFloorPlanEditor.tsx", import.meta.url);
const floorPlanContainerSource = existsSync(floorPlanEditorPath) ? readFileSync(floorPlanEditorPath, "utf8") : "";
// floor-plan-3d는 plan-extraction / room-model / room-scene 폴더로 분할되어 있어서
// 편집기 기능 검증은 폴더 아래 모든 소스 파일을 합친 코퍼스를 대상으로 한다.
const floorPlanDirUrl = new URL("./src/app/floor-plan-3d/", import.meta.url);
const floorPlanEditorSource = existsSync(floorPlanDirUrl)
  ? readdirSync(floorPlanDirUrl, { recursive: true })
      .map((name) => String(name).replaceAll("\\", "/"))
      .filter((name) => /\.(tsx|ts|mjs)$/.test(name) && name !== "page.tsx")
      .sort()
      .map((name) => readFileSync(new URL(name, floorPlanDirUrl), "utf8"))
      .join("\n")
  : "";
const floorPlanWorkerPath = new URL("./src/app/floor-plan-3d/plan-extraction/floor-plan-extraction.worker.ts", import.meta.url);
const floorPlanWorkerSource = existsSync(floorPlanWorkerPath) ? readFileSync(floorPlanWorkerPath, "utf8") : "";
const floorPlanModel = {
  ...(await import("./src/app/floor-plan-3d/room-model/wall-model.mjs")),
  ...(await import("./src/app/floor-plan-3d/plan-extraction/wall-detection.mjs"))
};
const dimensionLayout = await import("./src/app/floor-plan-3d/plan-extraction/dimension-layout.mjs");
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
const loginScreenSource = readFileSync(new URL("./src/app/_components/WoozuLoginScreen.tsx", import.meta.url), "utf8");
const unifiedLoginPageSource = readFileSync(new URL("./src/app/login/page.tsx", import.meta.url), "utf8");
const sessionLibSource = readFileSync(new URL("./src/lib/session.ts", import.meta.url), "utf8");
const tradeChatCenterSource = readFileSync(new URL("./src/app/_components/TradeChatCenter.tsx", import.meta.url), "utf8");
const tradeProxySource = readFileSync(new URL("./src/app/api/trade/[...path]/route.ts", import.meta.url), "utf8");
const managerHomeTabsSource = readFileSync(new URL("./src/app/manager/home/00/ManagerHomeTabs.tsx", import.meta.url), "utf8");
const managerHomePageSource = readFileSync(new URL("./src/app/manager/home/00/page.tsx", import.meta.url), "utf8");
const managerHomeDashboardDataSource = readFileSync(new URL("./src/app/manager/home/00/dashboard-data.ts", import.meta.url), "utf8");
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
const managerMessagingComposerPath = new URL("./src/app/manager/messaging/01/AnnouncementComposer.tsx", import.meta.url);
const managerMessagingActionsPath = new URL("./src/app/manager/messaging/01/actions.ts", import.meta.url);
const managerMessagingComposerCssSource = readFileSync(
  new URL("./src/app/manager/messaging/01/AnnouncementComposer.module.css", import.meta.url),
  "utf8",
);
const managerMessagingComposerSource = existsSync(managerMessagingComposerPath)
  ? readFileSync(managerMessagingComposerPath, "utf8")
  : "";
const managerMessagingActionsSource = existsSync(managerMessagingActionsPath)
  ? readFileSync(managerMessagingActionsPath, "utf8")
  : "";
const managerMessagingComposeStateSource = readFileSync(new URL("./src/lib/announcement-compose-state.ts", import.meta.url), "utf8");
const managerMessagingComposeFeatureSource = `${managerMessagingComposeSource}\n${managerMessagingComposerSource}\n${managerMessagingActionsSource}\n${managerMessagingComposeStateSource}\n${managerMessagingComposerCssSource}`;
const managerMessagingLayoutSource = readFileSync(new URL("./src/app/manager/messaging/layout.tsx", import.meta.url), "utf8");
const managerMessagingShellTitlePath = new URL("./src/app/manager/messaging/MessagingShellTitle.tsx", import.meta.url);
const managerMessagingShellTitleSource = existsSync(managerMessagingShellTitlePath)
  ? readFileSync(managerMessagingShellTitlePath, "utf8")
  : "";
const managerMessagingThreadSource = readFileSync(new URL("./src/app/manager/messaging/04/page.tsx", import.meta.url), "utf8");
const managerMessagingResultSource = readFileSync(new URL("./src/app/manager/messaging/03/page.tsx", import.meta.url), "utf8");
const managerContractPageSource = readFileSync(new URL("./src/app/manager/contract/01/page.tsx", import.meta.url), "utf8");
const managerContractApiSource = readFileSync(new URL("./src/lib/contract-manager-api.ts", import.meta.url), "utf8");
const managerMessagingApiSource = readFileSync(new URL("./src/lib/messaging-manager-api.ts", import.meta.url), "utf8");
const tradeControllerSource = readFileSync(new URL("../api/src/trade/trade.controller.ts", import.meta.url), "utf8");

function requireSourceMatch(source, pattern, label) {
  const match = source.match(pattern);
  assert.ok(match, `${label} should be present`);
  return match[0];
}

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
    tenant: "/living",
    manager: "/manager/home/00",
    vendor: "/vendor/job/00"
  };
  for (const route of ["tenant", "manager", "vendor"]) {
    assert.equal(existsSync(new URL(`./src/app/${route}/page.tsx`, import.meta.url)), true);
    assert.equal(existsSync(new URL(`./src/app/${route}/layout.tsx`, import.meta.url)), true);

    const routePageSource = readFileSync(new URL(`./src/app/${route}/page.tsx`, import.meta.url), "utf8");
    assert.match(routePageSource, /redirect\(/);
    assert.match(routePageSource, new RegExp(redirectTargets[route]));
  }

  assert.equal(existsSync(new URL("./src/app/manager/listing/page.tsx", import.meta.url)), true);
});

test("wires moveout screens to backend mutations instead of static links", () => {
  const moveoutNavSource = readFileSync(new URL("./src/lib/moveout-nav.ts", import.meta.url), "utf8");
  const moveoutLoadingExists = existsSync(new URL("./src/app/tenant/moveout/loading.tsx", import.meta.url));
  const moveoutErrorExists = existsSync(new URL("./src/app/tenant/moveout/error.tsx", import.meta.url));
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
  const managerMoveoutHomeSource = readFileSync(
    new URL("./src/app/manager/moveout/00/page.tsx", import.meta.url),
    "utf8",
  );
  const managerMoveoutNavSource = readFileSync(
    new URL("./src/lib/moveout-manager-nav.ts", import.meta.url),
    "utf8",
  );
  const managerMoveoutComponentsSource = readFileSync(
    new URL("./src/app/manager/moveout/_components.tsx", import.meta.url),
    "utf8",
  );
  const managerMoveoutLoadingPath = new URL("./src/app/manager/moveout/loading.tsx", import.meta.url);
  const managerMoveoutErrorPath = new URL("./src/app/manager/moveout/error.tsx", import.meta.url);
  const managerMoveoutLoadingExists = existsSync(managerMoveoutLoadingPath);
  const managerMoveoutErrorExists = existsSync(managerMoveoutErrorPath);
  const managerMoveoutLoadingSource = managerMoveoutLoadingExists
    ? readFileSync(managerMoveoutLoadingPath, "utf8")
    : "";
  const managerMoveoutErrorSource = managerMoveoutErrorExists
    ? readFileSync(managerMoveoutErrorPath, "utf8")
    : "";
  const managerReviewSource = readFileSync(
    new URL("./src/app/manager/moveout/02/page.tsx", import.meta.url),
    "utf8",
  );
  const managerReportSource = readFileSync(
    new URL("./src/app/manager/moveout/01/page.tsx", import.meta.url),
    "utf8",
  );
  const managerDisputeSource = readFileSync(
    new URL("./src/app/manager/moveout/03/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(moveoutNavSource, /withMoveoutId/);
  assert.equal(moveoutLoadingExists, true);
  assert.equal(moveoutErrorExists, true);
  assert.match(tenantMoveoutHomeSource, /listMoveouts/);
  assert.match(tenantMoveoutHomeSource, /getChecklist/);
  assert.match(tenantMoveoutHomeSource, /getDisputes/);
  assert.match(tenantMoveoutHomeSource, /completionProgress/);
  assert.match(tenantMoveoutHomeSource, /notificationItems/);
  assert.match(tenantMoveoutHomeSource, /withMoveoutId/);
  assert.doesNotMatch(tenantMoveoutHomeSource, /DEMO_MOVEOUT_ID/);
  assert.doesNotMatch(tenantMoveoutHomeSource, /<span[\s\S]*>\s*1\s*<\/span>/);
  assert.match(tenantRecordsSource, /SOURCE_ROUTE/);
  assert.match(tenantRecordsSource, /evidenceUrls/);
  assert.match(tenantRecordsSource, /targetItemId=\$\{record\.id\}/);
  assert.match(tenantRecordsSource, /근거 상세/);
  assert.match(tenantRecordsSource, /searchParams/);
  assert.doesNotMatch(tenantRecordsSource, /href=\{MOVEOUT_ROUTES\["T-OUT-04"\]\}/);
  assert.match(tenantSettlementSource, /createMoveoutInquiry/);
  assert.match(tenantSettlementSource, /action=\{createInquiryAction\}/);
  assert.match(tenantSettlementSource, /name="moveoutId"/);
  assert.match(tenantSettlementSource, /createMoveoutInquiry\(moveoutId/);
  assert.match(tenantSettlementSource, /attachmentUrlsFrom/);
  assert.match(tenantSettlementSource, /targetItemId=\$\{deduction\.id\}/);
  assert.match(tenantSettlementSource, /SOURCE_ROUTE/);
  assert.match(tenantSettlementSource, /계약 정보 확정 후 예상 정산 안내/);
  assert.match(tenantDisputeSource, /createMoveoutDispute/);
  assert.match(tenantDisputeSource, /action=\{createDisputeAction\}/);
  assert.match(tenantDisputeSource, /name="moveoutId"/);
  assert.match(tenantDisputeSource, /createMoveoutDispute\(moveoutId/);
  assert.match(tenantDisputeSource, /updateTenantMoveoutDispute\(moveoutId/);
  assert.match(tenantDisputeSource, /escalateMoveoutDispute\(moveoutId/);
  assert.match(tenantDisputeSource, /updateTenantMoveoutDispute/);
  assert.match(tenantDisputeSource, /action=\{updateDisputeAction\}/);
  assert.match(tenantDisputeSource, /escalateMoveoutDispute/);
  assert.match(tenantDisputeSource, /action=\{escalateDisputeAction\}/);
  assert.match(tenantDisputeSource, /name="targetItemId"/);
  assert.match(tenantDisputeSource, /attachmentUrlsFrom/);
  assert.match(tenantChecklistSource, /updateMoveoutChecklist/);
  assert.match(tenantChecklistSource, /action=\{saveChecklistAction\}/);
  assert.match(tenantChecklistSource, /name="moveoutId"/);
  assert.match(tenantChecklistSource, /updateMoveoutChecklist\(moveoutId/);
  assert.match(managerMoveoutNavSource, /withManagerMoveoutId/);
  assert.match(managerMoveoutHomeSource, /selectedRow/);
  assert.match(managerMoveoutHomeSource, /rows\.length === 0/);
  assert.match(managerMoveoutHomeSource, /withManagerMoveoutId\(MANAGER_MOVEOUT_ROUTES\["M-OUT-03"\]/);
  assert.match(managerMoveoutComponentsSource, /withManagerMoveoutId/);
  assert.match(managerMoveoutComponentsSource, /MANAGER_MOVEOUT_ROUTES\["M-OUT-02"\]/);
  assert.equal(managerMoveoutLoadingExists, true);
  assert.equal(managerMoveoutErrorExists, true);
  assert.match(managerMoveoutLoadingSource, /퇴실\/정산 정보를 불러오는 중/);
  assert.match(managerMoveoutErrorSource, /reset/);
  assert.match(managerReviewSource, /completeReview/);
  assert.match(managerReviewSource, /action=\{completeReviewAction\}/);
  assert.match(managerReviewSource, /adjustDeduction/);
  assert.match(managerReviewSource, /action=\{adjustDeductionAction\}/);
  assert.match(managerReviewSource, /name="deductionId"/);
  assert.match(managerReviewSource, /name=\{`estimatedMin-\$\{deduction\.id\}`\}/);
  assert.match(managerReviewSource, /name=\{`estimatedMax-\$\{deduction\.id\}`\}/);
  assert.match(managerReviewSource, /name=\{`resolveConfirmation-\$\{deduction\.id\}`\}/);
  assert.match(managerReportSource, /adjustWearVerdict/);
  assert.match(managerReportSource, /action=\{adjustWearVerdictAction\}/);
  assert.match(managerReportSource, /name="recordItemId"/);
  assert.match(managerReportSource, /name=\{`evidenceNote-\$\{record\.id\}`\}/);
  assert.match(managerReportSource, /name=\{`notifyTenant-\$\{record\.id\}`\}/);
  assert.match(managerDisputeSource, /respondDispute/);
  assert.match(managerDisputeSource, /action=\{respondDisputeAction\}/);
  assert.match(managerDisputeSource, /selectedDisputeId/);
  assert.match(managerDisputeSource, /targetDisputeId/);
  assert.match(managerDisputeSource, /name="selectedDisputeId"/);
  assert.match(managerDisputeSource, /reflect === "settlement"/);

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

test("manager messaging thread places its back link beside the shell title", () => {
  assert.equal(existsSync(managerMessagingShellTitlePath), true);
  assert.match(managerMessagingLayoutSource, /title=\{<MessagingShellTitle \/>\}/);
  assert.match(managerMessagingShellTitleSource, /usePathname/);
  assert.match(managerMessagingShellTitleSource, /pathname === MANAGER_MESSAGING_ROUTES\["M-MSG-04"\]/);
  assert.match(managerMessagingShellTitleSource, /aria-label="소통 허브로 돌아가기"/);
  assert.match(managerMessagingShellTitleSource, /href=\{MANAGER_MESSAGING_ROUTES\["M-MSG-00"\]\}/);
  assert.doesNotMatch(managerMessagingThreadSource, /aria-label="소통 허브로 돌아가기"/);
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

test("manager announcement compose edits targets and translates each language before review", () => {
  assert.match(
    managerMessagingComposeSource,
    /prepareAnnouncementDraftForCompose\(draft, Boolean\(id\)\)/,
  );
  assert.match(managerMessagingComposeSource, /initialDraft=\{initialDraft\}/);
  assert.match(managerMessagingComposeFeatureSource, /createAnnouncementDraft/);
  assert.match(managerMessagingComposeFeatureSource, /updateAnnouncementDraft/);
  assert.match(managerMessagingComposeFeatureSource, /translateAnnouncement/);
  assert.match(managerMessagingComposeFeatureSource, /name="title"/);
  assert.match(managerMessagingComposeFeatureSource, /name="body"/);
  assert.match(managerMessagingComposeFeatureSource, /name="category"/);
  assert.match(managerMessagingComposeFeatureSource, /name="scope"/);
  assert.match(
    managerMessagingComposerSource,
    /name="scope"[\s\S]*?<span className=\{styles\.categoryPill\}>\s*\{option\.label\}\s*<\/span>/,
  );
  assert.doesNotMatch(managerMessagingComposerSource, /styles\.radioMark/);
  assert.match(managerMessagingComposeFeatureSource, /targetRoomIds/);
  assert.match(managerMessagingComposerSource, /roomsForBuilding/);
  assert.match(managerMessagingComposerSource, /공지 대상 호실 건물/);
  assert.match(managerMessagingComposerSource, /changeSelectedBuilding/);
  assert.match(managerMessagingComposerSource, /changeScope/);
  assert.match(managerMessagingComposerSource, /nextScope === "unit"/);
  assert.match(managerMessagingComposerSource, /setSelectedRoomIds\(\[\]\)/);
  assert.match(managerMessagingComposerSource, /선택 가능한 호실이 없습니다\./);
  assert.match(managerMessagingComposerSource, /className=\{styles\.unitInput\}/);
  assert.match(managerMessagingComposerSource, /className=\{styles\.unitChip\}/);
  assert.match(managerMessagingComposerSource, /room\.roomNo \?\? roomDisplayLabel\(room\)/);
  assert.match(managerMessagingComposerSource, /styles\.unitCheck/);
  assert.match(
    managerMessagingComposeFeatureSource,
    /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/,
  );
  assert.match(managerMessagingComposeFeatureSource, /\.unitInput:checked \+ \.unitChip/);
  assert.match(managerMessagingComposeFeatureSource, /lang: "en", label: "English"/);
  assert.match(managerMessagingComposeFeatureSource, /lang: "zh", label: "中文"/);
  assert.match(managerMessagingComposeFeatureSource, /lang: "vi", label: "Tiếng Việt"/);
  assert.match(managerMessagingComposeFeatureSource, /`\$\{label\} 번역`/);
  assert.match(managerMessagingComposerSource, /buildAttachedTranslations/);
  assert.match(managerMessagingComposerSource, /findAttachedTranslation/);
  assert.match(managerMessagingComposerSource, /findVisibleTranslation/);
  assert.match(managerMessagingComposerSource, /첨부하기/);
  assert.match(managerMessagingComposerSource, /첨부됨/);
  assert.match(managerMessagingComposerSource, /번역 후 첨부할 언어를 선택해 주세요/);
  assert.doesNotMatch(managerMessagingComposerSource, /검수 완료/);
  assert.doesNotMatch(
    managerMessagingComposerSource,
    /type="checkbox"\s+checked=\{translation\.reviewed\}/,
  );
  assert.doesNotMatch(managerMessagingComposeFeatureSource, />⌄</);
  assert.match(
    managerMessagingComposeFeatureSource,
    /<div className=\{styles\.targetBox\}>\s*<span>\{target\.targetLabel\}<\/span>\s*<\/div>/,
  );
  assert.match(managerMessagingComposeFeatureSource, /className=\{styles\.selectWrap\}/);
  assert.match(managerMessagingComposeFeatureSource, /appearance: none/);
  assert.match(
    managerMessagingComposeFeatureSource,
    /right: calc\(var\(--space-lg\) \+ 10px\)/,
  );
  assert.match(managerMessagingComposeFeatureSource, /pointer-events: none/);
  assert.match(managerMessagingComposeFeatureSource, /aria-expanded=\{isExpanded\}/);
  assert.match(managerMessagingComposeFeatureSource, /aria-controls=\{panelId\}/);
  assert.match(managerMessagingComposeFeatureSource, /id=\{panelId\}/);
  assert.match(managerMessagingComposeFeatureSource, /isExpanded \? \(/);
  assert.match(managerMessagingComposeFeatureSource, /setExpandedLanguages/);
  assert.match(managerMessagingApiSource, /createAnnouncementDraft/);
  assert.match(managerMessagingApiSource, /updateAnnouncementDraft/);
  assert.match(managerMessagingApiSource, /translateAnnouncement/);
  assert.match(managerMessagingApiSource, /method: "POST"/);
  assert.doesNotMatch(managerMessagingComposeFeatureSource, /value=\{draft\.title\} readOnly/);
  assert.doesNotMatch(managerMessagingComposeFeatureSource, /<StaticButton>임시 저장<\/StaticButton>/);
  assert.match(managerMessagingReviewSource, /findAttachedTranslation/);
  assert.match(managerMessagingReviewSource, /최종 첨부 번역/);
  assert.match(managerMessagingReviewSource, /최종 언어/);
  assert.doesNotMatch(managerMessagingReviewSource, /D21 주요 언어 번역 미리보기/);
  assert.doesNotMatch(managerMessagingReviewSource, /주요 언어 검수 완료/);
  assert.doesNotMatch(managerMessagingReviewSource, /label="번역 검수"/);
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
  // 투어 예약은 존재하지 않는 기능이라 카피에서 전부 제거 — 3D 미리보기만 약속한다.
  assert.doesNotMatch(pageSource, /투어\s*예약/);
  assert.match(pageSource, /방문 전 3D로 먼저 보기/);
  assert.match(pageSource, /공간 미리보기/);
  assert.match(cssSource, /\.tour-sheet/);
  assert.match(cssSource, /\.tour-preview-stage/);
  assert.doesNotMatch(pageSource, /3D ENGINE SLOT|다른 팀의 3D 엔진|연결될 위치/);
});

test("offers a clean white social sign-in limited to Naver and Google", () => {
  // 로그인 화면은 WoozuLoginScreen으로 추출되어 /?auth=login과 /login이 공유한다.
  for (const label of [
    "네이버",
    "Google",
    "집우집주",
    "WOOZU 계정 하나로 방 찾기, 사는 집, 내놓은 집, 관리 중인 집을 이어갑니다",
    "3D투어",
    "입주관리AI",
    "업체연결"
  ]) {
    assert.match(loginScreenSource, new RegExp(label));
  }

  assert.match(loginScreenSource, /socialLoginNotice/);
  assert.match(loginScreenSource, /setSocialLoginNotice/);
  assert.match(loginScreenSource, /service-login-panel/);
  assert.match(loginScreenSource, /submitServiceLogin/);
  assert.match(loginScreenSource, /\/api\/auth\/login/);
  // 통합 로그인: 로그인은 역할을 제한하지 않는다 — expectedRole 차단 로직은 제거됐다.
  assert.doesNotMatch(loginScreenSource, /expectedRole/);
  assert.doesNotMatch(loginRouteSource, /expectedRole/);
  assert.match(loginScreenSource, /\/api\/auth\/me/);
  assert.match(loginScreenSource, /login-brandmark/);
  assert.match(loginScreenSource, /brand-mark-icon/);
  assert.match(pageSource, /WoozuLoginScreen/);
  assert.match(cssSource, /\.login-phone\s*{[^}]*background:\s*#ffffff/s);
  assert.match(cssSource, /\.login-feature-bar/);
  assert.match(cssSource, /\.social-login-notice/);
  assert.doesNotMatch(loginScreenSource, /카카오로 계속하기/);
  assert.doesNotMatch(loginScreenSource, /Apple로 계속하기/);
  assert.doesNotMatch(loginScreenSource, /assets\/img\/image\.png/);
  assert.doesNotMatch(loginScreenSource, /loginHeroImage/);
  assert.doesNotMatch(loginScreenSource, /login-visual/);
  assert.doesNotMatch(loginScreenSource, /login-hero-image/);
  assert.doesNotMatch(cssSource, /\.login-visual/);
  assert.doesNotMatch(cssSource, /\.login-hero-image/);
  assert.doesNotMatch(cssSource, /\.social-button\.kakao/);
  assert.doesNotMatch(cssSource, /\.social-button\.apple/);
  assert.doesNotMatch(pageSource, /개발 중에는/);
  assert.doesNotMatch(pageSource, /pin-a|pin-b|pin-c/);
});

test("routes every roomlog entry through the unified WOOZU /login with capability continuation", () => {
  assert.equal(existsSync(new URL("./src/app/login/page.tsx", import.meta.url)), true);
  assert.match(unifiedLoginPageSource, /WoozuLoginScreen/);
  assert.match(unifiedLoginPageSource, /resolvePostLoginDestination/);
  // capability가 없으면 재로그인이 아니라 "연결 필요" 안내 상태로 이어진다.
  assert.match(unifiedLoginPageSource, /link-required/);
  assert.match(unifiedLoginPageSource, /다른 계정으로 로그인/);

  // 기존 역할별 로그인 경로는 삭제하지 않고 /login?intent=... 호환 redirect로 남긴다.
  for (const [dir, intent] of [
    ["tenant", "tenant"],
    ["manager", "landlord"],
    ["vendor", "vendor"]
  ]) {
    const wrapperSource = readFileSync(
      new URL(`./src/app/${dir}/login/page.tsx`, import.meta.url),
      "utf8"
    );
    assert.match(wrapperSource, /legacyLoginRedirectTarget/);
    assert.match(wrapperSource, new RegExp(`"${intent}"`));
    assert.doesNotMatch(wrapperSource, /api\/auth\/login/);
  }

  // 서버 가드도 통합 로그인으로 보낸다 — 역할별 로그인 경로 하드코딩 금지.
  assert.match(sessionLibSource, /unifiedLoginPath/);
  assert.match(sessionLibSource, /hasCapability/);
  assert.doesNotMatch(sessionLibSource, /\/tenant\/login|\/manager\/login|\/vendor\/login/);

  // Google OAuth 실패 복귀 경로도 /login?intent=... 하나로 수렴한다.
  assert.match(googleAuthSharedSource, /\/login\?intent=/);
  assert.doesNotMatch(googleAuthSharedSource, /return "\/(tenant|manager|vendor)\/login"/);
});

test("landlord link-required CTA starts the unprotected listing flow instead of looping to /login", () => {
  // QA 2 회귀 방지: capability 없는 계정의 "집 내놓기"가 보호된 마이페이지로 갔다가
  // 다시 /login으로 돌아오는 루프가 없어야 한다.
  assert.match(unifiedLoginPageSource, /\/\?flow=listing/);
  assert.doesNotMatch(unifiedLoginPageSource, /"\/(\?role=landlord&tab=mypage)"/);
  assert.match(pageSource, /flow === "listing"/);
  assert.match(pageSource, /isListingStartMode/);
  // 등록 시작 모드에서는 매물등록(sell) 탭이 보호 대상에서 빠진다.
  assert.match(pageSource, /activeTab === "sell"\s*\?\s*isListingStartMode\s*\?\s*null/);
});

test("every inquiry entry point opens the same composer sheet and feeds the inquiry center", () => {
  // QA 3·4·6·7 회귀 방지: 홈 카드 문자문의·상세 문의하기가 같은 sheet로 이어진다.
  assert.match(pageSource, /function InquirySheet/);
  assert.match(pageSource, /openInquiryComposer\(listing\)/);
  // 문의 탭의 "새 문의" 버튼은 제거됐다 — 문의센터는 채팅 허브만 남는다.
  assert.doesNotMatch(pageSource, /onNewInquiry/);
  assert.match(pageSource, /pickInquiryTargetNo/);
  assert.match(pageSource, /withNewInquiry/);
  // "새 문의"가 안내 문구만 띄우고 홈으로 보내던 동작 금지.
  assert.doesNotMatch(pageSource, /새 문의는 매물 상세에서 바로 보낼 수 있습니다/);
  // 접수 완료 상태에서 문의센터로 바로 이동할 수 있다.
  assert.match(pageSource, /문의센터 보기/);
  assert.match(pageSource, /onViewInquiryCenter/);
});

test("inquiry center chat hub splits desktop two-pane vs app list with sort and unread badges", () => {
  // 문의센터는 TradeChatCenter 허브 변형 하나로 그려진다.
  assert.match(pageSource, /variant="hub"/);
  assert.doesNotMatch(pageSource, /inquiryChannelItems|inquiryTimelineItems|inquiry-mini-grid/);
  // 데스크톱 브라우저(넓은 화면·비설치)만 2패널 — PWA standalone은 앱 목록 디자인.
  assert.match(tradeChatCenterSource, /display-mode: standalone/);
  assert.match(tradeChatCenterSource, /min-width: 1080px/);
  assert.match(tradeChatCenterSource, /trade-hub-desktop/);
  // 최근 메시지순 정렬 + 상대가 보낸 새 메시지의 스레드별 안읽음 뱃지(읽음 기준은 사용자별 저장).
  assert.match(tradeChatCenterSource, /sortByLatest/);
  assert.match(tradeChatCenterSource, /woozuTradeSeen:\$\{/);
  assert.match(tradeChatCenterSource, /lastSenderId === myUserId/);
  assert.match(tradeChatCenterSource, /trade-hub-unread/);
  assert.match(cssSource, /\.trade-hub-desktop/);
  assert.match(cssSource, /\.trade-hub-list\.app/);
  assert.match(cssSource, /\.trade-hub-unread/);
  assert.match(cssSource, /\.trade-chat-room\s*\{/);
});

test("manager contracted-house rows open a resident-style dashboard with a locked tenant chat", () => {
  // 계약중인 집 행 클릭 → 집·세입자 정보 대시보드, 우측 하단 세입자 채팅은 계약의 문의 스레드에 잠긴다.
  assert.match(managerHomeTabsSource, /function ContractDashboard/);
  assert.match(managerHomeTabsSource, /setOpenContractId\(contract\.id\)/);
  assert.match(managerHomeTabsSource, /세입자 채팅/);
  assert.match(managerHomeTabsSource, /lockedThreadId=\{contract\.threadId\}/);
  assert.match(managerHomeTabsSource, /roleFilter="owner"/);
  // 서버 페이지가 스레드 id와 청구 요약을 내려준다 — 청구는 데모 폴백 없이 실패 시 null(위조 금지).
  assert.match(managerHomeDashboardDataSource, /threadId: contract\.threadId/);
  assert.match(managerHomeDashboardDataSource, /manager\/bills\/dashboard/);
  assert.doesNotMatch(managerHomeDashboardDataSource, /DEMO_DASHBOARD/);
});

test("switching hub threads never leaks the previous thread's conversation or contract bar", () => {
  // QA 회귀: 계약 체결 스레드를 열었다가 다른 스레드로 직행하면 계약 바가 남던 문제.
  // 1) 스레드 전환 시 이전 대화·계약 상태를 즉시 비운다.
  assert.match(tradeChatCenterSource, /setOpenThread\(null\);\s*\n\s*setOpenContract\(null\);\s*\n\s*\}, \[openThreadId\]\)/);
  // 2) 늦게 도착한 이전 스레드 응답은 버린다.
  assert.match(tradeChatCenterSource, /if \(openThreadIdRef\.current === threadId\) setOpenThread/);
  assert.match(tradeChatCenterSource, /if \(openThreadIdRef\.current === threadId\) setOpenContract/);
  // 3) 계약 없는 스레드의 contract 조회(업스트림 null 바디)가 프록시에서 500이 되지 않는다.
  assert.match(tradeProxySource, /NextResponse\.json\(data \?\? null\)/);
});

test("trade update badge ignores messages sent by the current viewer", () => {
  assert.match(tradeControllerSource, /threadId: thread\.id,\s*\n\s*senderId/);
  assert.match(pageSource, /onTradeUpdated = \(payload: \{ threadId\?: string; senderId\?: string \}\)/);
  assert.match(pageSource, /payload\.senderId === viewer\.userId/);
  assert.match(pageSource, /setUnseenTradeCount/);
});

test("owner registration state survives refresh via a versioned local draft with no fake prefills", () => {
  // QA 8 + 사전 입력 제거: 폼은 빈 값으로 시작하고, 작성/등록 상태는 localStorage draft로 유지된다.
  assert.match(pageSource, /useState\(emptyOwnerForm\)/);
  assert.match(pageSource, /OWNER_DRAFT_STORAGE_KEY/);
  assert.match(pageSource, /parseOwnerDraft/);
  assert.match(pageSource, /serializeOwnerDraft/);
  assert.match(pageSource, /임시저장됨/);
  assert.doesNotMatch(pageSource, /title: "방배 루미에르 402호",\s*\n\s*address: "서울특별시 서초구 방배동"/);
  assert.match(cssSource, /\.owner-draft-status/);
});

test("login success consumes the pushed auth history entry so back does not reopen the login screen", () => {
  // QA 5 회귀 방지(앱 내부 히스토리): completeServiceAuth도 closeAuthScreen처럼 push 엔트리를 소비한다.
  assert.match(pageSource, /const completeServiceAuth[\s\S]{0,400}isAuthHistoryPushedRef\.current = false;\s*\n\s*window\.history\.back\(\)/);
});

test("opens the dedicated signup page from signup actions and social fallback", () => {
  assert.match(pageSource, /const \[authMode, setAuthMode\]/);
  assert.match(pageSource, /openAuthScreen/);
  assert.match(pageSource, /normalizeAuthMode/);
  assert.match(loginScreenSource, /socialProvidersForMode/);
  assert.match(loginScreenSource, /flow=\$\{flow\}/);
  assert.match(loginScreenSource, /role=SEEKER/);
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
  assert.doesNotMatch(pageSource, /중개사 가입/);
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
  assert.match(pageSource, /입주 조건/);
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

test("removes the developer role login panel — roles derive from the signed-in account", () => {
  // 개발용 역할 입장은 제거됐다 — 역할은 로그인 계정 capability에서만 파생된다.
  assert.doesNotMatch(loginScreenSource, /개발용 로그인/);
  assert.doesNotMatch(loginScreenSource, /dev-role-button/);
  assert.doesNotMatch(loginScreenSource, /역할을 골라 바로 입장/);
  assert.doesNotMatch(pageSource, /startRoleSession/);

  assert.match(loginScreenSource, /type AppRole/);
  assert.match(loginScreenSource, /function WoozuLoginScreen/);
  assert.match(pageSource, /resetWindowScrollSoon/);
  assert.match(pageSource, /window\.setTimeout\(resetWindowScroll, 320\)/);
  assert.match(pageSource, /\[activeRole, activeTab, authMode\]/);
});

test("gives tenants a real resident dashboard instead of the generic profile", () => {
  for (const label of [
    "세입자 마이페이지",
    "집주인 공지사항",
    "임대인으로부터 전달된 새로운 소식이 없습니다.",
    "입주 정보",
    "tenantRoomTitle",
    "계약 기간",
    "차기 결제일",
    "월세",
    "관리비",
    "임대차 계약서 보기",
    "임대인에게 문의하기",
    "민원/하자 이력",
    "신규 요청하기",
    "이번 달 합계",
    "Woo-zu AI Assistant",
    "Choose your consultation mode",
    "How would you like to talk with Woo-zu AI?",
    "Text Chat",
    "Voice Call",
    "TEXT",
    "CALL",
    "안녕하세요! 우주\\(Woo-zu\\) AI 어시스턴트입니다. 무엇을 도와드릴까요\\?",
    "메시지를 입력하세요..."
  ]) {
    assert.match(pageSource, new RegExp(label));
  }

  assert.match(pageSource, /\/api\/tenant\/messaging\/announcements/);
  assert.match(pageSource, /roomlog:activity/);
  assert.match(pageSource, /공지사항을 확인하고 있습니다\./);
  assert.match(pageSource, /임대인으로부터 전달된 새로운 소식이 없습니다\./);
  assert.match(pageSource, /공지사항을 불러오지 못했습니다\. 잠시 후 다시 확인해 주세요\./);
  assert.match(pageSource, /\/tenant\/messaging\/02\?id=/);
  assert.doesNotMatch(pageSource, /"에어컨 수리"|"세면대 교체"/);

  assert.match(pageSource, /activeTab === "living"/);
  // 사는집 탭의 "내 룸로그 프로세스" 링크 카드와 "방문 일정" 안내 카드는 제거됐다.
  assert.doesNotMatch(pageSource, /tenant-domain-test-card|href="\/tenant\/messaging\/00"|href="\/tenant\/moveout\/00"/);
  assert.doesNotMatch(pageSource, /maintenance-card/);
  assert.doesNotMatch(cssSource, /\.maintenance-card/);
  assert.match(cssSource, /\.tenant-portal-screen/);
  assert.match(cssSource, /\.tenant-announcement-card/);
  assert.match(cssSource, /\.tenant-residence-card/);
  assert.match(cssSource, /\.tenant-history-card/);
  assert.match(cssSource, /\.tenant-payment-card/);
  assert.match(cssSource, /\.tenant-ai-assist-button/);
  assert.match(cssSource, /\.tenant-ai-panel/);
  assert.match(cssSource, /\.tenant-ai-mode-picker/);
  assert.match(cssSource, /\.tenant-ai-mode-card/);
  assert.match(cssSource, /\.tenant-ai-mode-toggle/);
  assert.match(cssSource, /\.tenant-ai-switch/);
  assert.match(cssSource, /\.tenant-ai-call-note/);
  assert.match(cssSource, /\.tenant-ai-composer/);
  assert.match(cssSource, /\.tenant-ai-composer\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+56px/);
  assert.doesNotMatch(cssSource, /\.tenant-ai-change-mode/);
  assert.doesNotMatch(cssSource, /\.tenant-ai-voice-panel/);
  assert.match(cssSource, /width:\s*min\(820px,\s*calc\(100vw - 48px\)\)/);
  assert.match(cssSource, /height:\s*min\(980px,\s*calc\(100dvh - 160px\)\)/);
  assert.match(cssSource, /\.tenant-ai-bubble\s*\{[^}]*font-size:\s*20px/);
  assert.match(pageSource, /setIsAiAssistantOpen\(\(isOpen\) => !isOpen\)/);
  assert.match(pageSource, /setAiStage\("choose"\)/);
  assert.match(pageSource, /setAiStage\("text"\)/);
  assert.match(pageSource, /setAiStage\("voice"\)/);
  assert.match(pageSource, /aria-label="AI 상담 모드 전환"/);
  assert.match(pageSource, /aria-checked=\{aiMode === "call"\}/);
  assert.match(pageSource, /통화 모드에서는 메시지 입력 대신 음성 상담 상태를 이어서 확인합니다\./);
  assert.match(pageSource, /aiStage !== "choose"/);
  assert.doesNotMatch(pageSource, /tenant-ai-change-mode/);
  assert.doesNotMatch(pageSource, /tenant-ai-voice-panel/);
  assert.doesNotMatch(pageSource, />Mode</);
  assert.match(pageSource, /handleAiSubmit/);
  assert.doesNotMatch(pageSource, /AI 생활 도우미는 곧 연결됩니다/);
  assert.match(pageSource, /tenant-chat-panel/);
  assert.match(pageSource, /setIsLandlordChatOpen\(true\)/);
  assert.match(pageSource, /tenantLandlordConversationPaths\.current\(\)/);
  assert.match(pageSource, /submitLandlordMessage/);
  assert.doesNotMatch(pageSource, /lockedThreadId=\{tenancy\.contract\.threadId\}/);
  assert.match(cssSource, /\.tenant-chat-panel/);
  assert.doesNotMatch(pageSource, /창문 누수|욕실 타일 보수|에어컨 필터|오늘 2:30|보일러 온수 불량 접수하기|HVAC|2:30 PM/);
});

test("shows a landlord my page with property registration fields and media actions", () => {
  for (const label of [
    "집주인 마이페이지",
    "내 집 등록",
    "매물명",
    "주소",
    "주소 검색",
    "세부주소",
    "거래유형",
    "입주가능일",
    "보증금",
    "월세",
    "전세금",
    "전세",
    "관리비",
    "전용면적",
    "층수",
    "사진과 3D방 자료",
    "사진 업로드",
    "3D 도면 만들기",
    "도면 JSON 업로드",
    "영상/스플랫 접수",
    "등록 요약",
    "등록하면 즉시 매물이 노출되고, 문의는 채팅으로 바로 도착합니다.",
    "매물 등록하기"
  ]) {
    assert.match(pageSource, new RegExp(label));
  }

  assert.match(pageSource, /owner-submit-summary/);
  assert.match(pageSource, /detailAddress/);
  assert.match(pageSource, /세부주소 없음/);
  assert.match(pageSource, /ownerForm/);
  assert.match(pageSource, /setOwnerForm/);
  assert.match(pageSource, /photoCount/);
  assert.match(pageSource, /has3DRoom/);
  assert.match(pageSource, /registrationStatus/);
  assert.match(pageSource, /submitOwnerListing/);
  assert.match(pageSource, /id="owner-registration-form"/);
  assert.doesNotMatch(pageSource, /업로드 버튼 대기|전용 업로드 영역|자료 대기/);
  assert.match(cssSource, /\.owner-preview-card/);
  assert.match(cssSource, /\.owner-preview-actions/);
  assert.match(cssSource, /\.owner-preview-actions button/);
  assert.match(cssSource, /\.owner-submit-summary/);
  assert.match(cssSource, /\.owner-summary-address/);
  assert.match(cssSource, /\.listing-detail-address/);
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
  assert.match(cssSource, /\.upload-tile--action\.is-connected/);
});

test("adds real bottom-tab destinations and a labeled role menu", () => {
  for (const label of [
    "찜한 매물",
    "문의센터",
    "세입자",
    "관리",
    "매물등록",
    "저장 조건",
    "찜한 매물 비교 요약",
    "가격 변동",
    "방문 후보",
    "최근 본 방"
  ]) {
    assert.match(pageSource, new RegExp(label));
  }

  assert.match(pageSource, /from "lucide-react"/);
  assert.match(pageSource, /Icon: HomeIcon/);
  assert.match(pageSource, /Icon: MapPinned/);
  assert.match(pageSource, /Icon: Heart/);
  assert.match(pageSource, /Icon: MessageCircle/);
  assert.match(pageSource, /className="mobile-role-menu__icon"/);
  assert.match(pageSource, /<\/svg>\s*메뉴\s*<\/button>/);
  assert.match(pageSource, /<UserRound\s/);
  assert.match(pageSource, /<Bell/);
  assert.match(pageSource, /<Search/);
  assert.match(pageSource, /<SlidersHorizontal/);
  assert.match(pageSource, /<item\.Icon/);
  // 탭 초기값은 라우트(/, /map, /saved, /inquiry, /sell, /living)가 내려주는 initialTab이다.
  assert.match(pageSource, /useState<AppTab>\(initialTab\)/);
  assert.match(pageSource, /TAB_PATHS/);
  assert.match(pageSource, /activeTab === item\.key/);
  assert.match(pageSource, /activeTab === "home"/);
  assert.match(pageSource, /activeTab === "map"/);
  assert.match(pageSource, /activeTab === "saved"/);
  assert.match(pageSource, /activeTab === "inquiry"/);
  assert.match(pageSource, /activeTab === "sell"/);
  assert.match(pageSource, /activeTab === "living"/);
  assert.match(pageSource, /window\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\)/);
  assert.match(pageSource, /querySelectorAll<HTMLElement>\("\.service-frame, \.screen, \.home-screen, \.map-screen, \.listing-detail-screen"\)/);
  assert.doesNotMatch(pageSource, /onClick=\{\(event\) => \{[\s\S]*scrollIntoView[\s\S]*activateTab\(item\.key\)/);
  assert.match(pageSource, /href: "#saved-list"/);
  assert.match(pageSource, /href: "#inquiry"/);
  assert.match(pageSource, /setInquiries/);
  assert.match(cssSource, /\.inquiry-notice/);
  assert.match(cssSource, /\.saved-compare-strip/);
  // 문의센터의 채널/타임라인/미니 통계 카드는 제거됐다 — 채팅 허브만 남는다.
  assert.doesNotMatch(cssSource, /\.inquiry-timeline-card|\.inquiry-channel-card|\.inquiry-mini-grid/);
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
    "3D 도면 미연결 매물",
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
    "안내 배지가 함께 표시됩니다"
  ]) {
    assert.match(pageSource, new RegExp(label));
  }

  for (const label of ["안심 거래 정보", "문의 가능", "등록 사진", "중개사 확인", "방배동 · 내방역 도보 5분"]) {
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
  // 상세는 /listing/[id] 라우트 — 카드 클릭은 상태 대신 라우터 이동, 찜은 localStorage 공유 스토어.
  assert.match(pageSource, /router\.push\(`\/listing\/\$\{encodeURIComponent\(listing\.listingNo\)\}`\)/);
  assert.match(pageSource, /listing-card-action/);
  assert.match(pageSource, /setIsShareSheetOpen\(true\)/);
  assert.match(pageSource, /isSaved=\{savedListingNos\.includes\(listing\.listingNo\)\}/);
  assert.match(pageSource, /toggleSavedListingNo/);
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
  // 전화·3D 둘러보기·1인칭 체험·문자 문의 4버튼 그리드(임시 데모).
  assert.match(cssSource, /\.detail-contact-bar\s*{[^}]*grid-template-columns:\s*52px minmax\(0, 1fr\) minmax\(0, 1fr\) minmax\(0, 1\.35fr\)/s);
  // 1인칭 체험 버튼은 splat 투어 페이지로 직접 이동한다.
  assert.match(pageSource, /detail-contact-splat[\s\S]*href="\/splat-tour"/);
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
  assert.match(pageSource, /selectedMapListingNo/);
  assert.match(pageSource, /selectedMapListing/);
  assert.match(pageSource, /map-selected-card/);
  assert.match(pageSource, /지도 선택 매물/);
  assert.match(pageSource, /setSelectedMapListingNo\(listing\.listingNo\)/);
  // 직접등록 매물이 지도 목록·마커에 합류하는 경로 (QA: 지도에 매물 안 찍힘)
  assert.match(pageSource, /tradeListingToMapItem/);
  assert.match(pageSource, /markers=\{mapMarkers\}/);
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

test("home recommendations use only the public trade listing feed", () => {
  assert.match(homeAppSource, /fetch\("\/api\/trade\/listings\/public", \{ cache: "no-store" \}\)/);
  assert.doesNotMatch(homeAppSource, /fetch\("\/api\/trade\/listings", \{ cache: "no-store" \}\)/);
  assert.match(homeAppSource, /key=\{listing\.listingNo\}/);
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
  // 인앱 설치 카드(PwaInstallCard)는 방찾는중 페이지와 함께 제거됐다 —
  // 설치 가능성은 manifest/서비스워커/레이아웃 메타로 유지된다(브라우저 기본 설치 UX).
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
  // "내 룸로그" 흐름이 홈에 들어오면서 룸로그 표기는 정식 제품 카피가 됐다 — PWA 목업 카피만 계속 금지.
  assert.doesNotMatch(pageSource, /ROOMLOG PWA|오프라인 캐시/);
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
  // 회귀 방지: API 응답은 서비스워커 캐시-우선에서 제외돼야 최신 매물이 즉시 보인다.
  assert.match(serviceWorkerSource, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(serviceWorkerSource, /request\.mode === "navigate"/);
  assert.match(serviceWorkerSource, /new URL\(request\.url\)/);
  assert.match(nextConfigSource, /allowedDevOrigins:\s*\[\s*"127\.0\.0\.1"\s*\]/);
});

test("removes obvious mockup copy from the visible product shell", () => {
  assert.doesNotMatch(pageSource, /프론트 셸/);
  // "관리자 관계 · 연결 예정"은 목업 카피가 아니라 내 룸로그의 관계 상태 표기다.
  assert.doesNotMatch(pageSource, /데이터 연결 예정|화면 연결 예정/);
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

  for (const label of ["3D 도면", "123123", "FloorPlanEditor", "초안 저장", "등록"]) {
    assert.match(floorPlanRouteSource, new RegExp(label));
  }
  // 뒤로가기는 매물등록(/sell)으로 — /my는 삭제된 라우트라 404가 났었다(회귀 방지).
  assert.match(floorPlanRouteSource, /href="\/sell\?flow=listing#my-page"/);
  assert.doesNotMatch(floorPlanRouteSource, /href="\/my\?flow=listing/);
  assert.match(floorPlanEditorSource, /FLOOR_PLAN_LISTING_RETURN_PATH/);
  assert.match(floorPlanEditorSource, /window\.location\.href = FLOOR_PLAN_LISTING_RETURN_PATH/);
  assert.match(floorPlanEditorSource, /disabled=\{isProcessing \|\| roomWalls3D\.length === 0\}/);
  assert.doesNotMatch(floorPlanEditorSource, /disabled=\{isProcessing \|\| walls\.length === 0 \|\| !isScaleSet\}/);
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

test("post-processes Roboflow wall boxes before using them as 3D walls", () => {
  const result = floorPlanModel.buildWallsFromDetectionBoxes({
    canvasHeight: 1000,
    canvasWidth: 1000,
    imageHeight: 1000,
    imageWidth: 1000,
    minGeneratedWallCount: 1,
    openingBoxes: [{ height: 50, width: 120, x: 430, y: 490 }],
    pixelToMmRatio: 10,
    wallBoxes: [
      { confidence: 0.83, height: 20, width: 400, x: 100, y: 500 },
      { confidence: 0.76, height: 18, width: 360, x: 480, y: 503 },
      { confidence: 0.18, height: 22, width: 400, x: 100, y: 700 }
    ]
  });

  assert.equal(result.generatedWallCount, 2);
  assert.equal(result.walls.every((wall) => wall.source === "roboflow-postprocessed"), true);
  assert.equal(new Set(result.walls.map((wall) => wall.orientation)).size, 1);
  assert.deepEqual(
    result.walls.map((wall) => Math.round(wall.start.y)),
    [1, 1].map(() => Math.round(result.walls[0].start.y))
  );
  assert.ok(result.walls[0].end.x <= -80, "opening should cut the left segment before the doorway");
  assert.ok(result.walls[1].start.x >= 30, "opening should cut the right segment after the doorway");
});

test("cuts walls when Roboflow opening boxes are slightly offset from the wall axis", () => {
  const result = floorPlanModel.buildWallsFromDetectionBoxes({
    canvasHeight: 1000,
    canvasWidth: 1000,
    imageHeight: 1000,
    imageWidth: 1000,
    minGeneratedWallCount: 1,
    openingBoxes: [{ height: 40, width: 240, x: 380, y: 545 }],
    pixelToMmRatio: 10,
    wallBoxes: [{ confidence: 0.8, height: 20, width: 800, x: 100, y: 500 }]
  });

  assert.equal(result.generatedWallCount, 2);
  assert.ok(result.walls.every((wall) => wall.source === "roboflow-postprocessed"));
});

test("keeps existing wall axes when Roboflow detects only a partial wall segment", () => {
  const result = floorPlanModel.buildWallsFromDetectionBoxes({
    canvasHeight: 1000,
    canvasWidth: 1000,
    currentWalls: [{ id: "existing-bottom", start: { x: -320, y: 0 }, end: { x: 320, y: 0 } }],
    imageHeight: 1000,
    imageWidth: 1000,
    minGeneratedWallCount: 1,
    openingBoxes: [{ height: 40, width: 140, x: 430, y: 500 }],
    pixelToMmRatio: 10,
    wallBoxes: [{ confidence: 0.78, height: 20, width: 220, x: 100, y: 500 }]
  });

  assert.equal(result.generatedWallCount, 2);
  assert.ok(result.walls[0].end.x < 0, "left segment should stop before the opening");
  assert.ok(result.walls[1].start.x > 0, "right segment should remain after the opening");
  assert.ok(result.walls[1].end.x >= 300, "right segment should keep the existing wall extent");
});

test("exposes Roboflow wall post-processing as a separate editor action", () => {
  for (const label of ["roboflowDetections", "applyRoboflowWallPostProcessing", "인식 보정", "Roboflow 원본 박스 저장됨"]) {
    assert.match(floorPlanEditorSource, new RegExp(label));
  }
});

test("extends and merges raw Roboflow wall boxes instead of dropping them from the cleaned overlay", () => {
  assert.match(floorPlanEditorSource, /generatedWallBoxes/);
  assert.match(floorPlanEditorSource, /variant: "postprocessed"/);
  assert.match(floorPlanEditorSource, /buildAdjustedWallBoxesFromRawAndGenerated/);
  assert.match(floorPlanEditorSource, /rawWallDisplayBoxes/);
  assert.match(floorPlanEditorSource, /fitOpeningBoxesToPostProcessedWalls/);
  assert.doesNotMatch(floorPlanEditorSource, /setLineDash\(\[8 \/ viewScale, 5 \/ viewScale\]\)/);
});

test("shows Roboflow post-processed walls as purple boxes instead of black center lines", () => {
  const postProcessedWallBranch = requireSourceMatch(
    floorPlanContainerSource,
    /if \(isRoboflowPostProcessedWall\) \{[\s\S]*?return;\s*\}\s*if \(selectedWall\?\.id === wall\.id\)/,
    "Roboflow post-processed wall drawing branch"
  );

  assert.match(postProcessedWallBranch, /if \(selectedWall\?\.id === wall\.id\) drawWall\(wall, "selected"\)/);
  assert.match(postProcessedWallBranch, /else if \(partialEraserSelectedWall\?\.id === wall\.id\) drawWall\(wall, "erase"\)/);
  assert.match(postProcessedWallBranch, /else if \(hoveredWall\?\.id === wall\.id\) drawWall\(wall, "hover"\)/);
  assert.doesNotMatch(postProcessedWallBranch, /drawWall\(wall(?:\)|,\s*"(?:normal|hidden|ai-missing|ai-room)")/);
});

test("preserves raw Roboflow wall boxes and a stable wall-axis source for post-processing", () => {
  assert.match(floorPlanEditorSource, /roboflowWallPostProcessSourceWalls/);
  assert.match(floorPlanEditorSource, /setRoboflowWallPostProcessSourceWalls/);
  assert.match(floorPlanEditorSource, /variant: "raw"/);
  assert.match(floorPlanEditorSource, /setDetectionBoxes\(\[\.\.\.cornerAlignedWallBoxes, \.\.\.fittedOpeningBoxes\]\)/);
});

test("keeps Roboflow windows over continuous walls and cuts wall boxes only at doors", () => {
  assert.match(floorPlanEditorSource, /openingBoxes: roboflowDetections\.openings\.filter\(\(opening\) => opening\.type === "DOOR"\)/);
  assert.doesNotMatch(floorPlanEditorSource, /openingBoxes: roboflowDetections\.openings\.map\(\(opening\) => opening\.boundingBox\)/);
});

test("clips Roboflow opening overlays to wall bounds without increasing their length", () => {
  assert.match(floorPlanEditorSource, /clipSegmentToRange/);
  assert.doesNotMatch(floorPlanEditorSource, /minimumLength/);
  assert.doesNotMatch(floorPlanEditorSource, /Math\.max\(sourceLength, minimumLength\)/);
});

test("uses a conservative wall gap fill so unrelated wall boxes are not stretched together", () => {
  assert.match(floorPlanEditorSource, /const gapTolerance = Math\.max\(36, Math\.min\(72, thickness \* 2\.5\)\)/);
  assert.doesNotMatch(floorPlanEditorSource, /const gapTolerance = 180/);
});

test("trims perpendicular Roboflow wall overlay corners so box strokes do not leave small square overlaps", () => {
  assert.match(floorPlanEditorSource, /trimWallBoxCornerOverlaps/);
  assert.match(floorPlanEditorSource, /const cornerTolerance = 6/);
  assert.match(floorPlanEditorSource, /const maxTrimOverlap = cornerTolerance \* 2/);
  assert.match(floorPlanEditorSource, /if \(overlapX > maxTrimOverlap && overlapY > maxTrimOverlap\) continue/);
  assert.match(floorPlanEditorSource, /const openingLineAlignedWallBoxes = alignWallBoxesToFittedOpeningLines/);
});

test("micro-snaps Roboflow opening overlay edges to nearby original wall breaks", () => {
  assert.match(floorPlanEditorSource, /snapOpeningBoxEdgesToNearbyWallBreaks/);
  assert.match(floorPlanEditorSource, /const openingEdgeSnapTolerance = 14/);
  assert.match(floorPlanEditorSource, /rawWallDisplayBoxes/);
});

test("aligns wall overlay thickness from already fitted Roboflow opening lines", () => {
  assert.match(floorPlanEditorSource, /alignWallBoxesToFittedOpeningLines/);
  assert.match(floorPlanEditorSource, /const fittedOpeningLineTolerance = 12/);
  assert.match(floorPlanEditorSource, /const openingLineAlignedWallBoxes = alignWallBoxesToFittedOpeningLines/);
  assert.match(floorPlanEditorSource, /setDetectionBoxes\(\[\.\.\.cornerAlignedWallBoxes, \.\.\.fittedOpeningBoxes\]\)/);
  assert.match(floorPlanEditorSource, /fitOpeningBoxesToPostProcessedWalls\(rawOpeningDisplayBoxes, cornerTrimmedWallBoxes\)/);
});

test("keeps merged Roboflow wall rendering aligned to fitted opening lines after edge snapping", () => {
  assert.match(
    floorPlanContainerSource,
    /const fittedOpeningBoxes = snapOpeningBoxEdgesToNearbyWallBreaks\(\s*fitOpeningBoxesToPostProcessedWalls\(rawOpeningDisplayBoxes, cornerTrimmedWallBoxes\),\s*rawWallDisplayBoxes\s*\);/
  );
  assert.match(floorPlanEditorSource, /const openingLineAlignedWallBoxes = alignWallBoxesToFittedOpeningLines\(cornerTrimmedWallBoxes, fittedOpeningBoxes\)/);
  assert.match(floorPlanEditorSource, /const cornerAlignedWallBoxes = alignConnectedPerpendicularWallBoxCorners\(openingLineAlignedWallBoxes\)/);
  assert.match(floorPlanEditorSource, /setDetectionBoxes\(\[\.\.\.cornerAlignedWallBoxes, \.\.\.fittedOpeningBoxes\]\)/);
});

test("propagates fitted Roboflow wall lines across connected perpendicular corner boxes", () => {
  assert.match(floorPlanEditorSource, /alignConnectedPerpendicularWallBoxCorners/);
  assert.match(floorPlanEditorSource, /const perpendicularCornerLineTolerance = 14/);
  assert.match(floorPlanEditorSource, /const perpendicularCornerTouchTolerance = 24/);
  assert.match(floorPlanEditorSource, /const cornerAlignedWallBoxes = alignConnectedPerpendicularWallBoxCorners\(openingLineAlignedWallBoxes\)/);
  assert.match(floorPlanEditorSource, /verticalBox\.y1 = horizontalBox\.y1/);
  assert.match(floorPlanEditorSource, /horizontalBox\.x2 = verticalBox\.x2/);
});

test("renders raw Roboflow walls as original boxes and merged post-processed walls", () => {
  const roboflowOverlayBlock = requireSourceMatch(
    floorPlanContainerSource,
    /const drawRoboflowDetectionOverlays = \(\) => \{[\s\S]*?context\.restore\(\);\s*\};/,
    "Roboflow detection overlay drawing function"
  );
  const mergedWallOverlayBlock = requireSourceMatch(
    roboflowOverlayBlock,
    /const drawMergedWallOverlayBoxes = \(\) => \{[\s\S]*?context\.globalAlpha = 1;\s*\};/,
    "merged Roboflow wall overlay drawing branch"
  );

  assert.match(roboflowOverlayBlock, /const detectionColors = \{ DOOR: "#e11d48", WALL: "#7c3aed", WINDOW: "#a3b800" \}/);
  assert.match(roboflowOverlayBlock, /const wallOverlayBoxes = detectionBoxes\.filter/);
  assert.match(roboflowOverlayBlock, /const openingOverlayBoxes = detectionBoxes\.filter/);
  assert.match(roboflowOverlayBlock, /drawRawWallOverlayBox/);
  assert.match(roboflowOverlayBlock, /const hasPostProcessedWall = wallOverlayBoxes\.some/);
  assert.match(roboflowOverlayBlock, /if \(hasPostProcessedWall\) drawMergedWallOverlayBoxes\(\)/);
  assert.match(roboflowOverlayBlock, /else wallOverlayBoxes\.forEach\(drawRawWallOverlayBox\)/);
  assert.match(mergedWallOverlayBlock, /context\.strokeStyle = detectionColors\.WALL/);
  assert.doesNotMatch(floorPlanEditorSource, /bridgeTouchingWallOverlayCorners/);
  assert.doesNotMatch(floorPlanEditorSource, /cornerBridgeTolerance/);
  assert.doesNotMatch(floorPlanEditorSource, /const edgeSnapTolerance = 14 \/ viewScale/);
  assert.match(mergedWallOverlayBlock, /coveredWallCells/);
  assert.match(mergedWallOverlayBlock, /context\.lineCap = "butt"/);
  assert.doesNotMatch(mergedWallOverlayBlock, /context\.lineCap = "square"/);
  assert.match(mergedWallOverlayBlock, /context\.stroke\(\)/);
  assert.doesNotMatch(floorPlanEditorSource, /wallOverlayBoxes\.forEach\(fillWallOverlayBox\)/);
  assert.doesNotMatch(floorPlanEditorSource, /wallOverlayBoxes\.forEach\(strokeVisibleWallEdges\)/);
  assert.match(mergedWallOverlayBlock, /const staticCutBoxes = openingOverlayBoxes[\s\S]*?const openingCutBoxes = \[\.\.\.staticCutBoxes, \.\.\.liveOpeningCutBoxes\]/);
  assert.match(mergedWallOverlayBlock, /const insideOpening = openingCutBoxes\.some/);
  assert.doesNotMatch(roboflowOverlayBlock, /drawOpeningOverlayBox/);
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
    "worldBeforeZoom",
    "handleWheel",
    "onWheel"
  ]) {
    assert.ok(`${floorPlanEditorSource}\n${globalsCssSource}`.includes(label));
  }
});
test("keeps landlord furniture authoring wiring and resident placement model", () => {
  // 편집기의 세입자 모드 UI 분기는 제거됐지만, 세입자 가구 배치는 매물 3D 투어(ListingTourRoom3D)에서
  // 살아 있고 그 모델 함수(placement/room-payload)는 floor-plan-3d 코퍼스에 그대로 남는다.
  for (const label of [
    "landlord",
    "resident",
    "임대인 옵션 가구",
    "handleFurnitureSelect",
    "placeFurnitureAtPoint",
    "createLandlordOptionFurniture",
    "isLockedFurnitureForResident",
    "finalizeFurnitureDraft"
  ]) {
    assert.match(floorPlanEditorSource, new RegExp(label));
  }

  assert.match(floorPlanEditorSource, /source:\s*"LANDLORD_OPTION"/);
  assert.match(floorPlanEditorSource, /locked:\s*true/);
  assert.match(floorPlanEditorSource, /editableBy:\s*\["LANDLORD"\]/);
  assert.match(floorPlanEditorSource, /visibleToTenant:\s*true/);
});

test("keeps landlord option furniture locked away from resident furniture designs", () => {
  for (const label of [
    "landlordOptionFurnitures",
    "residentDesignFurnitures",
    "lockedFurnitures"
  ]) {
    assert.match(floorPlanEditorSource, new RegExp(label));
  }
});

test("offers commercial candidate layers for openings and fixed fixtures", () => {
  for (const label of [
    "openingCandidates",
    "fixtureCandidates",
    "pendingCandidates",
    "floor-plan-candidate-bulk",
    "floor-plan-candidate-list",
    "floor-plan-candidate-actions",
    "candidateTypeLabel",
    "toggleCandidateStatus",
    "moveCandidate",
    "CONFIRMED",
    "REJECTED"
  ]) {
    assert.match(floorPlanEditorSource, new RegExp(label));
  }
  for (const label of ["후보 검토 대기", "처리됨", "80%↑ 모두 확정", "전체 확정", "전체 삭제"]) {
    assert.match(floorPlanContainerSource, new RegExp(label));
  }
  assert.match(floorPlanEditorSource, /onClick=\{\(\) => bulkSetCandidateStatus\(0, "CONFIRMED"\)\}/);
  assert.match(floorPlanEditorSource, /onClick=\{\(\) => bulkSetCandidateStatus\(0, "REJECTED"\)\}/);
  assert.match(floorPlanEditorSource, /onClick=\{\(\) => toggleCandidateStatus\(layer, candidate\.id, "CONFIRMED"\)\}/);
  assert.match(floorPlanEditorSource, /onClick=\{\(\) => toggleCandidateStatus\(layer, candidate\.id, "REJECTED"\)\}/);
});

test("keeps canvas candidate clicks from changing candidate status", () => {
  const candidateDragStateMatch = floorPlanContainerSource.match(/const \[candidateDragOperation[\s\S]*?\} \| null>\(null\);/);
  const openingCandidateBranchMatch = floorPlanContainerSource.match(/if \(tool === "opening"\) \{[\s\S]*?if \(tool === "fixture"\)/);
  const fixtureCandidateBranchMatch = floorPlanContainerSource.match(/if \(tool === "fixture"\) \{[\s\S]*?if \(tool === "eraser"\)/);
  const mouseUpCandidateBranchMatch = floorPlanContainerSource.match(/function handleMouseUp[\s\S]*?if \(wallDragOperation\)/);
  const setCandidateGeometryBlockMatch = floorPlanContainerSource.match(
    /function setCandidateGeometry\([\s\S]*?if \(layer === "opening"\) setOpeningCandidates\(updater\);\s*else setFixtureCandidates\(updater\);\s*\}/
  );

  assert.ok(candidateDragStateMatch, "candidate drag operation state should be declared");
  assert.ok(openingCandidateBranchMatch, "opening candidate mouse down branch should be present");
  assert.ok(fixtureCandidateBranchMatch, "fixture candidate mouse down branch should be present");
  assert.ok(mouseUpCandidateBranchMatch, "candidate mouse up branch should be present");
  assert.ok(setCandidateGeometryBlockMatch, "candidate geometry updater should be present");

  const candidateDragStateBlock = candidateDragStateMatch[0];
  const openingCandidateBranch = openingCandidateBranchMatch[0];
  const fixtureCandidateBranch = fixtureCandidateBranchMatch[0];
  const mouseUpCandidateBranch = mouseUpCandidateBranchMatch[0];
  const setCandidateGeometryBlock = setCandidateGeometryBlockMatch[0];
  const candidateStatusMutationPattern =
    /\btoggleCandidateStatus\b|\bbulkSetCandidateStatus\b|\bupdateCandidateStatus\b|\bsetOpeningCandidates\b|\bsetFixtureCandidates\b|\bstatus\s*:/;

  assert.match(openingCandidateBranch, /setSelectedCandidate\(\{ id: hit\.candidate\.id, layer: "opening" \}\)/);
  assert.match(
    fixtureCandidateBranch,
    /setSelectedCandidate\(closestCandidate \? \{ id: closestCandidate\.id, layer: "fixture" \} : null\)/
  );
  assert.doesNotMatch(candidateDragStateBlock, /\bshiftKey\b/);
  assert.doesNotMatch(floorPlanContainerSource, /shiftKey:\s*event\.shiftKey/);
  assert.match(openingCandidateBranch, /if \(event\.altKey\) \{\s*toggleOpeningCandidateType\(hit\.candidate\.id\);/);
  assert.doesNotMatch(openingCandidateBranch, candidateStatusMutationPattern);
  assert.doesNotMatch(fixtureCandidateBranch, candidateStatusMutationPattern);
  assert.match(mouseUpCandidateBranch, /if \(candidateDragOperation\)/);
  assert.match(mouseUpCandidateBranch, /if \(candidateDragOperation\.moved\)/);
  assert.doesNotMatch(mouseUpCandidateBranch, candidateStatusMutationPattern);
  assert.doesNotMatch(setCandidateGeometryBlock, /\bupdateCandidateStatus\b|\bstatus\s*:/);
  assert.match(floorPlanContainerSource, /toggleCandidateStatus\(layer, candidate\.id, "CONFIRMED"\)/);
  assert.match(floorPlanContainerSource, /toggleCandidateStatus\(layer, candidate\.id, "REJECTED"\)/);
  assert.match(floorPlanContainerSource, /bulkSetCandidateStatus\(0, "CONFIRMED"\)/);
  assert.match(floorPlanContainerSource, /bulkSetCandidateStatus\(0, "REJECTED"\)/);
});

test("removes legacy floor plan OpenAI analysis controls", () => {
  for (const label of [
    "FLOOR_PLAN_AI_MODELS",
    "OpenAI Vision",
    "selectedAiModel",
    "runAiDimensionAnalysis",
    "runAiCandidateReview",
    "requestFloorPlanAiAnalysis",
    "applyAiDimensionAnalysisResult",
    "applyAiCandidateReviewResult",
    "manualAiScaleRealLength",
    "AI 후보 검토",
    "AI 정밀 수치 읽기"
  ]) {
    assert.doesNotMatch(floorPlanEditorSource, new RegExp(label));
  }

  for (const label of [
    "runOpeningDetection",
    "applyRoboflowWallPostProcessing",
    "apiUrl\\(\"/floor-plans/opening-detection\"\\)",
    "fileToCompressedDataUrl"
  ]) {
    assert.match(floorPlanEditorSource, new RegExp(label));
  }
});
test("offers printed dimension reading with detected dimension chips", () => {
  for (const label of [
    "runPrintedDimensionReading",
    "apiUrl\\(\"/floor-plans/ai-analysis\"\\)",
    "analysisMode: \"dimension\"",
    "openai/floor-plan-vision",
    "parseDimensionTextsToMm",
    "printedDimensionChips",
    "drawPrintedDimensionOverlays",
    "normalizeAiTextBoundingBox",
    "normalizeAiTargetLine",
    "drawDimensionTargetLine",
    "boundingBox",
    "targetLine",
    "0~1000",
    "floor-plan-visible-dimension-strip",
    "치수 읽기",
    "읽힌 치수"
  ]) {
    assert.match(floorPlanContainerSource, new RegExp(label));
  }
});

test("classifies dimensions and uses only structural dimensions for scale and grid", () => {
  for (const label of [
    "aiDimensions",
    "isStructuralDimensionKind",
    "structuralDimensionChips",
    "openingDimensionChips",
    "furnitureDimensionChips",
    "guardrailKind",
    "outer_total",
    "room_span",
    "wall_span"
  ]) {
    assert.match(floorPlanContainerSource, new RegExp(label));
  }
  // 축척·격자 계산은 구조 치수만 소비해야 한다 (전체 치수 배열이 아니라).
  assert.match(floorPlanContainerSource, /estimateWallUnionScaleCandidate\(structuralDimensionChips/);
  assert.match(floorPlanContainerSource, /const marginChips = structuralDimensionChips\.filter/);
  // × 가구 표기와 ㎡ 면적은 하드 가드레일로 걸러진다.
  assert.match(floorPlanContainerSource, /return "area"/);
  assert.match(floorPlanContainerSource, /return kind === "fixture" \? "fixture" : "furniture"/);
  // 중첩 치수줄은 줄 클러스터링 후 각 줄 안에서만 체인을 푼다.
  assert.match(floorPlanContainerSource, /solveDimensionRowChains/);
  assert.match(floorPlanContainerSource, /perpTolerance/);
});

test("consumes structural dimensions to correct Roboflow wall positions", () => {
  // 구조 치수가 벽 위치 보정에 실제로 소비되는지(단순 표시 아님) 확인한다.
  for (const label of [
    "structuralWallBoundaries",
    "structuralBoundaryOffsetsMm",
    "snapWallsToStructuralBoundaries",
    "inferMissingWallsFromStructuralBoundaries",
    "applyStructuralDimensionWallCorrection",
    "applyStructuralDimensionMissingWallInference"
  ]) {
    assert.match(floorPlanContainerSource, new RegExp(label));
  }
  // 경계는 구조 치수만으로 만든다(가구/opening/면적 제외).
  assert.match(floorPlanContainerSource, /structuralDimensionChips\.filter\(\(chip\) => chip\.axis === axis/);
  // 보정 결과가 실제 벽 상태에 반영된다.
  assert.match(floorPlanContainerSource, /setWalls\(corrected\)/);
});

test("dimension-layout separates nested dimension rows and lays out each chain independently", () => {
  const { clusterDimensionRows, solveDimensionRowChains } = dimensionLayout;
  // 위쪽 여백에 전체줄 [10720]과 구간줄 [3040,1440,3120,3120]이 중첩된 케이스.
  const chips = [
    { id: "total", realLengthMm: 10720, perpCoord: 40, alongCoord: 500 },
    { id: "s1", realLengthMm: 3040, perpCoord: 75, alongCoord: 140 },
    { id: "s2", realLengthMm: 1440, perpCoord: 76, alongCoord: 340 },
    { id: "s3", realLengthMm: 3120, perpCoord: 74, alongCoord: 560 },
    { id: "s4", realLengthMm: 3120, perpCoord: 75, alongCoord: 820 }
  ];
  const rows = clusterDimensionRows(chips, 15);
  assert.equal(rows.length, 2, "전체줄과 구간줄이 2개 줄로 분리되어야 한다");

  const layout = solveDimensionRowChains(chips, 10720);
  assert.deepEqual(layout.get("total"), { endMm: 10720, startMm: 0 });
  assert.equal(layout.get("s1").startMm, 0);
  assert.ok(Math.abs(layout.get("s1").endMm - 3040) < 5);
  assert.ok(Math.abs(layout.get("s2").startMm - layout.get("s1").endMm) < 1, "구간이 끊김 없이 이어져야 한다");
  assert.ok(Math.abs(layout.get("s4").endMm - 10720) < 1, "마지막 구간이 전체 폭에 정확히 맞물려야 한다");

  // 합이 전체와 안 맞는 불완전한 줄은 배치하지 않는다(개별 앵커 폴백 대상).
  const incomplete = [
    { id: "x1", realLengthMm: 3040, perpCoord: 70, alongCoord: 140 },
    { id: "x2", realLengthMm: 1440, perpCoord: 70, alongCoord: 340 }
  ];
  assert.equal(solveDimensionRowChains(incomplete, 10720).size, 0);
});

test("structural dimensions correct Roboflow wall positions to match printed dimensions", () => {
  const { structuralBoundaryOffsetsMm, snapWallsToStructuralBoundaries } = dimensionLayout;
  // high.png 가로 체인 [10720]+[3040,1440,3120,3120] → 경계 mm 0/3040/4480/7600/10720
  const chips = [
    { id: "total", realLengthMm: 10720, perpCoord: 29, alongCoord: 500 },
    { id: "s1", realLengthMm: 3040, perpCoord: 63, alongCoord: 140 },
    { id: "s2", realLengthMm: 1440, perpCoord: 63, alongCoord: 340 },
    { id: "s3", realLengthMm: 3120, perpCoord: 63, alongCoord: 560 },
    { id: "s4", realLengthMm: 3120, perpCoord: 63, alongCoord: 820 }
  ];
  const boundariesMm = structuralBoundaryOffsetsMm(chips, 10720);
  assert.deepEqual(boundariesMm, [0, 3040, 4480, 7600, 10720]);

  // mm 경계 → 캔버스 x (planMin=-500, ratio=13.6mm/px)
  const planMin = -500;
  const ratio = 13.6;
  const verticalLineX = boundariesMm.map((mm) => planMin + mm / ratio);
  // Roboflow 벽이 경계에서 어긋나 있는 상태
  const walls = verticalLineX.map((x, i) => ({
    id: `w${i}`,
    start: { x: x + (i % 2 === 0 ? 12 : -14), y: -300 },
    end: { x: x + (i % 2 === 0 ? 12 : -14), y: 300 }
  }));
  // 경계에서 먼 벽은 스냅되면 안 된다
  walls.push({ id: "far", start: { x: verticalLineX[2] + 90, y: -300 }, end: { x: verticalLineX[2] + 90, y: 300 } });

  const { walls: corrected, movedCount } = snapWallsToStructuralBoundaries(walls, { verticalLineX }, 30);
  assert.equal(movedCount, 5, "경계 근처 벽 5개가 보정되어야 한다");
  // 완료 기준: 보정 후 벽 간 거리 * ratio = 도면 구간 치수
  const centers = corrected.slice(0, 5).map((w) => (w.start.x + w.end.x) / 2);
  const segMm = [];
  for (let i = 1; i < 5; i++) segMm.push(Math.round((centers[i] - centers[i - 1]) * ratio));
  assert.deepEqual(segMm, [3040, 1440, 3120, 3120], "보정 후 벽 간 거리가 도면 치수와 일치해야 한다");
  // far 벽은 그대로
  assert.ok(Math.abs((corrected[5].start.x + corrected[5].end.x) / 2 - (verticalLineX[2] + 90)) < 0.01);
});

test("does not collapse complex floor-plan dimensions by value or an 8-item display cap", () => {
  assert.match(floorPlanContainerSource, /MAX_VISIBLE_PRINTED_DIMENSIONS = 24/);
  assert.match(floorPlanContainerSource, /printedDimensionKey/);
  assert.doesNotMatch(floorPlanContainerSource, /const seen = new Set<number>\(\)/);
  assert.doesNotMatch(floorPlanContainerSource, /seen\.has\(realLengthMm\)/);
  assert.doesNotMatch(floorPlanContainerSource, /slice\(0, 8\)/);
  assert.doesNotMatch(floorPlanContainerSource, /new Map<number, DetectedDimensionLineSpan>/);
});




test("uses native label-based floor plan file selection", () => {
  for (const label of [
    "id=\"floor-plan-source-input\"",
    "htmlFor=\"floor-plan-source-input\"",
    "floor-plan-upload-label",
    "type=\"file\"",
    "accept=\"image/\\*\""
  ]) {
    assert.match(floorPlanContainerSource, new RegExp(label));
  }
  assert.doesNotMatch(floorPlanContainerSource, /fileInputRef\.current\?\.click\(\)/);
});

test("keeps unplaced printed dimensions out of the canvas overlay", () => {
  assert.match(floorPlanContainerSource, /hasReliableDimensionPlacement/);
  assert.match(floorPlanContainerSource, /locationStatus/);
  assert.match(floorPlanContainerSource, /위치 미확인/);
  assert.doesNotMatch(floorPlanContainerSource, /fallbackX/);
  assert.doesNotMatch(floorPlanContainerSource, /fallbackY/);
});



test("stores extraction metadata, openings, and fixtures through the floor plan API", () => {
  for (const label of [
    "extractionMeta",
    "scaleConfirmed",
    "scaleCandidates",
    "openings",
    "fixtures",
    "PUBLISHED",
    "등록"
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

test("imports wheretoput-style upload and Roboflow 3D conversion controls", () => {
  for (const label of [
    "도면 등록",
    "도면 인식",
    "인식 보정",
    "화면 배율",
    "handleImageUpload",
    "runOpeningDetection",
    "applyRoboflowWallPostProcessing",
    "convertWallsToWheretoputSimulator",
    "convertWallsToWheretoputRoom3D"
  ]) {
    assert.match(floorPlanContainerSource, new RegExp(label));
  }

  assert.doesNotMatch(floorPlanContainerSource, /벽 자동 추출/);
  assert.doesNotMatch(floorPlanContainerSource, /WallDetector/);
});

test("keeps uploaded floor plan registration separate from local pixel wall extraction", () => {
  assert.match(floorPlanContainerSource, /uploadFloorPlanSource/);
  assert.match(floorPlanContainerSource, /fileToCompressedDataUrl/);
  assert.match(floorPlanContainerSource, /setWalls\(\[\]\)/);
  assert.match(floorPlanContainerSource, /setRoboflowDetections\(null\)/);
  assert.match(floorPlanContainerSource, /setDetectionBoxes\(\[\]\)/);
  assert.match(floorPlanContainerSource, /도면 등록 완료/);
  assert.doesNotMatch(floorPlanContainerSource, /detectWallLinesFromImageData/);
  assert.doesNotMatch(floorPlanContainerSource, /createWallsFromDetectedLines/);
  assert.doesNotMatch(floorPlanContainerSource, /WallDetector/);
});

test("keeps upload flow free of wall-first local extraction fallback", () => {
  assert.doesNotMatch(floorPlanContainerSource, /mode:\s*"wall-first"/);
  assert.doesNotMatch(floorPlanContainerSource, /setWalls\(detectedWalls\.length > 0 \? detectedWalls : getStarterWalls\(\)\)/);
  assert.match(floorPlanContainerSource, /runOpeningDetection/);
  assert.match(floorPlanContainerSource, /applyRoboflowWallPostProcessing/);
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
    "초안 저장됨",
    "이 브라우저에만 임시 저장됨"
  ]) {
    assert.match(floorPlanEditorSource, new RegExp(label));
  }
});

test("floor plan editor container wires room-model payload helpers", () => {
  for (const label of [
    "buildFloorPlanDraftPayload",
    "buildFloorPlanLocalSnapshot"
  ]) {
    assert.match(floorPlanContainerSource, new RegExp(label));
  }

  assert.doesNotMatch(floorPlanContainerSource, /const room3d = \{/);
  assert.doesNotMatch(floorPlanContainerSource, /const nextExtractionMeta = \{/);
  assert.match(floorPlanContainerSource, /JSON\.stringify\(\{ \.\.\.payload, id: saved\.id, savedAt: Date\.now\(\) \}\)/);
});

test("floor plan editor model snaps, selects, removes, and summarizes walls", async () => {
  const model = floorPlanModel;
  const wall = model.createWall({ x: 0, y: 0 }, { x: 130, y: 40 }, "w1");
  const units = await import("./src/app/floor-plan-3d/room-model/units.ts");

  assert.deepEqual(wall, {
    id: "w1",
    start: { x: 0, y: 0 },
    end: { x: 125, y: 0 }
  });

  assert.equal(model.GRID_SIZE, 25);
  assert.equal(units.GRID_SIZE_PX, 25);
  assert.equal(units.DEFAULT_PIXEL_TO_MM_RATIO, 10);
  assert.equal(units.DEFAULT_PIXEL_TO_METER_RATIO, 0.01);
  assert.equal(model.findNearestWall([wall], { x: 48, y: 5 }, 18)?.id, "w1");
  assert.deepEqual(model.removeWall([wall], "w1"), []);
  assert.deepEqual(model.summarizeWalls([wall]), {
    wallCount: 1,
    approximateMeters: 1.3,
    status: "편집중"
  });
  assert.equal(model.summarizeWalls([{ id: "120px", start: { x: 0, y: 0 }, end: { x: 120, y: 0 } }]).approximateMeters, 1.2);
});

test("floor plan editor model moves and resizes selected walls without mutating originals", async () => {
  const model = floorPlanModel;
  const wall = { id: "edit-wall", start: { x: 100, y: 100 }, end: { x: 300, y: 100 } };

  const moved = model.moveWall(wall, { x: 25, y: 50 });
  const resizedEnd = model.resizeWall(wall, "end", { x: 360, y: 140 });
  const resizedStart = model.resizeWall(wall, "start", { x: 80, y: 60 });

  assert.deepEqual(moved, { id: "edit-wall", start: { x: 125, y: 150 }, end: { x: 325, y: 150 } });
  assert.deepEqual(resizedEnd, { id: "edit-wall", start: { x: 100, y: 100 }, end: { x: 360, y: 100 } });
  assert.deepEqual(resizedStart, { id: "edit-wall", start: { x: 80, y: 100 }, end: { x: 300, y: 100 } });
  assert.deepEqual(wall, { id: "edit-wall", start: { x: 100, y: 100 }, end: { x: 300, y: 100 } });
});

test("floor plan editor model optimizes wall conversion with stable ids", async () => {
  const model = floorPlanModel;
  const walls = [
    { id: "a", start: { x: 0, y: 0 }, end: { x: 50, y: 0 } },
    { id: "b", start: { x: 50, y: 0 }, end: { x: 100, y: 0 } },
    { id: "side", start: { x: 100, y: 0 }, end: { x: 100, y: 100 } }
  ];

  const converted = model.convertOptimizedWallsToWheretoputRoom3D(walls, {
    mergeCollinear: true,
    pixelToMmRatio: 20,
    stableIds: true
  });

  assert.equal(converted.length, 2);
  assert.equal(converted[0].id, "wall-merged-a-b");
  assert.equal(converted[0].wall_id, "merged:a+b");
  assert.deepEqual(converted[0].dimensions, { width: 2, height: 2.5, depth: 0.15 });
  assert.equal(converted[1].id, "wall-side");
  assert.deepEqual(walls[0], { id: "a", start: { x: 0, y: 0 }, end: { x: 50, y: 0 } });
});

test("floor plan editor model builds closed-loop floor polygon data", async () => {
  const model = floorPlanModel;
  const square = [
    { id: "top", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
    { id: "right", start: { x: 100, y: 0 }, end: { x: 100, y: 100 } },
    { id: "bottom", start: { x: 100, y: 100 }, end: { x: 0, y: 100 } },
    { id: "left", start: { x: 0, y: 100 }, end: { x: 0, y: 0 } }
  ];

  const polygons = model.buildClosedLoopFloorPolygons(square, { pixelToMmRatio: 20 });

  assert.equal(polygons.length, 1);
  assert.deepEqual(polygons[0].wallIds.sort(), ["bottom", "left", "right", "top"]);
  assert.deepEqual(polygons[0].points, [
    { x: 0, z: 0 },
    { x: 2, z: 0 },
    { x: 2, z: 2 },
    { x: 0, z: 2 }
  ]);
  assert.equal(polygons[0].perimeterMeters, 8);
});

test("floor plan editor model no longer exposes legacy 2.5D wall box conversion", async () => {
  const model = floorPlanModel;

  assert.equal("convertWallsTo3D" in model, false);
  assert.equal(typeof model.convertWallsToWheretoputRoom3D, "function");
});

test("floor plan editor model creates wheretoput simulator wall data", async () => {
  const model = floorPlanModel;
  const wall = model.createWall({ x: 0, y: 0 }, { x: 120, y: 0 }, "front");
  const converted = model.convertWallsToWheretoputSimulator([wall], {
    height: 2.5,
    depth: 0.15,
    pixelToMeterRatio: 0.02
  });

  assert.equal(converted.length, 1);
  assert.equal(converted[0].id, "front");
  assert.equal(converted[0].wall_id, "front");
  assert.deepEqual(converted[0].position, [1.25, 1.25, 0]);
  assert.deepEqual(converted[0].rotation, [0, 0, 0]);
  assert.deepEqual(converted[0].dimensions, { width: 2.5, height: 2.5, depth: 0.15 });
});

test("floor plan editor model creates centered wheretoput room 3D wall data", async () => {
  const model = floorPlanModel;
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
  const model = floorPlanModel;
  const walls = model.createWallsFromRegisteredPlan({ width: 1600, height: 1000, name: "unit.png" });

  assert.equal(walls.length >= 5, true);
  assert.equal(walls[0].id.startsWith("upload-unit-"), true);
  assert.equal(walls.every((wall) => wall.start && wall.end), true);
});

test("floor plan editor model detects wall lines from a binary image mask", async () => {
  const model = floorPlanModel;
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
  const model = floorPlanModel;
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
  const model = floorPlanModel;
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
  const model = floorPlanModel;
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

test("floor plan editor model does not merge wall gaps marked by perpendicular jambs", async () => {
  const model = floorPlanModel;
  const merged = model.mergeDetectedWallLines(
    [
      { x1: 180, y1: 300, x2: 270, y2: 300, orientation: "horizontal", thickness: 7 },
      { x1: 315, y1: 300, x2: 420, y2: 300, orientation: "horizontal", thickness: 7 },
      { x1: 270, y1: 286, x2: 270, y2: 318, orientation: "vertical", thickness: 6 },
      { x1: 315, y1: 286, x2: 315, y2: 318, orientation: "vertical", thickness: 6 }
    ],
    { axisTolerance: 4, gapTolerance: 50, maxLines: 10, respectPerpendicularGapMarkers: true }
  );

  assert.equal(merged.some((line) => line.orientation === "horizontal" && line.x1 === 180 && line.x2 === 420), false);
  assert.equal(merged.some((line) => line.orientation === "horizontal" && line.x1 === 180 && line.x2 === 270), true);
  assert.equal(merged.some((line) => line.orientation === "horizontal" && line.x1 === 315 && line.x2 === 420), true);
});

test("floor plan editor model does not merge distant same-axis walls when axis sorting differs", async () => {
  const model = floorPlanModel;
  const merged = model.mergeDetectedWallLines(
    [
      { x1: 602, y1: 144, x2: 743, y2: 144, orientation: "horizontal", thickness: 6 },
      { x1: 151, y1: 148, x2: 475, y2: 148, orientation: "horizontal", thickness: 12 }
    ],
    { axisTolerance: 4, gapTolerance: 35, maxLines: 10 }
  );

  assert.equal(merged.length, 2);
  assert.equal(merged.some((line) => line.x1 === 151 && line.x2 === 475), true);
  assert.equal(merged.some((line) => line.x1 === 602 && line.x2 === 743), true);
});

test("floor plan editor model preserves wall thickness and removes thin interior symbols", async () => {
  const model = floorPlanModel;
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
  const model = floorPlanModel;
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
  const model = floorPlanModel;
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
  const model = floorPlanModel;
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
  const model = floorPlanModel;
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
  const model = floorPlanModel;
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
  const model = floorPlanModel;
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
  const model = floorPlanModel;
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

test("floor plan editor model conservative mode keeps only confident thick wall lines", async () => {
  const model = floorPlanModel;
  const result = model.filterCommercialWallCandidates(
    [
      { x1: 120, y1: 140, x2: 620, y2: 140, orientation: "horizontal", thickness: 9 },
      { x1: 620, y1: 140, x2: 620, y2: 520, orientation: "vertical", thickness: 9 },
      { x1: 620, y1: 520, x2: 120, y2: 520, orientation: "horizontal", thickness: 9 },
      { x1: 120, y1: 520, x2: 120, y2: 140, orientation: "vertical", thickness: 9 },
      { x1: 300, y1: 140, x2: 300, y2: 520, orientation: "vertical", thickness: 8 },
      { x1: 180, y1: 260, x2: 410, y2: 260, orientation: "horizontal", thickness: 3 },
      { x1: 100, y1: 88, x2: 640, y2: 88, orientation: "horizontal", thickness: 1 },
      { x1: 210, y1: 330, x2: 260, y2: 330, orientation: "horizontal", thickness: 2 }
    ],
    { height: 680, mode: "conservative", width: 760 }
  );

  assert.equal(result.walls.length, 5);
  assert.equal(result.walls.some((line) => line.x1 === 300 && line.x2 === 300), true);
  assert.equal(result.walls.some((line) => line.thickness <= 3), false);
  assert.equal(result.dimensionCandidates.length, 1);
  assert.equal(result.removedNoiseCount, 3);
});

test("floor plan editor model conservative mode drops all ambiguous thin wall candidates", async () => {
  const model = floorPlanModel;
  const result = model.filterCommercialWallCandidates(
    [
      { x1: 160, y1: 160, x2: 520, y2: 160, orientation: "horizontal", thickness: 2 },
      { x1: 520, y1: 160, x2: 520, y2: 420, orientation: "vertical", thickness: 2 },
      { x1: 520, y1: 420, x2: 160, y2: 420, orientation: "horizontal", thickness: 2 },
      { x1: 160, y1: 420, x2: 160, y2: 160, orientation: "vertical", thickness: 2 }
    ],
    { height: 560, mode: "conservative", width: 680 }
  );

  assert.equal(result.walls.length, 0);
  assert.equal(result.annotationCandidates.length, 4);
  assert.equal(result.needsReview, true);
});

test("floor plan editor model wall-first mode reconnects dark wall runs", async () => {
  const model = floorPlanModel;
  const result = model.filterCommercialWallCandidates(
    [
      { x1: 120, y1: 140, x2: 330, y2: 140, orientation: "horizontal", thickness: 8 },
      { x1: 362, y1: 140, x2: 620, y2: 140, orientation: "horizontal", thickness: 8 },
      { x1: 620, y1: 140, x2: 620, y2: 520, orientation: "vertical", thickness: 8 },
      { x1: 620, y1: 520, x2: 120, y2: 520, orientation: "horizontal", thickness: 8 },
      { x1: 120, y1: 520, x2: 120, y2: 140, orientation: "vertical", thickness: 8 },
      { x1: 320, y1: 180, x2: 320, y2: 490, orientation: "vertical", thickness: 7 },
      { x1: 120, y1: 92, x2: 620, y2: 92, orientation: "horizontal", thickness: 1, markers: ["arrow-start", "arrow-end"] },
      { x1: 260, y1: 270, x2: 300, y2: 270, orientation: "horizontal", thickness: 2 }
    ],
    { height: 680, mode: "wall-first", width: 760 }
  );

  assert.equal(result.walls.length, 5);
  assert.equal(result.walls.some((line) => line.orientation === "horizontal" && line.y1 === 140 && line.x1 === 120 && line.x2 === 620), true);
  assert.equal(result.walls.some((line) => line.orientation === "vertical" && line.x1 === 320), true);
  assert.equal(result.dimensionCandidates.length, 1);
  assert.equal(result.removedNoiseCount, 2);
});

test("floor plan editor model wall-first mode keeps door gaps open when gap has perpendicular jambs", async () => {
  const model = floorPlanModel;
  const result = model.filterCommercialWallCandidates(
    [
      { x1: 120, y1: 140, x2: 620, y2: 140, orientation: "horizontal", thickness: 8 },
      { x1: 620, y1: 140, x2: 620, y2: 520, orientation: "vertical", thickness: 8 },
      { x1: 620, y1: 520, x2: 120, y2: 520, orientation: "horizontal", thickness: 8 },
      { x1: 120, y1: 520, x2: 120, y2: 140, orientation: "vertical", thickness: 8 },
      { x1: 180, y1: 300, x2: 270, y2: 300, orientation: "horizontal", thickness: 7 },
      { x1: 315, y1: 300, x2: 420, y2: 300, orientation: "horizontal", thickness: 7 },
      { x1: 270, y1: 288, x2: 270, y2: 318, orientation: "vertical", thickness: 6 },
      { x1: 315, y1: 288, x2: 315, y2: 318, orientation: "vertical", thickness: 6 }
    ],
    { height: 680, mode: "wall-first", width: 760 }
  );

  assert.equal(result.walls.some((line) => line.orientation === "horizontal" && line.y1 === 300 && line.x1 <= 180 && line.x2 >= 420), false);
  assert.equal(result.walls.some((line) => line.orientation === "horizontal" && line.y1 === 300 && line.x1 === 180 && line.x2 === 270), true);
  assert.equal(result.walls.some((line) => line.orientation === "horizontal" && line.y1 === 300 && line.x1 === 315 && line.x2 === 420), true);
});

test("floor plan editor model wall-first mode does not bridge larger probable opening gaps by default", async () => {
  const model = floorPlanModel;
  const result = model.filterCommercialWallCandidates(
    [
      { x1: 120, y1: 140, x2: 620, y2: 140, orientation: "horizontal", thickness: 8 },
      { x1: 620, y1: 140, x2: 620, y2: 520, orientation: "vertical", thickness: 8 },
      { x1: 620, y1: 520, x2: 120, y2: 520, orientation: "horizontal", thickness: 8 },
      { x1: 120, y1: 520, x2: 120, y2: 140, orientation: "vertical", thickness: 8 },
      { x1: 260, y1: 180, x2: 260, y2: 320, orientation: "vertical", thickness: 8 },
      { x1: 260, y1: 358, x2: 260, y2: 490, orientation: "vertical", thickness: 8 }
    ],
    { height: 680, mode: "wall-first", width: 760 }
  );

  assert.equal(result.walls.some((line) => line.orientation === "vertical" && line.x1 === 260 && line.y1 <= 180 && line.y2 >= 490), false);
});

test("floor plan editor model wall-first mode preserves short thick wall stubs connected to structure", async () => {
  const model = floorPlanModel;
  const result = model.filterCommercialWallCandidates(
    [
      { x1: 120, y1: 140, x2: 620, y2: 140, orientation: "horizontal", thickness: 8 },
      { x1: 620, y1: 140, x2: 620, y2: 520, orientation: "vertical", thickness: 8 },
      { x1: 620, y1: 520, x2: 120, y2: 520, orientation: "horizontal", thickness: 8 },
      { x1: 120, y1: 520, x2: 120, y2: 140, orientation: "vertical", thickness: 8 },
      { x1: 260, y1: 140, x2: 260, y2: 198, orientation: "vertical", thickness: 7 }
    ],
    { height: 680, mode: "wall-first", width: 760 }
  );

  assert.equal(result.walls.some((line) => line.orientation === "vertical" && line.x1 === 260 && line.y1 === 140 && line.y2 === 198), true);
});

test("floor plan editor model wall-first mode preserves small thick rectangular wall loops", async () => {
  const model = floorPlanModel;
  const result = model.filterCommercialWallCandidates(
    [
      { x1: 120, y1: 140, x2: 620, y2: 140, orientation: "horizontal", thickness: 8 },
      { x1: 620, y1: 140, x2: 620, y2: 520, orientation: "vertical", thickness: 8 },
      { x1: 620, y1: 520, x2: 120, y2: 520, orientation: "horizontal", thickness: 8 },
      { x1: 120, y1: 520, x2: 120, y2: 140, orientation: "vertical", thickness: 8 },
      { x1: 360, y1: 320, x2: 425, y2: 320, orientation: "horizontal", thickness: 7 },
      { x1: 360, y1: 380, x2: 425, y2: 380, orientation: "horizontal", thickness: 7 },
      { x1: 360, y1: 320, x2: 360, y2: 380, orientation: "vertical", thickness: 7 },
      { x1: 425, y1: 320, x2: 425, y2: 380, orientation: "vertical", thickness: 7 }
    ],
    { height: 680, mode: "wall-first", width: 760 }
  );

  assert.equal(result.walls.some((line) => line.orientation === "horizontal" && line.x1 === 360 && line.x2 === 425 && line.y1 === 320), true);
  assert.equal(result.walls.some((line) => line.orientation === "horizontal" && line.x1 === 360 && line.x2 === 425 && line.y1 === 380), true);
  assert.equal(result.walls.some((line) => line.orientation === "vertical" && line.x1 === 360 && line.y1 === 320 && line.y2 === 380), true);
  assert.equal(result.walls.some((line) => line.orientation === "vertical" && line.x1 === 425 && line.y1 === 320 && line.y2 === 380), true);
});

test("floor plan editor model wall-first mode infers missing outer edges and extends near walls", async () => {
  const model = floorPlanModel;
  const result = model.filterCommercialWallCandidates(
    [
      { x1: 120, y1: 140, x2: 620, y2: 140, orientation: "horizontal", thickness: 8 },
      { x1: 620, y1: 140, x2: 620, y2: 520, orientation: "vertical", thickness: 8 },
      { x1: 120, y1: 520, x2: 620, y2: 520, orientation: "horizontal", thickness: 8 },
      { x1: 320, y1: 168, x2: 320, y2: 493, orientation: "vertical", thickness: 7 }
    ],
    { height: 680, mode: "wall-first", width: 760 }
  );

  assert.equal(result.walls.some((line) => line.orientation === "vertical" && line.x1 === 120 && line.y1 === 140 && line.y2 === 520), true);
  assert.equal(result.walls.some((line) => line.orientation === "vertical" && line.x1 === 320 && line.y1 === 140 && line.y2 === 520), true);
  assert.equal(result.walls.length, 5);
  assert.equal(result.needsReview, true);
});

test("floor plan editor model wall-first mode skips inferred outer edges on complex multi-room plans", async () => {
  const model = floorPlanModel;
  const result = model.filterCommercialWallCandidates(
    [
      { x1: 100, y1: 100, x2: 620, y2: 100, orientation: "horizontal", thickness: 8 },
      { x1: 620, y1: 100, x2: 620, y2: 520, orientation: "vertical", thickness: 8 },
      { x1: 100, y1: 520, x2: 100, y2: 100, orientation: "vertical", thickness: 8 },
      { x1: 220, y1: 100, x2: 220, y2: 260, orientation: "vertical", thickness: 7 },
      { x1: 360, y1: 100, x2: 360, y2: 280, orientation: "vertical", thickness: 7 },
      { x1: 480, y1: 280, x2: 480, y2: 520, orientation: "vertical", thickness: 7 },
      { x1: 100, y1: 220, x2: 260, y2: 220, orientation: "horizontal", thickness: 7 },
      { x1: 300, y1: 220, x2: 460, y2: 220, orientation: "horizontal", thickness: 7 },
      { x1: 100, y1: 340, x2: 260, y2: 340, orientation: "horizontal", thickness: 7 },
      { x1: 340, y1: 340, x2: 520, y2: 340, orientation: "horizontal", thickness: 7 },
      { x1: 180, y1: 420, x2: 300, y2: 420, orientation: "horizontal", thickness: 7 },
      { x1: 360, y1: 420, x2: 540, y2: 420, orientation: "horizontal", thickness: 7 },
      { x1: 540, y1: 360, x2: 540, y2: 520, orientation: "vertical", thickness: 7 }
    ],
    { height: 680, mode: "wall-first", width: 760 }
  );

  assert.equal(result.walls.some((line) => line.markers?.includes("wall-first-inferred-outer")), false);
});

test("floor plan editor model strict line mask ignores filled surfaces and small dark noise", async () => {
  const model = floorPlanModel;
  const width = 240;
  const height = 180;
  const data = new Uint8ClampedArray(width * height * 4);
  const paint = (x, y, color) => {
    const offset = (y * width + x) * 4;
    data[offset] = color;
    data[offset + 1] = color;
    data[offset + 2] = color;
    data[offset + 3] = 255;
  };
  const fillRect = (left, top, right, bottom, color) => {
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) paint(x, y, color);
    }
  };

  fillRect(0, 0, width - 1, height - 1, 255);
  fillRect(30, 30, 200, 35, 0);
  fillRect(30, 140, 200, 145, 0);
  fillRect(30, 30, 35, 145, 0);
  fillRect(195, 30, 200, 145, 0);
  fillRect(70, 65, 165, 110, 135);
  fillRect(12, 12, 18, 18, 0);

  const lines = model.detectWallLinesFromImageData(
    { data, height, width },
    { height, minRunLength: 60, strictLineMask: true, width }
  );

  assert.equal(lines.length, 4);
  assert.equal(lines.every((line) => line.thickness <= 8), true);
  assert.equal(lines.some((line) => line.orientation === "horizontal" && line.y1 >= 65 && line.y1 <= 110), false);
  assert.equal(lines.some((line) => line.orientation === "vertical" && line.x1 >= 70 && line.x1 <= 165), false);
});

test("floor plan editor model separates dark furniture fill from black walls with adaptive luminance", async () => {
  const model = floorPlanModel;
  const width = 300;
  const height = 240;
  const data = new Uint8ClampedArray(width * height * 4);
  const fillRect = (left, top, right, bottom, color) => {
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const offset = (y * width + x) * 4;
        data[offset] = color;
        data[offset + 1] = color;
        data[offset + 2] = color;
        data[offset + 3] = 255;
      }
    }
  };

  fillRect(0, 0, width - 1, height - 1, 255);
  fillRect(30, 30, 270, 37, 20);
  fillRect(30, 202, 270, 209, 20);
  fillRect(30, 30, 37, 209, 20);
  fillRect(263, 30, 270, 209, 20);
  // 상단 벽 안쪽에 붙은 진회색 싱크대 채움 — 벽으로 검출되면 안 된다.
  fillRect(100, 38, 200, 80, 90);

  const lines = model.detectWallLinesFromImageData(
    { data, height, width },
    { height, minRunLength: 40, strictLineMask: true, width }
  );

  assert.equal(
    lines.some((line) => line.orientation === "horizontal" && Math.abs(line.y1 - 33) <= 3 && line.x1 <= 34 && line.x2 >= 266),
    true
  );
  assert.equal(lines.some((line) => line.orientation === "horizontal" && line.y1 >= 40 && line.y1 <= 85), false);
  assert.equal(lines.some((line) => line.orientation === "vertical" && line.x1 >= 95 && line.x1 <= 205 && line.y2 <= 90), false);
});

test("floor plan editor model keeps wall bands separate from adjacent solid fill blocks", async () => {
  const model = floorPlanModel;
  const width = 220;
  const height = 120;
  const mask = Array.from({ length: width * height }, () => false);
  const fillRect = (x1, y1, x2, y2) => {
    for (let y = y1; y <= y2; y += 1) {
      for (let x = x1; x <= x2; x += 1) mask[y * width + x] = true;
    }
  };

  fillRect(10, 20, 209, 27);
  // 벽 바로 아래 같은 색으로 붙은 채움 블록 — 벽 밴드를 흡수하면 안 된다.
  fillRect(60, 28, 119, 70);

  const lines = model.detectWallBandLinesFromMask(mask, { height, minRunLength: 40, width });
  const wallBand = lines.find((line) => line.orientation === "horizontal" && line.y1 <= 28);

  assert.equal(Boolean(wallBand), true);
  assert.equal(wallBand.thickness <= 10, true);
  assert.equal(wallBand.x1 <= 12 && wallBand.x2 >= 207, true);
});

test("floor plan editor model recovers short thick wall stubs below the primary run length", async () => {
  const model = floorPlanModel;
  const width = 300;
  const height = 240;
  const data = new Uint8ClampedArray(width * height * 4);
  const fillRect = (left, top, right, bottom, color) => {
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const offset = (y * width + x) * 4;
        data[offset] = color;
        data[offset + 1] = color;
        data[offset + 2] = color;
        data[offset + 3] = 255;
      }
    }
  };

  fillRect(0, 0, width - 1, height - 1, 255);
  fillRect(30, 30, 270, 37, 20);
  fillRect(30, 202, 270, 209, 20);
  fillRect(30, 30, 37, 209, 20);
  fillRect(263, 30, 270, 209, 20);
  fillRect(146, 38, 153, 74, 20);

  const lines = model.detectWallLinesFromImageData(
    { data, height, width },
    { height, minRunLength: 60, strictLineMask: true, width }
  );
  const recoveredStub = lines.find(
    (line) => line.orientation === "vertical" && Math.abs(line.x1 - 149) <= 3 && line.y2 <= 80
  );

  assert.equal(Boolean(recoveredStub), true);
  assert.equal(recoveredStub.markers?.includes("short-wall-recovered"), true);

  const filtered = model.filterCommercialWallCandidates(lines, { height, mode: "wall-first", width });
  assert.equal(
    filtered.walls.some((line) => line.orientation === "vertical" && Math.abs(line.x1 - 149) <= 3 && line.y2 <= 80),
    true
  );
});

test("floor plan editor model keeps small solid rectangular wall blocks as single walls", async () => {
  const model = floorPlanModel;
  const width = 300;
  const height = 240;
  const data = new Uint8ClampedArray(width * height * 4);
  const fillRect = (left, top, right, bottom, color) => {
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const offset = (y * width + x) * 4;
        data[offset] = color;
        data[offset + 1] = color;
        data[offset + 2] = color;
        data[offset + 3] = 255;
      }
    }
  };

  fillRect(0, 0, width - 1, height - 1, 255);
  fillRect(30, 30, 270, 37, 20);
  fillRect(30, 202, 270, 209, 20);
  fillRect(30, 30, 37, 209, 20);
  fillRect(263, 30, 270, 209, 20);
  // 순흑으로 채운 24x32 덕트/샤프트 — 긴 축 방향 벽 하나로 남아야 한다.
  fillRect(180, 120, 203, 151, 20);

  const lines = model.detectWallLinesFromImageData(
    { data, height, width },
    { height, minRunLength: 60, strictLineMask: true, width }
  );
  const filtered = model.filterCommercialWallCandidates(lines, { height, mode: "wall-first", width });
  const blockWalls = filtered.walls.filter(
    (line) => line.x1 >= 172 && line.x2 <= 211 && line.y1 >= 112 && line.y2 <= 159
  );

  assert.equal(blockWalls.length, 1);
  assert.equal(blockWalls[0].orientation, "vertical");
});

test("floor plan editor model classifies over-thick fill bands as furniture candidates", async () => {
  const model = floorPlanModel;
  const result = model.filterCommercialWallCandidates(
    [
      { x1: 120, y1: 140, x2: 620, y2: 140, orientation: "horizontal", thickness: 8 },
      { x1: 620, y1: 140, x2: 620, y2: 520, orientation: "vertical", thickness: 8 },
      { x1: 620, y1: 520, x2: 120, y2: 520, orientation: "horizontal", thickness: 8 },
      { x1: 120, y1: 520, x2: 120, y2: 140, orientation: "vertical", thickness: 8 },
      { x1: 260, y1: 180, x2: 410, y2: 180, orientation: "horizontal", thickness: 60 }
    ],
    { height: 680, mode: "wall-first", width: 760 }
  );

  assert.equal(result.walls.some((line) => Number(line.thickness ?? 1) >= 60), false);
  assert.equal(result.annotationCandidates.some((candidate) => candidate.source === "furniture-fill-band"), true);
});

test("floor plan editor model estimates scale from outside dimensions", async () => {
  const model = floorPlanModel;
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

test("floor plan editor model snaps normalized AI missing wall hints to dark image evidence", async () => {
  const model = floorPlanModel;
  const width = 120;
  const height = 80;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 255;
    data[index + 1] = 255;
    data[index + 2] = 255;
    data[index + 3] = 255;
  }
  for (let y = 38; y <= 42; y += 1) {
    for (let x = 15; x <= 105; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = 20;
      data[offset + 1] = 20;
      data[offset + 2] = 20;
    }
  }

  const snapped = model.snapNormalizedLineToWallEvidence(
    { x1: 120, y1: 465, x2: 900, y2: 465 },
    { data, height, width },
    { darkThreshold: 80, searchRadiusPx: 8 }
  );

  assert.equal(snapped.orientation, "horizontal");
  assert.equal(snapped.y1, 40);
  assert.equal(snapped.thickness >= 4, true);
  assert.equal(snapped.confidence > 0.7, true);
});

test("floor plan editor model creates wall candidates from AI room polygons and merges shared room edges", async () => {
  const model = floorPlanModel;
  const width = 200;
  const height = 120;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 255;
    data[index + 1] = 255;
    data[index + 2] = 255;
    data[index + 3] = 255;
  }
  for (let y = 20; y <= 100; y += 1) {
    for (let x = 99; x <= 101; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = 10;
      data[offset + 1] = 10;
      data[offset + 2] = 10;
    }
  }

  const lines = model.createWallCandidatesFromRoomPolygons(
    [
      {
        confidence: 0.82,
        label: "거실",
        polygon: [
          { x: 100, y: 150 },
          { x: 500, y: 150 },
          { x: 500, y: 850 },
          { x: 100, y: 850 }
        ]
      },
      {
        confidence: 0.8,
        label: "침실",
        polygon: [
          { x: 500, y: 150 },
          { x: 900, y: 150 },
          { x: 900, y: 850 },
          { x: 500, y: 850 }
        ]
      }
    ],
    { data, height, width },
    { darkThreshold: 80, minLength: 20, searchRadiusPx: 8 }
  );
  const sharedWalls = lines.filter((line) => line.orientation === "vertical" && line.x1 >= 98 && line.x1 <= 102);

  assert.equal(sharedWalls.length, 1);
  assert.equal(sharedWalls[0].markers.includes("ai-room-edge"), true);
  assert.equal(sharedWalls[0].thickness >= 2, true);
});

test("floor plan editor model creates opening candidates as editable layers", async () => {
  const model = floorPlanModel;
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
  const model = floorPlanModel;
  const candidates = model.detectFixtureCandidates({
    labels: [{ text: "싱크대", x: 220, y: 320, confidence: 0.86 }],
    shapes: [{ kind: "cabinet", x: 210, y: 300, width: 120, height: 36 }]
  });

  assert.equal(candidates[0].type, "SINK");
  assert.equal(candidates[0].status, "CANDIDATE");
  assert.equal(candidates[0].movable, false);
});

test("floor plan editor model recovers full structural bounds from a fragmented outline (real plan regression)", async () => {
  // 실제 원룸 도면(창문/문 opening으로 외곽선이 조각난 케이스)의 fallback 추출 결과.
  // 컴포넌트 기반 경계 추정이 국소 조각으로 붕괴해 벽 대부분을 잃던 회귀 케이스.
  const model = floorPlanModel;
  const rawLines = [
    { x1: 541, y1: 233, x2: 635, y2: 233, orientation: "horizontal", thickness: 19, markers: ["wall-band"] },
    { x1: 905, y1: 233, x2: 1008, y2: 233, orientation: "horizontal", thickness: 19, markers: ["wall-band"] },
    { x1: 286, y1: 754, x2: 460, y2: 754, orientation: "horizontal", thickness: 6, markers: ["wall-band"] },
    { x1: 668, y1: 767, x2: 1012, y2: 767, orientation: "horizontal", thickness: 12, markers: ["wall-band"] },
    { x1: 285, y1: 957, x2: 461, y2: 957, orientation: "horizontal", thickness: 19, markers: ["wall-band"] },
    { x1: 497, y1: 958, x2: 1008, y2: 958, orientation: "horizontal", thickness: 18, markers: ["wall-band"] },
    { x1: 269, y1: 253, x2: 269, y2: 737, orientation: "vertical", thickness: 19, markers: ["wall-band"] },
    { x1: 463, y1: 774, x2: 463, y2: 935, orientation: "vertical", thickness: 3, markers: ["wall-band"] },
    { x1: 495, y1: 774, x2: 495, y2: 935, orientation: "vertical", thickness: 3, markers: ["wall-band"] },
    { x1: 660, y1: 252, x2: 660, y2: 737, orientation: "vertical", thickness: 5, markers: ["wall-band"] },
    { x1: 1010, y1: 766, x2: 1010, y2: 940, orientation: "vertical", thickness: 3, markers: ["wall-band"] },
    { x1: 1036, y1: 250, x2: 1036, y2: 739, orientation: "vertical", thickness: 15, markers: ["wall-band"] },
    { x1: 1042, y1: 768, x2: 1042, y2: 950, orientation: "vertical", thickness: 4, markers: ["wall-band"] },
    { x1: 285, y1: 232, x2: 346, y2: 232, orientation: "horizontal", thickness: 17, markers: ["wall-band", "short-wall-recovered"] },
    { x1: 671, y1: 233, x2: 710, y2: 233, orientation: "horizontal", thickness: 19, markers: ["wall-band", "short-wall-recovered"] },
    { x1: 269, y1: 773, x2: 269, y2: 823, orientation: "vertical", thickness: 19, markers: ["wall-band", "short-wall-recovered"] },
    { x1: 269, y1: 907, x2: 269, y2: 940, orientation: "vertical", thickness: 19, markers: ["wall-band", "short-wall-recovered"] }
  ];

  const result = floorPlanModel.filterCommercialWallCandidates(rawLines, { height: 1280, mode: "wall-first", width: 1382 });

  // 경계가 건물 전체를 덮어야 한다 (국소 조각 아님).
  assert.equal(result.mainPlanBounds.minX <= 270, true);
  assert.equal(result.mainPlanBounds.maxX >= 1036, true);
  assert.equal(result.mainPlanBounds.minY <= 233, true);
  assert.equal(result.mainPlanBounds.maxY >= 957, true);

  // 방 사이 얇은 내벽(x=660, thick=5)과 아래쪽 외벽이 살아남아야 한다.
  assert.equal(
    result.walls.some((line) => line.orientation === "vertical" && Math.abs((line.x1 + line.x2) / 2 - 660) <= 4),
    true
  );
  assert.equal(
    result.walls.some((line) => line.orientation === "horizontal" && Math.abs((line.y1 + line.y2) / 2 - 958) <= 4),
    true
  );

  // 벽이 건물 경계 밖으로 생성되면 안 된다 (유령 벽 회귀 방지).
  for (const line of result.walls) {
    assert.equal(Math.max(line.y1, line.y2) <= result.mainPlanBounds.maxY + 12, true);
    assert.equal(Math.max(line.x1, line.x2) <= result.mainPlanBounds.maxX + 12, true);
  }
});

test("floor plan editor model scales detected image lines into editor walls", async () => {
  const model = floorPlanModel;
  const walls = model.createWallsFromDetectedLines(
    [{ x1: 100, y1: 50, x2: 900, y2: 50, orientation: "horizontal" }],
    { width: 1000, height: 500, name: "scan.png" }
  );

  assert.equal(walls.length, 1);
  assert.equal(walls[0].id, "scan-wall-1");
  assert.equal(walls[0].start.y, walls[0].end.y);
  assert.equal(walls[0].end.x > walls[0].start.x, true);
});

test("floor plan editor model overlays detected walls on the centered uploaded image", async () => {
  const model = floorPlanModel;
  const walls = model.createWallsFromDetectedLines(
    [{ x1: 500, y1: 0, x2: 500, y2: 500, orientation: "vertical" }],
    { width: 1000, height: 500, name: "scan.png" }
  );

  assert.equal(walls.length, 1);
  assert.equal(walls[0].start.x, 0);
  assert.equal(walls[0].end.x, 0);
  assert.equal(walls[0].start.y, -320);
  assert.equal(walls[0].end.y, 320);
});

test("floor plan editor model keeps small detected openings instead of snapping them closed", async () => {
  const model = floorPlanModel;
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

test("floor plan editor model builds normalized floor plan draft payload", async () => {
  const payloadModel = await import("./src/app/floor-plan-3d/room-model/room-payload.ts");
  const walls3D = [{ id: "wall-0", wall_id: "w1", position: [0, 1.25, 0], rotation: [0, 0, 0], dimensions: { width: 2, height: 2.5, depth: 0.15 } }];
  const confirmed = { id: "c1", status: "CONFIRMED" };
  const pending = { id: "c2", status: "PENDING" };
  const payload = payloadModel.buildFloorPlanDraftPayload({
    extractionMeta: { detectedLineCount: 4 },
    fixtureCandidates: [confirmed, pending],
    hiddenWallCount: 1,
    hiddenWallIds: new Set(["w2"]),
    landlordFurnitures: [{ id: "f1", source: "LANDLORD_OPTION" }],
    openingCandidates: [pending],
    pixelToMmRatio: 20,
    scaleConfirmed: true,
    status: "DRAFT",
    uploadedFloorPlanSource: { attachmentId: "att-1", imageUrl: "https://img" },
    uploadedImage: "data:fallback",
    walls: [{ id: "w1", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }],
    walls3D
  });

  assert.equal(payload.status, "DRAFT");
  assert.equal(payload.extractionMeta.scaleConfirmed, true);
  assert.equal(payload.extractionMeta.detectedLineCount, 4);
  assert.deepEqual(payload.hiddenWallIds, ["w2"]);
  assert.equal(payload.fixtures.length, 2);
  assert.equal(payload.sourceAttachmentId, "att-1");
  assert.equal(payload.sourceImageUrl, "https://img");
  assert.equal(payload.room3d.wallCount, 1);
  assert.equal(payload.room3d.hiddenWallCount, 1);
  assert.deepEqual(payload.room3d.fixtures, [confirmed]);
  assert.deepEqual(payload.room3d.openings, []);
});

test("floor plan editor model builds resident design and local snapshot payloads", async () => {
  const payloadModel = await import("./src/app/floor-plan-3d/room-model/room-payload.ts");
  const walls3D = [{ id: "wall-0", wall_id: "w1", position: [0, 1.25, 0], rotation: [0, 0, 0], dimensions: { width: 2, height: 2.5, depth: 0.15 } }];
  const resident = payloadModel.buildResidentDesignPayload({
    fixtureCandidates: [{ id: "c1", status: "CONFIRMED" }],
    floorPlanDraftId: "draft-9",
    hiddenWallIds: [],
    landlordOptionFurnitures: [{ id: "f1", source: "LANDLORD_OPTION" }],
    openingCandidates: [],
    pixelToMmRatio: 20,
    residentDesignFurnitures: [{ id: "f2", source: "RESIDENT_DESIGN" }],
    savedAt: 1234,
    walls: [],
    walls3D
  });

  assert.equal(resident.mode, "resident");
  assert.equal(resident.sourceFloorPlanDraftId, "draft-9");
  assert.equal(resident.lockedFurnitures[0].id, "f1");
  assert.equal(resident.furnitures[0].id, "f2");
  assert.deepEqual(resident.room3d, { walls: walls3D });

  const snapshot = payloadModel.buildFloorPlanLocalSnapshot({
    extractionMeta: { detectedLineCount: 4 },
    fixtureCandidates: [{ id: "c1", status: "CONFIRMED" }],
    hiddenWallIds: ["w2"],
    landlordFurnitures: [],
    openingCandidates: [{ id: "c3", status: "PENDING" }],
    pixelToMmRatio: 20,
    timestamp: 5678,
    walls: [],
    walls3D
  });

  assert.equal(snapshot.timestamp, 5678);
  assert.equal(snapshot.extractionMeta.scaleConfirmed, undefined);
  assert.equal(snapshot.room3d.fixtures.length, 1);
  assert.deepEqual(snapshot.room3d.openings, []);
  assert.equal(snapshot.room3d.wallCount, undefined);
});

test("floor plan editor model builds wall endpoint graphs and finds dangling ends", async () => {
  const graphModel = await import("./src/app/floor-plan-3d/room-model/wall-graph.ts");
  const walls = [
    { id: "top", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
    { id: "right", start: { x: 100.4, y: 0.3 }, end: { x: 100, y: 80 } },
    { id: "broken", start: { x: 180, y: 0 }, end: { x: 220, y: 0 } }
  ];

  const graph = graphModel.buildWallGraph(walls, 1);
  const corners = graphModel.findCorners(walls, 1);
  const danglingEnds = graphModel.findDanglingEnds(walls, 1);

  assert.equal(graph.nodes.some((node) => node.wallIds.includes("top") && node.wallIds.includes("right")), true);
  assert.equal(corners.length, 1);
  assert.deepEqual(corners[0].wallIds, ["top", "right"]);
  assert.equal(danglingEnds.length, 4);
  assert.deepEqual(
    danglingEnds.map((end) => `${end.wallId}:${end.end}`).sort(),
    ["broken:end", "broken:start", "right:end", "top:start"]
  );
});

test("floor plan editor model merges collinear overlapping wall runs", async () => {
  const graphModel = await import("./src/app/floor-plan-3d/room-model/wall-graph.ts");
  const walls = [
    { id: "a", start: { x: 0, y: 0 }, end: { x: 50, y: 0 } },
    { id: "b", start: { x: 50.4, y: 0 }, end: { x: 100, y: 0 } },
    { id: "c", start: { x: 80, y: 0 }, end: { x: 130, y: 0 } },
    { id: "side", start: { x: 160, y: 0 }, end: { x: 160, y: 40 } }
  ];

  const merged = graphModel.mergeCollinearWalls(walls, { gapTolerancePx: 1, tolerancePx: 1 });

  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0], {
    id: "merged:a+b+c",
    start: { x: 0, y: 0 },
    end: { x: 130, y: 0 }
  });
  assert.deepEqual(merged[1], walls[3]);
  assert.deepEqual(walls[1].start, { x: 50.4, y: 0 });
});

test("floor plan editor model detects closed wall loops", async () => {
  const graphModel = await import("./src/app/floor-plan-3d/room-model/wall-graph.ts");
  const square = [
    { id: "top", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
    { id: "right", start: { x: 100, y: 0 }, end: { x: 100, y: 80 } },
    { id: "bottom", start: { x: 100, y: 80 }, end: { x: 0, y: 80 } },
    { id: "left", start: { x: 0, y: 80 }, end: { x: 0, y: 0 } }
  ];

  const loops = graphModel.detectClosedLoops(square, 1);
  const openLoops = graphModel.detectClosedLoops(square.slice(0, 3), 1);

  assert.equal(loops.length, 1);
  assert.deepEqual(loops[0].wallIds.sort(), ["bottom", "left", "right", "top"]);
  assert.equal(loops[0].points.length, 4);
  assert.equal(loops[0].perimeterPx, 360);
  assert.deepEqual(openLoops, []);
});

test("floor plan editor model calculates rotated furniture footprints", async () => {
  const collisionModel = await import("./src/app/floor-plan-3d/room-model/collision.ts");
  const furniture = {
    id: "desk-1",
    furniture_id: "desk",
    length: [2000, 740, 1000],
    position: [1, 0.37, 2],
    rotation: [0, Math.PI / 2, 0],
    scale: 1
  };

  const footprint = collisionModel.getFurnitureFootprint(furniture);

  assert.equal(footprint.width, 2);
  assert.equal(footprint.depth, 1);
  assert.deepEqual(footprint.bounds, { maxX: 1.5, maxZ: 3, minX: 0.5, minZ: 1 });
  assert.deepEqual(footprint.corners, [
    { x: 1.5, z: 1 },
    { x: 1.5, z: 3 },
    { x: 0.5, z: 3 },
    { x: 0.5, z: 1 }
  ]);
  assert.deepEqual(furniture.position, [1, 0.37, 2]);
});

test("floor plan editor model detects furniture wall and furniture overlaps", async () => {
  const collisionModel = await import("./src/app/floor-plan-3d/room-model/collision.ts");
  const wall = {
    id: "wall-0",
    wall_id: "top",
    position: [0, 1.25, 0],
    rotation: [0, 0, 0],
    dimensions: { width: 4, height: 2.5, depth: 0.2 }
  };
  const sofa = {
    id: "sofa",
    furniture_id: "sofa",
    length: [1200, 700, 800],
    position: [0, 0.35, 0.15],
    rotation: [0, 0, 0],
    scale: 1
  };
  const table = {
    ...sofa,
    id: "table",
    position: [0.5, 0.35, 0.2]
  };
  const farChair = {
    ...sofa,
    id: "chair",
    position: [3, 0.35, 2]
  };

  assert.equal(collisionModel.furnitureIntersectsWall(sofa, wall), true);
  assert.equal(collisionModel.furnitureIntersectsWall(farChair, wall), false);
  assert.equal(collisionModel.furnitureOverlapsFurniture(sofa, table), true);
  assert.equal(collisionModel.furnitureOverlapsFurniture(sofa, farChair), false);
});

test("floor plan editor model clamps furniture inside wall bounds", async () => {
  const collisionModel = await import("./src/app/floor-plan-3d/room-model/collision.ts");
  const walls = [
    { id: "top", wall_id: "top", position: [0, 1.25, -2], rotation: [0, 0, 0], dimensions: { width: 4, height: 2.5, depth: 0.15 } },
    { id: "right", wall_id: "right", position: [2, 1.25, 0], rotation: [0, Math.PI / 2, 0], dimensions: { width: 4, height: 2.5, depth: 0.15 } },
    { id: "bottom", wall_id: "bottom", position: [0, 1.25, 2], rotation: [0, 0, 0], dimensions: { width: 4, height: 2.5, depth: 0.15 } },
    { id: "left", wall_id: "left", position: [-2, 1.25, 0], rotation: [0, Math.PI / 2, 0], dimensions: { width: 4, height: 2.5, depth: 0.15 } }
  ];
  const bed = {
    id: "bed",
    furniture_id: "bed",
    length: [1000, 500, 1000],
    position: [2.4, 0.25, -2.3],
    rotation: [0, 0, 0],
    scale: 1
  };

  const clamped = collisionModel.clampFurnitureIntoRoom(bed, walls);

  assert.deepEqual(clamped.position, [1.5, 0.25, -1.5]);
  assert.notEqual(clamped, bed);
  assert.deepEqual(bed.position, [2.4, 0.25, -2.3]);
});

test("floor plan editor model snaps furniture to the nearest wall", async () => {
  const collisionModel = await import("./src/app/floor-plan-3d/room-model/collision.ts");
  const wall = {
    id: "wall-0",
    wall_id: "top",
    position: [0, 1.25, 0],
    rotation: [0, 0, 0],
    dimensions: { width: 4, height: 2.5, depth: 0.2 }
  };
  const wardrobe = {
    id: "wardrobe",
    furniture_id: "wardrobe",
    length: [1000, 1900, 600],
    position: [0.4, 0.95, 0.45],
    rotation: [0, Math.PI / 2, 0],
    scale: 1
  };

  const snapped = collisionModel.snapFurnitureToWall(wardrobe, [wall], 0.4);
  const unchanged = collisionModel.snapFurnitureToWall({ ...wardrobe, position: [0.4, 0.95, 1.4] }, [wall], 0.4);

  assert.deepEqual(snapped.position, [0.4, 0.95, 0.4]);
  assert.deepEqual(snapped.rotation, [0, 0, 0]);
  assert.deepEqual(unchanged.position, [0.4, 0.95, 1.4]);
});
