# RoomLog Local 3D Dependency Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every active local MitUNet and furniture filesystem dependency under the RoomLog folder without changing wall, opening, animation, or rendering behavior.

**Architecture:** Keep the GPU FastAPI service remote, but make RoomLog the local source of the proxied MitUNet viewer, maintainable inference source, checkpoints, and GLB dataset. Resolve relative runtime paths from the RoomLog repository root and mount those internal directories into both local and production web containers.

**Tech Stack:** Next.js 16, Node.js test runner, TypeScript, Docker Compose, FastAPI/Python, PowerShell, GLB

## Global Constraints

- Modify only `C:\Users\smoun\Jungle\woo-zu\roomlog` until final verified cleanup of the two migrated source directories.
- Do not change wall generation, door/window composition, rendering style, or animation logic.
- Keep `MITUNET_INTERNAL_SERVICE_URL=http://8.230.7.1:8012` and require CUDA from the proxied health check.
- Copy first, verify hashes and HTTP behavior, then remove the original active directories.
- Do not remove `C:\Users\smoun\Jungle\floorplan-to-3d-mitunet - 복사본` in this migration.

---

### Task 1: Resolve runtime assets from the RoomLog repository

**Files:**
- Create: `apps/web/src/lib/runtime-asset-path.ts`
- Create: `apps/web/src/lib/runtime-asset-path.spec.ts`
- Modify: `apps/web/src/app/floor-plan-3d/mitunet-proxy.ts`
- Modify: `apps/web/src/app/floor-plan-3d/mitunet-proxy.spec.ts`
- Modify: `apps/web/src/lib/furniture-dataset.ts`

**Interfaces:**
- Produces: `resolveRoomlogRuntimePath(configuredPath: string, webRoot?: string): string`
- Consumes: `MITUNET_PROJECT_ROOT` and `FURNITURE_DATASET_ROOT`, each absolute in Docker or RoomLog-root-relative on the host

- [ ] **Step 1: Write failing path tests**

Test relative paths against `path.resolve(webRoot, "..", "..", configuredPath)`, preserve absolute paths, assert MitUNet no longer contains `C:/Users/smoun/Jungle/floorplan-to-3d-mitunet`, and assert furniture has an internal default.

- [ ] **Step 2: Verify RED**

Run from `apps/web`:

```powershell
pnpm.cmd run test:unit
```

Expected: the new runtime-path spec fails because `resolveRoomlogRuntimePath` and the internal defaults do not exist.

- [ ] **Step 3: Implement the shared resolver and internal defaults**

```ts
export function resolveRoomlogRuntimePath(configuredPath: string, webRoot = process.cwd()) {
  return path.isAbsolute(configuredPath)
    ? path.resolve(configuredPath)
    : path.resolve(webRoot, "..", "..", configuredPath);
}
```

Use `services/mitunet` and `runtime-assets/furniture-glb-dataset` as defaults. Keep `/mitunet` and `/furniture` absolute container paths unchanged when supplied by Compose.

- [ ] **Step 4: Verify GREEN**

Run the two focused specs with Node/ts-node, then run the full web unit test command. Expected: focused specs pass; any known unrelated suite failures are reported separately.

