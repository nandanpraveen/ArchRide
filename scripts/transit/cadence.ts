/** Passio confirmation supplied by project owner, 2026-10-25. Minimum request spacing. */
import { POLL_SECONDS } from "../../src/lib/transit/policy";
export { POLL_SECONDS };
export type RealtimeFeed = keyof typeof POLL_SECONDS;
export function retryDelayMs(
  feed: RealtimeFeed,
  previousFailures: number,
  retryAfterAt: string | null,
  now = Date.now(),
) {
  const backoff = Math.min(
    300_000,
    POLL_SECONDS[feed] * 1000 * 2 ** Math.min(Math.max(previousFailures, 0), 5),
  );
  const provider = retryAfterAt ? Date.parse(retryAfterAt) - now : 0;
  return Math.max(backoff, Number.isFinite(provider) ? provider : 0);
}
