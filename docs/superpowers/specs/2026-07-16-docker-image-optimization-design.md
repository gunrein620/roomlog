# Docker Image Optimization Design

## Goal

Production behavior stays unchanged while the web image uses Next.js standalone output and the API image avoids installing dependencies and generating Prisma Client twice.

## Scope

- Enable Next.js standalone output for `apps/web`.
- Package only the standalone server, static assets, and public assets in the web runtime image.
- Install API build dependencies and generate Prisma Client once.
- Use `pnpm deploy --prod` to create the API runtime dependency tree.
- Preserve the existing ports, environment variables, Compose service names, migration command, RDS CA bundle, GPU reconstruction scripts, and health behavior.
- Do not change deployment orchestration, conditional service builds, registry caching, EC2 storage, or unrelated application code.

## Web Image Design

`apps/web/next.config.ts` sets `output: "standalone"`. The builder continues compiling the monorepo with the existing public build arguments and transpiled workspace packages.

The web runtime stage starts from the pinned Node Alpine base instead of the dependency stage. It copies:

- `apps/web/public`
- `apps/web/.next/standalone`
- `apps/web/.next/static`

The container runs the generated server with `node apps/web/server.js`, binds to port 3000, and sets `HOSTNAME=0.0.0.0`. Runtime-only OAuth and API environment variables continue to come from Docker Compose.

## API Image Design

The API build stage installs the full API dependency graph once, generates Prisma Client once, builds NestJS, and then runs `pnpm deploy --filter api --prod /prod/api`. The deployed directory is a production-only API package with its runtime dependency tree.

The API runtime stage starts from the same pinned base and copies the deployed package, compiled output, Prisma schema and configuration, migration scripts, SQL fixture, shared types runtime files, RDS CA certificate, and GPU reconstruction scripts. It does not execute `pnpm install` or `prisma generate`.

The runtime command remains semantically equivalent to the current `start:prod` command and starts the compiled NestJS entry point. The migration Compose service continues using the API image and `node apps/api/scripts/migrate-database.mjs`.

## Error Handling and Compatibility

- A missing standalone server or API deployment output must fail the Docker build during `COPY`.
- The production web server must remain reachable on port 3000.
- The production API must remain reachable on port 4000 and retain its database health check.
- Prisma migrations must still execute from the final API image before API startup.
- No secrets are embedded in either image.

## Testing

Regression tests in `apps/web/property-shell.spec.mjs` assert:

- Next.js standalone output is enabled.
- The web runner copies standalone/static/public output and starts `server.js`.
- The web runner no longer inherits the dependency stage.
- The API Dockerfile contains exactly one full install and one Prisma generation.
- The API builder creates a production deployment with `pnpm deploy --prod`.
- The API runner performs neither installation nor Prisma generation.
- Existing RDS certificate and migration assets remain present.

Verification runs the focused Docker contract tests, the relevant package builds, production Docker image builds, migration execution against the Docker PostgreSQL service, and API/web container health checks. The pre-existing 21 `property-shell.spec.mjs` failures on `origin/main` are recorded separately and are not attributed to this change.

## Success Criteria

- Web and API production images build successfully.
- The web final image contains the standalone runtime rather than the full development dependency tree.
- The API Dockerfile executes one `pnpm install` and one `prisma generate` across all stages.
- The migration container completes successfully.
- Web and API containers start and return successful health responses.
- No application-facing behavior or deployment interface changes.
