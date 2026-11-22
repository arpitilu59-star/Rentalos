-- Private, deduplicated engagement data. Public clients cannot read or write raw events.
create table public.room_views (
  room_id uuid not null references public.rooms(id) on delete cascade,
  viewer_key text not null check(length(viewer_key) = 64),
  day date not null default (now() at time zone 'Asia/Kolkata')::date,
  first_seen_at timestamptz not null default now(),
  video_completed_at timestamptz,
  primary key(room_id, viewer_key, day)
);
create table public.room_save_events (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'Asia/Kolkata')::date,
  primary key(room_id, user_id, day)
);
create table public.room_insight_preferences (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  summary_frequency text not null default 'weekly' check(summary_frequency in ('daily','weekly','off')),
  signals_enabled boolean not null default true
);
create table public.request_rate_limits (
  scope text not null, key_hash text not null, bucket timestamptz not null,
  requests integer not null default 1,
  primary key(scope, key_hash, bucket)
);
create table public.support_queries (
  id uuid primary key,
  requester_hash text not null,
  name text not null check(length(name) between 2 and 100),
  email text not null check(length(email) <= 254),
  phone text check(length(phone) <= 20),
  category text not null check(category in ('booking','payments','account','technical','other')),
  subject text not null check(length(subject) between 4 and 150),
  message text not null check(length(message) between 20 and 4000),
  status text not null default 'queued' check(status in ('queued','accepted','failed')),
  provider_id text,
  created_at timestamptz not null default now()
);
alter table public.room_views enable row level security;
alter table public.room_save_events enable row level security;
alter table public.room_insight_preferences enable row level security;
alter table public.request_rate_limits enable row level security;
alter table public.support_queries enable row level security;
revoke all on public.room_views, public.room_save_events, public.request_rate_limits, public.support_queries from anon, authenticated;
grant all on public.room_views, public.room_save_events, public.request_rate_limits, public.support_queries, public.room_insight_preferences to service_role;
grant select, insert, update on public.room_insight_preferences to authenticated;
create policy "own insight preferences" on public.room_insight_preferences for all to authenticated
 using(owner_id = auth.uid()) with check(owner_id = auth.uid());

