import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import { SendCommandCommand } from "@aws-sdk/client-ssm";
import {
  createMeshConversionDispatcher,
  HttpMeshConversionDispatcher,
  type MeshConversionJob,
  type MeshConversionSsmClient,
  meshConversionCallbackBase,
  SsmMeshConversionDispatcher,
  UnconfiguredMeshConversionDispatcher
} from "./mesh-conversion-dispatcher";

const job: MeshConversionJob = {
  furnitureId: "tf-1",
  usdzUrl: "https://cdn.example/scan.usdz",
  glbUploadUrl: "https://s3.example/put",
  glbUploadHeaders: { "Content-Type": "model/gltf-binary" },
  glbPublicUrl: "https://cdn.example/out.glb"
};

describe("meshConversionCallbackBase", () => {
  it("appends /api when the base does not already end with it", () => {
    assert.equal(meshConversionCallbackBase("https://api.woo-zu.com"), "https://api.woo-zu.com/api");
  });

  it("does not double up /api and trims trailing slashes", () => {
    assert.equal(meshConversionCallbackBase("https://api.woo-zu.com/api/"), "https://api.woo-zu.com/api");
  });
});

describe("createMeshConversionDispatcher", () => {
  it("returns a dispatcher that fails closed when required env vars are missing", async () => {
    const dispatcher = createMeshConversionDispatcher({});
    assert.ok(dispatcher instanceof UnconfiguredMeshConversionDispatcher);

    await assert.rejects(
      () =>
        dispatcher.dispatch({
          furnitureId: "tf-1",
          usdzUrl: "https://cdn.example/scan.usdz",
          glbUploadUrl: "https://s3.example/put",
          glbUploadHeaders: {},
          glbPublicUrl: "https://cdn.example/out.glb"
        }),
      /MESH_WORKER_URL.*PUBLIC_API_BASE_URL.*GPU_WORKER_SECRET/s
    );
  });

  it("returns a working HTTP dispatcher once every required env var is set", () => {
    const dispatcher = createMeshConversionDispatcher({
      MESH_WORKER_URL: "http://mesh-worker:5001",
      PUBLIC_API_BASE_URL: "https://api.woo-zu.com",
      GPU_WORKER_SECRET: "secret"
    });
    assert.ok(dispatcher instanceof HttpMeshConversionDispatcher);
  });

  it("returns an SSM dispatcher when MESH_WORKER_DISPATCH=ssm", () => {
    const dispatcher = createMeshConversionDispatcher({
      MESH_WORKER_DISPATCH: "ssm",
      MESH_WORKER_URL: "http://mesh-worker:5001",
      GPU_INSTANCE_ID: "i-061e16af461c7c5df",
      GPU_REGION: "us-east-1",
      PUBLIC_API_BASE_URL: "https://api.woo-zu.com",
      GPU_WORKER_SECRET: "secret"
    });

    assert.ok(dispatcher instanceof SsmMeshConversionDispatcher);
  });

  it("returns the existing HTTP dispatcher when SSM mode is not selected", () => {
    const dispatcher = createMeshConversionDispatcher({
      MESH_WORKER_DISPATCH: "",
      MESH_WORKER_URL: "http://mesh-worker:5001",
      PUBLIC_API_BASE_URL: "https://api.woo-zu.com",
      GPU_WORKER_SECRET: "secret"
    });

    assert.ok(dispatcher instanceof HttpMeshConversionDispatcher);
  });

  it("returns an unconfigured dispatcher naming missing SSM env vars", async () => {
    const dispatcher = createMeshConversionDispatcher({
      MESH_WORKER_DISPATCH: "ssm",
      MESH_WORKER_URL: "http://mesh-worker:5001"
    });
    assert.ok(dispatcher instanceof UnconfiguredMeshConversionDispatcher);

    await assert.rejects(
      () => dispatcher.dispatch(job),
      /GPU_INSTANCE_ID.*GPU_REGION.*PUBLIC_API_BASE_URL.*GPU_WORKER_SECRET/s
    );
  });
});

