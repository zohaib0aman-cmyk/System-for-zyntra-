# Zyntra Lead ID System — Phase 1

A mobile-first web app for tracking Zyntra business leads. Each lead gets a permanent tracking ID like **`ZYN-IN-GJ-000123`**.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Supabase (Postgres + Auth) · Vercel

---

## Features (Phase 1)

- **Owner-only login** with email + password (no public sign-up).
- **Tracking IDs generated in the database.** A Postgres trigger and a per-country/state counter create them. Two inserts at the same moment can't get the same number, and an ID can never be changed once created.
- **Duplicate check before every insert.** It matches on phone, WhatsApp (checked against both columns), Instagram, website domain, or brand name + city. If a match exists, no new ID is created; you see the existing lead and can update it instead.
- **Smart search.** One box searches tracking ID, brand, owner, phone, WhatsApp, Instagram, website and email. Phone search works with or without `+91`, spaces or dashes.
- **Lead list** cards show a logo or initials avatar, brand, tracking ID, niche, city/state and status.
- **Add / edit form** with a niche dropdown (you can add new niches), Indian state dropdown and validation.
- **ID-card style lead profile** with a large tracking ID, Copy ID, and quick Call / WhatsApp / Instagram buttons.

## Project structure

```
supabase/
  migrations/20261106000000_init.sql   ← full schema, triggers, search, RLS
  seed.sql                             ← 5 fake sample leads
src/
  services/          ← DATA / SERVICE LAYER (reuse for API + MCP later)
    leads.ts           addLead, searchLeads, getLeadByTrackingId, updateLead, findDuplicateLeads
    niches.ts          listNiches, addNiche
    types.ts           DB client type + ServiceResult
  lib/
    validation.ts      zod schemas (shared by browser + server)
    normalize.ts       phone / Instagram / website normalisation
    constants.ts       Indian states, sources, statuses
    database.types.ts  Supabase table types
    supabase/          server client, proxy session refresh
  proxy.ts           auth guard (Next 16 "proxy", formerly middleware)
  app/
    login/             sign-in page + actions
    (app)/page.tsx     leads list + smart search
    (app)/leads/new    add lead
    (app)/leads/[trackingId]        profile
    (app)/leads/[trackingId]/edit   edit
  components/        LeadForm, LeadCard, LeadProfileCard, SearchBar, …
```

Every service function takes the Supabase client as its first argument and returns `{ ok: true, data }` or `{ ok: false, code, message }`. The functions validate their own input, so later a REST API route or an MCP server only needs to create a client and call the same function:

```ts
const res = await addLead(db, { brand_name: "X", state: "GJ", phone: "98765 43210" });
if (!res.ok && res.code === "duplicate") console.log(res.duplicates);
```

---

## 1. Supabase setup (step by step)

1. Go to <https://supabase.com> and click **New project**. Choose a name, a database password and a region (Mumbai, `ap-south-1`, is closest for India). Wait for the project to finish starting.
2. **Create the schema:** open **SQL Editor**, then **New query**. Paste the whole of `supabase/migrations/20261106000000_init.sql` and click **Run**. It should say "Success. No rows returned".
3. **Add sample data (optional):** in a new query, paste `supabase/seed.sql` and click **Run**. This creates 5 fake clothing-brand leads:
   `ZYN-IN-GJ-000001`, `ZYN-IN-GJ-000002`, `ZYN-IN-MH-000001`, `ZYN-IN-RJ-000001`, `ZYN-IN-TN-000001`.
4. **Turn off public sign-up:** go to **Authentication → Sign In / Providers** (called "Providers" or "Settings" in some versions). Turn **off** "Allow new users to sign up". Keep the **Email** provider enabled.
5. **Create your owner user:** go to **Authentication → Users → Add user → Create new user**. Enter your email and a strong password, and tick **Auto Confirm User**.
6. **Mark yourself as the owner.** Row Level Security only allows users listed in `app_owners`. In the SQL Editor, run:
   ```sql
   insert into public.app_owners (user_id)
   select id from auth.users where email = 'YOUR-EMAIL@example.com';
   ```
   Until you do this you can log in, but you won't see any leads.
7. **Copy your API keys:** go to **Project Settings → API** (or **API Keys**) and copy:
   - **Project URL**, which goes in `NEXT_PUBLIC_SUPABASE_URL`
   - **Publishable key** (`sb_publishable_…`) or the legacy **anon public** key, which goes in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

   Never put the `service_role` / secret key in the frontend env vars.
8. **Set the auth URLs:** go to **Authentication → URL Configuration**. Set **Site URL** to your Vercel URL once you have it (use `http://localhost:3000` until then).

## 2. Environment variables

Copy `.env.example` to `.env.local` and fill it in:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx   # or the anon key
```

(`NEXT_PUBLIC_SUPABASE_ANON_KEY` also works as the key name if you prefer it.)

## 3. Run locally

You need Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open <http://localhost:3000> (or your phone on the same Wi-Fi: `http://<your-computer-ip>:3000`) and sign in with the owner user.

Other commands:

```bash
npm run typecheck   # TypeScript check
npm run build       # production build
npm start           # run the production build
```

## 4. Deploy to Vercel

1. Push this repository to GitHub (already done if you're reading this there).
2. Go to <https://vercel.com/new>, then **Import** this repo. The framework is detected as **Next.js**, so leave the build settings at their defaults.
3. Under **Environment Variables**, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for Production, Preview and Development.
4. Click **Deploy**.
5. Copy the deployed URL (e.g. `https://zyntra-leads.vercel.app`) into Supabase **Authentication → URL Configuration → Site URL**.

---

## How it works

### Tracking IDs
- `tracking_counters (country, state, last_serial)` holds one counter per country + state.
- `next_tracking_id()` runs `INSERT … ON CONFLICT DO UPDATE SET last_serial = last_serial + 1 RETURNING`. That one statement locks the counter row, so concurrent inserts for the same state wait in line and each gets a unique serial. Different states don't block each other.
- The `BEFORE INSERT` trigger always overwrites `tracking_id`, so clients can't choose one. The `BEFORE UPDATE` trigger rejects any change to it.
- Changing a lead's state later does **not** change its ID.

### Duplicate check
`find_duplicate_leads()` (SQL) runs before insert, in `services/leads.ts → addLead`. Phones are stored in E.164 format (`+919876543210`) and Instagram as a lowercase handle. Websites are compared by domain (`website_host` generated column), so `http://www.brand.in/shop` matches `https://brand.in`.

### Search
`search_leads()` (SQL) uses trigram indexes for fast `ILIKE` on names and IDs. For phone matching it compares digits only, so `98765 43210`, `+91-98765-43210` and `098765 43210` all find the same lead.

### Security
- Row Level Security on `leads` and `niches` means only users listed in `app_owners` can read or write.
- `tracking_counters` and `app_owners` have RLS enabled with no policies. Only the security-definer functions use them.
- `src/proxy.ts` refreshes the Supabase session and sends anyone not logged in to `/login`.

## Ready for later phases
- **PDF import / AI (Claude, GPT):** call `addLead(db, data)` with `source: "pdf" | "claude" | "gpt"`. The duplicate check and ID generation come for free.
- **REST API / MCP server:** wrap the functions in `src/services`. For a server-to-server key, create a client with the secret key (this bypasses RLS) inside the API route only.
- **Filters / dashboard:** `niche`, `state`, `status` and `created_at` are already indexed.
- **Logos:** `logo_url` is already shown everywhere; a later job just fills it in.
