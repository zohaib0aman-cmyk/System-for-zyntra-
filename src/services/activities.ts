import type { ActivityRow, ActivityType, Json } from "@/lib/database.types";
import { dbError, type DB, type ServiceResult } from "./types";

/**
 * Who made a change: "owner" (you, in the app), "claude", "gpt", "system"
 * (background jobs), or any other AI / integration name.
 */
export type Actor = "owner" | "claude" | "gpt" | "system" | (string & {});

/** Options accepted by every write function in the service layer. */
export type ActorOptions = { actor?: Actor };

export function normalizeActor(actor: Actor | undefined): string {
  // Keep the given name (e.g. an API key's "Claude" / "ChatGPT") — just sanitise.
  const a = (actor ?? "owner").toString().trim().replace(/[^A-Za-z0-9 ._()-]/g, "").slice(0, 40);
  return a || "owner";
}

/**
 * Records one timeline event per lead. Never throws: a logging failure must
 * not undo the change that was just made (it is printed to the server log).
 */
export async function logActivity(
  db: DB,
  leadIds: string | string[],
  type: ActivityType,
  details: Record<string, unknown> = {},
  actor?: Actor,
): Promise<void> {
  const ids = Array.isArray(leadIds) ? leadIds : [leadIds];
  if (ids.length === 0) return;
  const who = normalizeActor(actor);
  const rows = ids.map((lead_id) => ({ lead_id, type, details: details as Json, actor: who }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("lead_activities").insert(rows.slice(i, i + 500));
    if (error) console.error(`[activity] ${type} for ${ids.length} lead(s): ${error.message}`);
  }
}

/** Timeline for a lead, newest first. */
export async function getTimeline(
  db: DB,
  leadId: string,
  options: { limit?: number; before?: string } = {},
): Promise<ServiceResult<ActivityRow[]>> {
  let q = db
    .from("lead_activities")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(Math.min(options.limit ?? 50, 200));
  if (options.before) q = q.lt("created_at", options.before);
  const { data, error } = await q;
  if (error) return dbError(error);
  return { ok: true, data: data ?? [] };
}
