-- Aggregate totals include every non-archived bill; pagination applies only to activity lists.
create function public.landlord_dashboard_totals(_owner uuid) returns jsonb language sql security definer stable set search_path=public as $$
 select jsonb_build_object(
 'properties',(select count(*) from properties where owner_id=_owner),
 'rooms',(select count(*) from rooms where owner_id=_owner),
 'occupied',(select count(distinct room_id) from tenants where owner_id=_owner and active),
 'beds',(select coalesce(sum(capacity),0) from rooms where owner_id=_owner),
 'filled',(select count(*) from tenants where owner_id=_owner and active),
 'due',(select coalesce(sum(greatest(total_amount-coalesce(amount_paid,0),0)),0) from bills where owner_id=_owner and status<>'paid' and not archived),
 'overdue',(select coalesce(sum(greatest(total_amount-coalesce(amount_paid,0),0)),0) from bills where owner_id=_owner and status<>'paid' and not archived and due_date<(now() at time zone 'Asia/Kolkata')::date),
 'collected',(select coalesce(sum(amount_paid),0) from bills where owner_id=_owner and not archived and paid_at>=date_trunc('month',now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'),
 'paid',(select coalesce(sum(amount_paid),0) from bills where owner_id=_owner and not archived),
 'pending',jsonb_build_object(
 'bookings',(select count(*) from bookings where landlord_id=_owner and status='pending'),
 'payments',(select count(*) from payments where owner_id=_owner and verification_status in ('submitted','pending')),
 'meters',(select count(*) from meter_submissions where owner_id=_owner and status='pending'),
 'tickets',(select count(*) from maintenance_tickets where owner_id=_owner and status in ('open','in_progress')))
 );
$$;
revoke all on function public.landlord_dashboard_totals(uuid) from public,anon,authenticated;
grant execute on function public.landlord_dashboard_totals(uuid) to service_role;
