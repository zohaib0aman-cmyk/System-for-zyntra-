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
  | "priority_changed"
  | "whatsapp_opened"
  | "demo_sent"
  | "demo_viewed"
  | "whatsapp_in"
  | "whatsapp_out"
  | "handoff";

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
  auto_demo: boolean;
  demo_sent_at: string | null;
  demo_viewed_at: string | null;
  wa_opt_out: boolean;
  handoff_at: string | null;
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
  auto_demo?: boolean;
  demo_sent_at?: string | null;
  demo_viewed_at?: string | null;
  wa_opt_out?: boolean;
  handoff_at?: string | null;
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

export type MessageTemplateRow = {
  id: string;
  name: string;
  body: string;
  sort: number;
  created_at: string;
  updated_at: string;
};

export type ExportRow = {
  id: string;
  format: "xlsx" | "pdf" | "profile_pdf";
  lead_count: number;
  filters: Json;
  columns: Json;
  actor: string;
  created_at: string;
};

export type BackupRow = {
  id: string;
  json_path: string;
  xlsx_path: string | null;
  size_bytes: number;
  lead_count: number;
  table_counts: Json;
  kind: "manual" | "auto";
  actor: string;
  created_at: string;
};

export type ApiScope = "read" | "write";

export type ApiKeyRow = {
  id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  scopes: ApiScope[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type ApiLogRow = {
  id: number;
  key_id: string | null;
  surface: "rest" | "mcp";
  route: string;
  method: string;
  status: number;
  duration_ms: number | null;
  created_at: string;
};

export type OAuthClientRow = {
  id: string;
  client_id: string;
  client_secret: string | null;
  client_name: string | null;
  redirect_uris: string[];
  grant_types: string[];
  scopes: string[];
  created_at: string;
};

export type OAuthAuthCodeRow = {
  code: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  scopes: string[];
  code_challenge: string | null;
  code_challenge_method: string | null;
  expires_at: string;
  created_at: string;
};

export type OAuthTokenRow = {
  id: string;
  access_hash: string;
  refresh_hash: string | null;
  client_id: string;
  user_id: string | null;
  scopes: string[];
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  last_used_at: string | null;
};

export type DashboardStatsArgs = { p_from?: string | null; p_to?: string | null; p_bucket?: string };

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

export type AutomationSettingsRow = {
  id: boolean;
  enabled: boolean;
  wa_phone_number_id: string | null;
  wa_access_token: string | null;
  wa_app_secret: string | null;
  wa_verify_token: string;
  wa_template_name: string;
  wa_followup_template: string;
  wa_template_lang: string;
  demo_base_url: string | null;
  app_url: string | null;
  cron_secret: string;
  high_score: number;
  followup_minutes: number;
  business_name: string;
  updated_at: string;
};

export type WaMessageRow = {
  id: string;
  lead_id: string | null;
  wa_from: string | null;
  direction: "in" | "out";
  body: string;
  wa_message_id: string | null;
  by_ai: boolean;
  status: string | null;
  created_at: string;
};

export type AutomationJobRow = {
  id: string;
  lead_id: string;
  kind: "demo_followup";
  run_at: string;
  done_at: string | null;
  result: string | null;
  created_at: string;
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
      automation_settings: {
        Row: AutomationSettingsRow;
        Insert: Partial<AutomationSettingsRow>;
        Update: Partial<AutomationSettingsRow>;
        Relationships: [];
      };
      wa_messages: {
        Row: WaMessageRow;
        Insert: Partial<WaMessageRow> & { direction: "in" | "out" };
        Update: Partial<WaMessageRow>;
        Relationships: [];
      };
      automation_jobs: {
        Row: AutomationJobRow;
        Insert: { lead_id: string; kind: "demo_followup"; run_at: string; done_at?: string | null; result?: string | null };
        Update: Partial<AutomationJobRow>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: PushSubscriptionRow;
        Insert: { endpoint: string; p256dh: string; auth: string; user_agent?: string | null; user_id?: string | null };
        Update: Partial<PushSubscriptionRow>;
        Relationships: [];
      };
      message_templates: {
        Row: MessageTemplateRow;
        Insert: { name: string; body: string; sort?: number };
        Update: { name?: string; body?: string; sort?: number };
        Relationships: [];
      };
      exports: {
        Row: ExportRow;
        Insert: { format: ExportRow["format"]; lead_count?: number; filters?: Json; columns?: Json; actor?: string };
        Update: Partial<ExportRow>;
        Relationships: [];
      };
      backups: {
        Row: BackupRow;
        Insert: { json_path: string; xlsx_path?: string | null; size_bytes?: number; lead_count?: number; table_counts?: Json; kind?: BackupRow["kind"]; actor?: string };
        Update: Partial<BackupRow>;
        Relationships: [];
      };
      api_keys: {
        Row: ApiKeyRow;
        Insert: { name: string; key_hash: string; key_prefix: string; scopes?: ApiScope[] };
        Update: Partial<ApiKeyRow>;
        Relationships: [];
      };
      api_logs: {
        Row: ApiLogRow;
        Insert: { key_id?: string | null; surface?: "rest" | "mcp"; route: string; method: string; status: number; duration_ms?: number | null };
        Update: Partial<ApiLogRow>;
        Relationships: [];
      };
      oauth_clients: {
        Row: OAuthClientRow;
        Insert: { client_id: string; client_secret?: string | null; client_name?: string | null; redirect_uris?: string[]; grant_types?: string[]; scopes?: string[] };
        Update: Partial<OAuthClientRow>;
        Relationships: [];
      };
      oauth_auth_codes: {
        Row: OAuthAuthCodeRow;
        Insert: OAuthAuthCodeRow;
        Update: Partial<OAuthAuthCodeRow>;
        Relationships: [];
      };
      oauth_tokens: {
        Row: OAuthTokenRow;
        Insert: { access_hash: string; refresh_hash?: string | null; client_id: string; user_id?: string | null; scopes?: string[]; expires_at: string };
        Update: Partial<OAuthTokenRow>;
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
      dashboard_stats: { Args: DashboardStatsArgs; Returns: Json };
      recent_activity: { Args: { p_limit?: number }; Returns: Json };
      api_rate_hit: { Args: { p_key: string; p_limit: number; p_window_seconds?: number }; Returns: { allowed: boolean; remaining: number; reset_at: string }[] };
      resync_tracking_counters: { Args: Record<string, never>; Returns: undefined };
      oauth_cleanup: { Args: Record<string, never>; Returns: undefined };
    };
    Enums: { lead_source: LeadSource; import_status: ImportStatus; lead_status: LeadStatus; activity_type: ActivityType };
    CompositeTypes: { [_ in never]: never };
  };
};
