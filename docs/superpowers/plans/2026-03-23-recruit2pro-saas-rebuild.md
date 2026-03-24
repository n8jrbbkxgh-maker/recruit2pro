# RecruitPro v2 SaaS Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild RecruitPro from a single-file localStorage app into a production SaaS with Supabase auth, cloud sync, and Stripe subscriptions at $20/month.

**Architecture:** Vanilla JS ES modules (no build toolchain), split from monolithic app.html into focused js/*.js modules. Supabase handles auth + PostgreSQL. Netlify functions handle Stripe + AI proxy. All modules are pure-function-first so Vitest can test them without a browser.

**Tech Stack:** Supabase JS v2 (CDN in browser, npm in functions), Stripe Node SDK, Vitest (unit + integration), Playwright (e2e), Netlify Functions (ESM)

**Spec:** `docs/superpowers/specs/2026-03-23-recruit2pro-saas-design.md`

---

## File Map

**Create:**
- `package.json` — dev deps (vitest, playwright), runtime deps (supabase-js, stripe)
- `vitest.config.js` — test config
- `playwright.config.js` — e2e config
- `netlify.toml` — build config
- `.env.example` — env var template
- `supabase/migrations/001_initial_schema.sql` — tables + RLS policies
- `js/profile.js` — pure functions: calcReadiness, getNextStep, validation
- `js/coaches.js` — pure functions: filtering, searching the coach DB
- `js/emails.js` — pure functions: buildEmailPrompt, parseEmailResult, capEmailHistory
- `js/auth.js` — pure functions: getAccessStatus; async: requireAuth, requireSubscription
- `js/db.js` — Supabase data layer: profile CRUD, email CRUD, subscription read
- `auth.html` — sign up / login / password reset page
- `netlify/functions/create-checkout.js` — Stripe checkout session
- `netlify/functions/stripe-webhook.js` — Stripe event handler
- `netlify/functions/customer-portal.js` — Stripe billing portal
- `tests/unit/profile.test.js`
- `tests/unit/coaches.test.js`
- `tests/unit/emails.test.js`
- `tests/unit/auth.test.js`
- `tests/integration/db.test.js`
- `tests/integration/stripe-webhook.test.js`
- `tests/e2e/auth.spec.js`
- `tests/e2e/app.spec.js`

**Modify:**
- `netlify/functions/ai-proxy.js` — add auth check, rate limiting, fix CORS
- `app.html` — remove inline JS, import js modules, add auth gate + paywall
- `index.html` — update "Get Started" CTA to point to auth.html
- `.gitignore` — add node_modules, .env

---

## Task 1: Dev Tooling

**Files:**
- Create: `package.json`
- Create: `vitest.config.js`
- Create: `playwright.config.js`
- Modify: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "recruit2pro",
  "type": "module",
  "scripts": {
    "test": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "playwright test",
    "test:all": "vitest run && playwright test"
  },
  "devDependencies": {
    "vitest": "^1.6.0",
    "@playwright/test": "^1.44.0",
    "netlify-cli": "^17.0.0"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.43.0",
    "stripe": "^15.0.0"
  }
}
```

- [ ] **Step 2: Create vitest.config.js**

```js
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
    environment: 'node',
  }
})
```

- [ ] **Step 3: Create playwright.config.js**

```js
import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:8888',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'netlify dev',
    url: 'http://localhost:8888',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})
```

- [ ] **Step 4: Update .gitignore**

Add to existing `.gitignore`:
```
node_modules/
.env
.env.local
.netlify/
```

- [ ] **Step 5: Install dependencies**

```bash
npm install
npx playwright install chromium
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Verify vitest works**

```bash
npm test
```

Expected: "No test files found" — that's fine, no tests exist yet.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.js playwright.config.js .gitignore
git commit -m "chore: add vitest and playwright dev tooling"
```

---

## Task 2: Supabase Migration

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/001_initial_schema.sql

-- PROFILES: one row per user, replaces rp_profile localStorage key
CREATE TABLE profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  name text,
  pos text,
  grad_year integer CHECK (grad_year BETWEEN 2025 AND 2030),
  hometown text,
  high_school text,
  gpa numeric CHECK (gpa >= 0 AND gpa <= 4),
  sat_act text,
  stats text,
  film_url text,
  email text,
  target_divs text[] DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- EMAILS: many rows per user, replaces rp_emails localStorage key
CREATE TABLE emails (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  school_id text NOT NULL,
  school_name text NOT NULL,
  type text NOT NULL CHECK (type IN ('first','followup','thankyou','showcase','autopilot')),
  subject text NOT NULL,
  body text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX emails_user_id_created_at ON emails (user_id, created_at DESC);
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emails_select_own" ON emails FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "emails_insert_own" ON emails FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "emails_delete_own" ON emails FOR DELETE USING (auth.uid() = user_id);

-- SUBSCRIPTIONS: one row per user, written by webhook via service role
CREATE TABLE subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL UNIQUE,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text NOT NULL DEFAULT 'none',
  current_period_end timestamptz,
  grace_until timestamptz,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
-- Users can only SELECT their own row; INSERT/UPDATE done via service role
CREATE POLICY "subscriptions_select_own" ON subscriptions FOR SELECT USING (auth.uid() = user_id);

-- AI_USAGE: rate limiting for ai-proxy, written by service role
CREATE TABLE ai_usage (
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  date date NOT NULL DEFAULT current_date,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
-- No user-facing policies; only accessed via service role from ai-proxy function
```

- [ ] **Step 2: Apply migration to local Supabase (for integration tests)**

```bash
npx supabase init
npx supabase start
npx supabase db reset
```

`supabase db reset` applies all migrations in `supabase/migrations/` to the local database. (`supabase db push` is for remote projects — don't use it here.)

Expected: Local Supabase running on port 54321. Migration applied. Note the output — it prints `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` for local dev.

- [ ] **Step 3: Commit**

```bash
git add supabase/
git commit -m "feat: add supabase schema — profiles, emails, subscriptions, ai_usage"
```

---

## Task 3: Infrastructure Config

**Files:**
- Create: `netlify.toml`
- Create: `.env.example`

- [ ] **Step 1: Create netlify.toml**

```toml
[build]
  functions = "netlify/functions"
  publish = "."

[dev]
  port = 8888
```

- [ ] **Step 2: Create .env.example**

```bash
# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# App
APP_ORIGIN=http://localhost:8888
```

- [ ] **Step 3: Create local .env from example (fill in real values)**

```bash
cp .env.example .env
# Edit .env with your actual keys
# For local Supabase: use values printed by `supabase start`
# APP_ORIGIN=http://localhost:8888 for dev
```

- [ ] **Step 4: Commit**

```bash
git add netlify.toml .env.example
git commit -m "chore: add netlify.toml and .env.example"
```

---

## Task 4: js/profile.js + Unit Tests

**Files:**
- Create: `js/profile.js`
- Create: `tests/unit/profile.test.js`

- [ ] **Step 1: Create empty js/profile.js with stubs**

```js
// js/profile.js
// Pure functions — no DOM, no Supabase. Testable in Node.

export function calcReadiness(profile) {
  throw new Error('not implemented')
}

export function getNextStep(profile, emailCount = 0) {
  throw new Error('not implemented')
}

export function validateGPA(value) {
  throw new Error('not implemented')
}

export function validateGradYear(value) {
  throw new Error('not implemented')
}

export function validateFilmUrl(value) {
  throw new Error('not implemented')
}

export function validateProfile(profile) {
  throw new Error('not implemented')
}
```

- [ ] **Step 2: Write tests/unit/profile.test.js**

```js
import { describe, test, expect } from 'vitest'
import {
  calcReadiness, getNextStep,
  validateGPA, validateGradYear, validateFilmUrl, validateProfile
} from '../../js/profile.js'

const FULL_PROFILE = {
  name: 'Jake Smith', pos: 'RHP', year: '2026',
  hometown: 'Tampa, FL', school: 'Plant High School',
  gpa: '3.5', stats: '90mph FB', film: 'https://hudl.com/v/abc', email: 'jake@email.com'
}

describe('calcReadiness', () => {
  test('returns 0 for empty profile', () => {
    expect(calcReadiness({})).toBe(0)
  })
  test('returns 100 for fully filled profile', () => {
    expect(calcReadiness(FULL_PROFILE)).toBe(100)
  })
  test('returns ~11 for only name filled (1 of 9 fields)', () => {
    expect(calcReadiness({ name: 'Jake' })).toBe(11)
  })
  test('ignores unknown fields', () => {
    expect(calcReadiness({ name: 'Jake', foo: 'bar' })).toBe(11)
  })
})

describe('getNextStep', () => {
  test('prompts to complete profile when name missing', () => {
    expect(getNextStep({}, 0)).toContain('profile')
  })
  test('prompts to add position when pos missing', () => {
    expect(getNextStep({ name: 'Jake' }, 0)).toContain('position')
  })
  test('prompts to add stats when stats missing', () => {
    expect(getNextStep({ name: 'Jake', pos: 'RHP' }, 0)).toContain('stats')
  })
  test('prompts to add film when film missing', () => {
    expect(getNextStep({ name: 'Jake', pos: 'RHP', stats: '90mph' }, 0)).toContain('film')
  })
  test('prompts to write first email when profile full but no emails', () => {
    expect(getNextStep(FULL_PROFILE, 0)).toContain('email')
  })
  test('prompts to scale when fewer than 5 emails', () => {
    expect(getNextStep(FULL_PROFILE, 3)).toContain('5')
  })
  test('encourages continued outreach at 5+ emails', () => {
    const msg = getNextStep(FULL_PROFILE, 10)
    expect(msg.length).toBeGreaterThan(0)
  })
})

describe('validateGPA', () => {
  test('returns null for valid GPA', () => {
    expect(validateGPA('3.5')).toBeNull()
    expect(validateGPA('4.0')).toBeNull()
    expect(validateGPA('0.0')).toBeNull()
    expect(validateGPA('')).toBeNull() // optional field
  })
  test('returns error for GPA above 4.0', () => {
    expect(validateGPA('4.1')).toMatch(/4\.0/)
  })
  test('returns error for negative GPA', () => {
    expect(validateGPA('-1')).toMatch(/0/)
  })
  test('returns error for non-numeric', () => {
    expect(validateGPA('abc')).toBeTruthy()
  })
})

describe('validateGradYear', () => {
  test('returns null for valid years', () => {
    expect(validateGradYear('2025')).toBeNull()
    expect(validateGradYear('2030')).toBeNull()
    expect(validateGradYear('')).toBeNull() // optional
  })
  test('returns error for year below 2025', () => {
    expect(validateGradYear('2024')).toBeTruthy()
  })
  test('returns error for year above 2030', () => {
    expect(validateGradYear('2031')).toBeTruthy()
  })
})

describe('validateFilmUrl', () => {
  test('accepts Hudl URLs', () => {
    expect(validateFilmUrl('https://www.hudl.com/video/3/12345/abc')).toBeNull()
  })
  test('accepts YouTube watch URLs', () => {
    expect(validateFilmUrl('https://www.youtube.com/watch?v=abc123')).toBeNull()
  })
  test('accepts youtu.be short URLs', () => {
    expect(validateFilmUrl('https://youtu.be/abc123')).toBeNull()
  })
  test('accepts empty string (field is optional)', () => {
    expect(validateFilmUrl('')).toBeNull()
  })
  test('rejects other URLs', () => {
    expect(validateFilmUrl('https://vimeo.com/123')).toBeTruthy()
    expect(validateFilmUrl('https://google.com')).toBeTruthy()
  })
})

describe('validateProfile', () => {
  test('returns valid for empty profile (all optional at save time)', () => {
    const result = validateProfile({})
    expect(result.valid).toBe(true)
  })
  test('returns invalid when GPA is out of range', () => {
    const result = validateProfile({ gpa: '5.0' })
    expect(result.valid).toBe(false)
    expect(result.errors.gpa).toBeTruthy()
  })
  test('returns invalid when film URL is not Hudl/YouTube', () => {
    const result = validateProfile({ film: 'https://vimeo.com/123' })
    expect(result.valid).toBe(false)
    expect(result.errors.film).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
npm test
```

Expected: All tests FAIL with "not implemented" errors.

- [ ] **Step 4: Implement js/profile.js**

```js
// js/profile.js

const READINESS_FIELDS = ['name','pos','year','hometown','school','gpa','stats','film','email']

export function calcReadiness(profile) {
  const filled = READINESS_FIELDS.filter(f => {
    const v = profile[f]
    return v && String(v).trim().length > 0
  }).length
  return Math.round((filled / READINESS_FIELDS.length) * 100)
}

export function getNextStep(profile, emailCount = 0) {
  if (!profile.name) return 'Complete your player profile to get started'
  if (!profile.pos) return 'Add your position to your profile'
  if (!profile.stats) return 'Add your stats (velocity, GPA, batting avg…) to your profile'
  if (!profile.film) return 'Add a Hudl or YouTube film link to your profile'
  if (!profile.email) return 'Add your email address so coaches can reply'
  if (emailCount === 0) return 'Write your first coach email — tap "Write Email"'
  if (emailCount < 5) return 'Send emails to 5+ coaches — use Autopilot to scale'
  return 'Keep sending — most recruits hear back after 8-12 emails per school'
}

export function validateGPA(value) {
  if (!value || value === '') return null
  const n = parseFloat(value)
  if (isNaN(n)) return 'GPA must be a number'
  if (n < 0 || n > 4.0) return 'GPA must be between 0.0 and 4.0'
  return null
}

export function validateGradYear(value) {
  if (!value || value === '') return null
  const n = parseInt(value, 10)
  if (isNaN(n) || n < 2025 || n > 2030) return 'Grad year must be between 2025 and 2030'
  return null
}

export function validateFilmUrl(value) {
  if (!value || value === '') return null
  const hudl = /^https?:\/\/(www\.)?hudl\.com\//i
  const youtube = /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/)/i
  if (hudl.test(value) || youtube.test(value)) return null
  return 'Film link must be a Hudl or YouTube URL'
}

export function validateProfile(profile) {
  const errors = {}
  const gpaErr = validateGPA(profile.gpa)
  const yearErr = validateGradYear(profile.year)
  const filmErr = validateFilmUrl(profile.film)
  if (gpaErr) errors.gpa = gpaErr
  if (yearErr) errors.year = yearErr
  if (filmErr) errors.film = filmErr
  return { valid: Object.keys(errors).length === 0, errors }
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
npm test
```

Expected: All profile tests PASS.

- [ ] **Step 6: Commit**

```bash
git add js/profile.js tests/unit/profile.test.js
git commit -m "feat: js/profile.js — calcReadiness, getNextStep, validation (TDD)"
```

---

## Task 5: js/coaches.js + Unit Tests

**Files:**
- Create: `js/coaches.js`
- Create: `tests/unit/coaches.test.js`

- [ ] **Step 1: Create stub js/coaches.js**

```js
// js/coaches.js
export function getFilteredCoaches(coachDB, options = {}) {
  throw new Error('not implemented')
}
export function getApMatches(coachDB, options = {}) {
  throw new Error('not implemented')
}
export function getUniqueStates(coachDB) {
  throw new Error('not implemented')
}
```

- [ ] **Step 2: Write tests/unit/coaches.test.js**

```js
import { describe, test, expect } from 'vitest'
import { getFilteredCoaches, getApMatches, getUniqueStates } from '../../js/coaches.js'

const DB = [
  { id: 'fsu', name: 'Florida State University', abbr: 'FSU', div: 'D1', conf: 'ACC', state: 'FL',
    coaches: [{ role: 'Head Coach', name: 'Link Jarrett' }] },
  { id: 'uf', name: 'University of Florida', abbr: 'UF', div: 'D1', conf: 'SEC', state: 'FL', coaches: [] },
  { id: 'chipola', name: 'Chipola College', abbr: 'Chipola', div: 'JUCO', conf: 'FCCAA', state: 'FL', coaches: [] },
  { id: 'uga', name: 'University of Georgia', abbr: 'UGA', div: 'D1', conf: 'SEC', state: 'GA', coaches: [] },
  { id: 'nc_state', name: 'NC State University', abbr: 'NC State', div: 'D1', conf: 'ACC', state: 'NC', coaches: [] },
]

describe('getFilteredCoaches', () => {
  test('returns all with no filters', () => {
    expect(getFilteredCoaches(DB, {}).length).toBe(5)
  })
  test('filters by division', () => {
    expect(getFilteredCoaches(DB, { divFilter: 'JUCO' }).length).toBe(1)
    expect(getFilteredCoaches(DB, { divFilter: 'D1' }).length).toBe(4)
  })
  test('filters by state', () => {
    expect(getFilteredCoaches(DB, { stateFilter: 'GA' }).length).toBe(1)
    expect(getFilteredCoaches(DB, { stateFilter: 'FL' }).length).toBe(3)
  })
  test('filters by search — school name', () => {
    expect(getFilteredCoaches(DB, { searchQuery: 'florida' }).length).toBe(2)
  })
  test('filters by search — abbreviation', () => {
    expect(getFilteredCoaches(DB, { searchQuery: 'fsu' }).length).toBe(1)
  })
  test('filters by search — coach name', () => {
    expect(getFilteredCoaches(DB, { searchQuery: 'jarrett' }).length).toBe(1)
  })
  test('filters by search — state code', () => {
    expect(getFilteredCoaches(DB, { searchQuery: 'GA' }).length).toBeGreaterThanOrEqual(1)
  })
  test('combines div and state filters', () => {
    expect(getFilteredCoaches(DB, { divFilter: 'D1', stateFilter: 'FL' }).length).toBe(2)
  })
  test('search is case-insensitive', () => {
    expect(getFilteredCoaches(DB, { searchQuery: 'FLORIDA' }).length).toBe(2)
  })
})

describe('getApMatches', () => {
  test('returns all when no filters or sentIds', () => {
    expect(getApMatches(DB, {}).length).toBe(5)
  })
  test('filters by divisions array', () => {
    expect(getApMatches(DB, { apDivs: ['JUCO'] }).length).toBe(1)
  })
  test('filters by states array', () => {
    expect(getApMatches(DB, { apStates: ['GA'] }).length).toBe(1)
  })
  test('excludes sentIds', () => {
    const sentIds = new Set(['fsu', 'uf'])
    const result = getApMatches(DB, { sentIds })
    expect(result.find(c => c.id === 'fsu')).toBeUndefined()
    expect(result.find(c => c.id === 'uf')).toBeUndefined()
    expect(result.length).toBe(3)
  })
  test('empty apDivs means no div filter', () => {
    expect(getApMatches(DB, { apDivs: [] }).length).toBe(5)
  })
})

describe('getUniqueStates', () => {
  test('returns sorted unique states', () => {
    const states = getUniqueStates(DB)
    expect(states).toEqual(['FL', 'GA', 'NC'])
  })
})
```

- [ ] **Step 3: Run — verify failure**

```bash
npm test
```

Expected: coaches tests FAIL.

- [ ] **Step 4: Implement js/coaches.js**

```js
// js/coaches.js

export function getFilteredCoaches(coachDB, { divFilter = 'all', stateFilter = 'all', searchQuery = '' } = {}) {
  const q = searchQuery.toLowerCase().trim()
  return coachDB.filter(c => {
    if (divFilter !== 'all' && c.div !== divFilter) return false
    if (stateFilter !== 'all' && c.state !== stateFilter) return false
    if (q) {
      return (
        c.name.toLowerCase().includes(q) ||
        (c.abbr && c.abbr.toLowerCase().includes(q)) ||
        c.state.toLowerCase().includes(q) ||
        c.conf.toLowerCase().includes(q) ||
        c.coaches.some(hc => hc.name && hc.name.toLowerCase().includes(q))
      )
    }
    return true
  })
}

export function getApMatches(coachDB, { apDivs = [], apStates = [], sentIds = new Set() } = {}) {
  return coachDB.filter(c => {
    if (apDivs.length && !apDivs.includes(c.div)) return false
    if (apStates.length && !apStates.includes(c.state)) return false
    if (sentIds.has(c.id)) return false
    return true
  })
}

export function getUniqueStates(coachDB) {
  return [...new Set(coachDB.map(c => c.state))].sort()
}
```

- [ ] **Step 5: Run — verify pass**

```bash
npm test
```

Expected: All coaches tests PASS.

- [ ] **Step 6: Commit**

```bash
git add js/coaches.js tests/unit/coaches.test.js
git commit -m "feat: js/coaches.js — filtering, search, autopilot matching (TDD)"
```

---

## Task 6: js/emails.js + Unit Tests

**Files:**
- Create: `js/emails.js`
- Create: `tests/unit/emails.test.js`

- [ ] **Step 1: Create stub js/emails.js**

```js
// js/emails.js
export const EMAIL_SYSTEM_PROMPT = `You are a college baseball recruiting email specialist who has placed 200+ players in college programs. You write emails that coaches actually open and reply to. Your emails are short, specific, confident, and personal. You always address the coach by last name. You always name the specific school and conference. You never use generic filler language. Every email sounds like a real athlete wrote it.

NEVER use these phrases: "I have always dreamed", "hard worker", "honored", "great fit", "I believe I would", "passionate about baseball", "pursue my dreams", "take my game to the next level", "I am reaching out because", "give me the opportunity", "I feel that", "I am confident that".

FORMAT YOUR RESPONSE EXACTLY AS:
SUBJECT: [subject line]
BODY:
[email body only — no subject, no explanation]`

export function buildEmailPrompt(type, school, hc, profile, notes = '') {
  throw new Error('not implemented')
}

export function parseEmailResult(text, profile = {}, school = {}) {
  throw new Error('not implemented')
}

export function capEmailHistory(emails, cap = 100) {
  throw new Error('not implemented')
}
```

- [ ] **Step 2: Write tests/unit/emails.test.js**

```js
import { describe, test, expect } from 'vitest'
import { buildEmailPrompt, parseEmailResult, capEmailHistory } from '../../js/emails.js'

const SCHOOL = {
  id: 'fsu', name: 'Florida State University', abbr: 'FSU',
  div: 'D1', conf: 'ACC', state: 'FL',
  notes: 'Strong ACC program. Active on Perfect Game circuit.',
  coaches: []
}
const HC = { role: 'Head Coach', name: 'Link Jarrett', email: 'ljarrett@fsu.edu' }
const PROFILE = {
  name: 'Jake Smith', pos: 'RHP', year: '2026',
  hometown: 'Tampa, FL', school: 'Plant High School',
  gpa: '3.5', stats: '90mph FB, 1.8 ERA', film: 'https://hudl.com/v/abc',
  email: 'jake@email.com'
}

describe('buildEmailPrompt', () => {
  test('includes coach last name', () => {
    const prompt = buildEmailPrompt('first', SCHOOL, HC, PROFILE, '')
    expect(prompt).toContain('Jarrett')
  })
  test('includes school name', () => {
    const prompt = buildEmailPrompt('first', SCHOOL, HC, PROFILE, '')
    expect(prompt).toContain('Florida State University')
  })
  test('includes conference', () => {
    const prompt = buildEmailPrompt('first', SCHOOL, HC, PROFILE, '')
    expect(prompt).toContain('ACC')
  })
  test('includes player stats', () => {
    const prompt = buildEmailPrompt('first', SCHOOL, HC, PROFILE, '')
    expect(prompt).toContain('90mph')
  })
  test('includes extra notes when provided', () => {
    const prompt = buildEmailPrompt('first', SCHOOL, HC, PROFILE, 'Met coach at Perfect Game')
    expect(prompt).toContain('Perfect Game')
  })
  test('handles null hc gracefully', () => {
    expect(() => buildEmailPrompt('first', SCHOOL, null, PROFILE, '')).not.toThrow()
  })
  test('handles missing profile fields gracefully', () => {
    expect(() => buildEmailPrompt('first', SCHOOL, HC, {}, '')).not.toThrow()
  })
  test('generates different prompts for each email type', () => {
    const first = buildEmailPrompt('first', SCHOOL, HC, PROFILE, '')
    const followup = buildEmailPrompt('followup', SCHOOL, HC, PROFILE, '')
    const thankyou = buildEmailPrompt('thankyou', SCHOOL, HC, PROFILE, '')
    const showcase = buildEmailPrompt('showcase', SCHOOL, HC, PROFILE, '')
    expect(first).not.toBe(followup)
    expect(followup).not.toBe(thankyou)
    expect(thankyou).not.toBe(showcase)
  })
})

describe('parseEmailResult', () => {
  test('extracts subject and body from well-formed response', () => {
    const text = 'SUBJECT: RHP — Jake Smith, Class of 2026 — FSU\nBODY:\nCoach Jarrett,\n\nI play at Plant HS.'
    const { subject, body } = parseEmailResult(text, PROFILE, SCHOOL)
    expect(subject).toBe('RHP — Jake Smith, Class of 2026 — FSU')
    expect(body).toContain('Coach Jarrett')
  })
  test('falls back to generated subject when SUBJECT line missing', () => {
    const text = 'BODY:\nCoach Jarrett,\n\nSome email.'
    const { subject } = parseEmailResult(text, PROFILE, SCHOOL)
    expect(subject).toBeTruthy()
    expect(subject.length).toBeGreaterThan(5)
  })
  test('returns full text as body when BODY marker missing', () => {
    const text = 'SUBJECT: My Subject\nCoach Jarrett,\n\nSome email.'
    const { body } = parseEmailResult(text, PROFILE, SCHOOL)
    expect(body).toContain('Coach Jarrett')
  })
  test('trims whitespace from subject and body', () => {
    const text = 'SUBJECT:  My Subject  \nBODY:\n  Coach Jarrett,\n\nEmail.  '
    const { subject, body } = parseEmailResult(text, PROFILE, SCHOOL)
    expect(subject).toBe('My Subject')
    expect(body).toBe('Coach Jarrett,\n\nEmail.')
  })
})

describe('capEmailHistory', () => {
  const makeEmails = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: `id-${i}`,
      created_at: new Date(i * 1000).toISOString()
    }))

  test('returns all emails when under cap', () => {
    expect(capEmailHistory(makeEmails(50), 100).length).toBe(50)
  })
  test('caps at limit, keeping most recent', () => {
    const emails = makeEmails(105)
    const capped = capEmailHistory(emails, 100)
    expect(capped.length).toBe(100)
    // most recent has highest index, so id-104 should be present
    expect(capped.some(e => e.id === 'id-104')).toBe(true)
    // oldest id-0 through id-4 should be gone
    expect(capped.some(e => e.id === 'id-0')).toBe(false)
  })
  test('returns empty array for empty input', () => {
    expect(capEmailHistory([], 100)).toEqual([])
  })
})
```

- [ ] **Step 3: Run — verify failure**

```bash
npm test
```

Expected: emails tests FAIL.

- [ ] **Step 4: Implement js/emails.js (copy buildEmailPrompt from existing app.html, update parseEmailResult and add capEmailHistory)**

Replace the stubs with full implementations. Copy `buildEmailPrompt` and `parseEmailResult` logic from `app.html` — search for the function name `buildEmailPrompt` (not by line number, as app.html will be modified later). Then add:

```js
export function parseEmailResult(text, profile = {}, school = {}) {
  const subjectMatch = text.match(/SUBJECT:\s*(.+)/i)
  const bodyMatch = text.match(/BODY:\s*([\s\S]+)/i)
  const subject = subjectMatch
    ? subjectMatch[1].trim()
    : `${profile.pos || 'Baseball Player'} — ${profile.name || 'Player'}, Class of ${profile.year || ''} — ${school.name || 'Recruiting Interest'}`
  const body = bodyMatch
    ? bodyMatch[1].trim()
    : text.replace(/^SUBJECT:.*\n?/i, '').trim()
  return { subject, body }
}

export function capEmailHistory(emails, cap = 100) {
  if (emails.length <= cap) return emails
  // Sort newest first (by created_at), keep top `cap`
  return [...emails]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, cap)
}
```

- [ ] **Step 5: Run — verify pass**

```bash
npm test
```

Expected: All emails tests PASS.

- [ ] **Step 6: Commit**

```bash
git add js/emails.js tests/unit/emails.test.js
git commit -m "feat: js/emails.js — email builder, parser, history cap (TDD)"
```

---

## Task 7: js/auth.js + Unit Tests

**Files:**
- Create: `js/auth.js`
- Create: `tests/unit/auth.test.js`

- [ ] **Step 1: Create stub js/auth.js**

```js
// js/auth.js
// Pure business logic at top (testable without Supabase).
// Async functions below require a Supabase client injected as first arg.

export function getAccessStatus(subscription) {
  throw new Error('not implemented')
}

// Browser-only: redirect helpers (not tested with Vitest, tested with Playwright)
export async function requireAuth(supabase) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) { window.location.href = '/auth.html'; return null }
  return session
}

export async function requireSubscription(supabase, userId) {
  const { data } = await supabase
    .from('subscriptions')
    .select('status, grace_until')
    .eq('user_id', userId)
    .maybeSingle()
  return getAccessStatus(data)
}
```

- [ ] **Step 2: Write tests/unit/auth.test.js**

```js
import { describe, test, expect } from 'vitest'
import { getAccessStatus } from '../../js/auth.js'

const future = new Date(Date.now() + 86400 * 1000).toISOString()
const past = new Date(Date.now() - 86400 * 1000).toISOString()

describe('getAccessStatus', () => {
  test('returns blocked when subscription is null', () => {
    expect(getAccessStatus(null)).toBe('blocked')
  })
  test('returns blocked when subscription is undefined', () => {
    expect(getAccessStatus(undefined)).toBe('blocked')
  })
  test('returns active when status is active', () => {
    expect(getAccessStatus({ status: 'active', grace_until: future })).toBe('active')
  })
  test('returns active even if grace_until is past (status is authoritative when active)', () => {
    expect(getAccessStatus({ status: 'active', grace_until: past })).toBe('active')
  })
  test('returns grace when status is past_due but grace_until is future', () => {
    expect(getAccessStatus({ status: 'past_due', grace_until: future })).toBe('grace')
  })
  test('returns blocked when status is past_due and grace_until is past', () => {
    expect(getAccessStatus({ status: 'past_due', grace_until: past })).toBe('blocked')
  })
  test('returns grace when status is canceled but grace_until is future', () => {
    expect(getAccessStatus({ status: 'canceled', grace_until: future })).toBe('grace')
  })
  test('returns blocked when status is canceled and grace_until is past', () => {
    expect(getAccessStatus({ status: 'canceled', grace_until: past })).toBe('blocked')
  })
  test('returns blocked when grace_until is missing', () => {
    expect(getAccessStatus({ status: 'past_due', grace_until: null })).toBe('blocked')
  })
})
```

- [ ] **Step 3: Run — verify failure**

```bash
npm test
```

Expected: auth tests FAIL.

- [ ] **Step 4: Implement getAccessStatus**

```js
export function getAccessStatus(subscription) {
  if (!subscription) return 'blocked'
  if (subscription.status === 'active') return 'active'
  if (!subscription.grace_until) return 'blocked'
  if (new Date(subscription.grace_until) > new Date()) return 'grace'
  return 'blocked'
}
```

- [ ] **Step 5: Run — verify pass**

```bash
npm test
```

- [ ] **Step 6: Commit**

```bash
git add js/auth.js tests/unit/auth.test.js
git commit -m "feat: js/auth.js — getAccessStatus with grace period (TDD)"
```

---

## Task 8: js/db.js + Integration Tests

**Files:**
- Create: `js/db.js`
- Create: `tests/integration/db.test.js`

> **Prerequisite:** Local Supabase running (`supabase start`). `.env` has `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` pointing at local instance.

- [ ] **Step 1: Create js/db.js**

```js
// js/db.js
// Supabase data layer. Import createClient from CDN in browser, from npm in tests.

export async function getProfile(supabase, userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function upsertProfile(supabase, userId, profile) {
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...profile, updated_at: new Date().toISOString() })
  if (error) throw error
}

export async function getEmails(supabase, userId) {
  const { data, error } = await supabase
    .from('emails')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data || []
}

export async function insertEmail(supabase, userId, email) {
  const { error } = await supabase
    .from('emails')
    .insert({ user_id: userId, ...email })
  if (error) throw error
  // Prune to 100 after insert
  await pruneEmails(supabase, userId, 100)
}

export async function pruneEmails(supabase, userId, cap = 100) {
  // Delete oldest emails beyond cap
  const { data } = await supabase
    .from('emails')
    .select('id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (!data || data.length <= cap) return
  const toDelete = data.slice(cap).map(e => e.id)
  await supabase.from('emails').delete().in('id', toDelete)
}

export async function getSubscription(supabase, userId) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('status, grace_until, current_period_end')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}
```

- [ ] **Step 2: Write tests/integration/db.test.js**

```js
import { describe, test, expect, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { getProfile, upsertProfile, getEmails, insertEmail, pruneEmails } from '../../js/db.js'

// Use local Supabase service role for test setup (bypasses RLS)
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.SUPABASE_ANON_KEY

// Two test user IDs — must exist in auth.users or be seeded
// For integration tests, use the Supabase admin API to create users
const TEST_USER_A = '00000000-0000-0000-0000-000000000001'
const TEST_USER_B = '00000000-0000-0000-0000-000000000002'

async function seedTestUsers(admin) {
  for (const id of [TEST_USER_A, TEST_USER_B]) {
    await admin.auth.admin.createUser({
      user_id: id,
      email: `test-${id}@test.com`,
      password: 'password123',
      email_confirm: true,
    }).catch(() => {}) // ignore if already exists
  }
}

async function getAuthenticatedClient(userId) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data } = await admin.auth.admin.getUserById(userId)
  // Sign in to get a session token
  const anonClient = createClient(SUPABASE_URL, ANON_KEY)
  const { data: signIn } = await anonClient.auth.signInWithPassword({
    email: `test-${userId}@test.com`,
    password: 'password123',
  })
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } }
  })
}

let adminClient, clientA, clientB

beforeEach(async () => {
  adminClient = createClient(SUPABASE_URL, SERVICE_KEY)
  await seedTestUsers(adminClient)
  // Clean up test data
  await adminClient.from('profiles').delete().in('id', [TEST_USER_A, TEST_USER_B])
  await adminClient.from('emails').delete().in('user_id', [TEST_USER_A, TEST_USER_B])
  clientA = await getAuthenticatedClient(TEST_USER_A)
  clientB = await getAuthenticatedClient(TEST_USER_B)
})

describe('profile', () => {
  test('upserts and retrieves profile', async () => {
    await upsertProfile(clientA, TEST_USER_A, { name: 'Jake Smith', pos: 'RHP' })
    const profile = await getProfile(clientA, TEST_USER_A)
    expect(profile.name).toBe('Jake Smith')
    expect(profile.pos).toBe('RHP')
  })

  test('updates existing profile on second upsert', async () => {
    await upsertProfile(clientA, TEST_USER_A, { name: 'Jake Smith' })
    await upsertProfile(clientA, TEST_USER_A, { name: 'Jake Updated' })
    const profile = await getProfile(clientA, TEST_USER_A)
    expect(profile.name).toBe('Jake Updated')
  })

  test('RLS: user A cannot read user B profile', async () => {
    await upsertProfile(clientA, TEST_USER_A, { name: 'Jake Smith' })
    // clientB tries to read TEST_USER_A's profile
    const profile = await getProfile(clientB, TEST_USER_A)
    expect(profile).toBeNull()
  })
})

describe('emails', () => {
  const EMAIL = {
    school_id: 'fsu', school_name: 'Florida State',
    type: 'first', subject: 'Test Subject', body: 'Test Body'
  }

  test('inserts and retrieves email', async () => {
    await insertEmail(clientA, TEST_USER_A, EMAIL)
    const emails = await getEmails(clientA, TEST_USER_A)
    expect(emails.length).toBe(1)
    expect(emails[0].school_id).toBe('fsu')
  })

  test('RLS: user A cannot read user B emails', async () => {
    await insertEmail(clientA, TEST_USER_A, EMAIL)
    const emails = await getEmails(clientB, TEST_USER_A)
    expect(emails.length).toBe(0)
  })

  test('pruneEmails keeps only 100 most recent', async () => {
    // Insert 105 emails via admin (bypass RLS for speed)
    const batch = Array.from({ length: 105 }, (_, i) => ({
      user_id: TEST_USER_A,
      school_id: `school-${i}`,
      school_name: `School ${i}`,
      type: 'first',
      subject: `Sub ${i}`,
      body: `Body ${i}`,
      created_at: new Date(Date.now() + i * 1000).toISOString()
    }))
    await adminClient.from('emails').insert(batch)
    await pruneEmails(clientA, TEST_USER_A, 100)
    const emails = await getEmails(clientA, TEST_USER_A)
    expect(emails.length).toBe(100)
  })
})
```

- [ ] **Step 3: Run integration tests — verify they fail**

```bash
npm run test:integration
```

Expected: Tests fail (db.js exists but functions throw or Supabase not connected).

- [ ] **Step 4: Verify local Supabase is running**

```bash
npx supabase status
```

Expected: Shows `API URL: http://127.0.0.1:54321` and keys. Copy these into `.env`.

- [ ] **Step 5: Run integration tests — verify they pass**

```bash
npm run test:integration
```

Expected: All db tests PASS.

- [ ] **Step 6: Commit**

```bash
git add js/db.js tests/integration/db.test.js
git commit -m "feat: js/db.js — Supabase profile/email CRUD with RLS (TDD)"
```

---

## Task 9: Netlify Functions — create-checkout.js

**Files:**
- Create: `netlify/functions/create-checkout.js`
- Create: `tests/integration/stripe-checkout.test.js`

- [ ] **Step 1: Write test first**

```js
// tests/integration/stripe-checkout.test.js
import { describe, test, expect } from 'vitest'

// We test the handler by calling it directly (not via HTTP)
// Dynamic import so we can set env vars before import
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const ANON_KEY = process.env.SUPABASE_ANON_KEY

describe('create-checkout handler', () => {
  test('returns 405 for non-POST requests', async () => {
    const { handler } = await import('../../netlify/functions/create-checkout.js')
    const result = await handler({ httpMethod: 'GET', headers: {} })
    expect(result.statusCode).toBe(405)
  })

  test('returns 401 when no auth token provided', async () => {
    const { handler } = await import('../../netlify/functions/create-checkout.js')
    const result = await handler({
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({})
    })
    expect(result.statusCode).toBe(401)
  })
})
```

- [ ] **Step 2: Run — verify failure**

```bash
npm run test:integration -- stripe-checkout
```

Expected: FAIL (module not found).

- [ ] **Step 3: Create netlify/functions/create-checkout.js**

```js
// netlify/functions/create-checkout.js
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.APP_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  // Verify auth
  const token = (event.headers.authorization || event.headers.Authorization || '').replace('Bearer ', '')
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

    // Find or create Stripe customer with user_id in metadata
    const existing = await stripe.customers.list({ email: user.email, limit: 1 })
    let customer
    if (existing.data.length > 0) {
      customer = existing.data[0]
      await stripe.customers.update(customer.id, { metadata: { user_id: user.id } })
    } else {
      customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      })
    }

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      subscription_data: { metadata: { user_id: user.id } },
      success_url: `${process.env.APP_ORIGIN}/app.html?checkout=success`,
      cancel_url: `${process.env.APP_ORIGIN}/app.html`,
    })

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    }
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    }
  }
}
```

- [ ] **Step 4: Run — verify tests pass**

```bash
npm run test:integration -- stripe-checkout
```

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/create-checkout.js tests/integration/stripe-checkout.test.js
git commit -m "feat: create-checkout.js — Stripe checkout with auth guard (TDD)"
```

---

## Task 10: Netlify Functions — stripe-webhook.js

**Files:**
- Create: `netlify/functions/stripe-webhook.js`
- Create: `tests/integration/stripe-webhook.test.js`

- [ ] **Step 1: Write tests/integration/stripe-webhook.test.js**

```js
import { describe, test, expect, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001'

describe('stripe-webhook handler', () => {
  test('returns 400 for invalid signature', async () => {
    const { handler } = await import('../../netlify/functions/stripe-webhook.js')
    const result = await handler({
      httpMethod: 'POST',
      headers: { 'stripe-signature': 'bad_sig' },
      body: JSON.stringify({ type: 'checkout.session.completed' }),
    })
    expect(result.statusCode).toBe(400)
  })

  test('upsertSubscription writes correct data to Supabase', async () => {
    // Test the internal upsertSubscription function directly
    const { upsertSubscription } = await import('../../netlify/functions/stripe-webhook.js')
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    // Clean up
    await admin.from('subscriptions').delete().eq('user_id', TEST_USER_ID)

    await upsertSubscription(admin, TEST_USER_ID, {
      id: 'sub_test123',
      status: 'active',
      current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
    }, 'cus_test123')

    const { data } = await admin.from('subscriptions').select('*').eq('user_id', TEST_USER_ID).single()
    expect(data.status).toBe('active')
    expect(data.stripe_subscription_id).toBe('sub_test123')
    expect(new Date(data.grace_until) > new Date(data.current_period_end)).toBe(true)
  })

  test('upsertSubscription is idempotent — duplicate call does not create duplicate row', async () => {
    const { upsertSubscription } = await import('../../netlify/functions/stripe-webhook.js')
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    await admin.from('subscriptions').delete().eq('user_id', TEST_USER_ID)

    const sub = { id: 'sub_idem', status: 'active', current_period_end: Math.floor(Date.now() / 1000) + 86400 }
    await upsertSubscription(admin, TEST_USER_ID, sub, 'cus_idem')
    await upsertSubscription(admin, TEST_USER_ID, sub, 'cus_idem') // duplicate

    const { data } = await admin.from('subscriptions').select('*').eq('user_id', TEST_USER_ID)
    expect(data.length).toBe(1)
  })
})
```

- [ ] **Step 2: Run — verify failure**

```bash
npm run test:integration -- stripe-webhook
```

- [ ] **Step 3: Create netlify/functions/stripe-webhook.js**

```js
// netlify/functions/stripe-webhook.js
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

// Exported for direct testing
export async function upsertSubscription(supabase, userId, sub, customerId) {
  const periodEnd = new Date(sub.current_period_end * 1000)
  const graceUntil = new Date(periodEnd.getTime() + 3 * 86400 * 1000)
  const { error } = await supabase.from('subscriptions').upsert({
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    status: sub.status,
    current_period_end: periodEnd.toISOString(),
    grace_until: graceUntil.toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) throw error
}

async function getUserIdFromCustomer(customerId) {
  const customer = await stripe.customers.retrieve(customerId)
  return customer.metadata?.user_id
}

export const handler = async (event) => {
  const sig = event.headers['stripe-signature']
  let stripeEvent
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body, sig, process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    return { statusCode: 400, body: `Webhook Error: ${err.message}` }
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object
        const userId = session.metadata?.user_id
        if (!userId) break
        const sub = await stripe.subscriptions.retrieve(session.subscription)
        await upsertSubscription(supabase, userId, sub, session.customer)
        break
      }
      case 'customer.subscription.updated':
      case 'invoice.payment_succeeded': {
        const obj = stripeEvent.data.object
        const subId = obj.subscription || obj.id
        const sub = await stripe.subscriptions.retrieve(subId)
        const userId = sub.metadata?.user_id || await getUserIdFromCustomer(sub.customer)
        if (userId) await upsertSubscription(supabase, userId, sub, sub.customer)
        break
      }
      case 'customer.subscription.deleted': {
        const sub = stripeEvent.data.object
        const userId = sub.metadata?.user_id || await getUserIdFromCustomer(sub.customer)
        if (!userId) break
        const periodEnd = new Date(sub.current_period_end * 1000)
        const graceUntil = new Date(periodEnd.getTime() + 3 * 86400 * 1000)
        await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_customer_id: sub.customer,
          stripe_subscription_id: sub.id,
          status: 'canceled',
          current_period_end: periodEnd.toISOString(),
          grace_until: graceUntil.toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        break
      }
      case 'invoice.payment_failed': {
        const invoice = stripeEvent.data.object
        const sub = await stripe.subscriptions.retrieve(invoice.subscription)
        const userId = sub.metadata?.user_id || await getUserIdFromCustomer(sub.customer)
        if (!userId) break
        const periodEnd = new Date(sub.current_period_end * 1000)
        const graceUntil = new Date(periodEnd.getTime() + 3 * 86400 * 1000)
        await supabase.from('subscriptions').upsert({
          user_id: userId,
          stripe_customer_id: sub.customer,
          stripe_subscription_id: sub.id,
          status: 'past_due',
          current_period_end: periodEnd.toISOString(),
          grace_until: graceUntil.toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        break
      }
    }
  } catch (err) {
    console.error('Webhook processing error:', err)
    return { statusCode: 500, body: 'Internal error' }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) }
}
```

- [ ] **Step 4: Run — verify tests pass**

```bash
npm run test:integration -- stripe-webhook
```

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/stripe-webhook.js tests/integration/stripe-webhook.test.js
git commit -m "feat: stripe-webhook.js — subscription lifecycle with signature verification (TDD)"
```

---

## Task 11: Netlify Functions — customer-portal.js

**Files:**
- Create: `netlify/functions/customer-portal.js`

No unit tests — it's a thin pass-through to Stripe. Tested via e2e.

- [ ] **Step 1: Create netlify/functions/customer-portal.js**

```js
// netlify/functions/customer-portal.js
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.APP_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const token = (event.headers.authorization || event.headers.Authorization || '').replace('Bearer ', '')
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }

  // Get stripe_customer_id from subscriptions table
  const serviceClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: sub } = await serviceClient
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!sub?.stripe_customer_id) {
    return { statusCode: 404, body: JSON.stringify({ error: 'No subscription found' }) }
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${process.env.APP_ORIGIN}/app.html`,
    })
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add netlify/functions/customer-portal.js
git commit -m "feat: customer-portal.js — Stripe billing portal endpoint"
```

---

## Task 12: Harden ai-proxy.js

**Files:**
- Modify: `netlify/functions/ai-proxy.js`

- [ ] **Step 1: Rewrite netlify/functions/ai-proxy.js**

```js
// netlify/functions/ai-proxy.js
import { createClient } from '@supabase/supabase-js'

const DAILY_LIMIT = 50
const APP_ORIGIN = process.env.APP_ORIGIN || 'http://localhost:8888'

const corsHeaders = {
  'Access-Control-Allow-Origin': APP_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  // Auth check
  const token = (event.headers.authorization || event.headers.Authorization || '').replace('Bearer ', '')
  if (!token) return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) }

  const anonClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
  if (authError || !user) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  // Subscription check
  const serviceClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: sub } = await serviceClient
    .from('subscriptions')
    .select('status, grace_until')
    .eq('user_id', user.id)
    .maybeSingle()

  const { getAccessStatus } = await import('../../js/auth.js')
  const access = getAccessStatus(sub)
  if (access === 'blocked') {
    return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'No active subscription' }) }
  }

  // Rate limiting: 50 AI calls per user per day
  const today = new Date().toISOString().split('T')[0]
  const { data: usage } = await serviceClient
    .from('ai_usage')
    .select('count')
    .eq('user_id', user.id)
    .eq('date', today)
    .maybeSingle()

  if (usage && usage.count >= DAILY_LIMIT) {
    return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ error: 'Daily limit reached' }) }
  }

  // Increment usage count
  await serviceClient.from('ai_usage').upsert(
    { user_id: user.id, date: today, count: (usage?.count || 0) + 1 },
    { onConflict: 'user_id,date' }
  )

  // Call Anthropic
  let body
  try {
    body = JSON.parse(event.body)
  } catch {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid request body' }) }
  }

  const messages = body.messages || [{ role: 'user', content: body.prompt || '' }]
  const requestBody = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: body.max_tokens || 700,
    messages,
  }
  if (body.system) requestBody.system = body.system

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    })
    const data = await response.json()
    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add netlify/functions/ai-proxy.js
git commit -m "fix: ai-proxy — add auth check, subscription gate, rate limiting, CORS restriction"
```

---

## Task 13: auth.html

**Files:**
- Create: `auth.html`

- [ ] **Step 1: Create auth.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>RecruitPro — Sign In</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--navy:#0a1628;--gold:#e8a020;--white:#fff;--off:#f8f9fc;--border:#e2e8f0;--text3:#64748b;--red:#ef4444;--green:#22c55e;--r:12px}
html,body{height:100%;background:var(--navy);font-family:'Inter',sans-serif}
.page{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 16px}
.logo{font-family:'Barlow Condensed',sans-serif;font-size:32px;font-weight:900;color:var(--white);letter-spacing:.04em;margin-bottom:8px}
.logo em{color:var(--gold);font-style:normal}
.tagline{font-size:14px;color:rgba(255,255,255,.5);margin-bottom:32px;text-align:center}
.card{background:var(--white);border-radius:var(--r);padding:28px 24px;width:100%;max-width:400px}
.card-title{font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:900;color:var(--navy);margin-bottom:4px}
.card-sub{font-size:13px;color:var(--text3);margin-bottom:20px}
.form-group{margin-bottom:14px}
.form-label{display:block;font-size:12px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px}
.form-input{width:100%;border:1.5px solid var(--border);border-radius:8px;padding:11px 12px;font-size:16px;color:var(--navy);outline:none;font-family:'Inter',sans-serif;transition:border-color .15s}
.form-input:focus{border-color:var(--navy)}
.btn{width:100%;height:48px;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;border:none;transition:opacity .15s;margin-top:4px;font-family:'Inter',sans-serif}
.btn-gold{background:var(--gold);color:var(--navy)}
.btn-ghost{background:transparent;border:1.5px solid var(--border);color:var(--navy);margin-top:8px}
.btn:disabled{opacity:.5;cursor:not-allowed}
.toggle-link{text-align:center;margin-top:16px;font-size:13px;color:var(--text3)}
.toggle-link a{color:var(--navy);font-weight:600;cursor:pointer;text-decoration:underline}
.alert{padding:10px 12px;border-radius:8px;font-size:13px;font-weight:500;margin-bottom:14px;display:none}
.alert-error{background:#fef2f2;color:var(--red);border:1px solid #fecaca}
.alert-success{background:#f0fdf4;color:#166534;border:1px solid #bbf7d0}
.spinner{width:16px;height:16px;border:2px solid rgba(10,22,40,.3);border-top-color:var(--navy);border-radius:50%;animation:spin .6s linear infinite;display:inline-block;vertical-align:middle;margin-right:6px}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="page">
  <div class="logo">RECRUIT<em>PRO</em></div>
  <div class="tagline">Find coaches. Write emails. Get recruited.</div>

  <div class="card">
    <!-- ALERT -->
    <div class="alert alert-error" id="alert-error"></div>
    <div class="alert alert-success" id="alert-success"></div>

    <!-- SIGN UP PANEL -->
    <div id="panel-signup">
      <div class="card-title">Create Account</div>
      <div class="card-sub">Start your baseball recruiting journey.</div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" type="email" id="signup-email" placeholder="jake@email.com" autocomplete="email">
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input class="form-input" type="password" id="signup-password" placeholder="8+ characters" autocomplete="new-password">
      </div>
      <button class="btn btn-gold" id="signup-btn" onclick="handleSignUp()">Create Account</button>
      <div class="toggle-link">Already have an account? <a onclick="showPanel('login')">Log in</a></div>
    </div>

    <!-- LOGIN PANEL -->
    <div id="panel-login" style="display:none">
      <div class="card-title">Welcome Back</div>
      <div class="card-sub">Log in to your RecruitPro account.</div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" type="email" id="login-email" placeholder="jake@email.com" autocomplete="email">
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <input class="form-input" type="password" id="login-password" placeholder="Password" autocomplete="current-password">
      </div>
      <button class="btn btn-gold" id="login-btn" onclick="handleLogin()">Log In</button>
      <button class="btn btn-ghost" onclick="showPanel('reset')">Forgot password?</button>
      <div class="toggle-link">New here? <a onclick="showPanel('signup')">Create account</a></div>
    </div>

    <!-- RESET PANEL -->
    <div id="panel-reset" style="display:none">
      <div class="card-title">Reset Password</div>
      <div class="card-sub">We'll email you a reset link.</div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" type="email" id="reset-email" placeholder="jake@email.com" autocomplete="email">
      </div>
      <button class="btn btn-gold" id="reset-btn" onclick="handleReset()">Send Reset Link</button>
      <div class="toggle-link"><a onclick="showPanel('login')">← Back to login</a></div>
    </div>

    <!-- NEW PASSWORD PANEL (after clicking reset link) -->
    <div id="panel-newpassword" style="display:none">
      <div class="card-title">Set New Password</div>
      <div class="card-sub">Choose a new password for your account.</div>
      <div class="form-group">
        <label class="form-label">New Password</label>
        <input class="form-input" type="password" id="new-password" placeholder="8+ characters" autocomplete="new-password">
      </div>
      <button class="btn btn-gold" id="newpw-btn" onclick="handleNewPassword()">Update Password</button>
    </div>

  </div>
</div>

<script type="module">
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = '__SUPABASE_URL__'  // replaced by netlify-cli env injection or build step
const SUPABASE_ANON_KEY = '__SUPABASE_ANON_KEY__'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── Panel switching ──────────────────────────────────────
window.showPanel = (name) => {
  ['signup','login','reset','newpassword'].forEach(p => {
    document.getElementById('panel-' + p).style.display = p === name ? 'block' : 'none'
  })
  clearAlerts()
}

function showError(msg) {
  const el = document.getElementById('alert-error')
  el.textContent = msg; el.style.display = 'block'
  document.getElementById('alert-success').style.display = 'none'
}
function showSuccess(msg) {
  const el = document.getElementById('alert-success')
  el.textContent = msg; el.style.display = 'block'
  document.getElementById('alert-error').style.display = 'none'
}
function clearAlerts() {
  document.getElementById('alert-error').style.display = 'none'
  document.getElementById('alert-success').style.display = 'none'
}
function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId)
  btn.disabled = loading
  btn.innerHTML = loading ? '<span class="spinner"></span> Please wait…' : btn.dataset.label
}

// Store original button labels
document.querySelectorAll('.btn').forEach(b => b.dataset.label = b.textContent)

// ── Sign Up ──────────────────────────────────────────────
window.handleSignUp = async () => {
  const email = document.getElementById('signup-email').value.trim()
  const password = document.getElementById('signup-password').value
  if (!email || !password) return showError('Please fill in all fields')
  if (password.length < 8) return showError('Password must be at least 8 characters')
  setLoading('signup-btn', true)
  const { error } = await supabase.auth.signUp({
    email, password,
    options: { emailRedirectTo: window.location.origin + '/auth.html' }
  })
  setLoading('signup-btn', false)
  if (error) return showError(error.message)
  showSuccess('Check your email to confirm your account, then log in below.')
  showPanel('login')
}

// ── Log In ───────────────────────────────────────────────
window.handleLogin = async () => {
  const email = document.getElementById('login-email').value.trim()
  const password = document.getElementById('login-password').value
  if (!email || !password) return showError('Please fill in all fields')
  setLoading('login-btn', true)
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  setLoading('login-btn', false)
  if (error) return showError(error.message)
  window.location.href = '/app.html'
}

// ── Reset Password ───────────────────────────────────────
window.handleReset = async () => {
  const email = document.getElementById('reset-email').value.trim()
  if (!email) return showError('Enter your email address')
  setLoading('reset-btn', true)
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/auth.html'
  })
  setLoading('reset-btn', false)
  if (error) return showError(error.message)
  showSuccess('Reset link sent. Check your email.')
}

// ── New Password ─────────────────────────────────────────
window.handleNewPassword = async () => {
  const password = document.getElementById('new-password').value
  if (password.length < 8) return showError('Password must be at least 8 characters')
  setLoading('newpw-btn', true)
  const { error } = await supabase.auth.updateUser({ password })
  setLoading('newpw-btn', false)
  if (error) return showError(error.message)
  showSuccess('Password updated! Redirecting…')
  setTimeout(() => window.location.href = '/app.html', 1500)
}

// ── On Load: handle auth state ───────────────────────────
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    showPanel('newpassword')
    return
  }
  if (event === 'SIGNED_IN' && session) {
    // Already logged in — check for ?confirmed param
    const params = new URLSearchParams(window.location.search)
    if (params.get('confirmed')) {
      showSuccess('Email confirmed! You can now log in.')
      showPanel('login')
      return
    }
    // Otherwise redirect to app
    window.location.href = '/app.html'
    return
  }
})

// Check initial state
const { data: { session } } = await supabase.auth.getSession()
if (session) {
  window.location.href = '/app.html'
}

// Show login panel if ?login param in URL
const params = new URLSearchParams(window.location.search)
if (params.get('login')) showPanel('login')
</script>
</body>
</html>
```

> **Note on SUPABASE_URL / SUPABASE_ANON_KEY:** These are public keys safe to expose in the browser. For local dev, replace `__SUPABASE_URL__` and `__SUPABASE_ANON_KEY__` with your actual values. In production, use a Netlify edge function or a build step to inject them, or use a `config.js` file loaded before auth.html that sets `window.SUPABASE_URL` etc.

> **Simpler approach for now:** Create `js/config.js` with the public keys hardcoded (these are not secrets), and import it. Replace the placeholders with actual values.

- [ ] **Step 2: Create js/config.js with public Supabase keys**

```js
// js/config.js — public keys, safe to commit (not secrets)
// These are the anon/public keys only. Service role key is NEVER here.
export const SUPABASE_URL = 'https://your-project.supabase.co' // replace
export const SUPABASE_ANON_KEY = 'eyJ...' // replace with your anon key
```

- [ ] **Step 3: Update auth.html to import from js/config.js**

Replace the placeholder lines in the `<script type="module">` block:
```js
// Replace:
const SUPABASE_URL = '__SUPABASE_URL__'
const SUPABASE_ANON_KEY = '__SUPABASE_ANON_KEY__'

// With:
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '/js/config.js'
```

- [ ] **Step 4: Commit**

```bash
git add auth.html js/config.js
git commit -m "feat: auth.html — sign up, login, password reset with Supabase"
```

---

## Task 14: Refactor app.html

**Files:**
- Modify: `app.html`

The goal is to: (1) add auth + subscription gate at the top of the `<script>`, (2) import pure functions from `js/*.js` modules, (3) replace localStorage calls with Supabase calls via `js/db.js`, (4) add paywall UI, (5) add "Manage Billing" and "Log Out" to profile modal.

- [ ] **Step 1: Add Supabase CDN and module imports to app.html `<script type="module">`**

Change `<script>` to `<script type="module">` and add at the top:

```js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '/js/config.js'
import { calcReadiness, getNextStep, validateProfile } from '/js/profile.js'
import { getFilteredCoaches, getApMatches, getUniqueStates } from '/js/coaches.js'
import { buildEmailPrompt, parseEmailResult, capEmailHistory, EMAIL_SYSTEM_PROMPT } from '/js/emails.js'
import { getAccessStatus } from '/js/auth.js'
import { getProfile, upsertProfile, getEmails, insertEmail, getSubscription } from '/js/db.js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
```

- [ ] **Step 2: Add auth gate at DOMContentLoaded**

Replace existing `DOMContentLoaded` handler with:

```js
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Auth gate
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) { window.location.href = '/auth.html'; return }

  currentUser = session.user

  // 2. Subscription gate
  const sub = await getSubscription(supabase, currentUser.id)
  const access = getAccessStatus(sub)

  if (access === 'blocked') {
    showPaywall()
    return
  }
  if (access === 'grace') {
    showGraceBanner()
  }

  // 3. Load data from Supabase
  profile = await getProfile(supabase, currentUser.id) || {}
  emailHistory = await getEmails(supabase, currentUser.id)

  // 4. Init UI
  updateHomeUI()
  renderRecentEmails()
  renderApStatePills()
})
```

- [ ] **Step 3: Add paywall HTML to app.html (before `</div><!-- #app -->`)**

```html
<!-- ── PAYWALL ──────────────────────────────────────────── -->
<div id="paywall" style="display:none;position:fixed;inset:0;background:var(--navy);z-index:1000;display:none;flex-direction:column;align-items:center;justify-content:center;padding:32px 24px;text-align:center">
  <div style="font-family:'Barlow Condensed',sans-serif;font-size:36px;font-weight:900;color:var(--white);margin-bottom:8px">RECRUIT<span style="color:var(--gold)">PRO</span></div>
  <div style="font-size:16px;color:rgba(255,255,255,.7);margin-bottom:32px;max-width:320px;line-height:1.5">Find coaches, write real emails, get recruited.</div>
  <div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:28px 24px;max-width:360px;width:100%;margin-bottom:24px">
    <div style="font-size:42px;font-weight:900;font-family:'Barlow Condensed',sans-serif;color:var(--gold)">$20<span style="font-size:18px;color:rgba(255,255,255,.5)">/mo</span></div>
    <div style="font-size:13px;color:rgba(255,255,255,.5);margin-bottom:20px">Cancel anytime</div>
    <ul style="list-style:none;text-align:left;font-size:14px;color:rgba(255,255,255,.85);line-height:2.2;margin-bottom:24px">
      <li>✅ 373+ college baseball programs</li>
      <li>✅ Verified coach emails & contacts</li>
      <li>✅ AI email writer (4 types)</li>
      <li>✅ Autopilot batch campaigns</li>
      <li>✅ Gmail compose integration</li>
      <li>✅ Cloud sync across devices</li>
    </ul>
    <button class="btn btn-gold btn-full" id="subscribe-btn" onclick="startCheckout()">Subscribe — $20/mo</button>
  </div>
  <button class="btn btn-ghost" style="max-width:360px;width:100%;color:rgba(255,255,255,.5);border-color:rgba(255,255,255,.1)" onclick="handleLogOut()">Log out</button>
</div>

<!-- ── GRACE BANNER ─────────────────────────────────────── -->
<div id="grace-banner" style="display:none;background:#92400e;color:#fef3c7;padding:10px 16px;font-size:13px;font-weight:600;text-align:center;position:sticky;top:0;z-index:200">
  ⚠ Payment issue — update your billing to keep access. <a onclick="openBillingPortal()" style="color:#fef3c7;text-decoration:underline;cursor:pointer">Manage billing →</a>
</div>
```

- [ ] **Step 4: Add showPaywall, showGraceBanner, startCheckout, openBillingPortal, handleLogOut functions**

Add to the script block:

```js
let currentUser = null

function showPaywall() {
  document.getElementById('paywall').style.display = 'flex'
  document.getElementById('app').style.display = 'none'
}

function showGraceBanner() {
  document.getElementById('grace-banner').style.display = 'block'
}

async function startCheckout() {
  const btn = document.getElementById('subscribe-btn')
  btn.disabled = true; btn.textContent = 'Loading…'
  const { data: { session } } = await supabase.auth.getSession()
  const resp = await fetch('/.netlify/functions/create-checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({})
  })
  const data = await resp.json()
  if (data.url) window.location.href = data.url
  else { btn.disabled = false; btn.textContent = 'Subscribe — $20/mo'; toast('Error starting checkout') }
}

async function openBillingPortal() {
  const { data: { session } } = await supabase.auth.getSession()
  const resp = await fetch('/.netlify/functions/customer-portal', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${session.access_token}` }
  })
  const data = await resp.json()
  if (data.url) window.location.href = data.url
}

async function handleLogOut() {
  await supabase.auth.signOut()
  window.location.href = '/index.html'
}
```

- [ ] **Step 5: Replace saveProfile to use Supabase instead of localStorage**

```js
async function saveProfile() {
  const p = {
    name: document.getElementById('p-name').value.trim(),
    pos: document.getElementById('p-pos').value,
    year: document.getElementById('p-year').value.trim(),
    hometown: document.getElementById('p-hometown').value.trim(),
    high_school: document.getElementById('p-school').value.trim(),
    gpa: document.getElementById('p-gpa').value.trim(),
    sat_act: document.getElementById('p-sat').value.trim(),
    stats: document.getElementById('p-stats').value.trim(),
    film_url: document.getElementById('p-film').value.trim(),
    email: document.getElementById('p-email').value.trim(),
    target_divs: profileDivs,
  }
  const validation = validateProfile({ gpa: p.gpa, year: p.year, film: p.film_url })
  if (!validation.valid) {
    const firstError = Object.values(validation.errors)[0]
    toast('⚠ ' + firstError); return
  }
  await upsertProfile(supabase, currentUser.id, p)
  profile = p
  closeProfileModal()
  updateHomeUI()
  renderRecentEmails()
  toast('Profile saved ✓')
}
```

- [ ] **Step 6: Replace saveEmailToHistory to use Supabase**

```js
async function saveEmailToHistory(school, type, subject, body) {
  await insertEmail(supabase, currentUser.id, {
    school_id: school.id,
    school_name: school.name,
    type,
    subject,
    body,
  })
  emailHistory = await getEmails(supabase, currentUser.id)
}
```

- [ ] **Step 7: Add "Manage Billing" and "Log Out" buttons to profile modal**

In the profile modal's action area (after Save Profile button), add:

```html
<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
  <button class="btn btn-ghost btn-sm" onclick="openBillingPortal()">💳 Manage Billing</button>
  <button class="btn btn-ghost btn-sm" onclick="handleLogOut()">Log Out</button>
</div>
```

- [ ] **Step 8: Handle ?checkout=success on load**

In DOMContentLoaded, after showing the app:
```js
const urlParams = new URLSearchParams(window.location.search)
if (urlParams.get('checkout') === 'success') {
  toast('🎉 Welcome to RecruitPro Pro!')
  window.history.replaceState({}, '', '/app.html')
}
```

- [ ] **Step 9: Pass auth token to callAI**

```js
async function callAI(userPrompt) {
  const { data: { session } } = await supabase.auth.getSession()
  const resp = await fetch('/.netlify/functions/ai-proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({
      system: EMAIL_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: 700
    })
  })
  if (!resp.ok) throw new Error('AI proxy error: ' + resp.status)
  const data = await resp.json()
  if (data.content && Array.isArray(data.content)) return data.content[0]?.text || ''
  return data.text || data.completion || ''
}
```

- [ ] **Step 10: Remove localStorage references**

Search app.html for `localStorage` — remove all remaining `localStorage.setItem` / `localStorage.getItem` calls. Data now lives in Supabase via `js/db.js`. Export/import backup functions can still read from Supabase and write JSON.

- [ ] **Step 11: Local test — run netlify dev and verify**

```bash
netlify dev
```

Open http://localhost:8888. Verify:
- Visiting app.html redirects to auth.html
- Can sign up with a test email
- After login lands on app with paywall (no subscription yet)
- Subscribe button calls checkout function (use Stripe test mode)

- [ ] **Step 12: Commit**

```bash
git add app.html
git commit -m "feat: app.html — auth gate, paywall, Supabase data, billing portal"
```

---

## Task 15: Update index.html

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Update the "Get Started" CTA in index.html**

Find any button/link that points to Gumroad or the app directly. Update all CTAs:

```html
<!-- Change any gumroad.com links or direct app links to: -->
<a href="/auth.html" class="nav-cta">Get Started</a>
```

Search for: `gumroad`, `giewkh`, `upgrade`, `utm_source=recruitpro` — remove or replace with `/auth.html` links.

- [ ] **Step 2: Update meta description**

```html
<meta name="description" content="RecruitPro — The baseball recruiting app. Find coaches, write AI-powered emails, get recruited. $20/month.">
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "fix: update index.html CTAs to point to auth.html, remove Gumroad links"
```

---

## Task 16: E2E Tests — Auth Flows

**Files:**
- Create: `tests/e2e/auth.spec.js`

- [ ] **Step 1: Write tests/e2e/auth.spec.js**

```js
import { test, expect } from '@playwright/test'

const TEST_EMAIL = `test-${Date.now()}@example.com`
const TEST_PASSWORD = 'TestPassword123'

test.describe('Auth flows', () => {
  test('unauthenticated user visiting app.html is redirected to auth.html', async ({ page }) => {
    await page.goto('/app.html')
    await expect(page).toHaveURL(/auth\.html/)
  })

  test('auth.html shows sign up panel by default', async ({ page }) => {
    await page.goto('/auth.html')
    await expect(page.locator('#panel-signup')).toBeVisible()
    await expect(page.locator('#panel-login')).not.toBeVisible()
  })

  test('toggle to login panel works', async ({ page }) => {
    await page.goto('/auth.html')
    await page.click('text=Log in')
    await expect(page.locator('#panel-login')).toBeVisible()
    await expect(page.locator('#panel-signup')).not.toBeVisible()
  })

  test('sign up with short password shows error', async ({ page }) => {
    await page.goto('/auth.html')
    await page.fill('#signup-email', 'test@example.com')
    await page.fill('#signup-password', '123')
    await page.click('#signup-btn')
    await expect(page.locator('#alert-error')).toBeVisible()
  })

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto('/auth.html')
    await page.click('text=Log in')
    await page.fill('#login-email', 'nonexistent@example.com')
    await page.fill('#login-password', 'wrongpassword')
    await page.click('#login-btn')
    await expect(page.locator('#alert-error')).toBeVisible()
  })

  test('forgot password panel shows when clicked', async ({ page }) => {
    await page.goto('/auth.html')
    await page.click('text=Log in')
    await page.click('text=Forgot password?')
    await expect(page.locator('#panel-reset')).toBeVisible()
  })
})
```

- [ ] **Step 2: Run e2e tests (requires netlify dev running)**

```bash
# Terminal 1: start dev server
netlify dev

# Terminal 2: run tests
npm run test:e2e -- tests/e2e/auth.spec.js
```

Expected: All auth e2e tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/auth.spec.js
git commit -m "test: e2e auth flows — redirect, panels, validation (Playwright)"
```

---

## Task 17: E2E Tests — App Flows

**Files:**
- Create: `tests/e2e/app.spec.js`
- Create: `tests/e2e/helpers.js`

- [ ] **Step 1: Create tests/e2e/helpers.js (auth helper)**

```js
// tests/e2e/helpers.js
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// Create a test user with active subscription, return session token
export async function createSubscribedUser(email = `e2e-${Date.now()}@test.com`, password = 'TestPass123') {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  // Create user
  const { data: { user } } = await admin.auth.admin.createUser({
    email, password, email_confirm: true
  })

  // Insert active subscription
  const futureDate = new Date(Date.now() + 30 * 86400 * 1000).toISOString()
  await admin.from('subscriptions').upsert({
    user_id: user.id,
    status: 'active',
    current_period_end: futureDate,
    grace_until: futureDate,
  }, { onConflict: 'user_id' })

  return { email, password, userId: user.id }
}

export async function cleanupUser(userId) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  await admin.auth.admin.deleteUser(userId)
}
```

- [ ] **Step 2: Write tests/e2e/app.spec.js**

```js
import { test, expect } from '@playwright/test'
import { createSubscribedUser, cleanupUser } from './helpers.js'

test.describe('App flows (requires active subscription)', () => {
  let user

  test.beforeAll(async () => {
    user = await createSubscribedUser()
  })

  test.afterAll(async () => {
    if (user) await cleanupUser(user.userId)
  })

  async function loginAndGoToApp(page) {
    await page.goto('/auth.html')
    await page.click('text=Log in')
    await page.fill('#login-email', user.email)
    await page.fill('#login-password', user.password)
    await page.click('#login-btn')
    await page.waitForURL('**/app.html')
  }

  test('subscribed user lands on app after login', async ({ page }) => {
    await loginAndGoToApp(page)
    await expect(page.locator('#bottom-nav')).toBeVisible()
    await expect(page.locator('#paywall')).not.toBeVisible()
  })

  test('completing profile updates readiness bar', async ({ page }) => {
    await loginAndGoToApp(page)
    await page.click('#home-avatar')
    await page.fill('#p-name', 'Jake Smith')
    await page.selectOption('#p-pos', 'RHP')
    await page.click('text=Save Profile')
    const pct = await page.locator('#readiness-pct').textContent()
    expect(parseInt(pct)).toBeGreaterThan(0)
  })

  test('coach search filters by division', async ({ page }) => {
    await loginAndGoToApp(page)
    await page.click('#nav-coaches')
    await page.click('[data-div="JUCO"]')
    await page.waitForTimeout(300)
    const count = await page.locator('#coach-count-label').textContent()
    expect(count).toContain('JUCO')
  })

  test('search input filters coach list', async ({ page }) => {
    await loginAndGoToApp(page)
    await page.click('#nav-coaches')
    await page.fill('#coach-search', 'florida state')
    await page.waitForTimeout(400)
    const cards = page.locator('.coach-card')
    await expect(cards.first()).toContainText('Florida State')
  })

  test('clicking coach card opens detail sheet', async ({ page }) => {
    await loginAndGoToApp(page)
    await page.click('#nav-coaches')
    await page.locator('.coach-card').first().click()
    await expect(page.locator('#coach-sheet.open')).toBeVisible()
  })

  test('"Write Email to This School" prefills the email writer', async ({ page }) => {
    await loginAndGoToApp(page)
    await page.click('#nav-coaches')
    await page.fill('#coach-search', 'Florida State')
    await page.waitForTimeout(400)
    await page.locator('.coach-card').first().click()
    await page.click('text=Write Email to This School')
    await expect(page.locator('#school-search-input')).toHaveValue(/Florida State/i)
  })

  test('copy button copies email to clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await loginAndGoToApp(page)
    await page.click('#nav-emails')
    // Manually set a generated email to test copy without calling AI
    await page.evaluate(() => {
      window.generatedSubject = 'Test Subject'
      window.generatedBody = 'Test Body'
      document.getElementById('email-result').style.display = 'block'
      document.getElementById('email-subject').textContent = 'Test Subject'
      document.getElementById('email-body').textContent = 'Test Body'
    })
    await page.click('text=Copy')
    const clip = await page.evaluate(() => navigator.clipboard.readText())
    expect(clip).toContain('Test Subject')
    expect(clip).toContain('Test Body')
  })

  test('log out redirects to index.html', async ({ page }) => {
    await loginAndGoToApp(page)
    await page.click('#home-avatar')
    await page.click('text=Log Out')
    await expect(page).toHaveURL(/index\.html|^\/$/)
  })
})
```

- [ ] **Step 3: Run e2e tests**

```bash
npm run test:e2e -- tests/e2e/app.spec.js
```

Expected: All app e2e tests PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/app.spec.js tests/e2e/helpers.js
git commit -m "test: e2e app flows — login, profile, coach search, email, logout (Playwright)"
```

