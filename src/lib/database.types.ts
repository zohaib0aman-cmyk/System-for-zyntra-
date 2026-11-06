// Hand-written Supabase types matching supabase/migrations/*_init.sql.
// You can regenerate them later with:
//   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts

export type LeadSource = "pdf" | "claude" | "gpt" | "manual";

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
};

export type LeadUpdate = Partial<LeadInsert>;

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
    Enums: { lead_source: LeadSource };
    CompositeTypes: { [_ in never]: never };
  };
};
