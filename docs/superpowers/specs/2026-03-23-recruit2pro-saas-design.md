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
- `js/auth.js` — Supabase session management, redirect logic
- `js/db.js` — Cloud data layer (profile + emails CRUD via Supabase)
- `js/coaches.js` — Coach list filtering, rendering, search
- `js/emails.js` — Email builder, AI call, history management
- `js/profile.js` — Profile load/save, readiness calculation, validation

### Back-end
**Netlify Functions (Node.js):**
- `netlify/functions/ai-proxy.js` — Existing. Add auth check + rate limiting.
- `netlify/functions/create-checkout.js` — NEW. Creates Stripe Checkout session.
- `netlify/functions/stripe-webhook.js` — NEW. Handles Stripe subscription lifecycle events.
- `netlify/functions/customer-portal.js` — NEW. Opens Stripe billing portal.

### Infrastructure
- **Hosting:** Netlify (existing)
- **Auth + Database:** Supabase (PostgreSQL + Supabase Auth)
- **Billing:** Stripe (existing connection)
- **AI:** Anthropic Claude Haiku (existing)

---

## Database Schema

All tables use Supabase Row Level Security (RLS). Users can only read/write their own rows (`user_id = auth.uid()`).

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

### `subscriptions`
One row per user. Written by Stripe webhook, read by app to gate access.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, auto-generated |
| user_id | uuid | References auth.users |
| stripe_customer_id | text | |
| stripe_subscription_id | text | |
| status | text | active / canceled / past_due / trialing |
| current_period_end | timestamptz | When access expires |
| updated_at | timestamptz | |

**Coach database** stays hardcoded in JS (373-program `coachDB[]` array). No DB table needed — it is static data that ships with the app.

---

## Auth & Subscription Flow

1. **index.html** — User sees landing page + $20/mo pricing. "Get Started" → auth.html.
2. **auth.html** — Sign up (email + password → Supabase confirmation email → confirm → logged in) or Log in or Forgot Password.
3. **app.html loads** → check Supabase session:
   - No session → redirect to auth.html immediately.
   - Session exists → check `subscriptions` table:
     - No active subscription → full-screen paywall → "Subscribe Now" → create-checkout.js → Stripe Checkout → payment success → stripe-webhook.js writes `status = active` → redirect back to app → full access.
     - Active subscription → load profile + email history from Supabase → show 3-tab app.
4. **Stripe webhook lifecycle:**
   - `checkout.session.completed` → create/update subscriptions row, status = active
   - `customer.subscription.updated` → update status + current_period_end
   - `customer.subscription.deleted` → status = canceled
   - `invoice.payment_failed` → status = past_due
   - `invoice.payment_succeeded` → extend current_period_end
5. **Grace period:** When `current_period_end` passes, show soft warning for 3 days before hard-blocking access.
6. **Settings menu:** "Manage Billing" (Stripe portal) + "Log Out".

---

## Feature Scope — v1

### Included in v1
- Auth: signup, login, password reset (Supabase)
- Cloud profile sync (Supabase `profiles` table)
- Cloud email history sync (Supabase `emails` table)
- Stripe subscription checkout (create-checkout.js)
- Stripe billing portal — cancel/update card (customer-portal.js)
- Stripe webhook — full subscription lifecycle (stripe-webhook.js)
- Paywall for users without active subscription
- Coach database — 373 programs (carried over from v1)
- AI Email Writer — 4 types: First Contact, Follow Up, Thank You, Showcase
- Autopilot batch email generation
- Gmail compose integration
- Data export / import (JSON backup)
- Auth check on ai-proxy (currently open endpoint)
- Rate limiting on ai-proxy
- Input validation: GPA range, grad year range, film URL format
- Full test suite: unit + integration + e2e

### Bugs Fixed in v1
- ai-proxy has no auth check — anyone can abuse the Anthropic API key
- ai-proxy CORS is wildcard `*` — restrict to app origin
- verify-license.js has no CORS headers
- Profile completeness ignores target divisions
- Autopilot generates emails sequentially — switch to controlled parallel batching
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

### Unit Tests (~50 tests, Vitest, no browser)
- `js/auth.js` — redirect logic for unauthenticated users, no subscription, grace period
- `js/profile.js` — calcReadiness(), getNextStep(), GPA/year/URL validation
- `js/emails.js` — buildEmailPrompt(), parseEmailResult(), saveEmail() cap at 100
- `js/coaches.js` — getFilteredCoaches() by div/state/search, getApMatches() excludes sent

### Integration Tests (~20 tests, Vitest + Supabase local)
- Profile saves to Supabase and loads back correctly
- Email saves to Supabase and appears in history
- Email history caps at 100, drops oldest
- RLS: user A cannot read user B's profile or emails
- stripe-webhook.js correctly updates subscriptions table for each event type
- create-checkout.js returns a valid Stripe session URL

### E2E Tests (~15 tests, Playwright)
- Unauthenticated user → redirected to auth.html
- Sign up → confirm email → log in → land on app
- No subscription → paywall shown, app blocked
- Complete profile → readiness bar updates
- Search coaches → filter by division + state works
- Open coach sheet → "Write Email" prefills school
- Generate email → subject + body appear
- Copy email → clipboard contains subject + body
- Log out → redirected to auth.html

### What We Don't Test
- The Anthropic API itself (mocked in unit tests)
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
