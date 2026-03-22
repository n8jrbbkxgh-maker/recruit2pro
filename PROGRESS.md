# RecruitPro — Project Memory

## Status: PHASE 3 COMPLETE
Last Updated: 2026-03-21

---

## COMPLETED
- [x] Bug fixes on app.html (Gmail draft, XSS, autopilot count, fallback crash, dead code)
- [x] Architecture & Roadmap drafted
- [x] Database schema designed
- [x] UI/UX strategy drafted
- [x] **Phase 1: 3-step onboarding wizard** (name/pos/year → stats → division picker + live email preview)
- [x] **Phase 1: Calendar defaults to current month** (was hardcoded March 2026)
- [x] **Phase 1: Dashboard readiness score sync** (uses getProfileScore() live, updates on save, color-coded ring)
- [x] **Phase 2: Coach DB bug fix** — addDBSchoolToTracker now saves to localStorage + re-renders (schools were lost on refresh)
- [x] **Phase 2: Division count badges** — filter pills now show program count (D1 48, D2 31, etc.)
- [x] **Phase 2: Already-tracked indicator** — green ✓ in list on programs already in My Schools
- [x] **Phase 2: Sort + results count** — A-Z / Verified first / Most coaches sort; "23 programs" counter
- [x] **Phase 2: State filter reset** — switching division resets state filter to All States
- [x] **Phase 2: Mobile stack layout** — Coach Database stacks to single column on ≤700px screens
- [x] **Phase 3: Showcase Invite email type** — chip added, subject + Professional/Casual body templates in fallback
- [x] **Phase 3: Subject/body visual split** — generated email shows Subject in labelled strip with its own Copy button; "Copy Body" and "Copy All" in output actions
- [x] **Phase 3: Word count guidance** — counts body words only (not subject), colors green/yellow/red relative to per-type ideal (Follow-Up 80, Thank You 100, others 130)
- [x] **Phase 3: Auto-switch email type** — opening Email Writer from My Schools auto-selects Follow-Up if contacted, Thank You if offer received, First Contact otherwise
- [x] **Phase 3: Quick Replied button** — green "✓ Replied" one-click button on every history row that hasn't replied yet; saves to localStorage

---

## PHASE ROADMAP

| Phase | Name | Status |
|-------|------|--------|
| 1 | Foundation (Onboarding, Core UI, Data sync) | ✅ Complete |
| 2 | Coach Database + Search | ✅ Complete |
| 3 | AI Email Generator | ✅ Complete |
| 4 | Athlete Dashboard + Tracking | Pending |
| 5 | Monetization, Polish & Launch | Pending |

---

## OPEN QUESTIONS (blocking Phase 1)
1. Monetization model?
2. Target sport scope (baseball only or multi-sport)?
3. AI provider preference (Claude vs OpenAI)?
4. Deployment target (Vercel? self-hosted?)?
5. Existing user data to migrate from app.html?

---

## KNOWN BUGS / TECH DEBT
- app.html is a monolithic 4,278-line file — migration target, not maintained further
- No backend/auth currently exists

---

## NEXT STEPS
- Receive answers to clarifying questions
- Scaffold Next.js + Supabase project (Phase 1)
