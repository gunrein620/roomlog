# 관리자 Living형 AI 챗봇 통합 설계

## 1. 목적

`/living`의 Woo-zu AI Assistant가 제공하는 플로팅 실행 버튼, 텍스트/음성 상담 모드 선택, 대화 중 모드 전환 경험을 관리자 페이지의 AI 챗봇에 적용한다.

관리자 챗봇은 단순 상담용이 아니라 티켓 조회, 청구 요약, 메시지 조회·답장, 연체 독촉 준비 등 실제 관리 업무를 수행한다. 따라서 Living의 인터페이스는 재사용하되, 기존 관리자 코파일럿의 서버 명령 allowlist, 역할 권한, 발송 전 확인 카드 및 차단 규칙은 유지한다.

## 2. 현재 상태

### Living 챗봇

- 우측 하단 플로팅 버튼으로 패널을 열고 닫는다.
- 처음 열면 `Text Chat`과 `Voice Call` 모드를 선택한다.
- 대화 화면에서도 텍스트/음성 모드를 전환할 수 있다.
- 현재 텍스트 응답과 통화 화면은 데모 상태다.

### 관리자 챗봇

- `ManagerAssistantLauncher`는 관리자 셸의 플로팅 진입점을 제공하지만 실제 대화는 별도 음성 비서 화면으로 이동시킨다.
- 관리자 홈의 `CopilotPanel`은 `/api/manager/copilot/chat`을 사용해 실제 텍스트 대화를 처리한다.
- `ManagerRealtimeConsole`은 Realtime 음성 연결과 관리 명령을 처리한다.
- 서버는 조회 명령과 발송 명령을 구분하며, 발송 명령은 보류 액션을 만든 뒤 관리인의 명시적 확인을 요구한다.

현재는 진입점, 홈 텍스트 코파일럿, 전체 화면 음성 비서가 서로 분리되어 있다. 이번 작업에서는 이 세 표면을 하나의 관리자 AI 패널로 통합한다.

## 3. 범위

### 포함

- 관리자 전 화면에서 접근 가능한 플로팅 AI 버튼
- Living과 동일한 텍스트/음성 모드 선택 단계
- 패널 안에서 텍스트 대화와 음성 통화 전환
- 기존 관리자 코파일럿 텍스트 API 연결
- 기존 관리자 Realtime 음성 API 연결
- 텍스트와 음성 transcript의 한 대화 흐름 표시
- 발송 전 확인 카드의 승인, 취소 및 독촉 문구 수정
- 네트워크 오류, AI 미설정, 마이크 권한 거부, 음성 연결 실패 상태
- 키보드와 스크린리더를 고려한 대화상자 접근성

### 제외

- Living 임차인 챗봇의 실제 AI 백엔드 구현
- 새로운 AI 모델 또는 AI 공급자 도입
- 관리자 명령 allowlist 확대
- 자동 발송 또는 음성만으로 발송을 확정하는 기능
- 대화 이력의 데이터베이스 영속화
- Docker, CI/CD, AWS 및 배포 설정 변경

## 4. 사용자 경험

### 4.1 진입

- `ManagerAppShell` 우측 하단에 `AI 비서` 플로팅 버튼을 표시한다.
- 버튼을 누르면 모달형 패널이 열린다.
- 새 세션의 첫 화면은 `Text Chat`과 `Voice Call` 두 카드를 보여준다.
- 세션 중 패널을 닫았다 다시 열면 현재 페이지가 유지되는 동안 마지막 모드와 transcript를 유지한다.

### 4.2 텍스트 모드

- 상단에는 `ROOMLOG AI Assistant`와 현재 모드를 표시한다.
- 중앙에는 사용자 메시지, AI 답변, 실행 영수증, 보류 액션 카드를 시간순으로 표시한다.
- 하단 입력창에서 Enter로 전송하고 Shift+Enter로 줄바꿈한다.
- 응답 대기 중에는 중복 전송을 막고 진행 상태를 표시한다.
- AI가 설정되지 않았으면 입력을 비활성화하고 운영 설정이 필요하다는 안내를 표시한다.

### 4.3 음성 모드

- 음성 모드 진입 직후 자동으로 마이크를 켜지 않는다. 사용자가 `통화 시작`을 눌러야 권한 요청과 연결을 시작한다.
- `연결 준비`, `연결 중`, `듣는 중`, `AI 응답 중`, `연결 종료`, `오류` 상태를 구분해 표시한다.
- 사용자 음성과 AI 응답 transcript를 텍스트 모드와 같은 대화 로그에 누적한다.
- 통화 중에도 텍스트 모드로 전환할 수 있다. 전환 시 활성 음성 연결은 명시적으로 종료해 백그라운드 마이크 사용을 방지한다.
- 음성 명령이 발송 작업을 만들면 음성으로 즉시 실행하지 않고 확인 카드를 표시한다.

