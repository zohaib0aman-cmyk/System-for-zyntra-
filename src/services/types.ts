import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, LeadRow } from "@/lib/database.types";
import type { FieldErrors } from "@/lib/validation";

/**
 * Every service takes the Supabase client as its first argument so the same
 * functions work from server actions (user session), a future REST API
 * (API-key → service client) and a future MCP server.
 */
export type DB = SupabaseClient<Database>;

export type Lead = LeadRow;

export type ServiceError =
  | { ok: false; code: "validation"; message: string; fieldErrors: FieldErrors }
  | { ok: false; code: "not_found"; message: string }
  | { ok: false; code: "duplicate"; message: string; duplicates: Lead[] }
  | { ok: false; code: "db_error"; message: string };

export type ServiceResult<T> = { ok: true; data: T } | ServiceError;

export function dbError(error: { message: string; code?: string }): ServiceError {
  if (error.code === "42501") {
    return { ok: false, code: "db_error", message: "Not allowed. Is your user added to app_owners?" };
  }
  return { ok: false, code: "db_error", message: error.message };
}
