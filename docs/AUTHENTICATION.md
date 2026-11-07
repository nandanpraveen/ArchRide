# Authentication operations

The owner restored required sign-in on November 6, 2026. Travel routes require Google or email/password sign-in. Privacy and authentication pages remain public. Email signup returns a session immediately; email ownership is not verified. Location permission is optional. Classes, journeys, reminders, and preferences remain on each device, separated by account.

## Contribution and implementation

The email form and safe destination handling adapt [Jadon Montgomery’s authentication contribution, PR #4](https://github.com/nandanpraveen/ArchRide/pull/4). Its normalized email, masked/confirmed passwords, submission guard, recoverable errors, and internal redirects remain useful. Its older server/cookie integration does not fit the current GitHub Pages static export; the current integration uses the pinned Supabase browser SDK and a client PKCE callback.

Protected providers mount only after the session is checked with Supabase Auth. Every transit read, walking request, and rider report independently verifies the JWT signature/expiry and its active `auth.sessions` row. A cached transit response still requires admission. Sign-out revokes the current session. Historical private database tables retain their ownership policies, and direct transit REST grants remain closed.

The account limiter is private and callable only by the server role. That role has column-level access to session ID, user ID, and expiration, without refresh-token access. Anonymous users, missing/forged JWTs, mismatched sessions, and expired/revoked sessions are rejected.

## Limits

| Operation | Account | Network | Global | Shared concurrency |
| --- | --- | --- | --- | --- |
| Transit reads | 360/minute | 3,600/minute | 12,000/minute | 20 |
| Walking routes | 60/minute | 180/minute | 600/minute | 2 |
| Rider reports | 12/hour | 120/hour | 2,000/hour | 2 |

Account counters follow the user across sessions and networks. Network identities use the existing daily HMAC of a trusted Cloudflare address prefix; raw addresses are not stored. Auth signup/sign-in also retains Supabase's 30 attempts per five minutes per IP. Upstream routing admission, bounded inputs/results, and per-isolate concurrency remain independent protections. The operational health endpoint stays public and rate limited.

Unverified email accounts do not establish verified identity or prevent multiple account creation. Network and global limits remain necessary. The existing security-advisor warning for leaked-password protection remains open on the current free plan.

## Provider configuration

- Supabase project: `yivnryjbzhampecphlgr` only.
- Google Cloud project: `archride`, display name ArchRide, project number `739139358325`.
- OAuth audience: External, in production; only non-sensitive identity scopes are configured.
- OAuth client: `ArchRide Web`, ID `739139358325-0s51gkdvausghjqlqjqsl7atpnpo6vti.apps.googleusercontent.com` (public identifier).
- OAuth web origin: `https://nandanpraveen.github.io`.
- Google redirect URI: `https://yivnryjbzhampecphlgr.supabase.co/auth/v1/callback`.
- App callback: `https://nandanpraveen.github.io/archride/auth/callback/` with an internal allowlisted destination.
- Google requests basic identity only: OpenID, email, and profile. No mail, contacts, calendar, or file access.
- Store the Google client secret only in server/provider configuration. Never use `NEXT_PUBLIC_` for secrets, and never commit downloaded credentials.
- Keep anonymous sign-in disabled and refresh-token rotation enabled. Email confirmation is disabled by explicit owner request; email change protections and existing TOTP settings remain enabled.

`supabase config push` applies the entire configuration immediately in this agent environment. It has no dry-run flag. Compare all local settings to the hosted configuration before using it; use targeted provider changes where possible. Preserve unrelated service settings.

Google provider configuration uses `ARCHRIDE_GOOGLE_CLIENT_SECRET` only during an intentional configuration push. Keep its value in secure provider configuration, never source or frontend assets. The initial provider push changed only Google enablement/client credentials; email settings and other services were unchanged. Home and privacy URLs point to the production `/archride/` site. No sensitive/restricted Google scopes are configured.

## Device storage and release

Storage keys include the authenticated user ID. Existing guest data is claimed once by the first account using this browser, with the owner recorded before copying. Pending asynchronous saves/reminders are cancelled when protected providers unmount. Clearing one account's device data preserves other accounts and authentication credentials. Browser storage is not encrypted against someone with access to the browser profile.

Release order: apply the additive private admission migration; configure and validate both providers; run the complete browser/export checks; publish the verified `/archride/` frontend; then promptly deploy `public-read`, `walking-route`, `rider-report`, and `health` with their shared admission module. Enforcing protected reads before publishing the sign-in frontend would interrupt the old account-free app.

Real verification uses a disposable email account and `ARCHRIDE_TEST_EMAIL` / `ARCHRIDE_TEST_PASSWORD` environment variables. The hosted smoke verifies unsigned, forged, and revoked-session rejection; the real export test completes a walking journey. Delete the disposable account after verification. Fixture tests establish interface behavior, not hosted OAuth configuration or transit prediction accuracy.

For rollback, restore the previous function bundle together with the previous frontend. Keep the additive migration and historical records; do not reset production data. Preserve the portfolio root and previous hashed assets as described in [development and deployment](DEVELOPMENT.md).

Production Google and email flows, session rejection, rate-limit persistence across sessions, and the live responsive suite are recorded in [the authentication release evidence](evidence/auth-release.json).
