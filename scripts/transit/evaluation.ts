/** Evidence-only evaluation. Positive error means the source predicted too early. */
export type Prediction = {
  id: string;
  instance_key: string;
  route_id: string;
  trip_id: string;
  stop_id: string;
  stop_sequence: number;
  arrival_at: string | null;
  update_timestamp: string;
  received_at: string;
  valid_until: string;
  relationship: string;
};
export type Observation = {
  id: string;
  instance_key: string;
  trip_id: string | null;
  stop_id: string;
  stop_sequence: number;
  observed_at: string;
  evidence: string;
};
const stamp = (s: string | null) => (s ? Date.parse(s) : NaN);
export function evaluate(
  predictions: Prediction[],
  observations: Observation[],
  now = Date.now(),
) {
  const unique = [
    ...new Map(
      predictions.map((p) => [`${p.id}|${p.update_timestamp}`, p]),
    ).values(),
  ];
  const pairs: {
    predictionId: string;
    observationId: string;
    routeId: string;
    patternId: string;
    stopSequence: number;
    errorSeconds: number;
    leadSeconds: number;
    predictedAt: string;
    receivedAt: string;
    observedAt: string;
  }[] = [];
  let stale = 0,
    missing = 0,
    pending = 0,
    unmatched = 0;
  for (const p of unique) {
    if (
      p.relationship !== "SCHEDULED" ||
      !Number.isFinite(stamp(p.arrival_at))
    ) {
      missing++;
      continue;
    }
    if (
      !(stamp(p.valid_until) > stamp(p.received_at)) ||
      stamp(p.received_at) - stamp(p.update_timestamp) > 180_000 ||
      stamp(p.update_timestamp) > stamp(p.received_at) + 120_000
    ) {
      stale++;
      continue;
    }
    const candidates = observations.filter(
      (o) =>
        o.evidence === "source_vehicle_stopped_at" &&
        o.instance_key === p.instance_key &&
        o.trip_id === p.trip_id &&
        o.stop_id === p.stop_id &&
        o.stop_sequence === p.stop_sequence &&
        stamp(o.observed_at) >=
          Math.max(stamp(p.received_at), stamp(p.update_timestamp)) &&
        stamp(o.observed_at) <= now,
    );
    // Multiple events for the same occurrence are ambiguous, not conveniently selected.
    const events = [...new Map(candidates.map((o) => [o.id, o])).values()];
    if (events.length === 1) {
      const o = events[0];
      pairs.push({
        predictionId: p.id,
        observationId: o.id,
        routeId: p.route_id,
        patternId: p.trip_id,
        stopSequence: p.stop_sequence,
        errorSeconds: (stamp(o.observed_at) - stamp(p.arrival_at)) / 1000,
        leadSeconds: (stamp(o.observed_at) - stamp(p.received_at)) / 1000,
        predictedAt: p.update_timestamp,
        receivedAt: p.received_at,
        observedAt: o.observed_at,
      });
    } else if (stamp(p.arrival_at) + 3_600_000 > now) pending++;
    else unmatched++;
  }
  const errors = pairs.map((p) => p.errorSeconds).sort((a, b) => a - b);
  const quantile = (q: number) => {
    if (!errors.length) return null;
    const position = (errors.length - 1) * q,
      lower = Math.floor(position),
      upper = Math.ceil(position);
    return errors[lower] + (errors[upper] - errors[lower]) * (position - lower);
  };
  // Snapshot revisions are correlated. Calibration requires independent stop occurrences.
  const independentEvents = new Set(pairs.map((p) => p.observationId)).size;
  return {
    generatedAt: new Date(now).toISOString(),
    counts: {
      predictions: unique.length,
      matched: pairs.length,
      independentEvents,
      stale,
      missing,
      pending,
      unmatched,
    },
    errorSeconds: {
      p10: quantile(0.1),
      median: quantile(0.5),
      p90: quantile(0.9),
      bias: errors.length
        ? errors.reduce((a, b) => a + b, 0) / errors.length
        : null,
      meanAbsolute: errors.length
        ? errors.reduce((a, b) => a + Math.abs(b), 0) / errors.length
        : null,
    },
    staleOrMissingRate: unique.length
      ? (stale + missing) / unique.length
      : null,
    observationCoverage: unique.length ? pairs.length / unique.length : null,
    calibration: {
      enabled: false,
      reason:
        "Source baseline only. Independent held-out coverage, time strata and calibration review are required before publishing windows or adjustments.",
    },
    // Gate route summaries on independent events, not on frequently refreshed predictions.
    routes: [...new Set(pairs.map((p) => p.routeId))].flatMap((routeId) => {
      const rows = pairs.filter((p) => p.routeId === routeId);
      return new Set(rows.map((p) => p.observationId)).size >= 30
        ? [
            {
              routeId,
              predictions: rows.length,
              independentEvents: new Set(rows.map((p) => p.observationId)).size,
            },
          ]
        : [];
    }),
    pairs,
  };
}
