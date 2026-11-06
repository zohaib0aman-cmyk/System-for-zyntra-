# Zyntra Lead ID System

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

---

# Phase 2 — PDF import + automatic logos

Upload a PDF of leads. Every business in it becomes a full lead profile with its own tracking ID, details cleaned up, and the brand logo fetched from its website.

## How it works

1. **Upload.** On **Import PDF**, choose or drag in a PDF (max 20 MB). The phone uploads it **directly to Supabase Storage** (private `imports` bucket), with a progress bar. This avoids Vercel's 4.5 MB request limit. An `imports` record is created with a status of `processing → review → done` (or `failed`).
2. **Extract.** On the server, `unpdf` pulls out the text and keeps table rows together: cells are joined with ` | `, one row per line. Long PDFs are split into ~12,000-character chunks at row or blank-line boundaries, and the table header is repeated in each chunk. The chunks go to the AI three at a time. If an answer is cut off, that chunk is split in half and retried. If a chunk still fails, it is **reported in the summary**, never dropped.
3. **Clean up.** Each lead is normalised:
   - phones go to `+91…`
   - Instagram is reduced to the bare handle
   - websites become `https://…`
   - state names are converted to 2-letter codes, or inferred from the city ("Bangalore" → KA)
   - niches are matched to your list ("Clothing" → "Clothing Brand"); unknown niches are created when you save
   - `source = pdf`, and `import_id` links the lead to the import
4. **Review.** Each lead is shown as a card with a badge: **New**, **Duplicate · will merge** (showing the existing tracking ID), or **Missing info**. You can edit or remove any card, then tap **Add all**. Or tick **Add everything directly** when uploading to skip review.
5. **Save.** New leads get tracking IDs. Duplicates (the Phase 1 rules: phone, WhatsApp, Instagram, website, or brand + city) are **merged**: empty fields on the existing lead are filled in, and values that differ are added to its notes, so nothing is overwritten or lost. Rows that can't be saved (e.g. no state) appear under **Skipped** with the reason. The summary shows X added / Y merged / Z skipped, with links.
6. **Logos (background).** After saving (and when you add or edit a lead with a website), Next.js `after()` looks for a logo without slowing the import down. It tries the site's `apple-touch-icon`, then `og:image`, then `/apple-touch-icon.png`, then Google's 128px favicon, and stops at the first real image of at least 32 px. The image is **copied into the `logos` bucket** and saved as `logo_url`, so it keeps working if the website changes. `logo_status` is `pending`, `found` or `not_found`, and the initials avatar stays when nothing is found. Instagram is never scraped: use **Upload logo / photo** on the profile (images are resized to 512 px on the phone first). **Find logo again** re-runs the search.

Scanned PDFs (photos with no text), password-protected PDFs and damaged files fail with a clear message.

### Code added
```
supabase/migrations/20261107000000_phase2_pdf_import_logos.sql   imports table, leads.import_id/logo_status, storage buckets + policies
src/lib/pdf/extractText.ts        PDF → text (keeps table rows), chunking
src/lib/ai/extractLeads.ts        provider switch (AI_PROVIDER) + chunked extraction
src/lib/ai/providers/             anthropic.ts (default), openai.ts, basic.ts (no-AI table parser)
src/lib/ai/prompt.ts, types.ts    shared prompt + JSON schema
src/lib/import/normalizeExtracted.ts   phones, handles, URLs, states, niche matching
src/lib/net/safeFetch.ts          SSRF-safe fetch for logo lookups (blocks private IPs, size/time limits)
src/services/imports.ts           createImport, processImport, classifyItem, commitImport, importLeadsFromPdf
src/services/logos.ts             findLogo, findLogos, uploadLeadLogo
src/app/(app)/imports/            Import PDF page, review / progress / summary page, server actions
scripts/make-sample-pdf.mjs       builds samples/zyntra-sample-leads.pdf
```

**For later phases (API / MCP):** these are plain service functions that take a Supabase client:
```ts
const res = await importLeadsFromPdf(db, { file: pdfBytes, fileName: "leads.pdf" }, { autoSave: true });
// res.data.summary → { added, merged, skipped, results, logoLeadIds }
await findLogos(db, res.data.summary!.logoLeadIds);   // or findLogo(db, leadId)
```

To add another AI, implement `LeadExtractor` (`extract(chunk, ctx) → ExtractedLead[]`) in `src/lib/ai/providers/` and add a `case` to `getExtractor()`.

## Phase 2 setup

1. **Run the new migration.** In Supabase, open **SQL Editor → New query**, paste `supabase/migrations/20261107000000_phase2_pdf_import_logos.sql` and click **Run**. It creates the `imports` table, the new lead columns, and two storage buckets with owner-only policies:
   - `imports`: private, PDFs only, 20 MB
   - `logos`: public read, owner-only write, images only

   You can check them under **Storage**.
