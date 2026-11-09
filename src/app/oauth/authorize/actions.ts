"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAuthCode, getClient, parseScopes } from "@/services/oauth";

/** Approve (or deny) an OAuth authorization request after the owner consents. */
export async function decideAuthorization(formData: FormData): Promise<void> {
  const clientId = String(formData.get("client_id") ?? "");
  const redirectUri = String(formData.get("redirect_uri") ?? "");
  const state = String(formData.get("state") ?? "");
  const scope = String(formData.get("scope") ?? "read");
  const codeChallenge = String(formData.get("code_challenge") ?? "");
  const codeChallengeMethod = String(formData.get("code_challenge_method") ?? "");
  const decision = String(formData.get("decision") ?? "deny");

  const addParams = (base: string, params: Record<string, string>) => {
    const u = new URL(base);
    for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
    return u.toString();
  };

  if (decision !== "approve") {
    redirect(addParams(redirectUri, { error: "access_denied", state }));
  }

  // Must be the logged-in owner.
  const ssr = await createClient();
  const { data: claims } = await ssr.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect(`/login?next=${encodeURIComponent("/oauth/authorize")}`);

  const { data: owner } = await ssr.rpc("is_owner");
  if (owner !== true) redirect(addParams(redirectUri, { error: "access_denied", error_description: "not_owner", state }));

  const admin = createAdminClient();

  const client = await getClient(admin, clientId);
  if (!client || !client.redirect_uris.includes(redirectUri)) {
    throw new Error("Invalid client or redirect_uri.");
  }

  const res = await createAuthCode(admin, {
    clientId,
    userId: userId!,
    redirectUri,
    scopes: parseScopes(scope),
    codeChallenge: codeChallenge || null,
    codeChallengeMethod: codeChallengeMethod || null,
  });
  if (!res.ok) throw new Error(res.message);

  redirect(addParams(redirectUri, { code: res.data, state }));
}
