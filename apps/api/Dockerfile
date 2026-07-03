FROM node:24-alpine AS base

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
RUN mkdir -p /usr/local/share/ca-certificates
ADD https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /usr/local/share/ca-certificates/aws-rds-global-bundle.pem
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/aws-rds-global-bundle.pem

FROM base AS deps

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY prisma prisma
COPY prisma.config.ts prisma.config.ts

RUN pnpm install --filter api --frozen-lockfile
RUN pnpm --filter api exec prisma generate --schema ../../prisma/schema.prisma

FROM deps AS builder

COPY apps/api apps/api

RUN pnpm --filter api build

FROM base AS runner

ENV NODE_ENV=production
ENV PORT=4000

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY prisma prisma
COPY prisma.config.ts prisma.config.ts

RUN pnpm install --filter api --prod --frozen-lockfile
RUN pnpm --filter api exec prisma generate --schema ../../prisma/schema.prisma

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY apps/api/assets ./apps/api/assets

EXPOSE 4000

CMD ["sh", "-c", "pnpm --filter api exec prisma db push --config ../../prisma.config.ts && pnpm --filter api start:prod"]
