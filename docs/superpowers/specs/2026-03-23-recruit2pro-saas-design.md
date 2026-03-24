# RecruitPro v2 — SaaS Rebuild Design Spec

**Date:** 2026-03-23
**Status:** Approved
**Author:** Brainstorming session with Claude Code

---

## Overview

RecruitPro is a mobile-first web app that helps high school baseball players find college coaches and write personalized outreach emails. This spec covers the rebuild from a single-file localStorage app into a proper SaaS with accounts, cloud sync, and Stripe subscriptions.

**What it is:** Athlete-facing. Baseball-only. Players use it to find coaches and send recruiting emails.
**What it is not:** A coach-facing tool. Not multi-sport (yet).

---

## Business Model

- **Price:** $20/month flat
- **Model:** Pay to access. No free tier. No feature tiers. Pay $20 → full access to everything.
- **Billing:** Stripe subscriptions (already connected)
- **Access logic:** Account + active Stripe subscription = full app access. Anything less = paywall.

---

## Architecture

### Front-end
Vanilla JS ES modules. No framework, no build toolchain. Existing CSS design system carried over entirely.

**Pages:**
- `index.html` — Landing page + pricing (already built, update Stripe CTA)
- `auth.html` — Sign up / Log in / Password reset (new)
- `app.html` — Main 3-tab app (auth-gated + subscription-gated)

**JS modules (new):**
- `js/auth.js` — Supabase session management, redirect logic, grace period check
- `js/db.js` — Cloud data layer (profile + emails CRUD via Supabase)
- `js/coaches.js` — Coach list filtering, rendering, search
- `js/emails.js` — Email builder, AI call, history management
- `js/profile.js` — Profile load/save, readiness calculation, validation

### Back-end
**Netlify Functions (Node.js):**
- `netlify/functions/ai-proxy.js` — Existing. Add auth check + per-user rate limiting.
- `netlify/functions/create-checkout.js` — NEW. Creates Stripe Checkout session.
- `netlify/functions/stripe-webhook.js` — NEW. Handles Stripe subscription lifecycle events. Verifies webhook signature.
- `netlify/functions/customer-portal.js` — NEW. Opens Stripe billing portal.

### Infrastructure
- **Hosting:** Netlify (existing)
- **Auth + Database:** Supabase (PostgreSQL + Supabase Auth)
- **Billing:** Stripe (existing connection)
- **AI:** Anthropic Claude Haiku (existing)

---

## Environment Variables

All secrets are set in the Netlify dashboard under Site Settings → Environment Variables. For local development, put them in `.env` (gitignored).

| Variable | Source | Used by |
|----------|--------|---------|
| `ANTHROPIC_API_KEY` | Anthropic Console | ai-proxy.js |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API Keys | create-checkout.js, customer-portal.js |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Developers → Webhooks → Signing secret | stripe-webhook.js |
| `STRIPE_PRICE_ID` | Stripe Dashboard → Products → RecruitPro Pro → Price ID (e.g. `price_xxx`) | create-checkout.js |
| `SUPABASE_URL` | Supabase project Settings → API → Project URL | All functions that touch Supabase |
| `SUPABASE_ANON_KEY` | Supabase project Settings → API → anon public key | Front-end JS modules + ai-proxy.js (for token validation) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project Settings → API → service_role secret | stripe-webhook.js only (bypasses RLS to write subscriptions) |
| `APP_ORIGIN` | Your production URL (e.g. `https://recruit2pro.netlify.app`) | ai-proxy.js CORS header, Supabase redirect URL allowlist |

---

## Netlify Configuration

`netlify.toml` in project root:

```toml
[build]
  functions = "netlify/functions"
  publish = "."
```

No SPA catch-all redirect needed — each page is a separate HTML file (`index.html`, `auth.html`, `app.html`).

Functions auto-discovered at `netlify/functions/*.js`. No additional config needed.

---

## Supabase Setup