2. **Get an Anthropic API key:** <https://console.anthropic.com>, then **API Keys → Create key**, and add billing credit.
3. **Add the environment variables** to `.env.local` locally, and in **Vercel → Project → Settings → Environment Variables**:

   | Variable | Value | Notes |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | `sk-ant-…` | **Server-only** — never prefix with `NEXT_PUBLIC_` |
   | `AI_PROVIDER` | `anthropic` | optional; `openai` or `basic` to switch |
   | `ANTHROPIC_MODEL` | `claude-opus-5-5` | optional (default) |
   | `ANTHROPIC_EFFORT` | `medium` | optional; `low` = faster/cheaper |
   | `OPENAI_API_KEY`, `OPENAI_MODEL` | | only when `AI_PROVIDER=openai` |

   Then redeploy (Vercel → Deployments → ⋯ → Redeploy) so the new variables take effect.
4. **Vercel time limit:** importing runs for up to 300 s (`maxDuration = 300`). This works on the Hobby plan when **Fluid Compute** is on, which is the default for new projects (Project → Settings → Functions). Very large PDFs (hundreds of pages) may need Pro.

The Claude request uses structured JSON output and `fallbacks: "default"`. If Claude's safety filter declines a chunk, Anthropic retries it on its recommended fallback model automatically.

## Test it with the sample PDF

`samples/zyntra-sample-leads.pdf` has 10 **fake** clothing-brand leads over 2 pages (rebuild it with `node scripts/make-sample-pdf.mjs`). Run `supabase/seed.sql` first, then expect:

| Row | What it tests | Expected |
|---|---|---|
| Kesariya Threads | same phone as seed lead, written `+91-98765-43210` | **Duplicate** → merged into `ZYN-IN-GJ-000001`; new email kept in notes |
| Mumbai Streetwear Co. | Instagram given as `instagram.com/mumbaistreetwear` | **Duplicate** → merged into `ZYN-IN-MH-000001` |
| Bombay Denim Lab | phone `12345 678` is invalid | **Missing info**; fix it with Edit, or it is skipped |
| Mystery Fabrics | no state, no city | **Missing info** → skipped with "State is required" unless you pick a state |
| Bengaluru Loom Co. | state blank, city "Bangalore" | state filled as **KA**, new niche "Ethnic Wear" |
| others | "Rajasthan" → RJ, "West Bengal" → WB, `@handle` → handle, `www.site` → https | **New** |

Result with no edits: **6 added, 2 merged, 2 skipped**. The skipped rows are shown with their reasons. Importing the same PDF again adds nothing new; every row merges.

## Test on your phone

1. Deploy (or redeploy) to Vercel with the Phase 2 env vars, and run the migration.
2. Get the sample PDF onto your phone. Open the repo on GitHub, go to `samples/zyntra-sample-leads.pdf`, tap **Download** (it lands in Files / Downloads). Or email the file to yourself.
3. On the phone, open your Vercel URL and sign in. Tip: Share → **Add to Home Screen** so it opens like an app.
4. Tap **Import PDF → Tap to choose a PDF**, then pick the file from Files / Downloads (or Drive).
5. Tap **Import leads**. Watch the upload bar, then "Finding leads with AI…". You can lock the phone or leave the page; it keeps running.
6. On the review screen, use the **New / Duplicate / Missing info** tabs. Tap **Edit** on *Bombay Denim Lab* and set the phone to `98190 45678`, **Remove** one card, then tap **Add all**.
7. Check the summary, then tap a tracking ID to open the profile. After about a minute, refresh: real websites get their logo, and fake sample domains keep initials. Try **Upload logo / photo** with a photo from your gallery.
8. Upload the same PDF again with **Add everything directly** ticked. Everything should merge and no new IDs should be created.

To test from your computer's dev server instead: `npm run dev -- -H 0.0.0.0`, then open `http://<computer-ip>:3000` on the phone (same Wi-Fi).

## Local Supabase (optional, for development)

`supabase/config.toml` is included. With Docker running, `npx supabase start` applies both migrations and `seed.sql` locally. Create a user in the local dashboard or with the admin API, insert it into `app_owners`, and point `.env.local` at the printed `API_URL` and publishable key. Set `AI_PROVIDER=basic` to test imports without an API key (clean tables only).

## Ready for later phases
- **AI connection (Claude, GPT):** call `addLead(db, data)` with `source: "claude" | "gpt"`, or `importLeadsFromPdf(db, …)` for PDFs. The duplicate check and ID generation come for free.
- **REST API / MCP server:** wrap the functions in `src/services`. For a server-to-server key, create a client with the secret key (this bypasses RLS) inside the API route only.
- **Filters / dashboard:** `niche`, `state`, `status` and `created_at` are already indexed.
- **Logos:** `logo_url` is already shown everywhere; a later job just fills it in.