### 4.4 모드 전환

- 대화 화면 하단에 Living과 동일한 텍스트/음성 토글을 제공한다.
- 모드 전환은 transcript와 보류 액션을 지우지 않는다.
- 보류 액션이 있는 동안에도 모드 전환은 가능하지만, 확인 또는 취소 전에는 새 발송 명령을 만들 수 없다.
- 패널을 닫으면 활성 음성 연결과 마이크를 종료한다.

## 5. 컴포넌트 설계

```text
ManagerAppShell
└─ ManagerAiAssistant
   ├─ ManagerAssistantLauncher
   ├─ ManagerAssistantDialog
   │  ├─ ManagerAssistantModePicker
   │  ├─ ManagerAssistantTranscript
   │  │  ├─ TranscriptBubble
   │  │  ├─ ReceiptEntry
   │  │  └─ ManagerAssistantActionCard
   │  ├─ ManagerTextComposer
   │  ├─ ManagerVoiceControls
   │  └─ ManagerAssistantModeToggle
   └─ hooks
      ├─ useManagerAssistantSession
      └─ useManagerRealtimeSession
```

### `ManagerAiAssistant`

- 패널 열림 여부와 세션 수명을 관리한다.
- 현재 관리자 화면의 context label과 홈 브리핑 데이터를 선택적으로 받는다.
- 기존 `ManagerAssistantLauncher`와 홈 `CopilotPanel`의 중복 진입 UI를 대체한다.

### `useManagerAssistantSession`

- 현재 모드, 선택 단계, transcript, 전송 중 상태, 오류, 보류 액션을 관리한다.
- 텍스트 API 응답과 Realtime transcript를 동일한 transcript 모델로 정규화한다.
- 보류 액션 승인, 취소, 독촉 문구 수정 요청을 처리한다.
- UI 컴포넌트가 API 응답 구조에 직접 의존하지 않도록 한다.

### `useManagerRealtimeSession`

- 기존 `ManagerRealtimeConsole`의 WebRTC와 Realtime 이벤트 처리 로직을 추출한다.
- 연결 시작과 종료, 마이크 스트림 정리, transcript 이벤트 전달을 책임진다.
- 관리자 명령 결과를 `useManagerAssistantSession`이 소비할 수 있는 이벤트로 전달한다.
- 컴포넌트 unmount, 패널 닫기, 텍스트 모드 전환 시 연결과 미디어 트랙을 반드시 종료한다.

## 6. 공유 타입

`packages/types`의 기존 관리자 코파일럿 타입을 확장해 다음 UI 독립 계약을 둔다.

- `ManagerAssistantMode`: `"text" | "voice"`
- `ManagerAssistantConnectionState`: 음성 연결 상태 enum
- `ManagerAssistantTranscriptEntry`: 사용자, AI, 시스템, 영수증 항목의 판별 유니온

API 요청/응답 계약은 기존 `ManagerCopilotChatRequest`, `ManagerCopilotChatResponse`, Realtime client-secret 및 command 계약을 유지한다. UI 상태 타입과 서버 계약을 분리해 향후 대화 영속화를 추가해도 패널 컴포넌트 변경을 최소화한다.

## 7. 데이터 흐름

### 텍스트

```text
관리자 입력
→ useManagerAssistantSession
→ /api/manager/copilot/chat
→ Nest manager/copilot/chat
→ OpenAI tool call
→ 서버 allowlist 명령 실행 또는 보류 액션 생성
→ 답변/확인 카드/영수증
→ 통합 transcript 렌더
```

### 음성

```text
통화 시작
→ Realtime client-secret 발급
→ 브라우저 WebRTC 연결
→ 사용자 음성 transcript
→ Realtime tool call
→ 서버 manager/agent/realtime/command
→ 조회 결과 또는 보류 액션
→ AI 음성 + 통합 transcript + 확인 카드
```

## 8. 안전 및 권한

- 모든 관리자 API는 현재와 동일하게 `LANDLORD` 역할을 요구한다.
- AI가 호출할 수 있는 명령은 기존 서버 allowlist에 한정한다.
- `billing.send_dunning`, `messaging.send_reply`는 텍스트와 음성 모두 보류 액션을 거친다.
- 독촉은 청구 전용 채널, 납부 신고 및 미연결 입금 차단 규칙을 유지한다.
- AI 답변은 초안과 조회 결과이며 결제, 계약 확정 또는 책임 판단으로 표시하지 않는다.
- 브라우저에 OpenAI API key를 노출하지 않고 기존 임시 Realtime client-secret 방식만 사용한다.

## 9. 오류 처리

