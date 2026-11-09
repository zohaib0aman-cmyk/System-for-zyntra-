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

---

# Phase 3 — sales pipeline

The lead list becomes a working pipeline: every lead has a **status**, a **timeline**, **follow-up reminders**, a **score** (Hot / Warm / Cold), **tags**, and a full **filter** panel. Installable on the phone (PWA) with push notifications for due follow-ups.

## What's new

1. **Status stages** — New → Contacted → Interested → Deal Closed → Rejected (a Postgres enum, so more can be added later). Change it in one tap on the profile, or from a card's **⋯ / long-press** menu. Every change is logged.
2. **Timeline** — `lead_activities` records created / updated / status_changed / note_added / followup_set / followup_done / imported / logo_found / merged / tag / priority events, each with who did it (**owner / claude / gpt / system / …**). Shown newest-first on the profile, with an **Add note** box. Phase 2 imports and merges are logged too.
3. **Follow-ups** — `followups` table. On the profile: **Set follow-up** (Tomorrow / 3 days / 1 week / custom). The home screen shows **"Aaj ke follow-ups"** (today + overdue, overdue in red) with **Done** and **Snooze**. The nav shows a badge of pending follow-ups. A **browser push notification** fires when one is due (works on the phone once the app is on the home screen).
4. **Lead score (0–100)** — recalculated on every change from **one config file, `src/config/scoring.ts`**, so you can tune it: profile completeness + status + recent contact + a manual **★ priority** boost. Labels **Hot ≥ 70 / Warm 40–69 / Cold < 40**. The profile shows a breakdown ("Why this score?").
5. **Tags** — `tags` + `lead_tags`. Add/remove on the profile with autocomplete (new tags created on the fly), or **select several leads in the list and tag them all at once**.
6. **Filters** — sidebar on desktop, bottom sheet on phone. Niche (with per-niche counts, at the top), status, score, tags, country, state, city, source, date-added range, follow-up due, priority. They **combine** (tap *Clothing Brand* + *Gujarat* → all Gujarat clothing brands), work with the search bar, show as **removable chips**, and are **saved in the URL** so a view can be bookmarked. Sort by newest / score / next follow-up / name. The list uses **infinite scroll**.

Everything is indexed for `status`, `score`, `niche`, `state`, `city`, `source`, `due_at` and the search columns, so filters stay fast with 50,000+ leads.

### Code added
```
supabase/migrations/20261108000000_phase3_pipeline.sql   status enum, lead_activities, followups, tags, push_subscriptions,
                                                          score columns, list_leads() + lead_filter_options(), indexes, RLS
supabase/sample_pipeline.sql     sample statuses / tags / scores / follow-ups
supabase/cron_followups.sql      optional pg_cron job (every 15 min)
src/config/scoring.ts            the score rules — tune these
src/lib/filters.ts               URL ⇄ filter state
src/lib/time.ts                  time-zone aware "today" (Asia/Kolkata)
src/services/pipeline.ts         setStatus, addNote, setPriority, recalculateScore(s)
src/services/followups.ts        setFollowup, completeFollowup, snoozeFollowup, getDueFollowups
src/services/tags.ts             addTag, removeTag, getOrCreateTag
src/services/activities.ts       logActivity, getTimeline
src/services/leadList.ts         listLeads(filters, sort, page), getFilterOptions
src/services/push.ts             web-push: subscribe, sendPushToAll, notifyDueFollowups
src/app/api/cron/followups/      the 15-minute job (checks CRON_SECRET)
src/app/(app)/followups/         Follow-ups tab
src/app/(app)/settings/          Settings: notifications + recalculate scores
src/app/manifest.ts, public/sw.js, public/icons/   PWA + push service worker
src/components/pipeline/, src/components/nav/, src/components/settings/   UI
```

**For the API / MCP phase** — every write function takes an `actor`, so an AI can act and the timeline shows who did what:
```ts
await setStatus(db, leadId, "Interested", { actor: "claude" });
await setFollowup(db, leadId, { dueAt, note }, { actor: "gpt" });
await addTag(db, leadIds, "Diwali offer", { actor: "owner" });
const { rows, total } = (await listLeads(db, { niches: ["Clothing Brand"], states: ["GJ"] }, "score")).data;
const timeline = (await getTimeline(db, leadId)).data;
```

