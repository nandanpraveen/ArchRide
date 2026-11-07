import { Stack, Typography, Box, Link } from "@mui/material";
export default function PrivacyPage() {
  return (
    <Stack spacing={3} sx={{ maxWidth: 760, mx: "auto" }}>
      <Typography component="h1" variant="h1">
        Privacy & data
      </Typography>
      <Typography color="text.secondary">
        ArchRide is a student-built campus utility. It is not affiliated with or
        endorsed by the University of Georgia.
      </Typography>
      {[
        [
          "Location is optional",
          "Choose a building or stop without sharing GPS. When you choose your current location, it stays in page memory. Walking directions send the selected endpoints to the routing service to calculate a path. Precise GPS points are not stored in our route cache, saved journeys, or active-trip history. We do not track you in the background.",
        ],
        [
          "Saved on your device",
          "ArchRide does not require an account. Preferences, saved places, classes, active trips, and notifications are stored in this browser, with no cross-device syncing. Use Clear device data in Profile, or clear this site’s data in your browser settings, to remove them. Someone with access to this browser may see its saved data.",
        ],
        [
          "Estimates & reminders",
          "Transit information comes from UGA / Passio. Walking paths use OpenStreetMap data. Arrival and walking times are estimates, not guarantees. Reminders work while ArchRide is open; browsers may delay them in background tabs. Background push is not enabled.",
        ],
        [
          "Retention",
          "Active trips expire after three hours. Expired notifications are removed after seven days. Raw vehicle observations are retained for up to 12 hours, raw predictions for up to 6 hours, and verified stop events for 14 days. Volume caps can shorten raw history. Rider reports are used for validation and prediction evaluation; no continuous rider location trail is collected.",
        ],
        [
          "Third-party services",
          "Map tiles are provided by OpenStreetMap. Walking routes are calculated by FOSSGIS's OpenStreetMap routing service, whose servers receive the selected route endpoints and may log requests. GitHub Pages hosts the public app and may log visitor IP addresses. Supabase hosts the public transit data and protected routing and reporting endpoints. Short-lived, salted network hashes enforce request limits without storing a raw IP address in ArchRide’s rate-limit tables. Hosting providers may maintain their own operational logs.",
        ],
      ].map(([title, body]) => (
        <Box component="section" key={title} sx={{ pt: 1 }}>
          <Typography component="h2" variant="h2" sx={{ mb: 1 }}>
            {title}
          </Typography>
          <Typography color="text.secondary">{body}</Typography>
        </Box>
      ))}
      <Typography variant="body2">
        <Link href="https://www.openstreetmap.org/copyright">
          OpenStreetMap attribution
        </Link>{" "}
        ·{" "}
        <Link href="https://routing.openstreetmap.de/about.html">
          Walking routing policy
        </Link>{" "}
        ·{" "}
        <Link href="https://www.architects.uga.edu/maps">
          UGA campus map sources
        </Link>
      </Typography>
    </Stack>
  );
}
