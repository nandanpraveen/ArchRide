/** Statistical baseline. Only independently verified observations enter training/evaluation. */
export type SegmentObservation = {
  eventId: string;
  instanceKey: string;
  patternId: string;
  direction: string;
  fromSequence: number;
  toSequence: number;
  kind: "segment" | "dwell";
  observedAt: string;
  seconds: number;
  officialSeconds: number | null;
  evidence: "official" | "corroborated_rider";
};
export type SegmentModel = {
  schemaVersion: 1;
  /** Current dataset measures complete stop-arrival to stop-arrival intervals, including dwell. */
  timingBasis?: "arrival_to_arrival";
  trainedThrough: string;
  cohorts: Record<string, { seconds: number; samples: number; trips: number }>;
};
const median = (v: number[]) => {
  const a = [...v].sort((a, b) => a - b);
  return a.length
    ? (a[Math.floor((a.length - 1) / 2)] + a[Math.ceil((a.length - 1) / 2)]) / 2
    : NaN;
};
const percentile = (v: number[], p: number) => {
  const a = [...v].sort((a, b) => a - b);
  return a.length
    ? a[Math.min(a.length - 1, Math.ceil(a.length * p) - 1)]
    : null;
};
const bucketFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "2-digit",
  hourCycle: "h23",
});
function bucket(iso: string) {
  const p = Object.fromEntries(
    bucketFormatter
      .formatToParts(Date.parse(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${p.weekday}:${Math.floor(Number(p.hour) / 3)}`;
}
const key = (
  o: Pick<
    SegmentObservation,
    "patternId" | "direction" | "fromSequence" | "toSequence" | "kind"
  >,
) =>
  JSON.stringify([
    o.patternId,
    o.direction,
    o.fromSequence,
    o.toSequence,
    o.kind,
  ]);
export function cleanObservations(rows: SegmentObservation[]) {
  const unique = new Map<string, SegmentObservation>();
  let rejected = 0;
  for (const o of rows) {
    if (
      !o ||
      !o.eventId ||
      !o.instanceKey ||
      !o.patternId ||
      !Number.isFinite(Date.parse(o.observedAt)) ||
      !Number.isFinite(o.seconds) ||
      o.seconds < 0 ||
      o.seconds > 1800 ||
      !Number.isInteger(o.fromSequence) ||
      !Number.isInteger(o.toSequence) ||
      o.fromSequence < 0 ||
      o.toSequence < o.fromSequence ||
      !["segment", "dwell"].includes(o.kind) ||
      (o.kind === "segment" && o.fromSequence === o.toSequence) ||
      !["official", "corroborated_rider"].includes(o.evidence)
    ) {
      rejected++;
      continue;
    }
    const identity = JSON.stringify([
      o.instanceKey,
      o.patternId,
      o.fromSequence,
      o.toSequence,
      o.kind,
    ]);
    const old = unique.get(identity);
    // Reports of one event never increase its independent sample count.
    if (!old || (old.evidence !== "official" && o.evidence === "official"))
      unique.set(identity, {
        ...o,
        observedAt: new Date(Date.parse(o.observedAt)).toISOString(),
      });
  }
  return {
    rows: [...unique.values()].sort(
      (a, b) =>
        a.observedAt.localeCompare(b.observedAt) ||
        a.eventId.localeCompare(b.eventId),
    ),
    rejected,
    duplicates: rows.length - rejected - unique.size,
  };
}
export function trainSegments(input: SegmentObservation[]): SegmentModel {
  const rows = cleanObservations(input).rows,
    groups = new Map<string, SegmentObservation[]>();
  for (const o of rows)
    for (const k of [key(o), key(o) + ":" + bucket(o.observedAt)]) {
      const group = groups.get(k) ?? [];
      group.push(o);
      groups.set(k, group);
    }
  const cohorts: SegmentModel["cohorts"] = {};
  for (const [k, list] of groups) {
    const mid = median(list.map((o) => o.seconds)),
      mad = median(list.map((o) => Math.abs(o.seconds - mid)));
    const robust = list.filter(
        (o) => Math.abs(o.seconds - mid) <= Math.max(60, 5 * mad),
      ),
      trips = new Set(robust.map((o) => o.instanceKey)).size;
    if (trips >= 12)
      cohorts[k] = {
        seconds: median(robust.map((o) => o.seconds)),
        samples: robust.length,
        trips,
      };
  }
  return {
    schemaVersion: 1,
    timingBasis: "arrival_to_arrival",
    trainedThrough: rows.at(-1)?.observedAt ?? new Date(0).toISOString(),
    cohorts,
  };
}
export function predictSegment(
  model: SegmentModel,
  o: Pick<
    SegmentObservation,
    | "patternId"
    | "direction"
    | "fromSequence"
    | "toSequence"
    | "kind"
    | "observedAt"
  >,
) {
  const cohort =
    model.cohorts[key(o) + ":" + bucket(o.observedAt)] ?? model.cohorts[key(o)];
  return cohort && cohort.trips >= 12 && Number.isFinite(cohort.seconds)
    ? cohort.seconds
    : null;
}
function score(pairs: { actual: number; predicted: number }[]) {
  if (!pairs.length)
    return {
      samples: 0,
      meanAbsolute: null,
      medianAbsolute: null,
      p90: null,
      p95: null,
      bias: null,
    };
  const absolute = pairs.map((p) => Math.abs(p.predicted - p.actual));
  return {
    samples: pairs.length,
    meanAbsolute: absolute.reduce((a, b) => a + b, 0) / pairs.length,
    medianAbsolute: median(absolute),
    p90: percentile(absolute, 0.9),
    p95: percentile(absolute, 0.95),
    bias: pairs.reduce((s, p) => s + p.predicted - p.actual, 0) / pairs.length,
  };
}
export function evaluateUpdate(
  input: SegmentObservation[],
  current?: SegmentModel,
) {
  const cleaned = cleanObservations(input),
    rows = cleaned.rows,
    spans = new Map<string, { start: number; end: number }>();
  for (const o of rows) {
    const at = Date.parse(o.observedAt),
      old = spans.get(o.instanceKey);
    spans.set(o.instanceKey, {
      start: Math.min(old?.start ?? at, at),
      end: Math.max(old?.end ?? at, at),
    });
  }
  const trips = [...spans].sort((a, b) => a[1].start - b[1].start),
    cutoff =
      trips.length >= 2
        ? trips[Math.min(trips.length - 1, Math.floor(trips.length * 0.8))][1]
            .start
        : Infinity;
  const train = rows.filter((o) => spans.get(o.instanceKey)!.end < cutoff),
    test = rows.filter((o) => spans.get(o.instanceKey)!.start >= cutoff);
  const model = trainSegments(train),
    official: { actual: number; predicted: number }[] = [],
    candidate: { actual: number; predicted: number }[] = [],
    deployed: { actual: number; predicted: number }[] = [];
  let supported = 0,
    missingOfficial = 0;
  for (const o of test) {
    if (
      o.officialSeconds === null ||
      !Number.isFinite(o.officialSeconds) ||
      o.officialSeconds < 0
    ) {
      missingOfficial++;
      continue;
    }
    const prediction = predictSegment(model, o),
      old = current ? predictSegment(current, o) : null;
    if (prediction !== null) supported++;
    official.push({ actual: o.seconds, predicted: o.officialSeconds });
    candidate.push({
      actual: o.seconds,
      predicted: prediction ?? o.officialSeconds,
    });
    deployed.push({ actual: o.seconds, predicted: old ?? o.officialSeconds });
  }
  const baseline = score(official),
    proposed = score(candidate),
    existing = score(deployed),
    heldOutTrips = new Set(test.map((o) => o.instanceKey)).size,
    coverage = test.length ? supported / test.length : 0;
  const currentLeakage =
    !!current && Date.parse(current.trainedThrough) >= cutoff;
  const sufficient =
    !currentLeakage &&
    test.length >= 100 &&
    heldOutTrips >= 30 &&
    coverage >= 0.8 &&
    baseline.samples >= 100;
  const improves =
    sufficient &&
    proposed.meanAbsolute! < baseline.meanAbsolute! * 0.95 &&
    proposed.meanAbsolute! < existing.meanAbsolute! * 0.95 &&
    proposed.p90! <= baseline.p90! &&
    proposed.p90! <= existing.p90! &&
    proposed.p95! <= baseline.p95! &&
    proposed.p95! <= existing.p95!;
  return {
    model,
    report: {
      schemaVersion: 1,
      cutoff: Number.isFinite(cutoff) ? new Date(cutoff).toISOString() : null,
      currentLeakage,
      trainingEvents: train.length,
      trainingTrips: new Set(train.map((o) => o.instanceKey)).size,
      heldOutEvents: test.length,
      heldOutTrips,
      overlappingEventsExcluded: rows.length - train.length - test.length,
      rejected: cleaned.rejected,
      duplicates: cleaned.duplicates,
      missingOfficial,
      coverage,
      official: baseline,
      current: existing,
      candidate: proposed,
      promote: improves,
      reason: improves
        ? "Candidate improves both baselines with no tail-error regression."
        : sufficient
          ? "Candidate did not beat both baselines without tail-error regression."
          : "Insufficient later, trip-disjoint evidence. Keep official predictions.",
      arrivalWindowsEnabled: false,
    },
  };
}

/** Linear distance along a verified shape; used only after a model passes promotion. */
export function positionAlongShape(
  shape: [number, number][],
  meters: number,
): [number, number] | null {
  if (
    !shape.length ||
    !Number.isFinite(meters) ||
    meters < 0 ||
    shape.some(
      (p) =>
        p.length !== 2 ||
        !p.every(Number.isFinite) ||
        Math.abs(p[0]) > 180 ||
        Math.abs(p[1]) > 90,
    )
  )
    return null;
  let remaining = meters;
  for (let i = 1; i < shape.length; i++) {
    const a = shape[i - 1],
      b = shape[i],
      rad = Math.PI / 180,
      h =
        Math.sin(((b[1] - a[1]) * rad) / 2) ** 2 +
        Math.cos(a[1] * rad) *
          Math.cos(b[1] * rad) *
          Math.sin(((b[0] - a[0]) * rad) / 2) ** 2,
      length = 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
    if (remaining <= length && length > 0) {
      const f = remaining / length;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    remaining -= length;
  }
  return shape.at(-1)!;
}
export function predictDownstream(
  model: SegmentModel,
  input: {
    promoted: boolean;
    /** Required: sourceAt is an independently observed arrival at the previous stop. */
    atObservedStopArrival?: boolean;
    patternId: string;
    direction: string;
    instanceKey: string;
    sourceAt: string;
    now: number;
    currentSequence: number;
    progress: number;
    shape: [number, number][];
    stops: { sequence: number; stopId: string; metersAlongShape: number }[];
  },
) {
  if (
    !input.promoted ||
    !input.atObservedStopArrival ||
    model.timingBasis !== "arrival_to_arrival" ||
    !input.instanceKey ||
    input.now - Date.parse(input.sourceAt) > 30000 ||
    input.now < Date.parse(input.sourceAt) - 15000 ||
    !Number.isFinite(input.progress)
  )
    return null;
  const stops = [...input.stops].sort((a, b) => a.sequence - b.sequence);
  if (
    stops.some(
      (s, i) =>
        !Number.isFinite(s.metersAlongShape) ||
        s.metersAlongShape < 0 ||
        (i > 0 &&
          (s.sequence <= stops[i - 1].sequence ||
            s.metersAlongShape < stops[i - 1].metersAlongShape)),
    )
  )
    return null;
  const next = stops.findIndex((s) => s.sequence === input.currentSequence);
  if (
    next < 1 ||
    // Arrival-to-arrival cohorts cannot infer remaining travel from moving GPS progress.
    input.progress !== stops[next - 1].metersAlongShape ||
    input.progress > stops[next].metersAlongShape
  )
    return null;
  let seconds = 0;
  const predictions = [];
  for (let i = next; i < stops.length; i++) {
    const prev = stops[i - 1],
      stop = stops[i],
      duration = predictSegment(model, {
        patternId: input.patternId,
        direction: input.direction,
        fromSequence: prev.sequence,
        toSequence: stop.sequence,
        kind: "segment",
        observedAt: new Date(input.now).toISOString(),
      });
    if (duration === null) return predictions.length ? predictions : null;
    const length = stop.metersAlongShape - prev.metersAlongShape;
    seconds +=
      duration *
      (i === next && length > 0
        ? (stop.metersAlongShape - input.progress) / length
        : 1);
    if (seconds > 900) break;
    const position = positionAlongShape(input.shape, stop.metersAlongShape);
    if (!position) return null;
    predictions.push({
      instanceKey: input.instanceKey,
      stopId: stop.stopId,
      stopSequence: stop.sequence,
      nextStop: i === next,
      arrivalAt: new Date(input.now + seconds * 1000).toISOString(),
      position,
      sourceTime: input.sourceAt,
      validUntil: new Date(Date.parse(input.sourceAt) + 30000).toISOString(),
      provenance: "calculated" as const,
    });
    // These durations already include dwell at the origin stop. Adding a dwell
    // cohort here would double-count it. Separate departure evidence requires a
    // different timing contract before moving-vehicle interpolation can serve.

  }
  return predictions;
}
