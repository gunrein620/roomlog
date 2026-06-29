FROM node:24-alpine AS base

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

FROM base AS deps

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json

RUN pnpm install --filter api --frozen-lockfile

FROM deps AS builder

COPY apps/api apps/api

RUN pnpm --filter api build

FROM base AS runner

ENV NODE_ENV=production
ENV PORT=4000

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json

RUN pnpm install --filter api --prod --frozen-lockfile

COPY --from=builder /app/apps/api/dist ./apps/api/dist

EXPOSE 4000

CMD ["pnpm", "--filter", "api", "start:prod"]
