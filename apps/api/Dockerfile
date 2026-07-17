# `# syntax=docker/dockerfile:1` 지시어는 의도적으로 없음 — frontend 이미지 resolve가
# 로컬 Docker Desktop에서 반복적으로 DeadlineExceeded를 내서, BuildKit 내장 frontend를 쓴다
# (--mount=type=cache는 내장 frontend도 지원).
# 베이스 이미지는 digest로 고정 — FROM 태그 조회 네트워크 왕복 최소화(빌드 타임아웃 완화).
# node 버전 올릴 때: docker pull node:<태그> 후 RepoDigests 값으로 교체.
FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS base

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
RUN mkdir -p /usr/local/share/ca-certificates
# AWS RDS 글로벌 CA 번들은 레포에 벤더링해 COPY — ADD <URL>의 매 빌드 외부 확인 제거.
# 갱신: curl -fsS -o apps/api/certs/aws-rds-global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
COPY apps/api/certs/aws-rds-global-bundle.pem /usr/local/share/ca-certificates/aws-rds-global-bundle.pem
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/aws-rds-global-bundle.pem

FROM base AS builder

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/types/package.json packages/types/package.json
COPY prisma prisma
COPY prisma.config.ts prisma.config.ts

# pnpm store를 캐시 마운트로 영속화 — lockfile이 바뀌어도 바뀐 패키지만 받는다(콜드 전량 다운로드 제거).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --filter api --frozen-lockfile --store-dir /pnpm/store
RUN pnpm --filter api exec prisma generate --schema ../../prisma/schema.prisma

COPY packages/types packages/types
COPY apps/api apps/api
COPY scripts/reconstruct scripts/reconstruct

RUN pnpm --filter api build
RUN pnpm --filter api deploy --legacy --prod /prod/api
RUN builder_client_root="$(dirname "$(dirname "$(readlink -f apps/api/node_modules/@prisma/client)")")" \
    && deployed_client_root="$(dirname "$(dirname "$(readlink -f /prod/api/node_modules/@prisma/client)")")" \
    && cp -R "$builder_client_root/.prisma" "$deployed_client_root/.prisma"

FROM base AS runner

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=builder /prod/api /app/apps/api
COPY --from=builder /app/apps/api/dist /app/apps/api/dist
COPY --from=builder /app/prisma /app/prisma
COPY --from=builder /app/packages/types ./packages/types
# GPU 오케스트레이터가 SSM으로 원격에 실을 재구성 스크립트(base64 인라인 소스). buildJobCommand가 /app/scripts/reconstruct에서 읽는다.
COPY --from=builder /app/scripts/reconstruct /app/scripts/reconstruct
RUN ln -sfn /app/packages/types /app/apps/api/node_modules/@roomlog/types

EXPOSE 4000

CMD ["node", "apps/api/dist/main"]
