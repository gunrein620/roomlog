# syntax=docker/dockerfile:1
# 베이스 이미지는 digest로 고정 — FROM 태그 조회 네트워크 왕복 최소화(빌드 타임아웃 완화).
# node 버전 올릴 때: docker pull node:<태그> 후 RepoDigests 값으로 교체.
FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS base

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

FROM base AS deps

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json

# pnpm store를 캐시 마운트로 영속화 — lockfile이 바뀌어도 바뀐 패키지만 받는다(콜드 전량 다운로드 제거).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --filter web... --frozen-lockfile --store-dir /pnpm/store

FROM deps AS builder

ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=
ARG NEXT_PUBLIC_SOCKET_URL=
ARG NEXT_PUBLIC_TOSS_CLIENT_KEY=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=$NEXT_PUBLIC_NAVER_MAP_CLIENT_ID
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_TOSS_CLIENT_KEY=$NEXT_PUBLIC_TOSS_CLIENT_KEY

COPY assets assets
COPY packages packages
COPY apps/web apps/web

RUN pnpm --filter web build

FROM base AS runner

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=
ARG NEXT_PUBLIC_SOCKET_URL=
ARG NEXT_PUBLIC_TOSS_CLIENT_KEY=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=$NEXT_PUBLIC_NAVER_MAP_CLIENT_ID
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_TOSS_CLIENT_KEY=$NEXT_PUBLIC_TOSS_CLIENT_KEY

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static /app/apps/web/.next/static
COPY --from=builder /app/apps/web/public /app/apps/web/public

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
