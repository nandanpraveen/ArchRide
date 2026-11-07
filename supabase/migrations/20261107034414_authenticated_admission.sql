-- Account admission supplements the existing network, global and concurrency gates.
-- The server role can check only these session fields, never refresh tokens or other auth data.
grant select(id,user_id,not_after) on auth.sessions to service_role;
create table archride_private.account_request_limits (
 user_id uuid not null references auth.users(id) on delete cascade,
 scope text not null check(scope in ('read','walking','report')),
 window_start timestamptz not null,
 hits integer not null check(hits>0),
 expires_at timestamptz not null,
 primary key(user_id,scope)
);
create index account_request_limits_expiry on archride_private.account_request_limits(expires_at);
alter table archride_private.account_request_limits enable row level security;
revoke all on archride_private.account_request_limits from public,anon,authenticated;
grant all on archride_private.account_request_limits to service_role;

create function archride_private.admit_account_request(p_scope text,p_hash text,p_user uuid,p_session uuid)
returns table(allowed boolean,retry_after integer,lease_id uuid)
language plpgsql security invoker set search_path='' as $$
declare admitted record; seconds integer; account_limit integer; boundary timestamptz; account_hits integer;
begin
 if p_user is null or p_session is null or not exists(
  select 1 from auth.sessions where id=p_session and user_id=p_user
   and (not_after is null or not_after>clock_timestamp())
 ) then raise exception 'session_required' using errcode='28000';end if;
 case p_scope
  when 'read' then seconds:=60;account_limit:=360;
  when 'walking' then seconds:=60;account_limit:=60;
  when 'report' then seconds:=3600;account_limit:=12;
  else raise exception 'invalid_scope';
 end case;
 -- Its transaction lock also serializes the account counter; denied attempts
 -- still consume the network/global budget and cannot reset it by switching users.
 select * into admitted from archride_private.admit_public_request(p_scope,p_hash);
 if not admitted.allowed then return query select false,admitted.retry_after,admitted.lease_id;return;end if;
 delete from archride_private.account_request_limits where expires_at<=clock_timestamp();
 boundary:=to_timestamp(floor(extract(epoch from clock_timestamp())/seconds)*seconds);
 insert into archride_private.account_request_limits(user_id,scope,window_start,hits,expires_at)
 values(p_user,p_scope,boundary,1,boundary+make_interval(secs=>seconds+60))
 on conflict(user_id,scope) do update set
  hits=case when account_request_limits.window_start=excluded.window_start then account_request_limits.hits+1 else 1 end,
  window_start=excluded.window_start,expires_at=excluded.expires_at
 returning hits into account_hits;
 if account_hits>account_limit then
  delete from archride_private.request_leases where id=admitted.lease_id;
  return query select false,greatest(1,ceil(extract(epoch from boundary+make_interval(secs=>seconds)-clock_timestamp()))::integer),null::uuid;return;
 end if;
 return query select true,0,admitted.lease_id;
end;
$$;
revoke all on function archride_private.admit_account_request(text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function archride_private.admit_account_request(text,text,uuid,uuid) to service_role;

-- HOSTED INFRASTRUCTURE:
select cron.schedule('archride-public-limit-retention','* * * * *',
 'delete from archride_private.request_limits where expires_at<=clock_timestamp(); delete from archride_private.request_leases where expires_at<=clock_timestamp(); delete from archride_private.account_request_limits where expires_at<=clock_timestamp();');