---

## Task 18: Final Smoke Test & Push

- [ ] **Step 1: Run full test suite**

```bash
npm run test:all
```

Expected: All unit tests pass. All integration tests pass. All e2e tests pass.

- [ ] **Step 2: Verify netlify dev works end-to-end**

```bash
netlify dev
```

Manual checks:
- [ ] Landing page loads, "Get Started" links to /auth.html
- [ ] Sign up creates account, email confirmation sent
- [ ] Login redirects to app.html
- [ ] App shows paywall for users without subscription
- [ ] Subscribe button opens Stripe checkout (test mode)
- [ ] After paying with test card `4242 4242 4242 4242`, app unlocks
- [ ] Profile saves and loads across page refreshes
- [ ] Coach search works, filters work
- [ ] Email writer generates email (requires ANTHROPIC_API_KEY in .env)
- [ ] Copy and Gmail send work
- [ ] Autopilot generates batch of emails
- [ ] "Manage Billing" opens Stripe portal
- [ ] Log out clears session

- [ ] **Step 3: Set environment variables in Netlify dashboard**

In Netlify → Site Settings → Environment Variables, add all variables from `.env.example`. For `APP_ORIGIN`, use your actual Netlify URL (e.g. `https://recruit2pro.netlify.app`).

- [ ] **Step 4: Register Stripe webhook in Stripe dashboard**

In Stripe → Developers → Webhooks → Add endpoint:
- URL: `https://your-netlify-url.netlify.app/.netlify/functions/stripe-webhook`
- Events to listen for: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.payment_succeeded`
- Copy the signing secret into `STRIPE_WEBHOOK_SECRET` in Netlify env vars.

- [ ] **Step 5: Push to GitHub and verify Netlify build**

```bash
git push origin main
```

Watch Netlify build log. Expected: Build succeeds, functions deploy, site live.

- [ ] **Step 6: Tag release**

```bash
git tag v2.0.0
git push origin v2.0.0
```
