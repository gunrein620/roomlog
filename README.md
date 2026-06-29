# 입주민 하자 상담 AI 데모

OpenAI Realtime API의 음성 응답 속도와 대화 자연스러움을 모바일 브라우저에서 테스트하기 위한 아주 작은 데모입니다. 서버는 API key를 `.env`에서만 읽고, 브라우저는 WebRTC SDP offer를 `/session`에 보내 Realtime API와 연결합니다.

## 설치

Node.js 20 LTS 이상을 권장합니다.

```bash
npm install
cp .env.example .env
npm run dev
```

`.env`의 `OPENAI_API_KEY`에 OpenAI API key를 입력하세요.

```bash
OPENAI_API_KEY=sk-your-openai-api-key
PORT=3000
REALTIME_MODEL=gpt-realtime-2
REALTIME_VOICE=marin
```

## 로컬 PC 테스트

브라우저에서 다음 주소로 접속합니다.

```text
http://localhost:3000
```

## 모바일 테스트

같은 Wi-Fi에 연결된 휴대폰에서 노트북의 로컬 IP로 접속할 수 있습니다.

```text
http://노트북-IP:3000
```

모바일 브라우저의 마이크 권한이나 보안 컨텍스트 문제가 있으면 HTTPS 터널을 쓰는 편이 편합니다.

```bash
ngrok http 3000
```

또는 cloudflared tunnel을 사용해도 됩니다.

## 테스트 시나리오

1. “상담 시작”을 누릅니다.
2. 말로 “에어컨에 문제가 있어요”라고 말합니다.
3. AI가 물으면 “냄새가 심해요”라고 답합니다.
4. “사진 업로드”로 에어컨 필터 사진 아무거나 업로드합니다.
5. AI가 계약 특약 확인, 하자 티켓 생성, 업체 견적 요청 tool call 흐름을 타는지 확인합니다.
6. “업체 견적 도착 시뮬레이션”을 누릅니다.
7. AI가 방문 예정과 처리 결과를 짧게 안내하는지 확인합니다.

## 주요 파일

- `server.js`: Express 서버, 정적 파일 서빙, `/session` Realtime WebRTC SDP bridge.
- `public/index.html`: 모바일 우선 단일 화면 UI.
- `public/app.js`: WebRTC 연결, data channel 이벤트 처리, mock tool executor, 사진 리사이즈.
- `public/styles.css`: 모바일에서 누르기 쉬운 간단한 반응형 스타일.
- `.env.example`: 필요한 환경 변수 예시.

## 보안 주의

- `OPENAI_API_KEY`는 절대 브라우저 코드에 넣지 마세요.
- 이 데모의 tool executor는 브라우저 mock입니다.
- 프로덕션에서는 계약 확인, 티켓 생성, 견적 요청, 결제/승인 처리를 서버 사이드와 관리자 승인 플로우로 옮겨야 합니다.

## 문제 해결

### `OPENAI_API_KEY` 없음

서버 시작 시 다음 메시지가 나오면 `.env` 파일을 만들고 API key를 넣으세요.

```text
OPENAI_API_KEY is missing. Copy .env.example to .env and set OPENAI_API_KEY.
```

### 마이크 권한 거부

브라우저 주소창의 사이트 설정에서 마이크 권한을 허용한 뒤 새로고침하세요. iOS Safari는 HTTPS 환경에서 더 안정적입니다.

### 브라우저 자동재생 문제

반드시 “상담 시작” 버튼을 직접 눌러 시작하세요. 그래도 소리가 안 나면 화면의 transcript와 이벤트 로그를 먼저 확인하세요.

### 모바일 접속 문제

노트북과 휴대폰이 같은 Wi-Fi에 있는지 확인하세요. 회사/학교 Wi-Fi는 기기 간 접속을 막을 수 있으니 ngrok 또는 cloudflared 같은 HTTPS 터널을 사용하세요.

### Realtime 모델 접근 권한/요금제 문제

`/session` 요청 실패 시 서버 콘솔과 화면 상단 에러 박스에 OpenAI 응답 status와 본문이 표시됩니다. 모델 접근 권한이나 계정 결제 상태를 확인하세요.

### 브라우저 콘솔 확인

데스크톱 브라우저에서는 개발자 도구 콘솔과 네트워크 탭을 확인하세요. 모바일 Safari는 Mac Safari의 Develop 메뉴로 원격 디버깅할 수 있습니다.