### Task 2: Point local and production Compose at internal directories

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker-compose.prod.yml`
- Modify: `.env.example`
- Modify: `.env.local`
- Modify: `.env.local.bak`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `/mitunet` and `/furniture` read-only mounts sourced below the RoomLog root
- Consumes: the Task 1 path resolver and existing `MITUNET_INTERNAL_SERVICE_URL`

- [ ] **Step 1: Add source assertions before configuration edits**

Extend `mitunet-internal-page.spec.ts` to require `./services/mitunet` and `./runtime-assets/furniture-glb-dataset` and reject `../../floorplan-to-3d-mitunet` and `../furniture-glb-dataset`.

- [ ] **Step 2: Verify RED**

Run the focused spec. Expected: failure because Compose still uses sibling directories.

- [ ] **Step 3: Update Compose and environment paths**

Use these mounts in both Compose files:

```yaml
- ${MITUNET_HOST_PROJECT_ROOT:-./services/mitunet}:/mitunet:ro
- ${FURNITURE_HOST_DATASET_ROOT:-./runtime-assets/furniture-glb-dataset}:/furniture:ro
```

Add `MITUNET_PROJECT_ROOT=/mitunet` and `FURNITURE_DATASET_ROOT=/furniture` to the web container. Set host defaults to `services/mitunet` and `runtime-assets/furniture-glb-dataset`. Ignore checkpoint binaries and the furniture dataset in Git.

- [ ] **Step 4: Verify GREEN and Compose rendering**

Run the focused spec and:

```powershell
docker compose config
docker compose -f docker-compose.prod.yml config
```

Expected: both rendered configurations reference only RoomLog-internal host directories.

### Task 3: Copy and verify the MitUNet project bundle

**Files:**
- Create: `services/mitunet/**`

**Interfaces:**
- Produces: maintainable MitUNet source plus all four checkpoint files inside RoomLog
- Consumes: `C:\Users\smoun\Jungle\floorplan-to-3d-mitunet`

- [ ] **Step 1: Validate source and target absolute paths**

Resolve the source and target and assert the target begins with `C:\Users\smoun\Jungle\woo-zu\roomlog\` while the source exactly matches the active external directory.

- [ ] **Step 2: Copy the selected source tree**

Copy `server`, `src`, `viewer`, `deploy`, `tests`, `tests_js`, `configs`, `scripts`, `docs`, all four files under `weights`, plus `pyproject.toml`, `.python-version`, `.gitignore`, `dev.sh`, `README.md`, and `LICENSE`. Do not copy `.git`, `.venv`, caches, output, logs, or screenshots.

- [ ] **Step 3: Verify source closure and hashes**

Compare relative file lists and SHA-256 hashes for every copied file. Expected: zero missing files and zero hash differences. Reconfirm the active GPU hashes for `best.pth` and `yolo-segv1.pt`.

- [ ] **Step 4: Run MitUNet tests from the new source**

Use the existing Python runtime for the copied tests before deleting the old `.venv`, and run `node --test tests_js/*.mjs` from `services/mitunet`. Expected: all relevant tests pass.

### Task 4: Copy and verify the furniture dataset

**Files:**
- Create: `runtime-assets/furniture-glb-dataset/**`

**Interfaces:**
- Produces: `manifest.json` plus 1,680 locally served GLBs
- Consumes: `C:\Users\smoun\Jungle\woo-zu\furniture-glb-dataset`

- [ ] **Step 1: Validate source and target absolute paths**

Assert the target is below the RoomLog root and is not equal to the source.

- [ ] **Step 2: Copy the complete dataset**

Copy the manifest, category directories, and `_source-metadata` without changing filenames or contents.

- [ ] **Step 3: Verify manifest closure and bytes**

Parse `manifest.json`, require `itemCount === 1680`, verify every `relativePath`, require zero missing assets, and compare the total referenced byte count with the source.

### Task 5: Switch the running RoomLog web container and verify live behavior

**Files:**
- Runtime state only

**Interfaces:**
- Consumes: Tasks 1-4
- Produces: a web container mounted exclusively from RoomLog-internal paths

- [ ] **Step 1: Run focused web tests**

Run the MitUNet proxy, internal page, furniture catalog, and renderer parity specs. Expected: all focused tests pass.

- [ ] **Step 2: Rebuild and recreate web**

```powershell
docker compose up -d --build --force-recreate web
```

- [ ] **Step 3: Inspect effective mounts and environment**

Require `/mitunet` source to end with `roomlog\services\mitunet`, `/furniture` source to end with `roomlog\runtime-assets\furniture-glb-dataset`, both read-only, and the internal service URL to remain `8.230.7.1:8012`.

- [ ] **Step 4: Verify live HTTP endpoints**

Require HTTP 200 for the editor, review editor module, manifest, and one sample GLB. Require the proxied health response to contain `"device":"cuda"`.

### Task 6: Remove migrated external sources and prove no fallback remains

**Files:**
- Delete after verification: `C:\Users\smoun\Jungle\floorplan-to-3d-mitunet`
- Delete after verification: `C:\Users\smoun\Jungle\woo-zu\furniture-glb-dataset`

**Interfaces:**
- Consumes: verified copies and live container from Task 5
- Produces: RoomLog as the only active local filesystem source

- [ ] **Step 1: Stop the obsolete local CPU MitUNet process**

Confirm its command/process owns Windows port 8012 and the RoomLog proxy still reports CUDA before stopping it.

- [ ] **Step 2: Revalidate exact deletion targets**

Resolve both paths and refuse deletion unless they exactly match the two migrated source paths and both verified targets still exist.

- [ ] **Step 3: Delete the migrated source directories**

Use native PowerShell `Remove-Item -LiteralPath ... -Recurse -Force` separately for each verified path. Do not touch the `- 복사본` directory.

- [ ] **Step 4: Run final verification after deletion**

Repeat mount inspection and all live HTTP checks. Search runtime source/config files for the deleted absolute paths and require zero active references.
