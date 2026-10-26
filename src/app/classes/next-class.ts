import { DateTime } from "ts-luxon";

export type ClassEntry = {
  id: number;
  title: string;
  weekdays: number[];
  startsAt: string;
  enabled: boolean;
};

type NextOccurence = {
  classEntry: ClassEntry;
  startTime: string;
};

const now = DateTime.now()
  .setZone("America/New_York")
  .minus({ weeks: 1 })
  .endOf("day")
  .toISO();

export default function getNextOccurrence(
  classes: ClassEntry[],
  now: DataTime,
): NextOccurence | null {}
