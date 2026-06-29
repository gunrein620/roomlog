# Roomlog

Roomlog는 임대/임차 관리를 위한 초기 모노레포 프로젝트입니다. 프론트엔드는 Next.js, 백엔드는 NestJS로 구성하며, EC2에서는 Docker Compose로 `nginx`, `web`, `api` 컨테이너를 함께 실행합니다. PostgreSQL은 별도 컨테이너를 띄우지 않고 AWS RDS PostgreSQL에 연결하는 구조입니다.

## Project Structure

```text
roomlog/
├─ apps/
│  ├─ web/          # Next.js frontend
│  └─ api/          # NestJS backend
├─ nginx/
│  └─ default.conf
├─ docker-compose.yml
├─ docker-compose.prod.yml
├─ .env.example
├─ package.json
├─ pnpm-workspace.yaml
└─ README.md
```

## Local Development

필요하면 `.env.example`을 참고해 루트에 `.env` 파일을 만듭니다. 기본 로컬 값은 다음과 같습니다.

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
PORT=4000
```

개별 앱을 로컬에서 실행할 때는 다음 명령을 사용합니다.

```bash
pnpm install
pnpm dev:web
pnpm dev:api
```

## Docker Compose

로컬에서 전체 서비스를 한 번에 실행합니다.

```bash
docker compose up --build
```

종료할 때는 다음 명령을 사용합니다.

```bash
docker compose down
```

확인 URL:

- Nginx: `http://localhost`
- Next.js 직접 접근: `http://localhost:3000`
- NestJS 직접 접근: `http://localhost:4000/api/health`
- Nginx API 프록시: `http://localhost/api/health`

## EC2 Deployment

EC2 배포에는 `docker-compose.prod.yml`을 사용합니다.

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

프로덕션에서는 루트 `.env`에 RDS 연결 문자열을 설정합니다.

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@roomlog-db.xxxxxx.ap-northeast-2.rds.amazonaws.com:5432/postgres
NEXT_PUBLIC_API_URL=/api
PORT=4000
AWS_REGION=ap-northeast-2
S3_BUCKET_NAME=roomlog-files
```

`docker-compose.prod.yml`은 `DATABASE_URL`이 없으면 실행 단계에서 실패하도록 구성되어 있습니다. RDS 보안 그룹은 EC2 인스턴스에서 PostgreSQL 기본 포트 `5432`로 접근할 수 있게 열어야 합니다.

## Port Map

| Service | Container Port | Host Port | Description |
| --- | ---: | ---: | --- |
| Nginx | 80 | 80 | Browser entrypoint and reverse proxy |
| Next.js web | 3000 | 3000 | Frontend app |
| NestJS api | 4000 | 4000 | Backend API |
| RDS PostgreSQL | 5432 | 5432 | External AWS RDS database |

## Routing

```text
Browser
  ↓
Nginx :80
  ├─ /        -> web:3000
  └─ /api     -> api:4000
```

The backend health endpoint is:

```http
GET /api/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "roomlog-api"
}
```
