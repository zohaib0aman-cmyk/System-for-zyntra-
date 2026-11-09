import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Service-role client for background jobs (cron) — bypasses Row Level Security.
 * Never import this from client code or use it for a user's request.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set SUPABASE_SECRET_KEY (server-only) for background jobs.");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
