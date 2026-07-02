import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync(new URL("./src/app/page.tsx", import.meta.url), "utf8");
const floorPlanPagePath = new URL("./src/app/floor-plan-3d/page.tsx", import.meta.url);
const floorPlanPageSource = existsSync(floorPlanPagePath) ? readFileSync(floorPlanPagePath, "utf8") : "";
const floorPlanEditorPath = new URL("./src/app/floor-plan-3d/RoomlogFloorPlanEditor.tsx", import.meta.url);
const floorPlanEditorSource = existsSync(floorPlanEditorPath) ? readFileSync(floorPlanEditorPath, "utf8") : "";
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

test("renders a mobile real-estate app shell with search, map list, and listing detail sections", () => {
  for (const label of ["조건에 맞는 방", "지도 열기", "추천 매물", "매물 57804322", "전체"]) {
    assert.match(pageSource, new RegExp(label));
  }
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

test("offers social-only sign in with a developer shortcut for local entry", () => {
  for (const label of [
    "카카오",
    "네이버",
    "Apple",
    "Google",
    "개발용 로그인",
    "집우집주",
    "소셜 로그인으로 관심 매물과 문의 내역을 이어서 볼 수 있습니다",
    "방문 전 3D 투어와 안심 정보를 먼저 확인하세요",
    "3D 투어",
    "확인매물",
    "지도 검색"
  ]) {
    assert.match(pageSource, new RegExp(label));
  }

  assert.match(pageSource, /socialLoginNotice/);
  assert.match(pageSource, /setSocialLoginNotice/);
  assert.match(pageSource, /setActiveRole/);
  assert.match(pageSource, /assets\/img\/image\.png/);
  assert.match(pageSource, /loginHeroImage/);
  assert.match(pageSource, /login-visual/);
  assert.match(pageSource, /login-hero-image/);
  assert.match(cssSource, /\.login-visual/);
  assert.match(cssSource, /\.login-hero-image/);
  assert.match(cssSource, /\.login-hero-image\s*{[^}]*object-fit:\s*contain/s);
  assert.match(cssSource, /\.login-trust-row/);
  assert.match(cssSource, /\.social-login-notice/);
  assert.doesNotMatch(pageSource, /개발 중에는/);
  assert.doesNotMatch(pageSource, /pin-a|pin-b|pin-c/);
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
  assert.match(pageSource, /<LoginScreen setActiveRole=\{startRoleSession\}/);
  assert.match(pageSource, /resetWindowScrollSoon/);
  assert.match(pageSource, /window\.setTimeout\(resetWindowScroll, 320\)/);
  assert.match(pageSource, /\[activeRole, activeTab, selectedListing\]/);
});

test("gives tenants a real resident dashboard instead of the generic profile", () => {
  for (const label of ["세입자 마이페이지", "계약 상태", "수리요청", "관리비", "방문 일정", "에어컨 필터 교체 방문", "124,000원"]) {
    assert.match(pageSource, new RegExp(label));
  }

  assert.match(pageSource, /activeRole === "tenant"/);
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
    "확인매물·3D 투어 배지"
  ]) {
    assert.match(pageSource, new RegExp(label));
  }

  assert.match(pageSource, /ownerReviewItems/);
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
  assert.match(cssSource, /\.upload-3d-button\.active/);
});

