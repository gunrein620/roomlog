# 관리자 AI 세입자 AI 시각 동일화 설계

## 목적

관리자 워크스페이스의 플로팅 `AI 비서`를 열었을 때 표시되는 선택 화면을 세입자 `Woo-zu AI Assistant`와 동일한 시각 구조와 영문 문구로 변경한다. 관리자 전용 텍스트 Copilot, Realtime 음성 연결, transcript 및 발송 확인 게이트는 그대로 유지한다.

## 기준 화면

- 실제 기준 구현: `apps/web/src/app/my/flows/TenantMyPage.tsx`의 `tenant-ai-panel`
- 실제 기준 스타일: `apps/web/src/app/globals.css`의 `tenant-ai-*`
- 사용자 제공 이미지: 파란 헤더, 대형 흰색 패널, 중앙 영문 안내, 2열 모드 카드

## 변경 범위

### 패널

- 데스크톱에서 세입자 AI와 동일하게 최대 폭 720px, 최대 높이 720px의 대형 패널을 사용한다.
- 패널은 화면 안에 유지되고, 좁은 화면에서는 좌우 여백을 둔 단일 패널로 축소한다.
- 기존 native `dialog`의 Escape, backdrop 닫기 및 접근성 계약은 유지한다.

### 헤더

- 배경은 공유 primary 토큰을 사용한 파란색 헤더로 변경한다.
- 왼쪽에 Bot 아이콘과 `Woo-zu AI Assistant`를 표시한다.
- 오른쪽에 흰색 닫기 아이콘 버튼을 표시한다.

### 모드 선택

- 다음 문구를 세입자 AI와 동일하게 표시한다.
  - `Choose your consultation mode`
  - `How would you like to talk with Woo-zu AI?`
- `Text Chat`과 `Voice Call` 카드는 2열로 배치한다.
- 카드 크기, 둥근 테두리, 아이콘 원형 배경, 그림자, 라벨 `TEXT`와 `CALL`을 세입자 AI 비율과 동일하게 맞춘다.
- 관리자 이름, 현재 화면명, 브리핑 개수는 선택 화면에서 제거한다.

### 대화 화면

- 모드를 선택한 뒤에도 동일한 대형 패널과 파란 헤더를 유지한다.
- 기존 transcript, 텍스트 입력, 음성 연결 상태, 모드 토글, 실행 영수증 및 `ManagerAssistantActionCard`는 변경하지 않는다.
- 텍스트와 음성 모드 전환 시 transcript와 보류 액션을 유지하고, 텍스트 전환 및 패널 종료 시 Realtime 자원을 정리한다.

## 구현 방식

세입자 클래스명을 관리자 화면에서 직접 재사용하지 않는다. `ManagerAssistant.tsx`의 관리자 전용 구조에 필요한 클래스만 추가하고 `apps/web/src/app/manager/globals.css`에서 세입자 패널의 치수와 시각 비율을 공유 토큰으로 재현한다. 이 방식은 세입자 화면 회귀를 막고 관리자 기능 상태를 독립적으로 유지한다.

## 스타일 제약

- 신규 색상, 간격, 글꼴, 반경 값은 `packages/ui/src/tokens.css`의 CSS 변수만 사용한다.
- raw hex와 rgba를 추가하지 않는다.
- 세입자 전역 CSS와 관리자 CSS 사이에 직접 의존성을 만들지 않는다.

## 접근성

- dialog 제목은 `aria-labelledby`로 연결한다.
- 닫기 버튼은 기존 한국어 접근성 이름을 유지한다.
- 모드 카드는 실제 button으로 렌더한다.
- transcript의 `role="log"`, 상태의 `aria-live`, 키보드 Escape 및 backdrop 닫기를 유지한다.
- 모바일에서도 모드 카드의 터치 영역을 공유 touch target 이상으로 유지한다.

## 테스트 및 완료 기준

1. 소스 계약 테스트가 영문 브랜드·안내 문구와 전용 아이콘 래퍼를 검증한다.
2. CSS 계약 테스트가 대형 패널 치수, 파란 헤더, 2열 카드와 반응형 규칙을 검증한다.
3. 집중 테스트와 전체 `pnpm test:web`가 통과한다.
4. `pnpm build:web`이 통과한다.
5. 기능 커밋을 `kms-manager-agent`에 푸시한다.
6. Docker web 이미지를 재빌드하고 `/manager/home/00`에서 패널을 열어 기준 이미지와 같은 구조, 오류 오버레이 부재 및 `Text Chat`/`Voice Call` 노출을 브라우저로 확인한다.

## 제외 범위

- 관리자 AI API 또는 서버 명령 변경
- 세입자 AI 컴포넌트 리팩터링
- 대화 이력 영속화
- Docker, CI/CD, AWS 또는 배포 설정 변경
