FROM node:24-alpine AS base

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

FROM base AS deps

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/tenant/package.json apps/tenant/package.json

RUN pnpm install --filter tenant --frozen-lockfile

FROM deps AS builder

ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_BASE_PATH=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH

COPY apps/tenant apps/tenant

RUN pnpm --filter tenant build

FROM base AS runner

ENV NODE_ENV=production
ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_BASE_PATH=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/tenant/package.json apps/tenant/package.json

RUN pnpm install --filter tenant --prod --frozen-lockfile

COPY --from=builder /app/apps/tenant ./apps/tenant

EXPOSE 3001

CMD ["pnpm", "--filter", "tenant", "start"]
