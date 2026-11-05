import { ESTIMATE_MAX_AGE_MS, type ArrivalEstimate } from "./estimates";
export type JourneyCandidate = {
  id: string;
  label?: string;
  departureAt: string;
  /** Complete destination arrival, including final walk; never just boarding ETA. */
  destinationArrivalAt: string;
  walkingSeconds: number;
  boardingBufferSeconds: number;
  support:
    | { kind: "live"; estimate: ArrivalEstimate }
    | { kind: "schedule"; serviceDate: string; verified: boolean }
    | { kind: "walking"; verified: boolean };
};
export type DeadlineAssessment = {
  status: "on_time" | "tight" | "likely_late" | "insufficient";
  reason: string;
  slackSeconds: number | null;
  label: "Estimate";
};
const insufficient = (reason: string): DeadlineAssessment => ({
  status: "insufficient",
  reason,
  slackSeconds: null,
  label: "Estimate",
});
export function assessDeadline(
  candidate: JourneyCandidate | null,
  deadline: string,
  bufferSeconds: number,
  now = Date.now(),
): DeadlineAssessment {
  const target = Date.parse(deadline);
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(target) ||
    !Number.isFinite(bufferSeconds) ||
    bufferSeconds < 0
  )
    return insufficient("Enter a valid deadline and a nonnegative buffer.");
  if (target <= now) return insufficient("Choose a deadline in the future.");
  if (!candidate)
    return insufficient("No complete, supported journey is available.");
  const departure = Date.parse(candidate.departureAt),
    arrival = Date.parse(candidate.destinationArrivalAt);
  if (
    ![
      departure,
      arrival,
      candidate.walkingSeconds,
      candidate.boardingBufferSeconds,
    ].every(Number.isFinite) ||
    candidate.walkingSeconds < 0 ||
    candidate.boardingBufferSeconds < 0 ||
    departure < now ||
    arrival - departure <
      (candidate.walkingSeconds + candidate.boardingBufferSeconds) * 1000
  )
    return insufficient("Journey timing is incomplete or has passed.");
  const support = candidate.support;
  if (
    support.kind === "live" &&
    (support.estimate.state !== "valid" ||
      !Number.isFinite(Date.parse(support.estimate.sourceTime ?? "")) ||
      now - Date.parse(support.estimate.sourceTime ?? "") >
        ESTIMATE_MAX_AGE_MS ||
      now - Date.parse(support.estimate.sourceTime ?? "") < -120_000 ||
      !(Date.parse(support.estimate.arrivalAt ?? "") >= now) ||
      !(Date.parse(support.estimate.validUntil ?? "") > now) ||
      !(departure <= Date.parse(support.estimate.validUntil ?? "")))
  )
    return insufficient(
      "Live prediction does not support this departure horizon. Future planning needs an operating schedule.",
    );
  if (support.kind !== "live" && !support.verified)
    return insufficient(
      "Walking or operating service data is not verified for this journey.",
    );
  const slackSeconds = (target - arrival) / 1000;
  return {
    label: "Estimate",
    slackSeconds,
    status:
      slackSeconds < 0
        ? "likely_late"
        : slackSeconds < bufferSeconds
          ? "tight"
          : "on_time",
    reason:
      slackSeconds < 0
        ? "Estimated destination arrival is after your deadline."
        : slackSeconds < bufferSeconds
          ? "Estimated destination arrival meets the deadline but leaves less than your requested buffer."
          : "Estimated destination arrival meets the deadline and your requested buffer.",
  };
}
/** Search supplied task-5 candidates, including verified walking-only choices. */
export function arriveBy(
  candidates: JourneyCandidate[],
  deadline: string,
  bufferSeconds: number,
  now = Date.now(),
) {
  return candidates
    .map((candidate) => ({
      candidate,
      assessment: assessDeadline(candidate, deadline, bufferSeconds, now),
    }))
    .filter(
      ({ assessment }) =>
        assessment.status === "on_time" || assessment.status === "tight",
    )
    .sort(
      (a, b) =>
        Date.parse(b.candidate.departureAt) -
        Date.parse(a.candidate.departureAt),
    );
}
export { campusDeadline } from "./service-times";
