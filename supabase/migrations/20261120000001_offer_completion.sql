-- Completes the offer lifecycle; existing tenancies are never repriced.
alter table public.bookings add column offer_confirmed_at timestamptz;
create unique index one_approved_offer_per_room on public.bookings(room_id)
 where status='pending' and offer_status='approved';
create table public.room_offer_audit (
 id uuid primary key default gen_random_uuid(), room_id uuid references rooms(id) on delete set null,
 actor_id uuid, action text not null, details jsonb not null default '{}', created_at timestamptz not null default now()
);
alter table public.room_offer_audit enable row level security;
grant select on public.room_offer_audit to authenticated;
grant all on public.room_offer_audit to service_role;
create policy "offer audit admin only" on public.room_offer_audit for select to authenticated using(public.is_admin(auth.uid()));
create table public.booking_offer_confirmations (
 booking_id uuid primary key references bookings(id), tenant_user_id uuid not null, landlord_id uuid not null,
 agreed_rent numeric not null check(agreed_rent>0), move_in_date date not null,
 terms_snapshot jsonb not null, confirmed_at timestamptz not null default now()
);
alter table public.booking_offer_confirmations enable row level security;
grant select on public.booking_offer_confirmations to authenticated;
grant all on public.booking_offer_confirmations to service_role;
create policy "own negotiated agreement" on public.booking_offer_confirmations for select to authenticated
 using(auth.uid() in (tenant_user_id,landlord_id));

create function public.audit_offer_settings() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.auto_approve and (not new.offers_enabled or new.min_rent is null) then raise exception 'OFFER_INVALID'; end if;
 if new.min_rent is not null and (new.min_rent<=0 or new.min_rent>10000000 or new.min_rent>(select rent_amount from rooms where id=new.room_id)) then raise exception 'OFFER_INVALID'; end if;
 insert into room_offer_audit(room_id,actor_id,action,details) values(new.room_id,new.owner_id,'settings_changed',jsonb_build_object('enabled',new.offers_enabled,'floor',new.min_rent,'auto_approve',new.auto_approve));
 return new;
end $$;
create trigger audit_offer_settings after insert or update on room_offer_settings for each row execute function audit_offer_settings();

create or replace function public.expire_booking_offers() returns int language plpgsql security definer set search_path=public as $$
declare r record;n int:=0;
begin
 for r in select id,room_id,tenant_user_id,landlord_id from bookings where status='pending' and offer_status in ('pending','countered','approved') and offer_expires_at<=now() for update skip locked loop
  update bookings set offer_status='expired',status='cancelled',offer_expires_at=null where id=r.id;
  insert into room_offer_audit(room_id,action,details) values(r.room_id,'expired',jsonb_build_object('booking_id',r.id));
  perform notify_user(r.tenant_user_id,'booking_offer_expired','Offer expired','The confirmation window ended. You can explore other available rooms.','/myr/bookings');
  n:=n+1;
 end loop;return n;
end $$;

-- Called while holding the room lock. All other open offers close when one price is approved.
create function public.reserve_room_offer(_booking uuid,_amount numeric) returns void language plpgsql security definer set search_path=public as $$
declare b bookings;r record;
begin
 select * into b from bookings where id=_booking;
 update bookings set offer_status='expired',status='cancelled',offer_expires_at=null where room_id=b.room_id and status='pending' and offer_status='approved' and offer_expires_at<=now();
 if exists(select 1 from bookings where room_id=b.room_id and id<>b.id and status='pending' and offer_status='approved') then raise exception 'OFFER_RESERVED';end if;
 update bookings set offer_status='approved',agreed_rent=_amount,offer_expires_at=now()+interval '24 hours' where id=b.id;
 for r in select id,tenant_user_id from bookings where room_id=b.room_id and id<>b.id and status='pending' and offer_status in ('pending','countered') loop
  update bookings set offer_status='expired',status='cancelled',offer_expires_at=null where id=r.id;
  perform notify_user(r.tenant_user_id,'booking_offer_expired','Room offer closed','Another offer is awaiting confirmation for this room.','/myr/bookings');
 end loop;
end $$;