1. Create a new Supabase project at supabase.com.
2. In Auth → Settings:
   - Enable "Confirm email" — users must verify email before logging in.
   - Add to "Redirect URLs" allowlist: `https://YOUR_APP_ORIGIN/auth.html` and `http://localhost:8888/auth.html`.
3. Schema managed via Supabase CLI migrations (`supabase/migrations/`). Run `supabase init` and `supabase start` for local development with integration tests.
4. Apply migrations from `supabase/migrations/` to create tables and RLS policies.

---

## Database Schema

### `profiles`
One row per user. Replaces `rp_profile` in localStorage.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | References auth.users (PK) |
| name | text | Player full name |
| pos | text | RHP, LHP, C, 1B, 2B, 3B, SS, OF, DH |
| grad_year | integer | 2025–2030 |
| hometown | text | |
| high_school | text | High school or club team |
| gpa | numeric | 0.0–4.0 |
| sat_act | text | Free-form (e.g. "1280 / 28") |
| stats | text | Free-form stats blob |
| film_url | text | Validated Hudl or YouTube URL |
| email | text | Player contact email |
| target_divs | text[] | e.g. {D1, D2, JUCO} |
| updated_at | timestamptz | |

### `emails`
Many rows per user, capped at 100. Replaces `rp_emails` in localStorage.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, auto-generated |
| user_id | uuid | References auth.users |
| school_id | text | e.g. 'fsu', 'vanderbilt' |
| school_name | text | |
| type | text | first / followup / thankyou / showcase |
| subject | text | |
| body | text | |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | |

### `subscriptions`
One row per user (UNIQUE constraint on `user_id`). Written exclusively by `stripe-webhook.js` using the service role key (bypasses RLS). Read by front-end to gate access.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, auto-generated |
| user_id | uuid | References auth.users — UNIQUE |
| stripe_customer_id | text | |
| stripe_subscription_id | text | |
| status | text | active / canceled / past_due / trialing |
| current_period_end | timestamptz | When paid period ends |
| grace_until | timestamptz | current_period_end + 3 days. Access allowed until this timestamp even if status ≠ active. |
| updated_at | timestamptz | |

**Upsert pattern:** All webhook events use `INSERT ... ON CONFLICT (user_id) DO UPDATE` keyed on `user_id`. This makes webhook handling idempotent — duplicate events are safe.

**Coach database** stays hardcoded in JS (373-program `coachDB[]` array). No DB table needed.

---

## Row Level Security Policies

RLS is enabled on all three tables. Exact SQL for migration file:

```sql
-- profiles: users read/write only their own row
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- emails: users read/write only their own rows
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emails_select_own" ON emails FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "emails_insert_own" ON emails FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "emails_delete_own" ON emails FOR DELETE USING (auth.uid() = user_id);

-- subscriptions: users can only SELECT their own row.
-- INSERT/UPDATE is done server-side via service role key (bypasses RLS).
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_select_own" ON subscriptions FOR SELECT USING (auth.uid() = user_id);
```

---

## Auth & Subscription Flow

1. **index.html** — User sees landing page + $20/mo pricing. "Get Started" → auth.html.

2. **auth.html** — Three states:
   - **Sign Up:** email + password → `supabase.auth.signUp({ email, password, options: { emailRedirectTo: APP_ORIGIN + '/auth.html' } })` → Supabase sends confirmation email → user clicks link → redirected to `auth.html?confirmed=true` → show "Email confirmed — log in now" → user logs in.
   - **Log In:** email + password → `supabase.auth.signInWithPassword()` → on success → `window.location = '/app.html'`.
   - **Forgot Password:** email → `supabase.auth.resetPasswordForEmail(email, { redirectTo: APP_ORIGIN + '/auth.html' })` → user clicks link → Supabase redirects to `auth.html` with `#access_token=...&type=recovery` in the URL hash → `auth.js` detects `type=recovery` in the hash (via `supabase.auth.onAuthStateChange` event `PASSWORD_RECOVERY`) → show new password form → `supabase.auth.updateUser({ password })`.

