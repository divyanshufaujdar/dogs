-- Campus Dogs — lift the BITS email restriction.
-- Paste into Supabase → SQL Editor → Run to allow any email to sign up again.
-- (Also set RESTRICT_TO_BITS = false in src/lib/bits.ts.)

drop trigger if exists enforce_bits_email_trg on auth.users;
drop function if exists public.enforce_bits_email();
