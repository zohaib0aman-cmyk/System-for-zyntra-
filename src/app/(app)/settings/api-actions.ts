"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createApiKey, revokeApiKey, type ApiScope, type CreatedApiKey } from "@/services";

export async function createApiKeyAction(name: string, scopes: ApiScope[]): Promise<{ key?: CreatedApiKey; error?: string }> {
  const r = await createApiKey(await createClient(), name, scopes);
  revalidatePath("/settings/connections");
  return r.ok ? { key: r.data } : { error: r.message };
}

export async function revokeApiKeyAction(id: string): Promise<{ error?: string }> {
  const r = await revokeApiKey(await createClient(), id);
  revalidatePath("/settings/connections");
  return r.ok ? {} : { error: r.message };
}