3. **app.html loads** → `js/auth.js` checks session:
   - No session → `window.location = '/auth.html'` immediately.
   - Session exists → query `subscriptions` table for this user:
     - No row, or `grace_until < now()` → show full-screen paywall.
     - `grace_until >= now()` but `status !== 'active'` → show soft warning banner + allow access (grace period).
     - `status = 'active'` → load profile + email history → show app.

4. **Paywall → Checkout:**
   - "Subscribe Now" → POST to `create-checkout.js` with `{ userId, userEmail }`.
   - Function creates Stripe Checkout session with `STRIPE_PRICE_ID`, `success_url = APP_ORIGIN + '/app.html?checkout=success'`, `cancel_url = APP_ORIGIN + '/app.html'`.
   - Returns `{ url }` → front-end redirects to Stripe Checkout.
   - User pays → Stripe fires `checkout.session.completed` → `stripe-webhook.js` upserts subscription row → user redirected to `app.html?checkout=success` → app detects param, re-checks subscription, shows success toast.

5. **Stripe webhook lifecycle** (`stripe-webhook.js` verifies signature with `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)` before processing):
   - `checkout.session.completed` → upsert `status = active`, set `current_period_end`, set `grace_until = current_period_end + 3 days`
   - `customer.subscription.updated` → update `status`, `current_period_end`, `grace_until`
   - `customer.subscription.deleted` → set `status = canceled`
   - `invoice.payment_failed` → set `status = past_due`
   - `invoice.payment_succeeded` → update `current_period_end`, `grace_until`, `status = active`

6. **Settings menu** (in app.html): "Manage Billing" → POST to `customer-portal.js` → returns Stripe portal URL → redirect. "Log Out" → `supabase.auth.signOut()` → redirect to `index.html`.

---

## AI Proxy — Auth Check & Rate Limiting

`ai-proxy.js` changes:
- **Auth check:** Extract `Authorization: Bearer <token>` header. Call `supabase.auth.getUser(token)` with the anon key. If invalid → 401. If valid but no active subscription → 403.
- **Rate limiting:** Per-user, Supabase-backed. A `ai_usage` table tracks `(user_id, date, count)`. On each request: increment count for today. If count > 50 (daily limit) → 429. The service role key is used to write this table from the function.
- **CORS:** Replace `Access-Control-Allow-Origin: *` with `Access-Control-Allow-Origin: ${process.env.APP_ORIGIN}`. Allow `http://localhost:8888` in development (check `NODE_ENV`).

---

## Import Data Validation

`importData()` validates that the imported JSON matches the expected backup schema before writing to Supabase:
- Must be an object with `profile` (object) and/or `emails` (array) keys.
- `profile` fields are validated the same as form inputs (GPA 0–4, year integer, film URL format).
- Each email in `emails` must have `school`, `type`, `subject`, `body` string fields.
- Invalid backup shows an error toast; valid fields are merged into Supabase.

---

## Autopilot Parallel Batching

Autopilot generates up to 10 emails per batch. Implementation:
- Concurrency limit: 3 simultaneous AI calls (prevents rate-limit errors and UI overload).
- Use a semaphore pattern: process in groups of 3 with `Promise.all`, then next 3, etc.
- Individual failures: skip the failed school, render an error card ("Could not generate — tap to retry"), continue the batch. Do not abort on single failure.
- Progress bar updates after each individual completion, not each group.

---

## Feature Scope — v1

### Included in v1
- Auth: signup, login, password reset (Supabase)
- Cloud profile sync (Supabase `profiles` table)
- Cloud email history sync (Supabase `emails` table)
- Stripe subscription checkout (create-checkout.js)
- Stripe billing portal — cancel/update card (customer-portal.js)
- Stripe webhook — full subscription lifecycle with signature verification (stripe-webhook.js)
- Paywall + grace period for users without active subscription
- Coach database — 373 programs (carried over)
- AI Email Writer — 4 types: First Contact, Follow Up, Thank You, Showcase
- Autopilot batch email generation (parallel, concurrency 3)
- Gmail compose integration
- Data export / import (JSON backup with schema validation)
- Auth check + rate limiting on ai-proxy
- Input validation: GPA range, grad year range, film URL format
- Full test suite: unit + integration + e2e

