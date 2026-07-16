# Manager Assistant Sticky Scroll Design

## Goal

관리자 AI 팝업에서 새 대화 내용이 추가될 때 사용자가 대화 하단을 보고 있는 경우에만 최신 메시지로 자동 스크롤한다. 사용자가 이전 대화를 읽기 위해 위로 이동한 상태에서는 현재 위치를 유지한다.

## Root Cause

관리자 AI 팝업의 `.manager-ai-transcript`는 독립적인 스크롤 컨테이너지만 현재 DOM ref, 사용자 스크롤 추적, 새 항목 반영 후 스크롤 처리가 없다. 따라서 transcript 항목은 정상적으로 추가돼도 컨테이너의 `scrollTop`이 유지되어 최신 메시지가 화면 아래에 숨는다.

전체 관리자 Realtime 콘솔에는 이미 하단과의 거리를 계산해 자동 스크롤 여부를 보존하는 구현이 있다. 팝업에는 이 동작이 빠져 있는 것이 두 화면의 핵심 차이다.

## Behavior

- 팝업을 처음 열거나 텍스트·음성 모드에 처음 진입하면 최신 대화를 보여준다.
- 사용자가 하단에서 96px 이내를 보고 있으면 하단 고정 상태로 판단한다.
- 하단 고정 상태에서 새 transcript 항목이나 실행 대기 카드가 추가되면 최신 내용으로 부드럽게 이동한다.
- 사용자가 위로 스크롤해 하단에서 96px보다 멀어지면 자동 스크롤을 중단한다.
- 사용자가 다시 아래로 내려와 96px 이내에 도달하면 다음 새 내용부터 자동 스크롤을 재개한다.
- 새 메시지가 추가되지 않은 일반 렌더에서는 스크롤 위치를 변경하지 않는다.

## Architecture

`ManagerAssistantLauncher`가 팝업 transcript의 스크롤 정책을 소유한다.

- `transcriptRef`: `.manager-ai-transcript` DOM 요소를 참조한다.
- `shouldStickToBottomRef`: 사용자가 최신 대화를 따라갈 상태인지 렌더와 무관하게 보존한다.
- `updateTranscriptStickiness()`: `scrollHeight - scrollTop - clientHeight`를 계산하고 96px 미만이면 고정 상태로 갱신한다.
- `scrollTranscriptToBottom()`: 현재 컨테이너의 `scrollHeight`까지 smooth scroll한다.
- effect: transcript 항목 수, pending action, notice, 대화 stage 또는 mode가 바뀐 다음 프레임에 고정 상태를 확인하고 스크롤한다.

DOM이 새 메시지 높이를 반영한 뒤 이동하도록 `requestAnimationFrame`을 사용하며 cleanup에서 예약된 frame을 취소한다.

## Data Flow

1. 음성 transcript, 텍스트 답변, system 안내 또는 receipt가 `session.entries`에 추가된다.
2. React가 새 대화 항목을 렌더한다.
3. effect가 변경된 항목 수를 감지한다.
4. `shouldStickToBottomRef.current`가 `true`일 때만 다음 animation frame에 하단으로 이동한다.
5. 사용자가 transcript를 스크롤하면 `onScroll`이 다음 새 메시지에 적용할 고정 상태를 갱신한다.

## Initial And Mode Transition Behavior

- `session.stage`가 대화 단계로 바뀌거나 `session.mode`가 바뀔 때 하단 고정 상태를 `true`로 초기화한다.
- mode transition 후 렌더된 transcript를 다음 animation frame에서 하단으로 이동한다.
- 팝업을 닫았다 다시 열어도 기존 대화가 있다면 최신 항목부터 보인다.

## Accessibility And Motion

- 기존 `role="log"`와 `aria-live="polite"`를 유지한다.
- 자동 스크롤은 사용자가 최신 대화를 따라가는 상태에서만 실행해 과거 내용 읽기를 방해하지 않는다.
- 기존 전체 관리자 Realtime 콘솔과 일관되게 smooth scroll을 사용한다.
- 새 포커스를 강제로 이동하지 않는다.

## Scope

- `ManagerAssistant.tsx`의 transcript 동작과 관련 테스트만 변경한다.
- 메시지 저장, Realtime 이벤트 처리, Push to Talk, API, 인프라 설정은 변경하지 않는다.
- 새 메시지 알림 버튼은 이번 범위에 포함하지 않는다.

## Tests

1. 하단 거리 95px는 자동 추적, 96px 이상은 비추적으로 판정하는 순수 정책 함수를 테스트한다.
2. transcript에 ref와 `onScroll`이 연결됐는지 소스 계약 테스트로 확인한다.
3. 새 항목 수와 pending action 변경에 반응하는 effect 및 `requestAnimationFrame` cleanup을 확인한다.
4. 관련 집중 테스트, Next.js 빌드, 전체 web 테스트를 실행한다.
5. Docker web 이미지를 재빌드한 뒤 브라우저에서 대화 하단 자동 이동과 수동 상단 위치 유지, 오류 부재를 확인한다.

## Acceptance Criteria

- 최신 대화를 보고 있는 상태에서 새 메시지가 추가되면 새 메시지가 화면에 보인다.
- 이전 대화를 읽는 상태에서 새 메시지가 추가돼도 스크롤이 강제로 내려가지 않는다.
- 다시 하단으로 이동하면 이후 새 메시지부터 자동 스크롤한다.
- 텍스트·음성 메시지와 실행 대기 카드가 같은 정책을 사용한다.
- 기존 대화, 음성 연결, Push to Talk 기능에 회귀가 없다.
