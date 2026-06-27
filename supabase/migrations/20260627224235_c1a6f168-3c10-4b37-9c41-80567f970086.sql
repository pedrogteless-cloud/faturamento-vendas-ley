
alter function public.fmt_brl(bigint) set search_path = public;
alter function public.workdays_in_month(uuid, int, int) set search_path = public;
alter function public.workdays_remaining(uuid, date) set search_path = public;
alter function public.workdays_elapsed(uuid, date) set search_path = public;

revoke all on function public.fmt_brl(bigint) from public, anon, authenticated;
revoke all on function public.workdays_in_month(uuid, int, int) from public, anon, authenticated;
revoke all on function public.workdays_remaining(uuid, date) from public, anon, authenticated;
revoke all on function public.workdays_elapsed(uuid, date) from public, anon, authenticated;
revoke all on function public.notify_new_entry() from public, anon, authenticated;
