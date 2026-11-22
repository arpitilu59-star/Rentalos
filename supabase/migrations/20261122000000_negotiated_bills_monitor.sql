-- Existing tenants and historical bills are unchanged. New monthly bills for confirmed
-- offers must use the immutable agreed price even when a client changes its payload.
create function public.guard_negotiated_bill_rent() returns trigger
language plpgsql security definer set search_path=public as $$
declare agreed numeric;
begin
 if tg_op='UPDATE' and new.rent_amount is not distinct from old.rent_amount and new.tenant_id is not distinct from old.tenant_id and new.bill_kind is not distinct from old.bill_kind then return new;end if;
 if new.bill_kind<>'monthly' or new.tenant_id is null then return new;end if;
 select c.agreed_rent into agreed from booking_offer_confirmations c join bookings b on b.id=c.booking_id
 where b.tenant_id=new.tenant_id and b.status='accepted' order by c.confirmed_at desc limit 1;
 if agreed is not null and new.rent_amount is distinct from agreed then
  raise exception 'This tenant agreed to Rs % per month. Use the agreed rent for this monthly bill.',agreed;
 end if;
 return new;
end $$;
create trigger guard_negotiated_bill_rent before insert or update on public.bills for each row execute function public.guard_negotiated_bill_rent();
revoke all on function public.guard_negotiated_bill_rent() from public,anon,authenticated;

create function public.room_activity_spikes() returns table(room_id uuid,room_number text,views bigint,offers bigint)
language sql security definer stable set search_path=public as $$
 with activity as (
 select r.id,r.room_number,
 (select count(*) from room_views v where v.room_id=r.id and v.first_seen_at>=now()-interval '24 hours') views,
 (select count(*) from bookings b where b.room_id=r.id and b.offered_rent is not null and b.created_at>=now()-interval '24 hours') offers
 from rooms r)
 select id,room_number,views,offers from activity where views>500 or offers>20 order by views+offers desc limit 100;
$$;
revoke all on function public.room_activity_spikes() from public,anon,authenticated;
grant execute on function public.room_activity_spikes() to service_role;
create or replace function public.monitor_room_insights() returns integer language plpgsql security definer set search_path=public as $$
declare spikes integer;admin_id uuid;slot text:=to_char(now() at time zone 'Asia/Kolkata','YYYY-MM-DD');
begin
 select count(*) into spikes from room_activity_spikes();
 if spikes=0 then return 0;end if;
 for admin_id in select user_id from admin_users where active loop
  if claim_automation_slot('room_insight_spike',admin_id,slot,'admin') then
   perform notify_user(admin_id,'admin_room_insight_spike','Review room activity spike',spikes||' rooms exceeded 500 daily views or 20 offers. Review the activity before treating this as demand.','/admin/fraud');
   perform finish_automation_slot('room_insight_spike',admin_id,slot,'completed');
  end if;
 end loop;return spikes;
end $$;
