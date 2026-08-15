-- Campus Dogs — authoritative BITS email restriction (Phase 7)
-- Paste into Supabase → SQL Editor → Run. Blocks any signup whose email is not
-- a BITS Pilani address, at the database level (can't be bypassed via the API).
-- Safe to re-run. To lift the restriction later, run drop_bits_restriction.sql.

create or replace function public.enforce_bits_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  domain text := lower(split_part(new.email, '@', 2));
  allowed text[] := array[
    'pilani.bits-pilani.ac.in',
    'goa.bits-pilani.ac.in',
    'hyderabad.bits-pilani.ac.in',
    'dubai.bits-pilani.ac.in',
    'bits-pilani.ac.in'
  ];
begin
  if not (
    domain = any(allowed)
    or exists (select 1 from unnest(allowed) d where domain like '%.' || d)
  ) then
    raise exception 'Sign-in is restricted to BITS Pilani email addresses.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_bits_email_trg on auth.users;
create trigger enforce_bits_email_trg
  before insert on auth.users
  for each row execute function public.enforce_bits_email();
