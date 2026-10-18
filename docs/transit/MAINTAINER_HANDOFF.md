# Maintainer deployment handoff

Use this handoff when the contributor can develop and open a PR but cannot administer the shared Supabase project. The maintainer keeps all credentials in their own authorized environment. The contributor does not need direct database access to submit this change.

## Review and merge

- Review branch `feature/transit-ingestion` against `main`; run CI before merging.
- Confirm with the task 3 owner that the additive `transit_*` schema does not conflict with their private tables. This change does not alter profiles or introduce personal feature tables.
- Review the source-access record in `README.md` in this directory, retain the original Passio correspondence, and record permitted use and the approved polling interval before enabling ingestion.
- Check whether the existing Supabase GitHub integration actually applies migrations from the production branch. A connected repository alone is not evidence that this is enabled. Use either that reviewed deployment path or the authorized CLI workflow below; do not apply the same migration independently through both paths.

## Apply the schema

Target the existing ArchRide project `yivnryjbzhampecphlgr`. Use the maintainer's installed Supabase CLI, following `docs/DEVELOPMENT.md`. Inspect CLI help first, sign in using the maintainer's account, and link this checkout to that project. Then:

```sh
supabase db push --linked --dry-run
# Verify that only reviewed, unapplied migrations are listed.
supabase db push --linked
pnpm db:types
supabase db advisors --linked --type all
```

If any migration was already applied under another version, or the dry run includes a teammate's unapplied migration, reconcile the history with that owner before proceeding. Do not edit an applied migration or reset the shared database. Commit any resulting generated-type corrections to this feature branch (or a reviewed follow-up).

## Configure and run the worker

1. Configure the app's public project URL and publishable key in its deployment environment. These are separate from worker credentials.
2. Store `TRANSIT_DATABASE_URL` in the chosen worker's secret manager. It must be a TLS-verified direct or SESSION-pooler database connection, not a transaction-pooler connection. Never paste it into a PR, issue, chat, or tracked file.
3. After the source permission/rate check, enable only this source through the authorized SQL editor:

```sql
update public.transit_sources set enabled = true where id = 'uga-passio';
```

4. Set `TRANSIT_SOURCE_APPROVED=true` in the trusted worker environment and run `pnpm transit:ingest` twice. Compare counts and timestamps; identical source revisions must not duplicate observations or stop events.
5. For GitHub Actions, configure repository secret `TRANSIT_DATABASE_URL` and repository variables `TRANSIT_SOURCE_APPROVED=true` and `TRANSIT_INGESTION_ENABLED=true`. Run the workflow manually and inspect its logs before relying on its schedule. Its five-minute interval is a bootstrap option; the UI correctly marks older realtime observations stale after three minutes.
6. For a provider-approved live polling interval, use the dedicated-host examples in `deployment/`, and disable the Actions poller. Use one scheduled poller. Do not enable the sample 30-second timer until the provider permits that rate and the team has checked its free-plan budget.

## Verify hosted behavior

These read-only SQL checks can run in the maintainer's SQL editor:

```sql
select id, state, source_timestamp, last_success_at, entity_count, error_code,
       next_attempt_at
from public.feed_status
where id like 'uga-passio:%'
order by id;

select count(*) as routes from public.transit_routes where active;
select count(*) as stops from public.transit_stops where active;

select feed_id, outcome, entity_count, error_code, finished_at
from public.transit_job_runs
order by finished_at desc
limit 20;

select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename like 'transit_%';

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name like 'transit_%'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;
```

Public transit tables should grant those roles SELECT only. Observations, observed events, job diagnostics, and retention configuration should not grant them access. Also verify denied writes using the app's publishable client and an ordinary signed-in account; SQL-editor administrator access is not a substitute for that check.

Open `/api/health` with the app's public configuration. Verify database connectivity and inspect the separate transit state/freshness fields. Test a staging outage and recovery, and overlapping worker invocations. Have the Home and Map owners consume the typed public read helpers and verify that stale/missing predictions never produce a live countdown. Runbook details and rollback steps are in this directory's `README.md`.

## Return evidence to the team

Report the applied migration version, CI result, first scheduled-run time, replay counts, hosted permission-check results, source rate confirmation, and any generated-type changes. Share only non-secret results. The week 1 draft can close when those hosted checks and teammate integration pass; passing local tests alone does not complete the hosted acceptance criteria.
