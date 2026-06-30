# Roomlog

Roomlog MVP는 하자 처리 E2E 흐름을 검증하는 모노레포입니다. 세입자, 관리자, 협력업체가 하나의 NestJS API와 공용 도메인 모델을 공유하고, 각 역할별 Next.js 앱에서 같은 티켓을 다르게 처리합니다.

## MVP Scope

- 세입자: 하자 신고 접수, AI 텍스트 분석 결과 확인, 처리 상태와 메시지 타임라인 조회
- 관리자: 티켓 큐 확인, AI 분석 검토, 추가정보 요청, 협력업체 배정, 완료 승인
- 협력업체: 배정된 수리 확인, 견적 제출, 방문 일정 입력, 완료 보고
- API: 데모 인증, 신고-티켓 분리, 상태 변경 이력, 인메모리 저장소 기반 MVP 도메인

실제 PostgreSQL, Prisma, S3, OpenAI 호출은 다음 단계에서 붙일 수 있게 도메인 서비스 뒤로 남겨두었습니다. 현재 MVP는 로컬에서 바로 실행되는 인메모리 버전입니다.

## Project Structure

```text
roomlog/
├─ apps/
│  ├─ api/       # NestJS API
│  ├─ tenant/    # Next.js tenant app, port 3001
│  ├─ manager/   # Next.js manager app, port 3002
│  ├─ vendor/    # Next.js vendor app, port 3003
│  └─ web/       # legacy scaffold kept for reference
├─ nginx/
├─ docker-compose.yml
├─ docker-compose.prod.yml
├─ plan.md
└─ README.md
```

## Local Development

```bash
pnpm install
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

## Demo Flow

1. Open the tenant app and submit the default defect report.
2. Open the manager app, refresh, select the new ticket, and assign the vendor.
3. Open the vendor app, refresh, submit an estimate, save a schedule, and report completion.
4. Return to the manager app and approve completion.
5. Refresh the tenant app to see the completed status.

## Docker Compose

```bash
docker compose up --build
```

Nginx routes:

- `http://localhost/tenant`
- `http://localhost/manager`
- `http://localhost/vendor`
- `http://localhost/api/health`

## Verification

```bash
pnpm test:api
pnpm build:api
pnpm build:tenant
pnpm build:manager
pnpm build:vendor
```