create or replace function public.offer_submit(_booking uuid,_tenant uuid,_offered numeric) returns jsonb language plpgsql security definer set search_path=public as $$
declare b bookings;s room_offer_settings;r rooms;tries integer;last_offer timestamptz;slot text;
begin
 select room_id into b.room_id from bookings where id=_booking;
 select * into r from rooms where id=b.room_id for update;
 select * into b from bookings where id=_booking for update;
 if b.id is null or b.tenant_user_id is distinct from _tenant or b.landlord_id=_tenant then raise exception 'FORBIDDEN';end if;
 if b.status<>'pending' or b.offer_status is not null then raise exception 'OFFER_INVALID_STATE';end if;
 if not public.tenant_verified(_tenant) then raise exception 'OFFER_VERIFICATION_REQUIRED';end if;
 if not r.is_public then raise exception 'OFFERS_OFF';end if;
 select * into s from room_offer_settings where room_id=b.room_id;
 if s.room_id is null or not s.offers_enabled then raise exception 'OFFERS_OFF';end if;
 if _offered is null or _offered<=0 or _offered>10000000 or _offered<>round(_offered) or coalesce(r.rent_amount,0)<=0 then raise exception 'OFFER_INVALID';end if;
 if _offered>=r.rent_amount then raise exception 'OFFER_NOT_LOWER';end if;
 if _offered<ceil(r.rent_amount*.5) then raise exception 'OFFER_TOO_LOW';end if;
 select count(*),max(created_at) into tries,last_offer from bookings where tenant_user_id=_tenant and room_id=b.room_id and offered_rent is not null;
 if tries>=2 then raise exception 'OFFER_LIMIT';end if;
 if last_offer>now()-interval '15 minutes' then raise exception 'OFFER_COOLDOWN';end if;
 if (select count(*) from bookings where tenant_user_id=_tenant and offered_rent is not null and created_at>now()-interval '1 day')>=10 then raise exception 'OFFER_LIMIT';end if;
 update bookings set offer_status='pending',offered_rent=_offered,offer_expires_at=now()+interval '7 days' where id=b.id;
 if s.auto_approve and s.min_rent is not null and _offered>=s.min_rent then
  perform reserve_room_offer(b.id,_offered);
  perform notify_user(_tenant,'booking_offer_approved','Your rent offer is approved','Confirm your booking within 24 hours at Rs '||_offered::bigint||'/month.','/myr/bookings');
 end if;
 insert into room_offer_audit(room_id,actor_id,action,details) values(b.room_id,_tenant,'submitted',jsonb_build_object('booking_id',b.id,'rent',_offered));
 slot:=floor(extract(epoch from now())/900)::text;
 if claim_automation_slot('room_offer_group',b.landlord_id,slot,'landlord') then
  perform notify_user(b.landlord_id,'booking_offers_group','New rent offers','You have new room offers. Review amounts and requests in RentDesk.','/bookings');
  perform finish_automation_slot('room_offer_group',b.landlord_id,slot,'completed');
 end if;
 return jsonb_build_object('offer_status',(select offer_status from bookings where id=b.id));
end $$;

