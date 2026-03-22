# RecruitPro — Project Memory

## Status: ALL 5 PHASES COMPLETE ✅
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
- [x] **Phase 4: Milestone persistence** — milestoneState now saves to rp_milestones in localStorage; survives refresh
- [x] **Phase 4: Timeline auto-check** — milestones auto-mark done based on real data (film set, profile score ≥60, 10+ schools, 10+ emails, committed status, etc.)
- [x] **Phase 4: Tracker filter pill counts** — each status pill now shows live count (All 8, Contacted 3, etc.)
- [x] **Phase 4: Follow-up alert bar** — yellow warning bar above school grid listing schools needing contact after 14+ days
- [x] **Phase 4: Quick "Mark Contacted" button** — one-click on school card updates contacted date to today; glows gold if overdue
- [x] **Phase 4: Inline status dropdown** — change school status directly on card without opening Edit modal
- [x] **Phase 4: updateCount wired** — now calls renderDashSchools() + renderNextAction() so dashboard updates immediately when schools change
- [x] **Phase 5: Personalized ref code** — generated from player's first name + random 2-digit number on profile save; persisted to localStorage; updates referral links and share messages automatically
- [x] **Phase 5: UTM tracking on all 5 Gumroad CTAs** — `?utm_source=recruitpro&utm_medium=app&utm_campaign=upgrade` added to every upgrade button
- [x] **Phase 5: License key input** — "Already purchased?" section at bottom of upgrade page; calls validateGumroadKey() to unlock access
- [x] **Phase 5: OG/Twitter social meta tags** — title, description, og:type, og:url, twitter:card for proper link previews when shared
- [x] **Phase 5: ?ref= URL param detection** — on load, reads incoming referral code from URL and stores to localStorage; shows welcome toast for referred new users
- [x] **Phase 5: Upgrade nav pulse** — gold pulse animation on "Upgrade to Pro" nav item draws attention without being obnoxious

---

## PHASE ROADMAP

| Phase | Name | Status |
|-------|------|--------|
| 1 | Foundation (Onboarding, Core UI, Data sync) | ✅ Complete |
| 2 | Coach Database + Search | ✅ Complete |
| 3 | AI Email Generator | ✅ Complete |
| 4 | Athlete Dashboard + Tracking | ✅ Complete |
| 5 | Monetization, Polish & Launch | ✅ Complete |

---

## KNOWN BUGS / TECH DEBT
- app.html is a monolithic single-file app — all features built inline (HTML/CSS/JS)
- No backend/auth — all data persists via localStorage; export/import backup added as mitigation
- AI emails require `ANTHROPIC_API_KEY` env var set in Netlify dashboard; falls back to template engine if missing
