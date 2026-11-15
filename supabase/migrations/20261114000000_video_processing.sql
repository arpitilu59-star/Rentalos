-- Additive rollout: originals and verification decisions are preserved.
alter table public.live_feed_videos
  add column if not exists processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processing', 'ready', 'failed')),
  add column if not exists processing_error text,
  add column if not exists playback_path text,
  add column if not exists preview_path text,
  add column if not exists poster_path text;

create or replace function public.guard_live_video_processing()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('postgres', 'supabase_admin') or coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.processing_status <> 'pending' or new.processing_error is not null
      or new.playback_path is not null or new.preview_path is not null or new.poster_path is not null then
      raise exception 'Video processing fields are managed by the server';
    end if;
  elsif (new.processing_status, new.processing_error, new.playback_path, new.preview_path, new.poster_path)
    is distinct from (old.processing_status, old.processing_error, old.playback_path, old.preview_path, old.poster_path) then
    raise exception 'Video processing fields are managed by the server';
  end if;
  return new;
end $$;

drop trigger if exists guard_live_video_processing on public.live_feed_videos;
create trigger guard_live_video_processing before insert or update on public.live_feed_videos
  for each row execute function public.guard_live_video_processing();

create index if not exists idx_lfv_playable_room on public.live_feed_videos(room_id, created_at desc)
  where verification_status = 'verified' and processing_status = 'ready';
