import { createClient } from "@/lib/supabase/server";

export type SupabaseHealth =
  | { state: "unconfigured" }
  | { state: "connected" }
  | { state: "error"; message: string };

/**
 * Lightweight Phase-1 connectivity check. Confirms the env vars are present
 * and that the Supabase Auth endpoint is reachable. Uses getSession() because
 * it needs no tables — real tables arrive in Phase 2.
 */
export async function checkSupabaseHealth(): Promise<SupabaseHealth> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key || url.includes("your-project")) {
    return { state: "unconfigured" };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.getSession();
    if (error) return { state: "error", message: error.message };
    return { state: "connected" };
  } catch (err) {
    return {
      state: "error",
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