create or replace function public.offer_decide(_booking uuid,_landlord uuid,_action text,_counter numeric default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare b bookings;r rooms;
begin
 select room_id into b.room_id from bookings where id=_booking;
 select * into r from rooms where id=b.room_id for update;
 select * into b from bookings where id=_booking for update;
 if b.id is null or b.landlord_id is distinct from _landlord or r.owner_id is distinct from _landlord then raise exception 'FORBIDDEN';end if;
 if b.status<>'pending' or b.offer_status is distinct from 'pending' then raise exception 'OFFER_INVALID_STATE';end if;
 if b.offer_expires_at<=now() then raise exception 'OFFER_EXPIRED';end if;
 if _action='approve' then
  perform reserve_room_offer(b.id,b.offered_rent);
  perform notify_user(b.tenant_user_id,'booking_offer_approved','Your offer was approved','Confirm within 24 hours at Rs '||b.offered_rent::bigint||'/month.','/myr/bookings');
 elsif _action='deny' then
  update bookings set offer_status='declined',status='rejected',decided_at=now(),offer_expires_at=null where id=b.id;
  perform notify_user(b.tenant_user_id,'booking_offer_declined','Offer not accepted','The owner did not accept this offer.','/myr/bookings');
 elsif _action='counter' then
  if _counter is null or _counter<>round(_counter) or _counter<=b.offered_rent or _counter>r.rent_amount then raise exception 'COUNTER_INVALID';end if;
  if b.offer_rounds>=1 then raise exception 'COUNTER_LIMIT';end if;
  update bookings set offer_status='countered',counter_rent=_counter,offer_rounds=1,offer_expires_at=now()+interval '24 hours' where id=b.id;
  perform notify_user(b.tenant_user_id,'booking_offer_counter','A counter offer is ready','The owner offered Rs '||_counter::bigint||'/month. Respond within 24 hours.','/myr/bookings');
 else raise exception 'OFFER_INVALID_ACTION';end if;
 insert into room_offer_audit(room_id,actor_id,action,details) values(b.room_id,_landlord,_action,jsonb_build_object('booking_id',b.id,'counter',_counter));
 return (select jsonb_build_object('offer_status',offer_status,'agreed_rent',agreed_rent,'counter_rent',counter_rent) from bookings where id=b.id);
end $$;

create or replace function public.offer_respond(_booking uuid,_tenant uuid,_action text) returns jsonb language plpgsql security definer set search_path=public as $$
declare b bookings;
begin
 select room_id into b.room_id from bookings where id=_booking;
 perform 1 from rooms where id=b.room_id for update;
 select * into b from bookings where id=_booking for update;
 if b.id is null or b.tenant_user_id is distinct from _tenant then raise exception 'FORBIDDEN';end if;
 if b.status<>'pending' or b.offer_status is distinct from 'countered' then raise exception 'OFFER_INVALID_STATE';end if;
 if b.offer_expires_at<=now() then perform expire_booking_offers();return jsonb_build_object('offer_status','expired');end if;
 if _action='accept' then
  perform reserve_room_offer(b.id,b.counter_rent);
  perform notify_user(b.tenant_user_id,'booking_offer_approved','Counter accepted','Confirm your booking within 24 hours. No payment is collected by this offer feature.','/myr/bookings');
 elsif _action='decline' then update bookings set offer_status='declined',status='cancelled',offer_expires_at=null where id=b.id;
 else raise exception 'OFFER_INVALID_ACTION';end if;
 insert into room_offer_audit(room_id,actor_id,action,details) values(b.room_id,_tenant,'counter_'||_action,jsonb_build_object('booking_id',b.id));
 return (select jsonb_build_object('offer_status',offer_status,'agreed_rent',agreed_rent) from bookings where id=b.id);
end $$;

create or replace function public.offer_agreed_rent(_booking uuid) returns numeric language plpgsql security definer stable set search_path=public as $$
declare b bookings;
begin
 select * into b from bookings where id=_booking;
 if not found then raise exception 'FORBIDDEN';end if;
 if b.offer_status in ('pending','countered') then raise exception 'OFFER_OPEN';end if;
 if b.offer_status='approved' then
  if b.offer_confirmed_at is null then raise exception 'OFFER_CONFIRM_REQUIRED';end if;
  if b.offer_expires_at<=now() then raise exception 'OFFER_EXPIRED';end if;
  return b.agreed_rent;
 end if;
 if b.offer_status in ('expired','declined','withdrawn') then raise exception 'OFFER_INVALID_STATE';end if;
 return null;
end $$;

-- A single transaction prevents duplicate tenants, overbooking and client-supplied rent tampering.
create function public.accept_room_booking(_booking uuid,_landlord uuid,_move_in date,_rent numeric default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare b bookings;r rooms;t uuid;rent numeric;n integer;contact_mobile text;contact_email text;
begin
 select room_id into b.room_id from bookings where id=_booking;
 select * into r from rooms where id=b.room_id for update;
 select * into b from bookings where id=_booking for update;
 if b.id is null or b.landlord_id is distinct from _landlord or r.owner_id is distinct from _landlord then raise exception 'FORBIDDEN';end if;
 if b.status='accepted' then return jsonb_build_object('ok',true,'tenant_id',b.tenant_id);end if;
 if b.status<>'pending' then raise exception 'OFFER_INVALID_STATE';end if;
 if exists(select 1 from bookings where room_id=b.room_id and id<>b.id and status='pending' and offer_status='approved' and offer_expires_at>now()) then raise exception 'OFFER_RESERVED';end if;
 if coalesce((public.terms_reaccept_status(b.id)->>'needs')::boolean,false) then raise exception 'OFFER_TERMS_REVIEW';end if;
 if _move_in is null or _move_in<(now() at time zone 'Asia/Kolkata')::date or _move_in>(now() at time zone 'Asia/Kolkata')::date+365 then raise exception 'OFFER_MOVE_IN_INVALID';end if;
 select count(*) into n from tenants where room_id=b.room_id and active;
 if n>=coalesce(r.capacity,1) then raise exception 'OFFER_ROOM_FULL';end if;
 rent:=coalesce(offer_agreed_rent(b.id),_rent,r.rent_amount);
 if rent is null or rent<=0 or rent>10000000 then raise exception 'OFFER_INVALID';end if;
 select tenant_mobile,tenant_email into contact_mobile,contact_email from booking_offer_contacts where booking_id=b.id;
 insert into tenants(owner_id,room_id,name,phone,email,persons,move_in_date,rent_share,active,tenant_user_id,tenant_code)
 values(b.landlord_id,b.room_id,b.tenant_name,coalesce(nullif(b.tenant_mobile,''),contact_mobile),coalesce(b.tenant_email,contact_email),1,_move_in,rent,true,b.tenant_user_id,generate_tenant_code()) returning id into t;
 update bookings set status='accepted',tenant_id=t,decided_at=now(),offer_expires_at=null where id=b.id;
 if n+1>=coalesce(r.capacity,1) then update bookings set status='rejected',decided_at=now() where room_id=b.room_id and id<>b.id and status='pending';end if;
 return jsonb_build_object('ok',true,'tenant_id',t);
end $$;

create function public.confirm_room_offer(_booking uuid,_tenant uuid,_move_in date) returns jsonb language plpgsql security definer set search_path=public as $$
declare b bookings;result jsonb;snap jsonb;
begin
 select room_id into b.room_id from bookings where id=_booking;
 perform 1 from rooms where id=b.room_id for update;
 select * into b from bookings where id=_booking for update;
 if b.id is null or b.tenant_user_id is distinct from _tenant then raise exception 'FORBIDDEN';end if;
 if b.status='accepted' and b.offer_confirmed_at is not null then return jsonb_build_object('ok',true,'tenant_id',b.tenant_id);end if;
 if b.status<>'pending' or b.offer_status is distinct from 'approved' then raise exception 'OFFER_INVALID_STATE';end if;
 if b.offer_expires_at<=now() then raise exception 'OFFER_EXPIRED';end if;
 update bookings set offer_confirmed_at=now() where id=b.id;
 select snapshot into snap from booking_terms_acceptances where booking_id=b.id order by accepted_at desc limit 1;
 insert into booking_offer_confirmations(booking_id,tenant_user_id,landlord_id,agreed_rent,move_in_date,terms_snapshot)
 values(b.id,_tenant,b.landlord_id,b.agreed_rent,_move_in,jsonb_build_object('accepted_terms',snap,'agreed_monthly_rent',b.agreed_rent,'offer_id',b.id));
 result:=accept_room_booking(b.id,b.landlord_id,_move_in,null);
 perform notify_user(b.landlord_id,'booking_offer_confirmed','Tenant confirmed the booking','The tenant confirmed at Rs '||b.agreed_rent::bigint||'/month. Their tenancy and contact details are ready.','/bookings');
 insert into room_offer_audit(room_id,actor_id,action,details) values(b.room_id,_tenant,'confirmed',jsonb_build_object('booking_id',b.id,'agreed_rent',b.agreed_rent));
 return result;
end $$;

create function public.guard_offer_confirmation() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='INSERT' then
  if current_user in ('anon','authenticated') then new.offer_confirmed_at:=null; if new.status<>'pending' then raise exception 'BOOKING_STATUS_LOCKED';end if;end if;
  return new;
 end if;
 if current_user in ('anon','authenticated') and new.offer_confirmed_at is distinct from old.offer_confirmed_at then raise exception 'OFFER_FIELDS_LOCKED';end if;
 if new.status='accepted' and old.status<>'accepted' and new.offer_status='approved' and (new.offer_confirmed_at is null or new.offer_expires_at<=now()) then raise exception 'OFFER_CONFIRM_REQUIRED';end if;
 return new;
end $$;
create trigger guard_offer_confirmation before insert or update on bookings for each row execute function guard_offer_confirmation();
revoke all on function public.audit_offer_settings(), public.reserve_room_offer(uuid,numeric), public.accept_room_booking(uuid,uuid,date,numeric), public.confirm_room_offer(uuid,uuid,date), public.guard_offer_confirmation() from public,anon,authenticated;
grant execute on function public.accept_room_booking(uuid,uuid,date,numeric), public.confirm_room_offer(uuid,uuid,date) to service_role;
create table public.booking_offer_contacts (
 booking_id uuid primary key references bookings(id) on delete cascade,
 tenant_user_id uuid not null, landlord_id uuid not null, tenant_mobile text, tenant_email text, message text
);
alter table public.booking_offer_contacts enable row level security;
grant select on public.booking_offer_contacts to authenticated;
grant all on public.booking_offer_contacts to service_role;
create policy "offer contact participants after confirmation" on public.booking_offer_contacts for select to authenticated
 using(tenant_user_id=auth.uid() or (landlord_id=auth.uid() and exists(select 1 from bookings b where b.id=booking_id and b.status='accepted')));
create function public.mask_offer_contacts() returns trigger language plpgsql security definer set search_path=public as $$
declare c booking_offer_contacts;
begin
 if new.offered_rent is null then return new;end if;
 if old.offered_rent is null then
  insert into booking_offer_contacts values(new.id,new.tenant_user_id,new.landlord_id,new.tenant_mobile,new.tenant_email,new.message) on conflict(booking_id) do nothing;
 end if;
 if new.status='accepted' then
  select * into c from booking_offer_contacts where booking_id=new.id;
  if c.booking_id is not null then new.tenant_mobile:=c.tenant_mobile;new.tenant_email:=c.tenant_email;new.message:=c.message;end if;
 else new.tenant_mobile:='';new.tenant_email:=null;new.message:=null;
 end if;
 return new;
end $$;
create trigger mask_offer_contacts before update on bookings for each row execute function mask_offer_contacts();
revoke all on function public.mask_offer_contacts() from public,anon,authenticated;

-- Creating the request, accepted terms and offer is all-or-nothing. No orphan request/notification.
create function public.create_room_offer_booking(_tenant uuid,_room uuid,_name text,_mobile text,_email text,_message text,_acks jsonb,_listened boolean,_offered numeric) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r rooms; bid uuid; result jsonb;
begin
 -- Serialize tenant-wide rate checks as well as room capacity/reservations.
 perform pg_advisory_xact_lock(hashtextextended(_tenant::text,17));
 select * into r from rooms where id=_room for update;
 if r.id is null or not r.is_public or not r.myr_available or r.owner_id=_tenant then raise exception 'OFFERS_OFF';end if;
 if (select count(*) from tenants where room_id=r.id and active)>=coalesce(r.capacity,1) then raise exception 'OFFER_ROOM_FULL';end if;
 if exists(select 1 from bookings where room_id=r.id and tenant_user_id=_tenant and status='pending') then raise exception 'OFFER_INVALID_STATE';end if;
 if (select count(*) from bookings where tenant_user_id=_tenant and status='pending')>=10 then raise exception 'OFFER_LIMIT';end if;
 if length(trim(_name))<2 or length(_name)>120 or length(_mobile)>20 then raise exception 'OFFER_INVALID';end if;
 perform set_config('rentalos.creating_offer','true',true);
 insert into bookings(room_id,property_id,landlord_id,tenant_user_id,tenant_name,tenant_mobile,tenant_email,message,status)
 values(r.id,r.property_id,r.owner_id,_tenant,_name,_mobile,_email,_message,'pending') returning id into bid;
 perform record_terms_acceptance(_tenant,bid,_acks,_listened);
 perform set_config('rentalos.creating_offer','false',true);
 result:=offer_submit(bid,_tenant,_offered);
 return jsonb_build_object('booking_id',bid,'offer','sent','offer_status',result->>'offer_status');
end $$;
revoke all on function public.create_room_offer_booking(uuid,uuid,text,text,text,text,jsonb,boolean,numeric) from public,anon,authenticated;
grant execute on function public.create_room_offer_booking(uuid,uuid,text,text,text,text,jsonb,boolean,numeric) to service_role;

-- Suppress only the ordinary booking/terms notices while the atomic offer RPC runs.
-- offer_submit creates the grouped owner notice; other booking notifications are unchanged.
create function public.group_new_offer_notifications() returns trigger language plpgsql set search_path=public as $$
begin
 if current_setting('rentalos.creating_offer',true)='true' and new.kind in ('booking_new','booking_terms_accepted') then return null;end if;
 return new;
end $$;
create trigger group_new_offer_notifications before insert on public.myr_notifications for each row execute function public.group_new_offer_notifications();
revoke all on function public.group_new_offer_notifications() from public,anon,authenticated;