- 텍스트 API 실패: 대화 로그에 재시도 가능한 시스템 메시지를 추가한다.
- OpenAI 미설정: 입력을 잠그고 설정 필요 안내를 표시하되 관리자 원천 화면 링크는 유지한다.
- 마이크 권한 거부: 권한이 필요한 이유와 브라우저 설정 확인 방법을 표시한다.
- 음성 연결 실패: 미디어 트랙을 정리하고 텍스트 모드 전환 버튼을 제공한다.
- 보류 액션 만료 또는 다른 관리자 소유: 서버 오류를 그대로 실행 실패로 처리하고 새 확인 카드 생성을 유도한다.
- 패널 닫기: 진행 중 fetch를 UI에서 무시하고 Realtime 연결 및 마이크를 종료한다.

## 10. 스타일 및 접근성

- 신규 스타일 값은 `packages/ui/src/tokens.css`의 CSS 변수만 사용한다.
- 임의의 raw hex, rgba 색상 및 고정 그림자 값을 추가하지 않는다.
- 데스크톱에서는 우측 패널형 모달, 좁은 화면에서는 화면 폭에 맞는 하단 시트형으로 표시한다.
- 모달은 제목, 닫기 버튼, 포커스 이동, Escape 닫기, backdrop 닫기를 지원한다.
- transcript는 `role="log"`, 상태 메시지는 `aria-live`, 모드 선택은 명확한 버튼 이름을 사용한다.
- 음성 연결 상태를 색상만으로 전달하지 않고 텍스트와 아이콘을 함께 사용한다.

## 11. 기능 슬라이스와 검증

### 슬라이스 1: 공통 셸과 모드 선택

- 공유 UI 상태 타입 추가
- 관리자 전역 플로팅 버튼과 대화상자 추가
- Text Chat/Voice Call 선택 및 모드 토글 구현
- 기존 미사용 진입 UI와의 중복을 제거할 준비만 하고 실제 API 로직은 연결하지 않는다.

검증:

- 모드 선택, 토글, 닫기 및 다시 열기 상태 테스트
- 대화상자 접근성 계약 테스트
- `packages/types` 빌드 및 web 단위 테스트

통과 후 슬라이스 1만 커밋하고 `kms-manager-agent`에 푸시한다.

### 슬라이스 2: 텍스트 코파일럿 통합

- `CopilotPanel`의 대화 상태를 공통 세션 훅으로 이동
- 텍스트 입력, preset, 오류, 영수증, 보류 액션 연결
- 홈과 전역 AI 진입점이 하나의 패널을 사용하도록 정리

검증:

- 메시지 전송과 최근 대화 변환 테스트
- AI 미설정 및 API 오류 테스트
- 보류 액션 승인, 취소, 독촉 문구 수정 테스트
- 관련 web/API 단위 테스트

통과 후 슬라이스 2만 커밋하고 푸시한다.

### 슬라이스 3: 음성 모드 통합

- Realtime 로직을 재사용 가능한 훅으로 추출
- 패널 내부 통화 시작, 종료, 상태 표시 구현
- 음성과 텍스트 transcript 통합
- 음성 발송 명령도 확인 카드로 연결

검증:

- Realtime 이벤트 reducer 및 transcript 테스트
- 연결 종료 시 peer connection과 media track 정리 테스트
- 음성 발송 확인 게이트 테스트
- 관련 web/API 단위 테스트

통과 후 슬라이스 3만 커밋하고 푸시한다.

### 슬라이스 4: 전역 적용과 중복 제거

- 관리자 전체 `ManagerAppShell`에서 통합 챗봇 사용
- 기존 홈 전용 코파일럿 모달과 별도 단순 AI 비서 패널의 중복 제거
- 홈 브리핑은 통합 챗봇을 여는 진입점으로 유지
- 별도 Realtime 전체 화면 경로는 호환용 진입 경로로 유지하되 통합 패널 사용을 기본으로 한다.

검증:

- `pnpm test:web`
- `pnpm test:api`
- `bash scripts/verify.sh`
- 필요 시 `docker compose up -d --build web` 후 관리자 주요 화면에서 텍스트/음성 전환과 확인 카드 브라우저 검증

통과 후 슬라이스 4만 커밋하고 푸시한다.

## 12. 완료 기준

- 관리자 어느 화면에서든 같은 플로팅 버튼으로 AI 패널을 열 수 있다.
- 처음 열었을 때 Text Chat과 Voice Call을 선택할 수 있다.
- 패널을 닫지 않고 텍스트와 음성을 전환할 수 있다.
- 텍스트와 음성 transcript가 하나의 대화 로그에 유지된다.
- 기존 관리자 조회 명령이 동작한다.
- 모든 발송 명령은 확인 카드 승인 전 실행되지 않는다.
- 패널 닫기와 모드 전환 시 마이크 및 Realtime 연결이 남지 않는다.
- 관련 단위 테스트, web/API 테스트와 기본 검증 스크립트가 통과한다.
- 인프라 파일을 수정하지 않는다. 필요성이 발견되면 로컬 인프라 가드 형식으로 먼저 보고한다.
