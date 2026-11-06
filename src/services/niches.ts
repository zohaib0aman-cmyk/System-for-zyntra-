import { nicheNameSchema } from "@/lib/validation";
import type { NicheRow } from "@/lib/database.types";
import { dbError, type DB, type ServiceResult } from "./types";

export async function listNiches(db: DB): Promise<ServiceResult<NicheRow[]>> {
  const { data, error } = await db.from("niches").select("*").order("name");
  if (error) return dbError(error);
  return { ok: true, data: data ?? [] };
}

/** Adds a niche, or returns the existing one if the name already exists (case-insensitive). */
export async function addNiche(db: DB, name: unknown): Promise<ServiceResult<NicheRow>> {
  const parsed = nicheNameSchema.safeParse(name);
  if (!parsed.success) {
    return { ok: false, code: "validation", message: parsed.error.issues[0].message, fieldErrors: {} };
  }
  const clean = parsed.data.replace(/\s+/g, " ");

  const existing = await db.from("niches").select("*").ilike("name", clean.replace(/[\\%_]/g, "\\$&")).maybeSingle();
  if (existing.error) return dbError(existing.error);
  if (existing.data) return { ok: true, data: existing.data };

  const { data, error } = await db.from("niches").insert({ name: clean }).select("*").single();
  if (error) return dbError(error);
  return { ok: true, data };
}
