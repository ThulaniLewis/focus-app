# Claude Code brief 2: Shareable Focus, Spaces build (updated 25 Nov 2026)

Run this **after all three stages of brief 1 and all of brief 1b have landed, plus briefs 1c and 1d** (location, skipping and wind down, "Are you going to make it?", and the location fixes). Paste into Claude Code in the Focus folder. Every rule in `docs/FOCUS_BIG_BUILD.md` still applies.

Everything from brief 1 and 1b must work in the Spaces app with no changes: places come from onboarding with their place types, place reminders and the work routine work for anyone, live traffic leave by times work for anyone, skips and the three skip check-in work on any task, wind down's "I noticed" follow-ups come from each person's own data, and "this sounds like a new space" uses the Spaces templates in section 3.

**Goal:** a second Focus app that has **every feature of Thulani's personal Focus**, but knows nothing about her. Everything personal is built from the person's own onboarding. Then test it: put Thulani through it as if she were a stranger and see whether it ends up doing the same job as her personal build.

Specs to copy into `docs/` if not there: `focus-product-spec-spaces.md` (the spaces design) and `focus-pa-benchmark.md` (the UHNW PA benchmark) from the project.

---

## 1. One codebase, two apps

So the shareable app always has all the functionality, **do not fork the code**. Build two variants from the same code:

| | Personal | Shareable |
|---|---|---|
| App name | Focus | Focus Spaces (working name) |
| Android package | current one | new one, e.g. `...focus.spaces`, so both install side by side on her phone |
| Supabase | current project | **new project**, so her brothers each get their own account and none of her data is anywhere near it |
| Profile | Thulani's | empty until onboarding |
| EAS channel | `preview` | `spaces` |

- Use `app.config.ts` with an `APP_VARIANT` setting to switch name, package, icon tint, Supabase URL and publishable key, and channel.
- Feature parity rule: a feature is built once and works in both. The only difference between variants is config and data. Add a test that fails if any screen or feature checks the variant to switch itself off.
- New Supabase project (Thulani may already have made it while brief 1 was running; ask for its URL and publishable key): same `focus-claude` function, plus the Google Places and Google Routes functions from brief 1b, and same secret rules. Ask Thulani whether the Spaces project uses her same Google key (with its own quota) or a separate one. `ALLOWED_EMAILS` holds Thulani's test email and her brothers' emails. Sign ups off after accounts are made. Row level security on every table by user id.
- Before starting: tag the current state in Git (`personal-before-spaces`) so nothing is lost, and work on a branch.

## 2. Strip out everything hard coded

- Audit the code for anything about Thulani's life: Sav, Savannah, Niall, nursery, Elmers End, Sainsbury's, Sydenham, her office, her rooms, her times (19:30, 17:15, 8:15 and so on), her dad's Saturdays, job search, Glow Up.
- Each one moves into the profile as data. Her personal variant gets it back from a profile file loaded on first run (kept out of Git, like `config.ts`).
- Add a **hard code check test**: scan `src/` for a list of her personal words and times and fail if any appear outside test fixtures.
- Give a list of every item moved and where it now lives. That list is the "where the rebuild breaks it" record she asked for.

## 3. Spaces (build to `focus-product-spec-spaces.md`)

A space has a template, an on/off switch, settings and an owner.
- **Home:** one per household, any kind of home, house share "my bits only" option, optional room tags.
- **Interest spaces:** as many as the user wants, named by them. The AI may suggest one, only after a check-in.
- **Pets:** template set by animal type. (Open decision: one space per pet or one Pets space. Build one Pets space with a profile per pet, and make it easy to change.)
- **Children:** one per child plus optional All children. **Life stage sets the template** (0 to 4, primary, secondary, 16 to 18, UK first) and moves on by itself with a check-in. A child's nursery or school is a place of type "child's nursery or school" linked to that child's space.
- **Events:** short events and trips, which behave differently.
- A template library as data files, not code, so new spaces can be added without a rebuild.