## Phase 3 setup

1. **Run the migration.** Supabase → SQL Editor → paste `supabase/migrations/20261108000000_phase3_pipeline.sql` → Run. It converts `status` to an enum (old values map over: Follow-up→Contacted, Converted→Deal Closed, Not Interested→Rejected), adds the new tables and indexes, and backfills a "created" timeline entry for existing leads.
2. **Push notification keys.** Generate a VAPID key pair once:
   ```bash
   npx web-push generate-vapid-keys
   ```
   Add to `.env.local` and to Vercel's environment variables:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | the public key (exposed to the browser) |
   | `VAPID_PRIVATE_KEY` | the private key — **server-only** |
   | `VAPID_SUBJECT` | `mailto:you@example.com` |
   | `CRON_SECRET` | any long random string |
   | `SUPABASE_SECRET_KEY` | Supabase → Settings → API → service-role/secret key — **server-only**, used by the cron job |

   Redeploy after adding them.
3. **Schedule the 15-minute job** (sends due-follow-up notifications and refreshes scores). Pick one:
   - **Vercel Cron** — `vercel.json` defines daily schedules so the project **builds on the Hobby plan** (Hobby rejects sub-daily crons at build time). Vercel automatically sends `Authorization: Bearer $CRON_SECRET`, so just set `CRON_SECRET`. A daily follow-up check is only a fallback — for timely (15-minute) reminders use Supabase pg_cron below (works on any plan). On **Pro**, change `/api/cron/followups` in `vercel.json` to `*/15 * * * *`.
   - **Supabase pg_cron** — edit `supabase/cron_followups.sql` (put in your app URL and `CRON_SECRET`) and run it in the SQL Editor. Works on any plan.
4. **Time zone** (optional): set `NEXT_PUBLIC_APP_TIMEZONE` (default `Asia/Kolkata`) — used for "today" and follow-up dates.

## Sample data
Run `supabase/sample_pipeline.sql` (after `seed.sql`) to give the 5 sample leads different statuses, tags, scores and follow-ups — one overdue, one due today, a Hot priority lead, a closed deal, and a Rejected (score 0) lead.

## Test on your phone

1. Deploy with the Phase 3 env vars and run the migration (+ sample data).
2. **Install the app:** open your Vercel URL in the phone browser → **Share → Add to Home Screen**. Open it from the home-screen icon (it runs full-screen, like an app).
3. **Pipeline:** open a lead, tap a **status** chip (one tap), tap **★ Priority** and watch the score jump, add a **note** and a **tag**, and **Set follow-up → Tomorrow**.
4. **Filters:** tap **Filter**, choose **Clothing Brand**, then add **Gujarat** — the list narrows to Gujarat clothing brands, and the URL updates (bookmark it). Remove a chip or **Clear all**.
5. **Bulk:** tap **Select**, pick a few leads, **# Add tag**.
6. **Follow-ups:** the home screen shows **Aaj ke follow-ups**; tap **Done** or **Snooze**. The **Follow-ups** tab groups Overdue / Later today / Upcoming.
7. **Notifications:** go to **Settings → Enable notifications** (allow when asked), then **Send test notification** — it should appear on your phone. Real reminders arrive within 15 minutes of a follow-up's time (via the cron job). On iPhone this only works from the home-screen app, on iOS 16.4+.

---

# Phase 4 — dashboard, WhatsApp, export, backup

The home screen is now a **dashboard**; the lead list moved to **/leads**. You can message any lead on WhatsApp in one tap, export any filtered view, and the app keeps its own daily backups.

## What's new

