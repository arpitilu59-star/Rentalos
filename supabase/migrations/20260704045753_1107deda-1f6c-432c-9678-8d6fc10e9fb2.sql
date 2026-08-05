
REVOKE EXECUTE ON FUNCTION public.notify_user(uuid,text,text,text,text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_bill_reminders() FROM public, anon, authenticated;
