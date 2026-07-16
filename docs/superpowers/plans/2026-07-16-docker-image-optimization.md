# Docker Image Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce production Docker build and image export time by packaging the Next.js standalone runtime and eliminating the API runner's second dependency installation and Prisma generation.

**Architecture:** The web builder emits Next.js standalone output and a minimal Node runner copies only standalone, static, and public artifacts. The API builder installs once, generates Prisma once, compiles NestJS, and uses `pnpm --filter api deploy --prod` to assemble a production runtime tree copied into a clean runner stage.

**Tech Stack:** Docker BuildKit, Docker Compose, Next.js 16 standalone output, NestJS 11, pnpm 11 deploy, Prisma 7, Node.js 24 Alpine

## Global Constraints

- Preserve ports 3000 and 4000, current Compose service names, environment variables, migration command, RDS CA bundle, SQL fixture, and GPU reconstruction scripts.
- Do not change deployment orchestration, service-change detection, external cache configuration, EC2 storage, or application behavior.
- Do not modify or absorb the user's existing `.env.example` change in the main checkout.
- Treat the 21 pre-existing `apps/web/property-shell.spec.mjs` failures on `origin/main` as baseline failures; require all new focused tests and Docker integration checks to pass.
- Use `bash scripts/verify.sh` for the repository-wide final check and report baseline failures honestly if they remain.

---

### Task 1: Add Docker Packaging Contract Tests

**Files:**
- Modify: `apps/web/property-shell.spec.mjs`

**Interfaces:**
- Consumes: Dockerfile and Next config text already loaded as `webDockerfileSource`, `apiDockerfileSource`, and `nextConfigSource`.
- Produces: focused source-contract tests that fail on the current Dockerfiles and pass only after both packaging optimizations exist.

- [ ] **Step 1: Replace the old web runtime assertions with standalone assertions**

Update the existing `serves role frontends from the single web container on port 3000` test so its Docker assertions are:

```js
  assert.match(nextConfigSource, /output:\s*["']standalone["']/);
  assert.match(webDockerfileSource, /FROM base AS runner/);
  assert.match(webDockerfileSource, /COPY --from=builder \/app\/apps\/web\/.next\/standalone/);
  assert.match(webDockerfileSource, /COPY --from=builder \/app\/apps\/web\/.next\/static \/app\/apps\/web\/.next\/static/);
  assert.match(webDockerfileSource, /COPY --from=builder \/app\/apps\/web\/public \/app\/apps\/web\/public/);
  assert.match(webDockerfileSource, /ENV HOSTNAME=0\.0\.0\.0/);
  assert.match(webDockerfileSource, /EXPOSE 3000/);
  assert.match(webDockerfileSource, /CMD \["node", "apps\/web\/server\.js"\]/);
  assert.doesNotMatch(webDockerfileSource, /FROM deps AS runner/);
```

- [ ] **Step 2: Add an API single-install packaging test**

Add:

```js
test("packages the production API without reinstalling dependencies in the runner", () => {
  assert.equal(apiDockerfileSource.match(/pnpm install/g)?.length, 1);
  assert.equal(apiDockerfileSource.match(/prisma generate/g)?.length, 1);
  assert.match(apiDockerfileSource, /pnpm --filter api deploy --prod \/prod\/api/);

  const runnerSource = requireSourceMatch(
    apiDockerfileSource,
    /FROM base AS runner[\s\S]*$/,
    "api runner stage",
  );
  assert.doesNotMatch(runnerSource, /pnpm install/);
  assert.doesNotMatch(runnerSource, /prisma generate/);
  assert.match(runnerSource, /COPY --from=builder \/prod\/api \/app\/apps\/api/);
  assert.match(runnerSource, /COPY --from=builder \/app\/prisma \/app\/prisma/);
  assert.match(runnerSource, /COPY --from=builder \/app\/scripts\/reconstruct \/app\/scripts\/reconstruct/);
  assert.match(runnerSource, /CMD \["node", "apps\/api\/dist\/main"\]/);
});
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
node --test --test-name-pattern='serves role frontends|packages the production API' apps/web/property-shell.spec.mjs
```

Expected: both selected tests fail because standalone output, `pnpm deploy`, and minimal runner stages are absent.

- [ ] **Step 4: Commit the failing contracts**

```bash
git add apps/web/property-shell.spec.mjs
git commit -m "test(docker): require minimal production images"
```

---

### Task 2: Package the Next.js Standalone Runtime

**Files:**
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/Dockerfile`
- Test: `apps/web/property-shell.spec.mjs`

**Interfaces:**
- Consumes: the existing Next build arguments and monorepo root configuration.
- Produces: `apps/web/.next/standalone/apps/web/server.js`, `.next/static`, and public assets in a minimal runtime image.

- [ ] **Step 1: Enable standalone output**

Add to `nextConfig`:

```ts
  output: "standalone",
  outputFileTracingRoot: join(__dirname, "..", ".."),
