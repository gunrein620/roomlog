export type MitunetUpstreamLog = {
  event: "mitunet_upstream";
  endpoint: string;
  status: number;
  elapsedMs: number;
};

type FetchMitunetOptions = {
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  log?: (entry: MitunetUpstreamLog) => void;
  now?: () => number;
};

export class MitunetUpstreamTimeoutError extends Error {
  constructor() {
    super("MitUNet upstream timed out");
    this.name = "MitunetUpstreamTimeoutError";
  }
}

function endpointName(url: URL) {
  return url.pathname.split("/").filter(Boolean).at(-1) ?? "unknown";
}

function isTimeoutError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

export async function fetchMitunetUpstream(
  url: URL,
  init: RequestInit,
  {
    timeoutMs,
    fetchImpl = fetch,
    log = entry => console.info(JSON.stringify(entry)),
    now = () => performance.now(),
  }: FetchMitunetOptions,
) {
  const startedAt = now();
  const complete = (status: number) => log({
    event: "mitunet_upstream",
    endpoint: endpointName(url),
    status,
    elapsedMs: Math.max(0, Math.round(now() - startedAt)),
  });

  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
    complete(response.status);
    return response;
  } catch (error) {
    if (isTimeoutError(error)) {
      complete(504);
      throw new MitunetUpstreamTimeoutError();
    }
    complete(502);
    throw error;
  }
}
