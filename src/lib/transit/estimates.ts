import { FRESH_SECONDS } from "./policy";
import type { Arrival } from "./contracts";

/** Shared contract for Home, Map, task-5 candidates and task-9/10 reminders. */
export type ArrivalEstimate = {
  provenance: "source" | "calculated";
  arrivalAt: string | null;
  sourceTime: string | null;
  receivedAt: string | null;
  validUntil: string | null;
  state: "valid" | "missing" | "stale" | "cancelled" | "passed";
  reason: string;
  countdownMinutes: number | null;
};
export const ESTIMATE_MAX_AGE_MS = FRESH_SECONDS.arrivals * 1000;
const time = (value: string | null) => (value ? Date.parse(value) : NaN);
export function arrivalEstimate(
  row: Arrival | null,
  now = Date.now(),
  connected = true,
): ArrivalEstimate {
  const base = {
    provenance: "source" as const,
    arrivalAt: row?.arrival_at ?? null,
    sourceTime: row?.update_timestamp ?? null,
    receivedAt: row?.received_at ?? null,
    validUntil: row?.valid_until ?? null,
    countdownMinutes: null,
  };
  const invalid = (
    state: ArrivalEstimate["state"],
    reason: string,
  ): ArrivalEstimate => ({ ...base, state, reason });
  if (!row) return invalid("missing", "No source prediction supplied.");
  if (row.relationship === "CANCELED" || row.relationship === "SKIPPED")
    return invalid(
      "cancelled",
      `Source reports ${row.relationship.toLowerCase()}.`,
    );
  if (
    row.relationship !== "SCHEDULED" ||
    row.provenance !== "source" ||
    !Number.isFinite(time(row.arrival_at))
  )
    return invalid("missing", "No usable source arrival time.");
  if (!connected)
    return invalid("stale", "Arrival feed disconnected or unavailable.");
  const age = now - time(row.update_timestamp);
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(age) ||
    age < -120_000 ||
    age > ESTIMATE_MAX_AGE_MS ||
    !(time(row.valid_until) > now)
  )
    return invalid(
      "stale",
      "Source prediction expired or its clock is invalid.",
    );
  if (time(row.arrival_at) < now)
    return invalid(
      "passed",
      "Predicted arrival time has passed; actual arrival is unconfirmed.",
    );
  return {
    ...base,
    state: "valid",
    reason: "Source estimate; actual arrival may differ.",
    countdownMinutes: Math.ceil((time(row.arrival_at) - now) / 60_000),
  };
}
export function arrivalLabel(
  estimate: ArrivalEstimate,
  locale = "en-US",
  zone = "America/New_York",
) {
  const format = (value: string | null) =>
    Number.isFinite(time(value))
      ? new Intl.DateTimeFormat(locale, {
          timeZone: zone,
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        }).format(time(value))
      : "unavailable";
  return estimate.state === "valid"
    ? `${estimate.provenance === "source" ? "Source prediction" : "Calculated estimate"} · updated ${format(estimate.sourceTime)} · ${format(estimate.arrivalAt)} · ${estimate.countdownMinutes} min · Estimate`
    : `${estimate.reason}${estimate.sourceTime ? ` · Last source update ${format(estimate.sourceTime)} · Last estimate ${format(estimate.arrivalAt)}` : ""}`;
}
/** Reject backward updates even when a response arrives later. */
export function newerArrival(previous: Arrival, incoming: Arrival): Arrival {
  return time(incoming.update_timestamp) > time(previous.update_timestamp)
    ? incoming
    : previous;
}

/** Derived estimates inherit the shortest input validity; they never gain freshness. */
export function calculatedArrival(
  arrivalAt: string | null,
  inputs: ArrivalEstimate[],
  now = Date.now(),
): ArrivalEstimate {
  const usable =
    inputs.length > 0 &&
    inputs.every(
      (input) =>
        input.state === "valid" &&
        time(input.validUntil) > now &&
        now - time(input.sourceTime) <= ESTIMATE_MAX_AGE_MS,
    );
  const sourceTime = inputs.length
    ? inputs
        .map((input) => input.sourceTime)
        .sort((a, b) => time(a) - time(b))[0]
    : null;
  const validUntil = inputs.length
    ? inputs
        .map((input) => input.validUntil)
        .sort((a, b) => time(a) - time(b))[0]
    : null;
  const receivedAt = inputs.length
    ? inputs
        .map((input) => input.receivedAt)
        .sort((a, b) => time(b) - time(a))[0]
    : null;
  const valid =
    usable && Number.isFinite(time(arrivalAt)) && time(arrivalAt) >= now;
  return {
    provenance: "calculated",
    arrivalAt,
    sourceTime,
    receivedAt,
    validUntil,
    state: valid ? "valid" : "missing",
    reason: valid
      ? "Calculated from valid source inputs; actual arrival may differ."
      : "A required estimate is missing, expired or no longer usable.",
    countdownMinutes: valid ? Math.ceil((time(arrivalAt) - now) / 60000) : null,
  };
}
