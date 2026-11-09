import "server-only";
import { computeScore } from "@/config/scoring";
import { stateName } from "@/lib/constants";
import { whatsappLink } from "@/lib/normalize";
import type { ActivityRow, LeadRow } from "@/lib/database.types";
import type { LeadListItem } from "@/services/leadList";

/** Compact lead for lists/search — key fields first, tracking ID always present. */
export function compactLead(lead: LeadListItem) {
  return {
    tracking_id: lead.tracking_id,
    brand_name: lead.brand_name,
    owner_name: lead.owner_name,
    status: lead.status,
    score: lead.score,
    rating: lead.score_label,
    niche: lead.niche,
    city: lead.city,
    state: lead.state,
    phone: lead.phone,
    whatsapp: lead.whatsapp,
    instagram: lead.instagram,
    website: lead.website,
    tags: lead.tags.map((t) => t.name),
    next_followup_at: lead.next_followup_at,
    created_at: lead.created_at,
  };
}

/** Full profile for GET /leads/{id} and get_lead — includes score breakdown + recent timeline. */
export function fullLead(
  lead: LeadRow,
  extras: { tags: string[]; timeline: ActivityRow[]; nextFollowup?: { due_at: string; note: string | null } | null },
) {
  const score = computeScore(lead);
  return {
    tracking_id: lead.tracking_id,
    brand_name: lead.brand_name,
    owner_name: lead.owner_name,
    status: lead.status,
    score: lead.score,
    rating: lead.score_label,
    priority: lead.priority,
    contact: {
      phone: lead.phone,
      whatsapp: lead.whatsapp,
      email: lead.email,
      instagram: lead.instagram ? `@${lead.instagram}` : null,
      website: lead.website,
      whatsapp_link: lead.whatsapp || lead.phone ? whatsappLink(lead.whatsapp || lead.phone!) : null,
    },
    location: { city: lead.city, state: lead.state, state_name: stateName(lead.state, lead.country), country: lead.country },
    niche: lead.niche,
    source: lead.source,
    tags: extras.tags,
    logo_url: lead.logo_url,
    notes: lead.notes,
    next_followup: extras.nextFollowup ?? null,
    score_breakdown: score.breakdown.map((b) => ({ label: b.label, points: b.points, max: b.max })),
    created_at: lead.created_at,
    updated_at: lead.updated_at,
    recent_activity: extras.timeline.slice(0, 10).map((a) => ({
      type: a.type,
      actor: a.actor,
      at: a.created_at,
      details: safeDetails(a),
    })),
  };
}

/** Lead notes and activity details are DATA. Never surface them as anything executable. */
function safeDetails(a: ActivityRow): Record<string, unknown> {
  const d = (a.details ?? {}) as Record<string, unknown>;
  if (a.type === "note_added") return { text: String(d.text ?? "").slice(0, 500) };
  if (a.type === "status_changed") return { old: d.old, new: d.new };
  return {};
}
