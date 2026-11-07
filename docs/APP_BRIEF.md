# ArchRide

Current owner scope (November 6, 2026): require Google or email/password sign-in for all travel screens, retain server-side account/network/global rate limits, and keep personal travel data on each device separated by account. Email verification and cross-device sync are out of scope. This decision supersedes the guest/sync proposals in the original brief below. The implementation uses the established Material UI system; see [authentication operations](AUTHENTICATION.md).

## App idea

ArchRide is a mobile-first campus transit web app for UGA students. It helps people decide which bus to take, when to leave for a stop, and whether they can reach their destination on time.

Instead of making students interpret a map full of buses, ArchRide turns transit information into clear, useful decisions. A student should be able to search for a campus building, compare taking the bus with walking, and get a recommended trip with an honest arrival estimate.

The app would be built with Next.js and TypeScript for the frontend, Tailwind CSS for styling, and Supabase for authentication, database storage, and backend tasks. UGA transit information available through Passio would be the intended transit source, subject to verifying data access and available fields.

## The problem

Students often need more than a bus location. They need to know whether a bus will reach their stop soon, whether they have enough time to walk there, whether they are boarding in the correct direction, and whether walking would actually be faster.

ArchRide would bring those decisions into one simple interface. Its main promise is clearer and more reliable trip planning, not an unsupported guarantee of perfect arrival predictions.

## Intended experience

The app would have five main navigation destinations.

- Home
- Map
- Plan
- Saved
- Profile

Route details, stop details, service alerts, and active trips would open from those destinations. Basic transit browsing would work without an account. Signing in would unlock synced favorites, saved trips, class schedules, and personal preferences.

## 1. Home dashboard

The home screen would show the information a student is most likely to need immediately.

- A search bar for campus buildings, stops, and destinations.
- A recommended next-trip card with the route, boarding stop, estimated bus arrival, and estimated destination arrival.
- Nearby stops and their next available buses.
- Favorite stops and saved journeys for returning users.
- The next scheduled class destination when a schedule has been added.
- Relevant service alerts and clear data freshness indicators.
- Quick actions for planning a trip or opening the map.

Location access would be optional. Students could choose a starting building or stop manually if they do not want to share their location.

## 2. Live bus map

An interactive map would display buses, stops, and route paths together.

Students could filter routes, select a bus to see its route and last known position, or select a stop to view upcoming arrivals. Route colors would stay consistent throughout the app.

The map would include a button to recenter on the student's location and a mobile-friendly detail panel for selected items. Old vehicle positions would be visibly marked as stale rather than presented as current live locations.

## 3. Route directory and stop details

A searchable route directory would help students understand where each route goes.

Each route page would show its path, ordered stops, direction or route variant, and available operating information. Each stop page would show its location, routes serving it, upcoming arrivals, and relevant alerts.

Stop details would also explain where to board and which direction the bus travels. Students could open walking directions to the boarding point and save the stop to their favorites.

When data is available, the page would show the next three arrivals rather than only the next bus. This would help students make a backup plan or choose a less rushed departure.

## 4. Arrival estimates and reliability

Arrival cards would make the quality of the information visible.

They would show the estimated arrival, the time of the last update, and whether the estimate comes from the transit source or an ArchRide calculation. Arrival windows such as 4–6 minutes would be used when there is enough evidence to support them.

The app would initially use available source estimates. Over time, stored vehicle observations could help evaluate those estimates and test adjustments based on route segment travel times, recent movement, and time of day.

Reliability labels and custom prediction improvements would only be introduced after they can be measured. Missing or stale information would produce a clear explanation instead of a made-up countdown.

## 5. Building-to-building trip planner

Students would search for a destination building rather than needing to know a bus route in advance.

The planner would accept a current location, campus building, stop, or selected map point as the origin. Students could choose to leave now or enter an arrival deadline.

Each suggested trip would explain the complete journey.

- Walk to the boarding stop.
- Wait for the selected bus.
- Board the correct route and direction.
- Exit at the recommended stop.
- Walk to the destination building.

Results would include estimated total travel time and destination arrival time. The initial scope would focus on direct, single-bus journeys. Unsupported trips would be identified clearly rather than filled with unreliable connections.

Building entrances would be used where available to make walking directions more useful.

## 6. Bus versus walking and arrival deadlines

The app would compare a complete bus journey with walking directly to the destination.

The bus estimate would include the walk to the stop, the wait after reaching it, the ride, and the final walk. A bus the student cannot reach in time would not be recommended.

The comparison would explain the recommendation in plain language, such as walking being faster or a bus reducing the amount of walking.

For an arrival deadline, ArchRide would show whether the trip is likely on time, has tight timing, is likely late, or lacks enough data for an assessment. These would be estimates rather than guarantees.