describe("SsmMeshConversionDispatcher", () => {
  it("sends a one-shot command to the configured instance with the intact job payload", async () => {
    const calls: SendCommandCommand[] = [];
    const client: MeshConversionSsmClient = {
      async send(command) {
        calls.push(command);
        return { Command: { CommandId: "cmd-1" } };
      }
    };
    const dispatcher = new SsmMeshConversionDispatcher(
      "i-061e16af461c7c5df",
      "us-east-1",
      "https://api.woo-zu.com/api",
      "worker-secret",
      client
    );
    const specialJob: MeshConversionJob = {
      ...job,
      glbUploadUrl:
        "https://s3.example/put?X-Amz-Signature=a+b/c==&note='따옴표'&redirect=https%3A%2F%2Fx.example%2Fa%3Fb%3D1%26c%3D2"
    };

    await dispatcher.dispatch(specialJob);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].input.InstanceIds, ["i-061e16af461c7c5df"]);
    assert.equal(calls[0].input.DocumentName, "AWS-RunShellScript");
    const commands = calls[0].input.Parameters?.commands ?? [];
    assert.equal(commands[0], "set -eu");
    const command = commands.find((line) => line.includes("docker run")) ?? "";
    assert.match(
      command,
      /timeout --signal=TERM --kill-after=10s 600s docker run --rm -i --entrypoint node mesh-worker:test \/app\/cli\.mjs$/
    );
    const encodedPayload = command.match(/^printf '%s' ([A-Za-z0-9+/=]+) \| base64 -d \|/)?.[1];
    assert.ok(encodedPayload, "SSM 명령에서 base64 잡 페이로드를 찾을 수 있어야 한다");
    assert.deepEqual(JSON.parse(Buffer.from(encodedPayload, "base64").toString("utf8")), {
      ...specialJob,
      callbackBase: "https://api.woo-zu.com/api",
      workerSecret: "worker-secret"
    });
  });

  it("prepares the repo, NVMe runtime, and image before running the conversion", async () => {
    const calls: SendCommandCommand[] = [];
    const client: MeshConversionSsmClient = {
      async send(command) {
        calls.push(command);
        return { Command: { CommandId: "cmd-self-heal" } };
      }
    };
    const dispatcher = new SsmMeshConversionDispatcher(
      "i-061e16af461c7c5df",
      "us-east-1",
      "https://api.woo-zu.com/api",
      "worker-secret",
      client
    );

    await dispatcher.dispatch(job);

    const commands = calls[0].input.Parameters?.commands ?? [];
    const joined = commands.join("\n");
    const syncIndex = commands.findIndex((line) => line.includes("git clone --branch"));
    const ensureIndex = commands.findIndex((line) => line.includes("services/mesh-worker/remote/ensure-worker.sh"));
    const conversionIndex = commands.findIndex((line) => line.includes("docker run"));

    assert.match(joined, /https:\/\/github\.com\/gunrein620\/roomlog\.git/);
    assert.match(joined, /git clone --branch/);
    assert.match(joined, /git .* fetch --prune origin/);
    assert.match(joined, /git .* reset --hard/);
    assert.match(joined, /runuser -u "\$REPO_USER" -- git/);
    assert.match(joined, /"\+refs\/heads\/\$MESH_WORKER_BRANCH:/);
    assert.match(joined, /MESH_WORKER_BRANCH='main'/);
    assert.match(joined, /flock -x -w 1200 9/);
    assert.match(joined, /mesh-conversion\/failure/);
    assert.deepEqual(calls[0].input.Parameters?.executionTimeout, ["5400"]);
    assert.ok(syncIndex >= 0 && syncIndex < ensureIndex, "인라인 레포 확보가 ensure-worker보다 먼저여야 한다");
    assert.ok(ensureIndex >= 0, "SSM 명령에 ensure-worker 준비 단계가 있어야 한다");
    assert.ok(conversionIndex > ensureIndex, "변환 컨테이너는 ensure-worker 성공 뒤에만 실행돼야 한다");
  });

  it("throws a clear error when SendCommand fails", async () => {
    const client: MeshConversionSsmClient = {
      async send() {
        throw new Error("AccessDeniedException");
      }
    };
    const dispatcher = new SsmMeshConversionDispatcher(
      "i-061e16af461c7c5df",
      "us-east-1",
      "https://api.woo-zu.com/api",
      "worker-secret",
      client
    );

    await assert.rejects(
      () => dispatcher.dispatch(job),
      /SSM mesh-worker 잡 전송에 실패했습니다.*i-061e16af461c7c5df.*AccessDeniedException/s
    );
  });

  it("throws when SendCommand does not return a CommandId", async () => {
    const client: MeshConversionSsmClient = {
      async send() {
        return {};
      }
    };
    const dispatcher = new SsmMeshConversionDispatcher(
      "i-061e16af461c7c5df",
      "us-east-1",
      "https://api.woo-zu.com/api",
      "worker-secret",
      client
    );

    await assert.rejects(() => dispatcher.dispatch(job), /CommandId/);
  });
});

describe("HttpMeshConversionDispatcher", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("POSTs the job plus callback base/worker secret to <workerUrl>/convert", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: 202 });
    }) as typeof fetch;

    const dispatcher = new HttpMeshConversionDispatcher(
      "http://mesh-worker:5001/",
      "https://api.woo-zu.com/api",
      "worker-secret"
    );

    await dispatcher.dispatch({
      furnitureId: "tf-1",
      usdzUrl: "https://cdn.example/scan.usdz",
      glbUploadUrl: "https://s3.example/put",
      glbUploadHeaders: { "Content-Type": "model/gltf-binary" },
      glbPublicUrl: "https://cdn.example/out.glb"
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://mesh-worker:5001/convert");
    assert.equal((calls[0].init.headers as Record<string, string>)["x-worker-secret"], "worker-secret");
    const body = JSON.parse(String(calls[0].init.body));
    assert.deepEqual(body, {
      furnitureId: "tf-1",
      usdzUrl: "https://cdn.example/scan.usdz",
      glbUploadUrl: "https://s3.example/put",
      glbUploadHeaders: { "Content-Type": "model/gltf-binary" },
      glbPublicUrl: "https://cdn.example/out.glb",
      callbackBase: "https://api.woo-zu.com/api",
      workerSecret: "worker-secret"
    });
  });

  it("throws when the worker responds with a non-2xx status", async () => {
    globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;
    const dispatcher = new HttpMeshConversionDispatcher("http://mesh-worker:5001", "https://api.example/api", "s");

    await assert.rejects(
      () =>
        dispatcher.dispatch({
          furnitureId: "tf-1",
          usdzUrl: "https://cdn.example/scan.usdz",
          glbUploadUrl: "https://s3.example/put",
          glbUploadHeaders: {},
          glbPublicUrl: "https://cdn.example/out.glb"
        }),
      /500/
    );
  });

  it("throws when the worker is unreachable", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    const dispatcher = new HttpMeshConversionDispatcher("http://mesh-worker:5001", "https://api.example/api", "s");

    await assert.rejects(
      () =>
        dispatcher.dispatch({
          furnitureId: "tf-1",
          usdzUrl: "https://cdn.example/scan.usdz",
          glbUploadUrl: "https://s3.example/put",
          glbUploadHeaders: {},
          glbPublicUrl: "https://cdn.example/out.glb"
        }),
      /ECONNREFUSED/
    );
  });
});
