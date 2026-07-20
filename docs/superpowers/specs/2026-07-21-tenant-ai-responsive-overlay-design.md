# Tenant AI Responsive Overlay Design

## Goal

세입자 AI 비서가 데스크톱에서는 페이지를 밀어내지 않는 우측 오버레이로 열리고, 모바일에서는 하단 내비게이션에 가리지 않는 전체 화면으로 열리게 한다.

## Scope

- `TenantAiAssistantPanel`의 레이아웃과 반응형 CSS만 수정한다.
- 기존 텍스트·음성 세션, 대화 보존, 민원 초안, 발송 로직은 유지한다.
- 새 버튼이나 별도 모드 선택 화면은 추가하지 않는다.

## Desktop

- `1025px` 이상에서는 AI 패널을 viewport 우측에 `position: fixed`로 배치한다.
- 패널 폭은 기존 `--manager-assistant-panel-width` 토큰을 사용한다.
- 본문 grid 컬럼과 서비스 프레임 폭을 변경하지 않아 원래 페이지가 아래나 옆으로 밀리지 않게 한다.
- 패널은 전체 viewport 높이를 사용하고, 기존 테두리와 토큰 기반 그림자로 본문과 구분한다.
- 패널이 열린 상태의 민원 초안 시트는 패널 아래로 숨지 않도록 우측 여백을 유지한다.

## Mobile and Tablet

- `1024px` 이하에서는 패널을 viewport 전체에 고정한다.
- `--z-overlay`를 사용해 사이트 하단 내비게이션보다 위에 표시한다.
- 패널 높이는 `100dvh`이며 하단 safe area를 반영한다.
- 헤더, 입력/음성 제어, 텍스트·음성 전환은 화면 안에 유지하고 대화 목록만 스크롤한다.
- 모드 전환 영역은 불투명한 배경과 safe-area 하단 패딩을 가져 항상 터치 가능해야 한다.

## Accessibility and Interaction

- 기존 `aside`, 제목 연결, 아이콘 버튼의 `aria-label`, `aria-pressed`를 유지한다.
- 모드 전환 버튼은 최소 터치 영역을 유지한다.
- 레이아웃 전환 애니메이션은 추가하지 않는다.

## Verification

- 소스 회귀 테스트에서 데스크톱 fixed-right overlay와 모바일 full-screen overlay를 확인한다.
- 모바일 safe area와 모드 전환 영역의 하단 고정을 확인한다.
- web 프로덕션 빌드와 `bash scripts/verify.sh`를 통과시킨다.
