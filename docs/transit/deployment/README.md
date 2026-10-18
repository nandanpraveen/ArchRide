# Dedicated host option

These files are examples, not installed services. Use a trusted Linux host, a non-login `archride` user, Node 24 and a reviewed release checkout in `/opt/archride`. Install pinned dependencies first. Adjust the Node binary path to the actual Node 24 installation.

The authorized operator must configure `/etc/archride/transit.env` with owner-only access, `TRANSIT_DATABASE_URL` and `TRANSIT_SOURCE_APPROVED=true`. The URL must use a TLS-verified direct or SESSION pooler connection. Never commit this file. Complete the parent runbook's migration, source enablement and smoke checks first.

Review `OnUnitInactiveSec` against the confirmed Passio limit. Thirty seconds is only an example. Copy the reviewed service and timer to `/etc/systemd/system/`, reload systemd, then enable/start `archride-transit.timer` as the host administrator. No network port or public privileged ingestion endpoint is needed. A oneshot service cannot overlap itself, and the worker's session advisory lock also protects against another host.

Use `systemctl list-timers archride-transit.timer` and `journalctl -u archride-transit.service` to verify operation. Alert on repeated nonzero exits and source staleness. Disable the Actions schedule so there is only one scheduled poller. Stop/disable this timer to pause ingestion. Never change the timer to defeat a provider's Retry-After restriction.
