import { FeedError, assert } from "./model";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export async function fetchFeed(
  url: string,
  options: {
    fetch?: typeof fetch;
    sleep?: (ms: number) => Promise<unknown>;
    maxBytes?: number;
    attempts?: 1 | 3;
  } = {},
) {
  const get = options.fetch || fetch,
    wait = options.sleep || sleep,
    max = options.maxBytes || 5_000_000;
  const attempts = options.attempts ?? 3;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let response: Response;
    try {
      response = await get(url, {
        signal: AbortSignal.timeout(15_000),
        redirect: "error",
        headers: {
          "User-Agent": "ArchRide student non-commercial transit importer",
        },
      });
    } catch {
      if (attempt === attempts - 1) throw new FeedError("network_or_timeout");
      await wait(500 * 2 ** attempt);
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      await response.body?.cancel();
      const retry = response.headers.get("retry-after");
      const delay = retry
        ? /^\d+$/.test(retry)
          ? Number(retry) * 1000
          : Date.parse(retry) - Date.now()
        : 500 * 2 ** attempt;
      // Never shorten a provider's requested backoff: fail and wait until next scheduled run.
      if (delay > 30_000 || attempt === attempts - 1)
        throw new FeedError(
          response.status === 429 ? "rate_limited" : "upstream_5xx",
          new Date(
            Date.now() + Math.max(1000, Number.isFinite(delay) ? delay : 1000),
          ).toISOString(),
        );
      await wait(Math.max(500, delay || 0));
      continue;
    }
    assert(response.ok, "upstream_http_" + response.status);
    assert(
      Number(response.headers.get("content-length") || 0) <= max,
      "response_too_large",
    );
    const reader = response.body?.getReader();
    assert(reader, "empty_response");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        assert(size <= max, "response_too_large");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    return bytes;
  }
  throw new FeedError("retries_exhausted");
}