## 7. Service alerts and missed-bus recovery

Relevant service information would appear where it affects the student's trip.

Alerts could describe route changes, stop changes, or other notices supported by the available source data. Any manually entered notice would be labeled separately from agency information.

If a student misses a bus or their selected trip becomes less useful, the app would suggest a recovery option.

- Wait for the next suitable bus.
- Walk to another boarding stop.
- Take a supported alternative route.
- Walk to the destination.

The app would ask the student to confirm a missed bus when it cannot determine that reliably. It would not declare a route closed simply because a bus disappears from the feed.

## 8. Favorites and saved trips

Students could save frequently used stops and journeys.

Favorite stops would appear on the home screen and Saved page. Saved trips could have custom names such as Dorm to Class or Class to Parking.

Opening a saved trip would recalculate the recommendation using current information instead of reusing an old bus selection. Signed-in users would have their saved items synced across devices. Guests could use local favorites without creating an account.

Students could reorder, rename, and remove saved items.

## 9. Class schedule and recurring travel

Students could manually enter their weekly class schedule with a building, day, start time, and preferred arrival buffer.

The app would use that schedule to surface the next destination on the home screen and offer a trip-planning action before class. When a starting location is known, it could calculate a suggested departure time.

Students would be able to enable or disable reminders for individual classes. Campus schedules would use the America/New_York timezone.

The rough scope would not include connecting to university accounts or automatically importing private course information.

## 10. Leave-now reminders and notification center

ArchRide would help students leave at the right time instead of repeatedly checking a countdown.

A leave-now reminder would account for walking time to the stop and a configurable safety buffer. It could update when a bus estimate changes enough to affect the selected trip.

The notification center would also show trip-related service alerts and scheduled class reminders. Notification preferences would include quiet hours and controls for individual notification types.

Reminders would be deduplicated and expire when they are no longer useful. In-app reminders would be the basic experience. Background web push would depend on verified support for the target browsers and devices and would not be assumed to work everywhere.

## 11. Authentication, profile, and preferences

The profile page would manage the student's account and travel preferences.

- Display name and email.
- Default starting location.
- Walking pace preference.
- Preferred arrival buffer.
- Theme preference.
- Notification settings and quiet hours.
- Links to saved stops, trips, and class schedules.
- Sign-out and account deletion.

Supabase Auth would handle authentication. Public maps, routes, stops, and arrival information would remain available without signing in.

Personal schedules and saved trips would be private. The app would explain location requests and avoid storing continuous user location history by default. Account deletion would remove the user's associated personal data.

ArchRide would be described as a student-built project unless official endorsement is obtained.

## 12. Backend, transit data, and database

Supabase would store shared transit data and private user information. Backend tasks would fetch and normalize transit information centrally so every visitor does not make a separate request to the upstream source.

The data layer would preserve source identifiers and timestamps, handle failed requests, keep the last valid snapshot during temporary outages, and expose data freshness to the interface. Polling frequency would depend on verified source limits and update frequency.

### Shared transit data

- Buildings and entrances.
- Routes, directions, and route patterns.
- Stops and ordered route-stop relationships.
- Available operating schedules.
- Vehicles and their latest known positions.
- Historical vehicle observations with a defined retention period.
- Arrival predictions and observed arrival events.
- Cached walking paths.
- Service alerts and the routes or stops they affect.

### Private user data

- Profiles and preferences.
- Favorite stops.
- Saved origin-destination trips.
- Class schedule entries.
- Active trip sessions.
- Reminder jobs and notification history.
- Push subscriptions if background push is supported.

### Security and maintenance

Private records would be protected with row-level security so users can only access their own information. Server credentials would stay out of browser code. Transit writes would be restricted to trusted ingestion and administrative operations.

A small restricted admin screen would show ingestion health, failed jobs, source freshness, and prediction evaluation. It would also support building corrections and clearly labeled manual notices.

The database would use foreign keys, indexes, and uniqueness constraints. Route-stop relationships would support repeated visits to the same stop on loop routes. Latest vehicle state would be kept separate from historical observations to avoid unnecessary growth.

## Visual direction

ArchRide should feel like a polished campus utility rather than a crowded transit dashboard. The interface would use clear cards, readable arrival times, consistent route colors, and simple map interactions.

A restrained red, black, and neutral palette could connect the app to campus while keeping the information easy to read. Mobile screens would prioritize comfortable touch targets and quick decisions. Desktop screens would have more space for maps and side-by-side trip comparisons.

## What makes ArchRide useful

The defining experience is turning transit information into a practical recommendation. A student searches for a class building, sees whether a bus or walking is better, chooses a trip, and gets told when to leave.

If the timing changes, ArchRide explains the change and offers another option. The value is not simply showing more data. It is helping students use that data with less uncertainty.
