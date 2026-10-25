import { DateTime } from "ts-luxon";

type ClassEntry = {
  id: string;
  label: string;
  weekdays: number[];
  startTime: string;
  comment: string;
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