```

- [ ] **Step 2: Replace the web runner stage**

Replace `FROM deps AS runner` and its runtime copies/command with:

```dockerfile
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
```

- [ ] **Step 3: Run the focused web contract and verify GREEN**

Run:

```bash
node --test --test-name-pattern='serves role frontends' apps/web/property-shell.spec.mjs
```

Expected: selected test passes; unrelated tests are skipped.

- [ ] **Step 4: Build the web package locally**

Run:

```bash
pnpm --filter web build
test -f apps/web/.next/standalone/apps/web/server.js
```

Expected: Next build exits 0 and the standalone server exists.

- [ ] **Step 5: Commit the web optimization**

```bash
git add apps/web/next.config.ts apps/web/Dockerfile
git commit -m "perf(web): ship standalone production image"
```

---

### Task 3: Deploy API Production Dependencies Once

**Files:**
- Modify: `apps/api/Dockerfile`
- Test: `apps/web/property-shell.spec.mjs`

**Interfaces:**
- Consumes: the API workspace package, compiled `dist`, generated Prisma Client, shared `@roomlog/types`, migration scripts, SQL fixture, RDS certificate, and reconstruction scripts.
- Produces: `/prod/api` containing the production API package and runtime dependencies for the clean runner stage.

- [ ] **Step 1: Collapse API deps and builder stages**

Keep the existing `base` stage, then define the builder so it copies dependency manifests, installs once, generates Prisma once, copies sources, builds, and deploys:

```dockerfile
FROM base AS builder

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/types/package.json packages/types/package.json
COPY prisma prisma
COPY prisma.config.ts prisma.config.ts

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --filter api --frozen-lockfile --store-dir /pnpm/store
RUN pnpm --filter api exec prisma generate --schema ../../prisma/schema.prisma

COPY packages/types packages/types
COPY apps/api apps/api
COPY scripts/reconstruct scripts/reconstruct

RUN pnpm --filter api build
RUN pnpm --filter api deploy --prod /prod/api
```

- [ ] **Step 2: Build a clean API runner without install commands**

Use:

```dockerfile
FROM base AS runner

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=builder /prod/api /app/apps/api
COPY --from=builder /app/apps/api/dist /app/apps/api/dist
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=builder /app/prisma /app/prisma
COPY --from=builder /app/prisma.config.ts /app/prisma.config.ts
COPY --from=builder /app/packages/types /app/packages/types
COPY --from=builder /app/scripts/reconstruct /app/scripts/reconstruct

EXPOSE 4000

CMD ["node", "apps/api/dist/main"]
```

The `/prod/api` copy contains package metadata, tracked migration assets, and production dependencies. The explicit `dist` copy avoids package-packlist rules excluding the gitignored build directory. Root workspace metadata keeps the migration script's existing `pnpm --filter api exec prisma` command valid. The explicit shared types and reconstruction copies preserve runtime file reads and workspace package imports.

- [ ] **Step 3: Run the focused API contract and verify GREEN**

Run:

```bash
node --test --test-name-pattern='packages the production API|api image trusts' apps/web/property-shell.spec.mjs
```

Expected: both selected tests pass; unrelated tests are skipped.

- [ ] **Step 4: Build the API package locally**

Run:

```bash
pnpm --filter api build
deploy_check_dir="$(mktemp -d /tmp/roomlog-api-deploy-check.XXXXXX)"
pnpm --filter api deploy --prod "$deploy_check_dir"
test -f apps/api/dist/main.js
test -f "$deploy_check_dir/scripts/migrate-database.mjs"
```

Expected: build and deploy exit 0 and both runtime entry points exist.

- [ ] **Step 5: Commit the API optimization**

```bash
git add apps/api/Dockerfile
git commit -m "perf(api): deploy production dependencies once"
```

---

### Task 4: Verify Production Images and Runtime Compatibility

**Files:**
- Verify: `apps/web/next.config.ts`
- Verify: `apps/web/Dockerfile`
- Verify: `apps/api/Dockerfile`
- Verify: `docker-compose.prod.yml`

**Interfaces:**
- Consumes: both optimized Docker images and the existing production Compose contract.
- Produces: fresh evidence that images build, migrations run, services start, and health endpoints respond.

- [ ] **Step 1: Run all Docker packaging contracts**

Run:

```bash
node --test --test-name-pattern='serves role frontends|packages the production API|api image trusts' apps/web/property-shell.spec.mjs
```

Expected: selected tests pass with zero failures.

- [ ] **Step 2: Build production images with timing and inspect sizes**

Run:

```bash
/usr/bin/time -p docker compose -f docker-compose.prod.yml build web api
docker image inspect roomlog-web:latest roomlog-api:deploy --format '{{.RepoTags}} {{.Size}}'
```

Expected: both images build successfully and their byte sizes are printed for comparison with the previous images.

- [ ] **Step 3: Run migration and services against the Docker PostgreSQL test environment**

Run the repository's Docker-backed verification path without exposing production secrets:

```bash
bash scripts/verify.sh
```

Expected: types, UI, web and API builds complete; report the known baseline test state separately if the script reaches the pre-existing 21 UI contract failures.

- [ ] **Step 4: Smoke-test image entry points**

Run the optimized images in the standard local Docker stack or isolated containers, then verify:

```bash
curl -fsS http://127.0.0.1:4000/api/health
curl -fsS -o /dev/null http://127.0.0.1:3000/
```

Expected: API returns status `ok` with database status `ok`; web returns HTTP success.

- [ ] **Step 5: Review the final diff and commit any verification-only contract adjustment**

Run:

```bash
git diff origin/main...HEAD --check
git status --short
git log --oneline origin/main..HEAD
```

Expected: no whitespace errors, no uncommitted implementation files, and only the design, plan, tests, and Docker optimization commits are present.
