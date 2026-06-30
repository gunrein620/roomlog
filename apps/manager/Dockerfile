FROM node:24-alpine AS base

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

FROM base AS deps

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/manager/package.json apps/manager/package.json

RUN pnpm install --filter manager --frozen-lockfile

FROM deps AS builder

ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_BASE_PATH=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH

COPY apps/manager apps/manager

RUN pnpm --filter manager build

FROM base AS runner

ENV NODE_ENV=production
ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_BASE_PATH=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/manager/package.json apps/manager/package.json

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/manager/node_modules ./apps/manager/node_modules

COPY --from=builder /app/apps/manager ./apps/manager

EXPOSE 3002

CMD ["pnpm", "--filter", "manager", "start"]
