// Hand-written Supabase types matching supabase/migrations/*_init.sql.
// You can regenerate them later with:
//   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts

export type LeadSource = "pdf" | "claude" | "gpt" | "manual";
export type LogoStatus = "pending" | "found" | "not_found";
export type ImportStatus = "processing" | "review" | "done" | "failed";
export type LeadStatus = "New" | "Contacted" | "Interested" | "Deal Closed" | "Rejected";
export type ScoreLabel = "hot" | "warm" | "cold";
export type ActivityType =
  | "created"
  | "updated"
  | "status_changed"
  | "note_added"
  | "followup_set"
  | "followup_done"
  | "imported"
  | "logo_found"
  | "merged"
  | "followup_snoozed"
  | "tag_added"
  | "tag_removed"
  | "priority_changed";

export type LeadRow = {
  id: string;
  tracking_id: string;
  brand_name: string;
  owner_name: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  instagram: string | null;
  website: string | null;
  city: string | null;
  state: string;
  country: string;
  niche: string | null;
  logo_url: string | null;
  source: LeadSource;
  status: LeadStatus;
  notes: string | null;
  website_host: string | null;
  import_id: string | null;
  logo_status: LogoStatus;
  logo_source: string | null;
  logo_checked_at: string | null;
  score: number;
  score_label: ScoreLabel;
  score_updated_at: string | null;
  priority: boolean;
  last_contacted_at: string | null;
  next_followup_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadInsert = {
  brand_name: string;
  state: string;
  owner_name?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  instagram?: string | null;
  website?: string | null;
  city?: string | null;
  country?: string;
  niche?: string | null;
  logo_url?: string | null;
  source?: LeadSource;
  status?: LeadStatus;
  notes?: string | null;
  import_id?: string | null;
  logo_status?: LogoStatus;
  logo_source?: string | null;
  logo_checked_at?: string | null;
  score?: number;
  score_label?: ScoreLabel;
  score_updated_at?: string | null;
  priority?: boolean;
  last_contacted_at?: string | null;
};

export type LeadUpdate = Partial<LeadInsert>;

/** JSON stored in imports.items / imports.results — see src/services/imports.ts */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ImportRow = {
  id: string;
  file_name: string;
  file_path: string | null;
  file_size: number | null;
  page_count: number | null;
  uploaded_at: string;
  updated_at: string;
  status: ImportStatus;
  progress: string | null;
  auto_save: boolean;
  total_found: number;
  added: number;
  merged: number;
  skipped: number;
  error: string | null;
  items: Json;
  results: Json;
};

export type ImportInsert = Partial<Omit<ImportRow, "id" | "uploaded_at" | "updated_at">> & { file_name: string };

export type NicheRow = { id: string; name: string; created_at: string };

export type ActivityRow = {
  id: string;
  lead_id: string;
  type: ActivityType;
  details: Json;
  actor: string;
  created_at: string;
};

export type FollowupRow = {
  id: string;
  lead_id: string;
  due_at: string;
  note: string | null;
  done: boolean;
  done_at: string | null;
  notified_at: string | null;
  actor: string;
  created_at: string;
};

export type TagRow = { id: string; name: string; color: string; created_at: string };
export type LeadTagRow = { lead_id: string; tag_id: string; created_at: string };

export type PushSubscriptionRow = {
  id: string;
  user_id: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  last_used_at: string | null;
};

export type ListLeadsArgs = {
  p_query?: string;
  p_niches?: string[] | null;
  p_countries?: string[] | null;
  p_states?: string[] | null;
  p_cities?: string[] | null;
  p_statuses?: LeadStatus[] | null;
  p_score_labels?: ScoreLabel[] | null;
  p_tag_ids?: string[] | null;
  p_sources?: LeadSource[] | null;
  p_created_from?: string | null;
  p_created_to?: string | null;
  p_due_before?: string | null;
  p_priority?: boolean | null;
  p_sort?: string;
  p_limit?: number;
  p_offset?: number;
};

export type Database = {
  public: {
    Tables: {
      leads: {
        Row: LeadRow;
        Insert: LeadInsert;
        Update: LeadUpdate;
        Relationships: [];
      };
      imports: {
        Row: ImportRow;
        Insert: ImportInsert;
        Update: Partial<ImportInsert>;
        Relationships: [];
      };
      niches: {
        Row: NicheRow;
        Insert: { name: string };
        Update: { name?: string };
        Relationships: [];
      };
      lead_activities: {
        Row: ActivityRow;
        Insert: { lead_id: string; type: ActivityType; details?: Json; actor?: string; created_at?: string };
        Update: Partial<ActivityRow>;
        Relationships: [];
      };
      followups: {
        Row: FollowupRow;
        Insert: { lead_id: string; due_at: string; note?: string | null; actor?: string; done?: boolean; done_at?: string | null };
        Update: Partial<FollowupRow>;
        Relationships: [
          { foreignKeyName: "followups_lead_id_fkey"; columns: ["lead_id"]; isOneToOne: false; referencedRelation: "leads"; referencedColumns: ["id"] },
        ];
      };
      tags: {
        Row: TagRow;
        Insert: { name: string; color?: string };
        Update: { name?: string; color?: string };
        Relationships: [];
      };
      lead_tags: {
        Row: LeadTagRow;
        Insert: { lead_id: string; tag_id: string };
        Update: Partial<LeadTagRow>;
        Relationships: [
          { foreignKeyName: "lead_tags_tag_id_fkey"; columns: ["tag_id"]; isOneToOne: false; referencedRelation: "tags"; referencedColumns: ["id"] },
          { foreignKeyName: "lead_tags_lead_id_fkey"; columns: ["lead_id"]; isOneToOne: false; referencedRelation: "leads"; referencedColumns: ["id"] },
        ];
      };
      push_subscriptions: {
        Row: PushSubscriptionRow;
        Insert: { endpoint: string; p256dh: string; auth: string; user_agent?: string | null; user_id?: string | null };
        Update: Partial<PushSubscriptionRow>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      search_leads: {
        Args: { p_query?: string; p_limit?: number };
        Returns: LeadRow[];
      };
      find_duplicate_leads: {
        Args: {
          p_phone?: string | null;
          p_whatsapp?: string | null;
          p_instagram?: string | null;
          p_website?: string | null;
          p_brand_name?: string | null;
          p_city?: string | null;
          p_exclude_id?: string | null;
        };
        Returns: LeadRow[];
      };
      is_owner: { Args: Record<string, never>; Returns: boolean };
      list_leads: { Args: ListLeadsArgs; Returns: Json };
      lead_filter_options: { Args: Record<string, never>; Returns: Json };
    };
    Enums: { lead_source: LeadSource; import_status: ImportStatus; lead_status: LeadStatus; activity_type: ActivityType };
    CompositeTypes: { [_ in never]: never };
  };
};
