# Production Database Target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move production migrations off the PostgreSQL `postgres` system database onto a dedicated `roomlog` database and prevent the invalid example from recurring.

**Architecture:** Inventory the current RDS database before mutation, create or reuse a dedicated target database without discarding existing data, then update the GitHub Actions secret and rerun deployment. Add a repository regression test so the documented production URL agrees with the migration bootstrap safety gate.

**Tech Stack:** PostgreSQL/RDS, Docker Compose, GitHub Actions, Node test runner, TypeScript.

## Global Constraints

- Never print or commit the full production `DATABASE_URL` or password.
- Do not replace a populated production database with an empty database without first preserving its application data.
- Keep the existing API recovery behavior during failed migrations.
- Run deployment through the existing GitHub Actions workflow.

---

### Task 1: Inventory production database state

**Files:**
- Read: `.github/workflows/deploy.yml`
- Read: `docker-compose.prod.yml`
- Read: remote `.env` through `ssh rlog` without printing secrets

**Interfaces:**
- Consumes: EC2 SSH alias `rlog` and the deployed Compose project.
- Produces: target database name, application-table count, migration-ledger state, and whether `roomlog` already exists.

- [ ] **Step 1: Confirm the configured database name using URL parsing with redacted output.**
- [ ] **Step 2: Query PostgreSQL catalogs for existing databases and application objects.**
- [ ] **Step 3: Stop if copying or renaming populated production data requires a migration choice.**

### Task 2: Correct the documented production target

**Files:**
- Modify: `.env.example:101`
- Modify: `apps/api/src/roomlog/docker-postgres.spec.ts`

**Interfaces:**
- Consumes: migration bootstrap rule that rejects `postgres`, `template0`, and `template1`.
- Produces: a tested production example ending in `/roomlog?sslmode=require`.

- [ ] **Step 1: Add a test asserting that the production example uses `/roomlog`.**
- [ ] **Step 2: Run the focused API test and confirm it fails against `/postgres`.**
- [ ] **Step 3: Change only the production example to `/roomlog`.**
- [ ] **Step 4: Rerun the focused API test and confirm it passes.**

### Task 3: Provision and deploy

**Files:**
- Update externally: RDS database catalog
- Update externally: GitHub Actions secret `DATABASE_URL`

**Interfaces:**
- Consumes: the verified production connection components and GitHub repository `gunrein620/roomlog`.
- Produces: a dedicated non-system production database and a deployment run targeting it.

- [ ] **Step 1: Create `roomlog` with the existing application role as owner if it does not exist.**
- [ ] **Step 2: Update the GitHub Actions secret while preserving credentials, host, port, and query parameters.**
- [ ] **Step 3: Trigger or rerun the production deployment.**
- [ ] **Step 4: Verify migration exit status, API health, web health, and running container state.**

### Task 4: Repository verification

**Files:**
- Verify: `.env.example`
- Verify: `apps/api/src/roomlog/docker-postgres.spec.ts`

**Interfaces:**
- Consumes: repository changes from Task 2.
- Produces: fresh test and verification output suitable for review.

- [ ] **Step 1: Run the focused regression test.**
- [ ] **Step 2: Run `bash scripts/verify.sh`.**
- [ ] **Step 3: Review `git diff` and ensure no credential appears.**
