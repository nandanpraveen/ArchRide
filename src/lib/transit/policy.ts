/** Provider reply supplied by the project owner on 2026-10-25; intervals in seconds. */
export const POLL_SECONDS = {
  vehicles: 10,
  arrivals: 30,
  alerts: 120,
} as const;
/** Three nominal update opportunities; operational freshness, not statistical accuracy. */
export const FRESH_SECONDS = {
  vehicles: 30,
  arrivals: 90,
  alerts: 360,
} as const;
