// Hand-written Supabase types matching supabase/migrations/*_init.sql.
// You can regenerate them later with:
//   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts

export type LeadSource = "pdf" | "claude" | "gpt" | "manual";
export type LogoStatus = "pending" | "found" | "not_found";
export type ImportStatus = "processing" | "review" | "done" | "failed";

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
  status: string;
  notes: string | null;
  website_host: string | null;
  import_id: string | null;
  logo_status: LogoStatus;
  logo_source: string | null;
  logo_checked_at: string | null;
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
  status?: string;
  notes?: string | null;
  import_id?: string | null;
  logo_status?: LogoStatus;
  logo_source?: string | null;
  logo_checked_at?: string | null;
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
    };
    Enums: { lead_source: LeadSource; import_status: ImportStatus };
    CompositeTypes: { [_ in never]: never };
  };
};
