# RecruitPro — Project Memory

## Status: PLANNING PHASE
Last Updated: 2026-03-21

---

## COMPLETED
- [x] Bug fixes on app.html (Gmail draft, XSS, autopilot count, fallback crash, dead code)
- [x] Architecture & Roadmap drafted
- [x] Database schema designed
- [x] UI/UX strategy drafted
- [ ] Awaiting clarifying answers before Phase 1 begins

---

## PHASE ROADMAP

| Phase | Name | Status |
|-------|------|--------|
| 1 | Foundation (Auth, DB, Core UI shell) | Pending |
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
