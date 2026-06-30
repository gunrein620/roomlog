FROM node:24-alpine AS base

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

FROM base AS deps

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/vendor/package.json apps/vendor/package.json

RUN pnpm install --filter vendor --frozen-lockfile

FROM deps AS builder

ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_BASE_PATH=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH

COPY apps/vendor apps/vendor

RUN pnpm --filter vendor build

FROM base AS runner

ENV NODE_ENV=production
ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_BASE_PATH=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/vendor/package.json apps/vendor/package.json

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/vendor/node_modules ./apps/vendor/node_modules

COPY --from=builder /app/apps/vendor ./apps/vendor

EXPOSE 3003

CMD ["pnpm", "--filter", "vendor", "start"]
