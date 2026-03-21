# RecruitPro — Project Memory

## Status: PHASE 1 COMPLETE
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

---

## PHASE ROADMAP

| Phase | Name | Status |
|-------|------|--------|
| 1 | Foundation (Onboarding, Core UI, Data sync) | ✅ Complete |
| 2 | Coach Database + Search | Pending |
| 3 | AI Email Generator | Pending |
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
