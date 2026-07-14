# Manager Assistant Push-to-Talk Design

## Goal

관리자 AI 음성 모드에서 마이크를 상시 송출하지 않는다. Realtime 통화가 연결되면 마이크를 기본 음소거하고, 사용자가 `Push to Talk` 버튼을 누르고 있는 동안에만 음성을 전송한다.

## Scope

- 관리자 AI 팝업의 음성 모드만 변경한다.
- 기존 WebRTC 연결, transcript, 도구 호출, 통화 종료 흐름은 유지한다.
- 서버 API, Docker, 배포 설정은 변경하지 않는다.
- 별도 녹음 파일을 만들거나 저장하지 않는다.

## Interaction

1. 사용자가 `통화 시작`을 누르고 마이크 권한을 허용한다.
2. 마이크 트랙은 획득 즉시 비활성화한다.
3. Realtime 연결이 완료되면 `Push to Talk` 버튼을 활성화한다.
4. 마우스, 터치, 펜으로 버튼을 누르는 동안 마이크 트랙을 활성화한다.
5. 포인터를 놓거나 취소하면 즉시 마이크 트랙을 비활성화한다.
6. 키보드 사용자는 버튼에 포커스한 상태에서 Space 또는 Enter를 누르는 동안 말할 수 있다.
7. 활성 상태에서는 버튼 문구를 `말하는 중…`으로 바꾸고 시각적 pressed 상태를 표시한다.
8. 창이 blur 되거나 문서가 숨겨지거나 통화가 종료되면 누름 상태와 관계없이 마이크를 비활성화한다.

## Architecture

### Realtime session controller

`useManagerRealtimeSession`이 로컬 마이크 트랙의 단일 소유자가 된다.

- 마이크 스트림 획득 직후 모든 audio track에 `enabled = false`를 적용한다.
- `startTalking()`은 연결 상태일 때만 audio track을 활성화한다.
- `stopTalking()`은 상태와 관계없이 audio track을 비활성화한다.
- `isTalking` 상태를 노출해 UI와 실제 트랙 상태를 동기화한다.
- disconnect, connection failure, resource cleanup은 항상 `stopTalking()`과 같은 안전한 음소거 결과를 만든다.

트랙 활성화는 순수 함수로 분리해 MediaStream의 audio track만 변경하고 결과를 반환한다. 이 함수는 브라우저 마이크 없이 단위 테스트한다.

### Voice controls

연결 완료 상태에서 기존 `통화 종료` 버튼과 별도로 큰 `Push to Talk` 버튼을 표시한다.

- Pointer Events로 mouse, touch, pen 입력을 하나의 흐름으로 처리한다.
- `pointerdown`에서 pointer capture를 획득하고 `startTalking()`을 호출한다.
- `pointerup`, `pointercancel`, `lostpointercapture`에서 `stopTalking()`을 호출한다.
- 키보드 `keydown`/`keyup`은 Space와 Enter만 처리하며 key repeat은 무시한다.
- `blur`와 페이지 visibility 변경 시에도 `stopTalking()`을 호출한다.
- 연결 전과 연결 중에는 버튼을 disabled 처리한다.

## Accessibility

- 버튼에는 `aria-pressed`로 현재 송출 상태를 제공한다.
- 기본 접근 가능한 이름은 `Push to Talk`이다.
- 송출 중에는 화면 문구와 상태 안내를 `말하는 중…`으로 바꾼다.
- 키보드 Space/Enter hold 동작을 지원한다.
- 색상만으로 상태를 전달하지 않고 문구와 pressed 상태를 함께 사용한다.

## Error And Safety Behavior

- 마이크 권한 거부와 장치 오류는 기존 오류 문구를 유지한다.
- 연결이 끊기거나 통화가 종료되면 트랙을 정지하기 전에 먼저 비활성화한다.
- 버튼 밖으로 포인터가 이동해도 capture를 유지하되, 포인터 종료·취소 시 반드시 음소거한다.
- UI 이벤트가 중복 발생해도 start/stop 함수는 멱등적으로 동작한다.
- 연결되지 않은 상태의 start 요청은 마이크를 활성화하지 않는다.

## Styling

- `packages/ui/src/tokens.css`의 기존 CSS 변수만 사용한다.
- 연결된 음성 제어 카드 안에 Push to Talk를 주요 액션으로 배치한다.
- 기본 상태는 primary, 누르는 상태는 명확한 pressed 스타일을 적용한다.
- `통화 종료`는 별도의 error 색상 보조 액션으로 유지한다.

## Tests

1. audio track helper가 활성화와 음소거를 정확히 전환하는지 단위 테스트한다.
2. 연결 전 start 요청이 활성화되지 않는 정책을 테스트한다.
3. 관리자 AI 소스 계약 테스트에서 Pointer Events, keyboard hold, `aria-pressed`, blur/visibility 안전장치를 확인한다.
4. 관련 집중 테스트와 전체 web 테스트를 실행한다.
5. Docker web 이미지를 재빌드하고 브라우저에서 버튼 렌더링, pressed 상태, 오류 오버레이와 콘솔 오류 부재를 확인한다.

## Acceptance Criteria

- 통화 연결 직후 마이크는 음소거 상태다.
- `Push to Talk`을 누르는 동안만 마이크 audio track이 활성화된다.
- 어떤 종료 경로에서도 버튼을 놓은 뒤 마이크가 계속 활성화되지 않는다.
- 마우스, 터치, 펜, 키보드로 동일한 hold-to-talk 동작을 사용할 수 있다.
- 기존 통화 시작·종료, transcript, 텍스트 모드 동작에 회귀가 없다.
