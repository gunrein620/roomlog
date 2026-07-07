# Splat Compression Bench Notes

Input asset:

- `apps/web/public/samples/room.spz`

Expected SOG output path:

- `apps/web/public/samples/room.sog`

Blocked SOG conversion command:

```sh
npx @playcanvas/splat-transform apps/web/public/samples/room.spz apps/web/public/samples/room.sog
```

This repository does not currently include a SOG converter dependency or CLI, and the local environment cannot fetch a new package. Until `room.sog` exists, the report script emits a `.spz`-only table and records SOG as blocked.

Loading measurement:

```sh
node scripts/splat-compress-report.mjs
```

The script measures Spark `SplatMesh.initialized` using the local `room.spz` bytes and a Node worker shim because this sandbox cannot open a local HTTP port or an in-app browser. Browser URL timing remains available through `measureSplatMeshLoading({ url })` in `compression-bench.ts`.
