import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCompressionBenchRows,
  formatCompressionBenchTable,
  measureAverageFps,
  measureSplatMeshLoading,
  normalizeSplatFormat,
  parseLoadingSamples,
  summarizeLoadingSamples
} from "./compression-bench";

test("normalizes supported splat formats", () => {
  assert.equal(normalizeSplatFormat(".spz"), "spz");
  assert.equal(normalizeSplatFormat("SOG"), "sog");
  assert.throws(() => normalizeSplatFormat("ply"), /Unsupported splat format/);
});

test("parses JSON loading samples and averages by format", () => {
  const samples = parseLoadingSamples(
    JSON.stringify({
      spz: [120, "180ms"],
      sog: "0.09s"
    })
  );

  assert.deepEqual(samples, [
    { format: "spz", loadingMs: 120 },
    { format: "spz", loadingMs: 180 },
    { format: "sog", loadingMs: 90 }
  ]);

  assert.deepEqual(summarizeLoadingSamples(samples), [
    { format: "spz", samples: [120, 180], averageMs: 150, minMs: 120, maxMs: 180 },
    { format: "sog", samples: [90], averageMs: 90, minMs: 90, maxMs: 90 }
  ]);
});

test("parses key-value and markdown loading samples", () => {
  const samples = parseLoadingSamples(`
spz=240.5ms
.sog: 0.12s
| .spz | room.spz | 220 ms |
`);

  assert.deepEqual(samples, [
    { format: "spz", loadingMs: 240.5 },
    { format: "sog", loadingMs: 120 },
    { format: "spz", loadingMs: 220 }
  ]);
});

test("builds rows with averaged loading samples and inferred status", () => {
  const rows = buildCompressionBenchRows(
    [
      { format: "spz", fileName: "room.spz", bytes: 8_864_742 },
      { format: "sog", fileName: "room.sog", bytes: null, status: "blocked", note: "converter unavailable" }
    ],
    [
      { format: "spz", loadingMs: 300 },
      { format: "spz", loadingMs: 360 }
    ]
  );

  assert.equal(rows[0].sizeMiB?.toFixed(2), "8.45");
  assert.equal(rows[0].loadingMs, 330);
  assert.equal(rows[0].status, "measured");
  assert.equal(rows[1].status, "blocked");
  assert.equal(rows[1].loadingMs, null);
});

test("formats a markdown table for the bench report", () => {
  const table = formatCompressionBenchTable(
    buildCompressionBenchRows([{ format: "spz", fileName: "room.spz", bytes: 1024 * 1024, loadingMs: 42.25 }])
  );

  assert.match(table, /\| Format \| File \| Size \(bytes\) \|/);
  assert.match(table, /\| \.spz \| room\.spz \| 1,048,576 \| 1\.00 \| 42\.3 \| n\/a \| measured \| n\/a \|/);
});

test("measures SplatMesh initialized duration with an injected mesh factory", async () => {
  const ticks = [10, 32, 40, 64];
  const result = await measureSplatMeshLoading(
    { url: "/samples/room.spz" },
    {
      runs: 2,
      now: () => {
        const value = ticks.shift();
        if (value === undefined) throw new Error("missing tick");
        return value;
      },
      createMesh: () => ({
        initialized: Promise.resolve(),
        numSplats: 12
      })
    }
  );

  assert.deepEqual(result.samplesMs, [22, 24]);
  assert.equal(result.averageMs, 23);
  assert.equal(result.numSplats, 12);
});

test("measures fixed-frame FPS with injected frame scheduler", async () => {
  let now = 0;
  const result = await measureAverageFps({
    frameCount: 4,
    now: () => now,
    requestFrame: (callback) => {
      now += 16;
      callback(now);
      return now;
    }
  });

  assert.equal(result.frames, 4);
  assert.equal(result.durationMs, 64);
  assert.equal(result.averageFps, 62.5);
});