-- Atomic limits work across serverless instances. Only HMAC hashes are stored, never raw IPs.
create function public.consume_request_limit(_scope text, _key text, _limit integer, _seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer; b timestamptz;
begin
 if _limit < 1 or _seconds < 1 or length(_key) <> 64 then return false; end if;
 b := to_timestamp(floor(extract(epoch from now()) / _seconds) * _seconds);
 insert into request_rate_limits(scope,key_hash,bucket) values(_scope,_key,b)
 on conflict(scope,key_hash,bucket) do update set requests = request_rate_limits.requests + 1
 returning requests into n;
 return n <= _limit;
end $$;

create function public.room_insight_counts(_owner uuid, _days integer default 7)
returns table(room_id uuid, room_number text, views bigint, video_completions bigint, saves bigint,
 offers bigint, requests bigint, bookings bigint, has_video boolean, has_photos boolean)
language sql security definer stable set search_path = public as $$
 select r.id, r.room_number,
 (select count(*) from room_views v where v.room_id=r.id and v.day >= (now() at time zone 'Asia/Kolkata')::date - (least(greatest(_days,1),90)-1)),
 (select count(*) from room_views v where v.room_id=r.id and v.video_completed_at is not null and v.day >= (now() at time zone 'Asia/Kolkata')::date - (least(greatest(_days,1),90)-1)),
 (select count(*) from room_save_events s where s.room_id=r.id and s.day >= (now() at time zone 'Asia/Kolkata')::date - (least(greatest(_days,1),90)-1)),
 (select count(*) from bookings b where b.room_id=r.id and b.offered_rent is not null and b.created_at >= ((now() at time zone 'Asia/Kolkata')::date - (least(greatest(_days,1),90)-1)) at time zone 'Asia/Kolkata'),
 (select count(*) from bookings b where b.room_id=r.id and b.created_at >= ((now() at time zone 'Asia/Kolkata')::date - (least(greatest(_days,1),90)-1)) at time zone 'Asia/Kolkata'),
 (select count(*) from bookings b where b.room_id=r.id and b.status='accepted' and b.created_at >= ((now() at time zone 'Asia/Kolkata')::date - (least(greatest(_days,1),90)-1)) at time zone 'Asia/Kolkata'),
 exists(select 1 from live_feed_videos v where v.room_id=r.id and v.verification_status='verified' and v.processing_status='ready'),
 coalesce(jsonb_array_length(to_jsonb(r.myr_photos)),0)>0
 from rooms r where r.owner_id=_owner order by r.room_number;
$$;

create function public.notify_room_signal(_room uuid, _kind text) returns void
language plpgsql security definer set search_path = public as $$
declare o uuid; label text; slot text;
begin
 if _kind not in ('saved','video_complete') then return; end if;
 select owner_id,room_number into o,label from rooms where id=_room;
 if o is null or not room_insights_enabled(o) or exists(select 1 from room_insight_preferences where owner_id=o and not signals_enabled) then return; end if;
 slot := floor(extract(epoch from now()) / 900)::text;
 if not claim_automation_slot('room_signal_'||_kind,o,slot,'landlord') then return; end if;
 perform notify_user(o,'room_insight_signal',case when _kind='saved' then 'A room was saved' else 'A full room video was watched' end,
   'Room '||coalesce(label,'')||case when _kind='saved' then ' was saved. Open Insights for the counts.' else ': a viewer reached the end of the full video. Open Insights for the counts.' end,'/rentdesk');
 perform finish_automation_slot('room_signal_'||_kind,o,slot,'completed');
end $$;

create function public.capture_room_save() returns trigger
language plpgsql security definer set search_path = public as $$
declare inserted integer;
begin
 if not exists(select 1 from rooms where id=new.room_id and is_public and room_insights_enabled(owner_id) and owner_id<>new.user_id) then return new; end if;
 insert into room_save_events(room_id,user_id) values(new.room_id,new.user_id) on conflict do nothing;
 get diagnostics inserted = row_count;
 if inserted>0 then perform notify_room_signal(new.room_id,'saved'); end if;
 return new;
end $$;
create trigger capture_room_save after insert on public.app_saved_rooms for each row execute function public.capture_room_save();

create function public.record_room_engagement(_room uuid,_viewer text,_user uuid,_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare d date:=(now() at time zone 'Asia/Kolkata')::date; inserted integer; seconds numeric;
begin
 if length(_viewer)<>64 or _kind not in ('view','video_complete') then return; end if;
 if not exists(select 1 from rooms where id=_room and is_public and room_insights_enabled(owner_id) and owner_id is distinct from _user) then return; end if;
 if _kind='view' then
  insert into room_views(room_id,viewer_key,day) values(_room,_viewer,d) on conflict do nothing;
 else
  select duration_seconds into seconds from live_feed_videos where room_id=_room and verification_status='verified' and processing_status='ready' order by created_at desc limit 1;
  if seconds is null then return; end if;
  update room_views set video_completed_at=now() where room_id=_room and viewer_key=_viewer and day=d
   and video_completed_at is null and first_seen_at <= now()-make_interval(secs=>greatest(seconds-4,3)::double precision);
  get diagnostics inserted = row_count;
  if inserted>0 then perform notify_room_signal(_room,'video_complete'); end if;
 end if;
end $$;
revoke all on function public.record_room_engagement(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.record_room_engagement(uuid,text,uuid,text) to service_role;

create function public.run_room_insight_summaries() returns integer
language plpgsql security definer set search_path = public as $$
declare o record; r record; slot text; freq text; days integer; n integer:=0;
begin
 for o in select distinct owner_id from rooms where is_public and room_insights_enabled(owner_id) loop
  select summary_frequency into freq from room_insight_preferences where owner_id=o.owner_id;
  freq:=coalesce(freq,'weekly');
  if freq='off' or (freq='weekly' and extract(isodow from now() at time zone 'Asia/Kolkata')<>1) then continue; end if;
  days:=case when freq='daily' then 1 else 7 end;
  slot:=to_char(now() at time zone 'Asia/Kolkata',case when freq='daily' then 'YYYY-MM-DD' else 'IYYY-IW' end);
  if not claim_automation_slot('room_insights_'||freq,o.owner_id,slot,'landlord') then continue; end if;
  select coalesce(sum(views),0) views,coalesce(sum(video_completions),0) video_completions,
   coalesce(sum(saves),0) saves,coalesce(sum(requests),0) requests into r from room_insight_counts(o.owner_id,days);
  if r.views+r.saves+r.requests>0 then
   perform notify_user(o.owner_id,'room_insight_summary',case when freq='daily' then 'Daily' else 'Weekly' end||' room insights',
    r.views||' daily unique views, '||r.video_completions||' full video plays, '||r.saves||' saves, '||r.requests||' requests across your rooms. Open Insights for room counts.','/rentdesk');
  end if;
  perform finish_automation_slot('room_insights_'||freq,o.owner_id,slot,'completed'); n:=n+1;
 end loop;
 delete from room_views where day < current_date-90;
 delete from room_save_events where day < current_date-90;
 delete from request_rate_limits where bucket < now()-interval '2 days';
 delete from support_queries where created_at < now()-interval '180 days';
 return n;
end $$;

revoke all on function public.consume_request_limit(text,text,integer,integer), public.room_insight_counts(uuid,integer), public.notify_room_signal(uuid,text), public.capture_room_save(), public.run_room_insight_summaries() from public,anon,authenticated;
grant execute on function public.consume_request_limit(text,text,integer,integer), public.room_insight_counts(uuid,integer), public.notify_room_signal(uuid,text), public.run_room_insight_summaries() to service_role;
do $$ begin perform cron.schedule('room-insight-summaries','30 3 * * *','select public.run_room_insight_summaries()'); exception when invalid_schema_name or undefined_function then null; end $$;

-- Operational rollout control and daily aggregate spike alerts; never expose raw visitors.
create table public.room_insight_rollout (
 id boolean primary key default true check(id),enabled boolean not null default false,
 pilot_owners uuid[] not null default '{}'
);
insert into public.room_insight_rollout(id) values(true);
alter table public.room_insight_rollout enable row level security;
revoke all on public.room_insight_rollout from anon,authenticated;
grant all on public.room_insight_rollout to service_role;
create function public.room_insights_enabled(_owner uuid) returns boolean language sql security definer stable set search_path=public as $$
 select coalesce((select enabled or _owner=any(pilot_owners) from room_insight_rollout where id),false);
$$;
revoke all on function public.room_insights_enabled(uuid) from public,anon,authenticated;
grant execute on function public.room_insights_enabled(uuid) to service_role;
create function public.monitor_room_insights() returns integer language plpgsql security definer set search_path=public as $$
declare spikes integer;admin_id uuid;slot text:=to_char(now() at time zone 'Asia/Kolkata','YYYY-MM-DD');
begin
 select count(*) into spikes from (select room_id from room_views where day=(now() at time zone 'Asia/Kolkata')::date-1 group by room_id having count(*)>500) s;
 if spikes=0 then return 0;end if;
 for admin_id in select user_id from admin_users where active loop
  if claim_automation_slot('room_insight_spike',admin_id,slot,'admin') then
   perform notify_user(admin_id,'admin_room_insight_spike','Review room activity spike',spikes||' rooms exceeded 500 daily unique views yesterday. Review aggregate activity and rate limits before treating this as demand.','/admin');
   perform finish_automation_slot('room_insight_spike',admin_id,slot,'completed');
  end if;
 end loop;return spikes;
end $$;
revoke all on function public.monitor_room_insights() from public,anon,authenticated;
grant execute on function public.monitor_room_insights() to service_role;
do $$ begin perform cron.schedule('room-insight-monitor','15 3 * * *','select public.monitor_room_insights()'); exception when invalid_schema_name or undefined_function then null;end $$;
