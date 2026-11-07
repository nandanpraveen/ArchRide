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
          "An account is required to use ArchRide. Preferences, saved places, classes, active trips, and notifications stay in this browser, separated by signed-in account, with no cross-device syncing. Existing device data moves to the first account used after this update. Clear device data in Profile removes the current account’s device data. Browser storage is not encrypted against someone with access to the browser or device.",
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
          "Google sign-in shares your basic profile and email with Supabase Auth to establish your account. Email signup stores your email and a protected password hash in Supabase Auth. Authentication sessions and short-lived account counters enforce access and request limits. Map tiles come from OpenStreetMap. FOSSGIS calculates walking routes and receives selected endpoints. GitHub Pages and these providers may maintain operational logs. Short-lived salted network hashes enforce additional limits without storing raw IP addresses in ArchRide’s rate-limit tables. We do not request access to your Google mail, files, calendar, or contacts.",
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