### Bugs Fixed in v1
- ai-proxy has no auth check — anyone can abuse the Anthropic API key
- ai-proxy CORS is wildcard `*` — restrict to APP_ORIGIN
- verify-license.js has no CORS headers
- Profile completeness ignores target divisions
- Autopilot generates emails sequentially — switch to concurrency-3 parallel batching
- No input validation on GPA, year, film URL
- importData accepts any JSON without schema validation
- Gmail send button active before email is generated

### Saved for v2
- School tracker (saved schools list + status tracking)
- Follow-up reminder system
- Community coach data contributions
- Recruiting calendar / timeline
- Email open/reply tracking
- Coach DB expansion (more verified data)
- Team / family accounts
- Affiliate / referral system
- Admin dashboard
- Analytics / usage metrics
- iOS/Android PWA install flow
- Push notifications

---

## Testing Strategy

**Tools:** Vitest (unit + integration) + Playwright (e2e)
**Approach:** TDD — write failing test first, then write minimum code to pass, then refactor.
**Local Supabase:** `supabase start` spins up a local Postgres instance for integration tests. Migrations in `supabase/migrations/` apply automatically.

### Unit Tests (~50 tests, Vitest, no browser)
- `js/auth.js` — redirect for unauthenticated users; redirect for no subscription; access granted for active subscription; grace period allows access when `grace_until >= now()`; hard block when `grace_until < now()`
- `js/profile.js` — calcReadiness() correct % per field combination; getNextStep() correct prompt per state; GPA validation (0–4); grad year validation (2025–2030); film URL validation (Hudl/YouTube patterns)
- `js/emails.js` — buildEmailPrompt() includes coach last name; includes school name and conference; parseEmailResult() extracts subject + body; handles missing SUBJECT: line; saveEmail() caps at 100 and drops oldest
- `js/coaches.js` — getFilteredCoaches() by division; by state; by search query (name/abbr/coach); getApMatches() excludes already-sent schools

### Integration Tests (~20 tests, Vitest + Supabase local)
- Profile saves to Supabase and loads back with correct fields
- Email saves to Supabase and appears in history query
- Email history caps at 100 — inserting 101st drops oldest
- RLS: user A cannot SELECT user B's profile
- RLS: user A cannot SELECT user B's emails
- stripe-webhook.js with valid signature → updates subscriptions correctly for each event type
- stripe-webhook.js with invalid signature → 400 rejected
- stripe-webhook.js idempotent — duplicate `checkout.session.completed` does not create duplicate row
- create-checkout.js returns a Stripe session URL containing `stripe.com`

### E2E Tests (~15 tests, Playwright)
- Unauthenticated user visiting app.html → redirected to auth.html
- Sign up → confirm email → log in → land on app.html
- Logged-in user with no subscription → paywall shown, 3-tab app not visible
- Full subscription purchase flow: paywall → checkout (Stripe test mode) → webhook → access granted
- Complete profile → readiness bar percentage increases
- Search coaches → division filter returns correct subset
- State filter returns correct subset
- Open coach sheet → "Write Email to This School" prefills school autocomplete
- Generate email → subject strip and body both appear
- Copy email → clipboard contains "Subject:" + body text
- Autopilot: select divisions → match count updates → generate → cards appear
- Log out → redirected to auth.html, session cleared

### What We Don't Test
- The Anthropic API response quality (mocked in unit tests)
- Stripe's checkout UI (Stripe tests that)
- Coach database data accuracy
- CSS / visual appearance

---

## What Stays the Same
- All CSS and the design system (navy/gold color palette, typography, component styles)
- 3-tab layout (Home / Coaches / Emails)
- Coach database (373 programs, `coachDB[]` array)
- Email writer UI and 4 email type templates
- Autopilot UI
- Gmail compose integration
- Landing page design (index.html)
