# Roomlog

Roomlog MVP는 하자 처리 E2E 흐름을 검증하는 모노레포입니다. 세입자, 관리자, 협력업체가 하나의 NestJS API와 공용 도메인 모델을 공유하고, 각 역할별 Next.js 앱에서 같은 티켓을 다르게 처리합니다.

## MVP Scope

- 세입자: 하자 신고 접수, AI 텍스트 분석 결과 확인, 처리 상태와 메시지 타임라인 조회
- 관리자: 티켓 큐 확인, AI 분석 검토, 추가정보 요청, 협력업체 배정, 완료 승인
- 협력업체: 배정된 수리 확인, 견적 제출, 방문 일정 입력, 완료 보고
- API: 데모 인증, 신고-티켓 분리, 상태 변경 이력, 로컬 JSON/PostgreSQL 영속화, OpenAI 상담 생성과 로컬 fallback

현재 MVP는 로컬 JSON 저장소로 바로 실행할 수 있고, `DATABASE_URL`이 있으면 PostgreSQL projector로 주요 운영 데이터를 영속화합니다. `OPENAI_API_KEY`가 있으면 AI 접수 상담은 OpenAI Responses/Realtime 경로를 사용하고, 없으면 로컬 안전 fallback으로 동작합니다. S3 연동은 아직 선택 설정이며 기본 파일 업로드는 로컬 저장소를 사용합니다.

## Project Structure

```text
roomlog/
├─ apps/
│  ├─ api/       # NestJS API
│  ├─ tenant/    # Next.js tenant app, port 3001
│  ├─ manager/   # Next.js manager app, port 3002
│  ├─ vendor/    # Next.js vendor app, port 3003
│  └─ web/       # legacy scaffold kept for reference
├─ docker-compose.yml
├─ docker-compose.prod.yml
├─ plan.md
└─ README.md
```

## Local Development

```bash
pnpm install
cp .env.example .env
pnpm dev:api
pnpm dev:tenant
pnpm dev:manager
pnpm dev:vendor
```

Open the apps directly:

- Tenant: `http://localhost:3001`
- Manager: `http://localhost:3002`
- Vendor: `http://localhost:3003`
- API health: `http://localhost:4000/api/health`

Demo accounts use `password123!`:

- `tenant@roomlog.test`
- `manager@roomlog.test`
- `vendor@roomlog.test`

## Environment

API가 실행되는 환경의 `.env`에 `OPENAI_API_KEY`가 있어야 OpenAI 상담/음성 기능이 활성화됩니다. 로컬과 `ssh rlog` 서버에서 같은 OpenAI 동작을 기대한다면 두 환경의 API용 `.env`에 같은 키를 넣어야 합니다.
텍스트 상담은 기본적으로 `OPENAI_CHAT_MODEL=gpt-5.5`를 사용하고, 필요하면 환경별 `.env`에서 다른 Responses API 모델로 바꿀 수 있습니다.

환경별로 달라져야 하는 값도 있습니다.

- 로컬 직접 실행 및 로컬 Docker Compose: `NEXT_PUBLIC_API_URL=http://localhost:4000`
- 운영 ALB 경유 실행: `NEXT_PUBLIC_API_URL=/api` 또는 운영 API 절대 URL
- Docker Compose 내부 DB: `DATABASE_URL=postgresql://roomlog:roomlog@postgres:5432/roomlog?schema=public`
- 호스트에서 Compose DB에 직접 접속: `DATABASE_URL=postgresql://roomlog:roomlog@localhost:5433/roomlog?schema=public`
- 운영 RDS: 운영 RDS 주소와 계정의 `DATABASE_URL`

`.env`를 바꾼 뒤 이미 Docker 컨테이너가 떠 있다면 API 컨테이너를 다시 만들어야 반영됩니다.

```bash
docker compose up -d --build api
```

## Demo Flow

1. Open the tenant app and submit the default defect report.
2. Open the manager app, refresh, select the new ticket, and assign the vendor.
3. Open the vendor app, refresh, submit an estimate, save a schedule, and report completion.
4. Return to the manager app and approve completion.
5. Refresh the tenant app to see the completed status.

## Docker Compose

```bash
docker compose up --build --remove-orphans
```

Local Docker URLs:

- Tenant: `http://localhost:3001`
- Manager: `http://localhost:3002`
- Vendor: `http://localhost:3003`
- API health: `http://localhost:4000/api/health`

## Verification

```bash
pnpm test:api
pnpm build:api
pnpm build:tenant
pnpm build:manager
pnpm build:vendor
```