1. **Dashboard (home screen).** Headline cards (total, new this week/month, hot, due today, deals closed, conversion = Deal Closed ÷ contacted) and **Recharts** charts: pipeline funnel, leads by state, by niche, by source, and added-over-time. A **date range** selector (7/30/90 days, all time, custom) drives the charts. **Tap any bar or card** to open the lead list already filtered (e.g. tap *Gujarat* → `/leads?state=GJ`). Below: **"Aaj ke follow-ups"** and **Recent activity** (last 10 events across all leads). All numbers come from one SQL function (`dashboard_stats`), so it stays fast with 50,000+ leads.
2. **One-click WhatsApp.** A WhatsApp button on every card and the profile. It opens a **template picker with a live preview**, then `https://wa.me/<number>?text=<message>` (the app on a phone, WhatsApp Web on desktop). Templates live in a `message_templates` table and support `{brand_name} {owner_name} {city} {state} {niche} {tracking_id}`; manage them in **Settings → Message templates** (3 starters included). The open is logged on the timeline, and if the lead is still **New** you're asked **"Mark as Contacted?"**. No number → the button is disabled with a hint. WhatsApp number is used, falling back to phone.
3. **Export.** The **Export** button on the list exports exactly the current filtered + sorted view, with a **column picker**:
   - **Excel (.xlsx):** all chosen fields, **bold frozen header**, auto column widths, a filter + auto-filter, and an "Export info" sheet (date, count, applied filters).
   - **PDF:** a clean paginated table with the Zyntra title, date, applied filters and total.
   - **Download PDF** on a profile makes a one-page **ID-card** (logo, big tracking ID, details, score, tags, recent activity).
   Every export is logged in an `exports` table.
4. **Backup & restore.** **Settings → Backups** lists backups (date, size, lead count) with **Backup now** and per-backup **JSON / Excel** download. A backup is a single JSON file (plus an Excel copy) of every table — `leads, niches, tags, lead_tags, lead_activities, followups, message_templates, imports` — plus the list of logo/import storage paths, saved in a private **`backups`** bucket. The **last 30** are kept automatically. **Restore** uploads a file, shows a **preview** (new vs existing leads), and defaults to **merge** (nothing deleted); **Replace everything** needs an explicit tick. Restore preserves tracking IDs and re-syncs the ID counters so new leads never collide. The dashboard shows **"Last backup: …"**, in red if older than 2 days. A **daily automatic backup** runs via cron.

All exports and backups check the logged-in owner **on the server** (RLS + an auth check in each route), not just in the UI.

### Code added
```
supabase/migrations/20261109000000_phase4_dashboard_export_backup.sql
    dashboard_stats() + recent_activity(), message_templates / exports / backups tables,
    backups storage bucket, whatsapp_opened activity, restore-friendly tracking_id + resync_tracking_counters()
src/services/dashboard.ts     getDashboardStats, getRecentActivity, resolveRange
src/services/templates.ts     getWhatsAppLink, renderTemplate, logWhatsAppOpened, template CRUD
src/services/exportLeads.ts   exportLeads (xlsx/pdf), exportLeadProfile   (+ exportColumns.ts)
src/services/backup.ts        createBackup, listBackups, previewRestore, restoreBackup, pruneBackups
src/app/api/export/{leads,profile}/   download routes (owner-only)
src/app/api/cron/backup/      daily backup job (CRON_SECRET)
src/app/(app)/page.tsx        the dashboard;  /leads  is now the list
src/components/dashboard/, src/components/whatsapp/, src/components/export/, src/components/settings/{Template,Backup}Manager
```

**For the API / MCP phase** (all take a Supabase client, all record an actor):
```ts
const stats = (await getDashboardStats(db, "30d")).data;
const { url } = (await getWhatsAppLink(db, leadId, templateId)).data;   // then logWhatsAppOpened(db, leadId, …)
const file = (await exportLeads(db, { niches: ["Clothing Brand"] }, "xlsx", "score")).data;   // { filename, bytes }
const profile = (await exportLeadProfile(db, leadId)).data;
const backup = (await createBackup(db)).data;   // listBackups(db) · restoreBackup(db, json, "merge")
```

## Phase 4 setup

1. **Run the migration:** Supabase → SQL Editor → `supabase/migrations/20261109000000_phase4_dashboard_export_backup.sql`. It adds the tables, the `backups` bucket, the dashboard functions, and makes restore keep tracking IDs. No new npm env beyond Phase 3.
2. **Daily backup schedule** (uses the same `CRON_SECRET` and `SUPABASE_SECRET_KEY` from Phase 3):
   - **Vercel Cron** — `vercel.json` already has `/api/cron/backup` daily at 02:30. Vercel sends the `Authorization: Bearer $CRON_SECRET` header automatically.
   - **Supabase pg_cron** — `supabase/cron_followups.sql` now also schedules `zyntra-backup`; edit the URL + secret and run it.
   The job skips if a backup was made in the last 20 hours, so calling it more often is safe. `?force=1` forces one.
