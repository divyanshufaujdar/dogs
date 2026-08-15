import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Server-only — it bypasses RLS, so it must
 * never be imported into a Client Component or exposed to the browser.
 * Used to create confirmed users without sending any email.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set in .env.local");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function hasAdminKey(): boolean {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}
