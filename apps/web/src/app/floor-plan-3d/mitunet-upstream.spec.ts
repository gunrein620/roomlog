import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchMitunetUpstream,
  MitunetUpstreamTimeoutError,
} from "./mitunet-upstream";

test("logs successful MitUNet upstream timing without exposing its URL", async () => {
  const entries: unknown[] = [];
  const times = [100, 126];
  const response = await fetchMitunetUpstream(
    new URL("http://gpu.internal:8012/extract-image"),
    { method: "POST" },
    {
      timeoutMs: 90_000,
      fetchImpl: async (_url, init) => {
        assert.ok(init?.signal);
        return new Response("{}", { status: 200 });
      },
      log: entry => entries.push(entry),
      now: () => times.shift() ?? 126,
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(entries, [{
    event: "mitunet_upstream",
    endpoint: "extract-image",
    status: 200,
    elapsedMs: 26,
  }]);
  assert.doesNotMatch(JSON.stringify(entries), /gpu\.internal/);
});

test("maps AbortError and TimeoutError to a typed timeout", async () => {
  for (const name of ["AbortError", "TimeoutError"]) {
    const entries: unknown[] = [];
    const times = [20, 21];
    const timeoutFetch: typeof fetch = async () => {
      throw new DOMException("timed out", name);
    };

    await assert.rejects(
      () => fetchMitunetUpstream(
        new URL("http://gpu.internal:8012/extract-image"),
        { method: "POST" },
        {
          timeoutMs: 1,
          fetchImpl: timeoutFetch,
          log: entry => entries.push(entry),
          now: () => times.shift() ?? 21,
        },
      ),
      MitunetUpstreamTimeoutError,
    );
    assert.deepEqual(entries, [{
      event: "mitunet_upstream",
      endpoint: "extract-image",
      status: 504,
      elapsedMs: 1,
    }]);
  }
});
