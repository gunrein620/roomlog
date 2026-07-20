import assert from "node:assert/strict";
import test from "node:test";
import { Readable, Writable } from "node:stream";

import { runCli } from "./cli.mjs";

function inputOf(value) {
  return Readable.from([value]);
}

function capturedStderr() {
  let output = "";
  const stream = new Writable({
    write(chunk, _encoding, done) {
      output += chunk.toString();
      done();
    }
  });
  return { stream, output: () => output };
}

test("stdin 잡을 그대로 넘기고 성공하면 exit 0을 반환한다", async () => {
  const job = { furnitureId: "tf-cli", workerSecret: "s'ecret&value" };
  let receivedJob;
  const stderr = capturedStderr();

  const exitCode = await runCli({
    input: inputOf(JSON.stringify(job)),
    stderr: stderr.stream,
    async runJob(value) {
      receivedJob = value;
      return { ok: true };
    }
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(receivedJob, job);
  assert.equal(stderr.output(), "");
});

test("runConversionJob이 실패 결과를 돌려주면 콜백을 추가하지 않고 exit 1을 반환한다", async () => {
  let calls = 0;
  const stderr = capturedStderr();

  const exitCode = await runCli({
    input: inputOf('{"furnitureId":"tf-cli"}'),
    stderr: stderr.stream,
    async runJob() {
      calls += 1;
      return { ok: false, error: "download failed" };
    }
  });

  assert.equal(exitCode, 1);
  assert.equal(calls, 1);
  assert.match(stderr.output(), /변환 실패: download failed/);
});

test("잘못된 stdin JSON은 변환 함수를 부르지 않고 stderr + exit 1로 끝낸다", async () => {
  let calls = 0;
  const stderr = capturedStderr();

  const exitCode = await runCli({
    input: inputOf("not-json"),
    stderr: stderr.stream,
    async runJob() {
      calls += 1;
      return { ok: true };
    }
  });

  assert.equal(exitCode, 1);
  assert.equal(calls, 0);
  assert.match(stderr.output(), /실행 실패: SyntaxError/);
});