test("adds real bottom-tab destinations for saved listings, inquiries, and profile", () => {
  for (const label of [
    "찜한 매물",
    "문의센터",
    "마이페이지",
    "진행중 문의",
    "저장 조건",
    "최근 문의 상태가 여기에 표시됩니다",
    "찜한 매물 비교 요약",
    "가격 변동",
    "방문 후보",
    "문의 타임라인",
    "최근 문의 흐름",
    "문의 채널",
    "원하는 방식으로 바로 확인",
    "로그인 없이 가능",
    "방문예약",
    "문의 진행",
    "저장 지역",
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
  assert.match(pageSource, /setInquiryNotice/);
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
    "방문 가능 여부 확인",
    "3D 투어",
    "예약",
    "매물 신뢰 요약",
    "오늘 검수",
    "평균 8분",
    "실측 도면",
    "보상 정책",
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

  for (const label of ["거래 가능 정보", "문의 가능", "사진", "중개사 검수", "방배동 · 내방역 도보 5분"]) {
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
  assert.match(pageSource, /detail-availability-strip/);
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
  assert.match(cssSource, /\.detail-contact-bar\s*{[^}]*grid-template-columns:\s*54px minmax\(0, 1fr\) 74px/s);
  assert.match(cssSource, /\.detail-contact-bar\s*{[^}]*padding:\s*17px 14px 10px/s);
  assert.match(cssSource, /\.detail-contact-small,\s*[\s\S]*?\.detail-contact-tour\s*{[^}]*min-height:\s*50px/s);
  assert.match(cssSource, /\.detail-gallery\s*{[^}]*height:\s*clamp\(340px, 43vh, 390px\)/s);
  assert.match(cssSource, /\.detail-top-title\s*{[^}]*min-height:\s*74px/s);
  assert.match(cssSource, /\.detail-price-block\s*{[^}]*padding:\s*24px 18px 16px/s);
  assert.match(cssSource, /\.detail-contact-small/);
  assert.match(cssSource, /\.detail-contact-primary/);
  assert.match(cssSource, /\.detail-contact-tour/);
  assert.doesNotMatch(cssSource, /\.contact-icon-button/);
  assert.match(cssSource, /\.detail-address-line/);
  assert.match(cssSource, /\.detail-availability-strip/);
  assert.match(cssSource, /\.share-sheet\s*{/);
  assert.match(cssSource, /\.share-action-grid/);
  assert.match(cssSource, /\.detail-toast/);
  assert.match(cssSource, /\.complex-sheet\s*{/);
  assert.match(cssSource, /\.complex-score-grid/);
  assert.match(cssSource, /\.agent-sheet\s*{/);
  assert.match(cssSource, /\.agent-metric-grid/);
  assert.match(cssSource, /\.detail-trust-summary/);
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

test("supports a responsive desktop web layout beyond the phone frame", () => {
  assert.match(cssSource, /@media \(min-width:\s*1080px\)/);
  assert.match(cssSource, /\.service-frame\.with-bottom-tabs\s*{[^}]*width:\s*min\(calc\(100vw - 48px\), 1180px\)/s);
  assert.match(cssSource, /\.home-screen\s*{[^}]*grid-template-columns:\s*minmax\(340px, 0\.86fr\) minmax\(500px, 1\.14fr\)/s);
  assert.match(cssSource, /\.map-screen\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 390px/s);
  assert.match(cssSource, /\.listing-detail-screen\s*{[^}]*grid-template-columns:\s*minmax\(460px, 1fr\) 360px/s);
  assert.match(cssSource, /\.bottom-tabs\s*{[^}]*width:\s*min\(540px, calc\(100vw - 48px\)\)/s);
  assert.match(cssSource, /\.bottom-tabs\s*{[^}]*border-radius:\s*999px/s);
  assert.match(cssSource, /\.bottom-tabs\s*{[^}]*backdrop-filter:\s*blur\(18px\)/s);
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

test("copies wheretoput-style furniture selection and 3D placement controls", () => {
  for (const label of [
    "wheretoput furniture picker",
    "FURNITURE_CATALOG",
    "createFurnitureModel",
    "FurnitureMesh",
    "FurnitureGlbMesh",
    "useGLTF",
    "modelUrl",
    "furniture-models/bed-queen.glb",
    "handleFurnitureSelect",
    "handle3DFloorPointerDown",
    "placedFurnitures",
    "pendingFurniture",
    "배치 가구",
    "90도 회전",
    "가구 배치"
  ]) {
    assert.match(floorPlanEditorSource, new RegExp(label));
  }
});

test("loads furniture picker data from the local furniture catalog API", () => {
  for (const label of [
    "apiUrl\\(\"/furniture-catalog\"\\)",
    "setFurnitureCatalog",
    "카탈로그 동기화 필요",
    "오늘의집 대신 공개 API 기반 로컬 DB"
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