3. No new environment variables. (Exports/backup run server-side with the user's session; the cron backup uses `SUPABASE_SECRET_KEY`.)

## Sample data
`supabase/sample_pipeline.sql` (from Phase 3) already gives varied statuses, scores, tags and follow-ups, so the dashboard charts, conversion rate and activity feed are populated.

## Test on your phone

1. Deploy with the migration run. Open the app (add to home screen for the full-screen experience).
2. **Dashboard:** change the date range; tap **Hot leads** or a **state bar** → the filtered list opens. Check **Last backup** top-right.
3. **WhatsApp:** on any lead tap the green **WhatsApp** button → pick **First intro** → see the filled preview → **Open WhatsApp** (it opens the chat with the message ready). Come back and accept **Mark as Contacted?**.
4. **Export:** on **/leads**, apply a filter (e.g. niche + state), tap **Export**, choose columns, download **Excel** and **PDF**. Open a profile and tap **Download PDF**.
5. **Backup:** **Settings → Backups → Backup now**, then download the JSON. To test restore safely, delete a lead, then upload that JSON and **Merge** — the lead comes back. (Try **Replace everything** only on test data.)

---

# Phase 5 — connect any AI (REST API + MCP server)

Any AI — Claude, ChatGPT, or your own tools — can now work directly in Zyntra. Tell it "add these leads", "find ZYN-IN-GJ-000123", "show me all Hot clothing brands in Gujarat", or hand it a PDF, and it goes straight into your system. Everything an AI does appears in the lead timeline under that AI's name.

## What's new

1. **API keys.** Create a key per AI in **Settings → AI Connections**. The key is shown **once** (copy button); only its SHA-256 hash is stored. Each key has **read** and/or **write** scope, shows last-used, and can be **revoked** instantly. The key's **name is the timeline actor**, so every lead shows which AI added or changed it. (Keys are managed only in the app — never exposed to the API itself.)
2. **REST API at `/api/v1`.** Bearer-auth (`Authorization: Bearer <key>`), scope-checked on every route, rate-limited (120/min per key), request-size-capped, and every call logged to `api_logs`. Every route calls only the shared service layer, with zod validation and clean JSON errors. Endpoints: `GET /leads/search`, `GET /leads` (filters + sort + pagination), `GET /leads/{tracking_id}`, `POST /leads` (duplicate check → merge), `POST /leads/bulk` (≤500), `POST /imports/pdf` (multipart or base64/URL; `review:false` adds directly), `PATCH /leads/{id}`, `POST /leads/{id}/{status,notes,followups,tags}`, `GET /followups/due`, `GET /stats`, `GET /leads/{id}/whatsapp-link`, `POST /exports`. **Not exposed:** deleting leads, restoring backups, managing keys (owner-only in the app). A machine-readable **OpenAPI spec** is public at `/api/v1/openapi.json` for ChatGPT Actions.
3. **MCP server at `/api/mcp`.** A remote MCP server (Streamable HTTP, via `mcp-handler`) with 15 tools (`search_leads`, `get_lead`, `list_leads`, `add_lead`, `add_leads_bulk`, `import_pdf`, `update_lead`, `set_status`, `add_note`, `set_followup`, `list_due_followups`, `add_tags`, `get_stats`, `get_whatsapp_link`, `export_leads`). Read tools carry `readOnlyHint`; results are compact (key fields first, tracking ID always included). Two auth methods:
   - **Bearer API key** — for Claude Code, Claude Desktop and other clients.
   - **OAuth 2.1** (the MCP authorization spec: discovery metadata, Dynamic Client Registration, authorization code + **PKCE**, refresh) — so it can be added as a **custom connector in claude.ai** on web and phone. The OAuth login reuses your existing owner login and shows a consent screen.
   All lead data (names, notes, PDF text) is treated as **data, never instructions** — tool descriptions say so and the server never executes content found inside leads.
4. **Connection guide.** **Settings → How to connect AI** has copy-paste steps and the exact URLs for Claude (web/phone connector), Claude Code/Desktop (MCP config), ChatGPT (Custom GPT Action from the OpenAPI URL), and any REST client (curl examples).

### Code added
```
supabase/migrations/20261110000000_phase5_api_mcp.sql   api_keys, api_logs, api_rate_hit(),
    oauth_clients / oauth_auth_codes / oauth_tokens, restore-safe tracking-id helpers already in P4
src/services/apiKeys.ts        createApiKey (shown once), verifyApiKey, checkRateLimit, logApiCall
src/services/oauth.ts          DCR, PKCE code exchange, token verify + refresh
src/lib/api/handler.ts         withApi() wrapper: auth, scope, rate limit, body cap, logging, errors
src/lib/api/operations.ts      the ONE place REST + MCP call the service layer
src/lib/api/{schemas,serialize,openapi,baseUrl}.ts
src/lib/mcp/tools.ts           the 15 MCP tools (readOnlyHint, compact results)
src/app/api/v1/**              all REST routes + /openapi.json
src/app/api/mcp/route.ts       MCP (Streamable HTTP) with bearer + OAuth
src/app/api/oauth/{register,token}, src/app/oauth/authorize   OAuth 2.1 endpoints + consent
src/app/.well-known/**         OAuth discovery metadata
src/app/(app)/settings/{connections,connect-ai}   AI Connections + guide
tests/api.test.mjs, tests/mcp.test.mjs            end-to-end tests
```

## Phase 5 setup

1. **Run the migration:** Supabase → SQL Editor → `supabase/migrations/20261110000000_phase5_api_mcp.sql`.
2. **Set `NEXT_PUBLIC_APP_URL`** in Vercel to your real URL (e.g. `https://zyntra-leads.vercel.app`). It's used in the OpenAPI spec, the OAuth metadata and the connect guide. (`SUPABASE_SECRET_KEY` from Phase 4 is reused — the API/MCP run with the service-role client and enforce auth in code.) Optional: `API_RATE_LIMIT` (default 120/min).
3. Redeploy. Then open **Settings → AI Connections**, create a key, and follow **How to connect AI**.

### Your URLs (after deploy)
- **API base:** `https://<your-app>/api/v1` · **OpenAPI:** `https://<your-app>/api/v1/openapi.json`
- **MCP server:** `https://<your-app>/api/mcp`

## Test end to end

Automated (see `tests/README.md`): with Supabase + the app running,
```bash
node tests/api.test.mjs   # 18 checks: auth, scopes, add, duplicate-merge, bulk, actor-in-timeline, export, rate limit, revoke
node tests/mcp.test.mjs   # 9 checks: tools, readOnlyHint, scopes, add via MCP, actor recorded
```

## Connect it to Claude on your phone

1. Deploy and run the migration. Create a key in **Settings → AI Connections** (optional for the connector — claude.ai uses OAuth).
2. In the **Claude app → Settings → Connectors → Add custom connector**, paste your **MCP URL** `https://<your-app>/api/mcp` and tap **Connect**.
3. Claude opens Zyntra's login — sign in as the owner and tap **Allow**.
4. In a chat, enable the **Zyntra** connector and try: *"Find ZYN-IN-GJ-000001"* or *"Add a lead: Surat Silk House, Gujarat, 98765 43210."* Your timeline will show the action under "Claude".

## Connect it to ChatGPT

1. Create a key with the **write** scope in AI Connections.
2. ChatGPT → **Create a GPT → Configure → Create new Action → Import from URL**: `https://<your-app>/api/v1/openapi.json`.
3. **Authentication → API Key → Bearer**, paste the key. Save, then ask *"Show me all Hot clothing brands in Gujarat."*

## Ready for later phases
- **The service layer is the single source of truth.** REST routes and MCP tools both call `src/lib/api/operations.ts`, which calls `src/services/*`. New surfaces reuse the same functions; every write records an `actor`.
- **Deleting / restoring / key management stay owner-only** in the app and are intentionally absent from the API and MCP.
