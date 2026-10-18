// Synthetic, sanitized fixtures. Never imported by production code.
import { zipSync, strToU8 } from "fflate";
import GtfsRealtime from "gtfs-realtime-bindings";
export const NOW = Date.parse("2026-10-17T16:00:00Z");
export const epoch = NOW / 1000;
export function archive(overrides: Record<string, string> = {}) {
  const files = {
    "agency.txt": "agency_id,agency_timezone\n1,America/New_York\n",
    "routes.txt":
      "route_id,route_short_name,route_long_name,route_color,route_text_color\nr,R,Test Loop,FF0000,FFFFFF\n",
    "stops.txt":
      "stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station\na,Test East,0,0,0,\nb,Test West,33.95,-83.37,0,\n",
    "calendar.txt":
      "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\ns,1,1,1,1,1,1,1,20260101,20261231\n",
    "trips.txt":
      "route_id,service_id,trip_id,trip_headsign,direction_id,shape_id\nr,s,t,Loop,0,\n",
    "stop_times.txt":
      "trip_id,arrival_time,departure_time,stop_id,stop_sequence,pickup_type,drop_off_type\nt,24:01:00,24:01:00,a,1,0,0\nt,,,b,2,0,0\nt,25:01:00,25:01:00,a,3,0,0\n",
    "frequencies.txt":
      "trip_id,start_time,end_time,headway_secs,exact_times\nt,23:00:00,26:00:00,600,0\n",
    ...overrides,
  };
  return zipSync(
    Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])),
  );
}
export const trip = {
  tripId: "t",
  routeId: "r",
  startDate: "20261017",
  startTime: "24:00:00",
};
export function message(
  entity: unknown[],
  timestamp = epoch,
  incrementality = 0,
) {
  return GtfsRealtime.transit_realtime.FeedMessage.encode(
    GtfsRealtime.transit_realtime.FeedMessage.fromObject({
      header: { gtfsRealtimeVersion: "2.0", timestamp, incrementality },
      entity,
    }),
  ).finish();
}
export const vehicle = (
  timestamp = epoch,
  extra: Record<string, unknown> = {},
) => ({
  id: "v",
  vehicle: {
    trip,
    vehicle: { id: "v" },
    position: { latitude: 0, longitude: 0 },
    timestamp,
    currentStopSequence: 1,
    stopId: "a",
    currentStatus: 1,
    ...extra,
  },
});
export const update = (
  timestamp = epoch,
  extra: Record<string, unknown> = {},
) => ({
  id: "u",
  tripUpdate: {
    trip,
    timestamp,
    stopTimeUpdate: [
      { stopSequence: 1, stopId: "a", arrival: { time: epoch + 300 } },
      { stopSequence: 3, stopId: "a", arrival: { time: epoch + 900 } },
    ],
    ...extra,
  },
});