**Rhythms**, running across spaces:
- Fixed commitments (such as a child seeing their other parent every other Saturday), set once.
- Learned patterns: the AI notices repeats and asks "Do you want to make this a regular thing?" Never adds without asking.
- **Cadence tiers:** a recurring task is stored once with a cadence (daily light touch, weekly, monthly, custom), never created fresh every day. Onboarding asks how often for each (such as a deep clean).

**Check-ins:** anything new the AI creates (task, pattern, space, life stage change, place reminder) is asked first. Yes, no, or change it.

## 4. Onboarding, AI led
- Quick start first: "What do you want Focus to help with?" plus one or two fixed points. Then the offer: "I need to know a bit more about you, can you give me a few more minutes?" Yes or Maybe later.
- The deeper part is AI led, not a fixed form: one area at a time, follow up questions ("You said you have a child, can I ask more about them?"), check before moving on. Talk or type, switch any time.
- Onboarding produces the profile: people, spaces switched on, places with their types, anchors, fixed commitments, cadences.
- **Key places, by type (same as brief 1b Fix 2):** Focus asks for the places the person will use all the time, one type at a time, and only the ones that fit what it has learned: home, food shop, work or office (if they work from one), each child's nursery or school (if they have children), family, gym, other. Each is saved with its type, and the type decides what Focus does there. No generic "show shopping list" switches. The person can skip any and add more later.
- **Email and diary scope (from brief 1d Stage 5):** if the person connects email, onboarding asks **whole inbox or selected senders only**, changeable later in Settings. The diary is read in full. Appointment emails and letters (job centre, NHS, nursery, physio) are spotted and asked about ("This looks like an appointment on Fri 28 Nov at 10:00. Add it?"); yes starts appointment prep. Keep only what's needed. Never send, reply, delete or move email.
- **Brief 1d carries over:** alarms (Focus alarms plus the offer of real Clock alarms), appointment prep suggestions by appointment type, learning from lateness and the calendar week and month views all work for anyone, with rules and suggestions as data.
- Everything onboarding learns can be changed later in Settings or by saying so.

## 5. Safety guardrails (must be in before any tester)
Build to section 4 of the spaces spec:
- Text and voice are checked before anything becomes a task.
- If anything suggests the person may be at risk, Focus does not make it a task. It shows a fixed, pre-written support response: Samaritans 116 123 (free, 24/7), text SHOUT to 85258, 999 in an emergency.
- Focus will not plan, schedule or remind about anything that would harm someone else.
- Use the model's own judgement plus a check in the Edge Function. Ask Thulani before adding any extra paid moderation service.
- Minimal logging. A short first run screen: Focus is not a crisis service. A "report this response" button.
- Tests with sample phrases for each case.

## 6. Tester reports
- Each tester has a **Download report** button (the dev report from Stage 1): what they said, what Focus made of it, notes for Claude. They choose to send it; Thulani never sees their raw data otherwise.

## 7. The test: does it come out the same without knowing her?
Build a **parity test** Thulani can run on her own phone:
1. She installs Focus Spaces next to her personal Focus, signs in with her test email, and does onboarding from scratch as if Focus has never met her.
2. A **compare** screen (or a script that reads both profiles) lines up what each version knows and does: spaces, people, places and their types, fixed commitments, cadences, place behaviours, and tomorrow's plan side by side.
3. Every gap is listed: in personal but missed by onboarding, in Spaces but not in personal, and different.
4. Also score the Spaces result against `focus-pa-benchmark.md` (diary, travel, household and property, family admin, comms and gatekeeping, anticipating needs): covered, partly, missing.
5. Automated version for the test suite: a scripted onboarding transcript (written from her profile file, kept out of Git) fed through onboarding, checking the resulting profile matches her personal one.

## 8. Build and report
- New package and Supabase project mean an EAS build for the Spaces variant. Say so first.
- Work in stages: (a) variants and new Supabase, (b) hard code strip and audit list, (c) spaces, rhythms, cadences, check-ins, (d) onboarding, (e) guardrails, (f) reports and parity test. **Stop and report after each stage** using the format in `docs/FOCUS_BIG_BUILD.md`.
- Final report must say what Thulani needs to do: create the new Supabase project, add secrets (including the Google key), add her brothers' emails, and how to install both apps.
