# Focus big build: brief for Claude Code (21 Nov 2026)

Thulani wants the whole roadmap built in one push, in stages, then she'll test and work back through it. This file is the brief. The detail for every item is in `docs/focus-roadmap.md` (item numbers below refer to it). The screens are in `docs/design/focus-mockups-v0.6.html` and the theme in `docs/design/focus-tokens.json`.

Work stage by stage. **At the end of every stage: tests pass, commit, then stop and report** (format at the bottom). Don't start the next stage until Thulani says go.

---

## 1. Rules that never bend

**Security**
- The Anthropic key lives only in Supabase secrets. Never in the app, code, chat, screenshots, commits or GitHub. The app holds only the Supabase URL and publishable key.
- Never edit or commit `src/config.ts`. Add it (and any `.env*`) to `.gitignore` before the first commit.
- Microsoft client secret: Supabase secrets only. OAuth tokens: stored server side in Supabase, never in the app bundle.
- Never paste sign-in links into chat.

**Privacy**
- Phone only, never synced, never on the tablet, never read aloud: Just for me, Money, sleep, check-ins, momentum and avoidance logs, people list, health goals, the "Just for you" section.
- Keep the existing test that sleep can't reach `localRows`, and add the same test for every phone-only data type in this build.
- Bank statements: read once in the Edge Function, keep only the summary (totals and categories), delete the raw file, never store account numbers.

**Focus never acts on its own**
- Never sends a message or email, never pays or moves money, never unsubscribes, never adds anything without Thulani's yes. Drafts open in WhatsApp, Messages or email for her to send.
- Every proactive feature follows one pattern: spot something, offer one next step, wait for yes.

**Product principles**
- No made-up times. Only real fixed times and deadlines keep a time. Everything else is an ordered "next" list that is never late.
- Checkpoints, not stacked notifications. Notifications group and clear themselves.
- Only tick a job off when she says it's finished. If unclear, ask.
- 24-hour times everywhere (17:45, not 5:45).
- Every call to Claude injects the real device timestamp. Claude has no clock.

**Build to the mockups**
- Build each screen to match its mockup in `docs/design/focus-mockups-v0.6.html`: layout, order, wording, colours, light and dark. Screens marked "New" are this build.
- Generate `src/theme` from `docs/design/focus-tokens.json` (dusty rose palette, Lexend and Atkinson Hyperlegible Next). Use only theme values. No hand-picked colours, fonts or sizes.
- Each app screen uses its mockup's title as its name.
- If something can't match (Android limits, missing data), say so and ask before building it differently. Don't improvise.

**Flexibility (so the app can later be stripped back for other people)**
- Life is data, not code. Nothing in code mentions Sav, Niall, 19:30, her rooms or her places. It all lives in a profile.
- Tasks hang off anchors, not clock times ("after Sav's asleep", "drop off minus travel").
- Three kinds of change: standing change (from a date), one-off exception (one day, then reverts), life stage (a bundle from a date). Trips are short life stages.
- Every integration is a switch the user connects to their own account. Every feature can be switched off in Focus settings without breaking the rest.

**Builds**
- Expo SDK 58, EAS. JS-only stages go out as OTA: `eas update --channel preview`.
- If a stage adds a native module or permission, bump `runtimeVersion` (currently 0.7.0), say so before building, and tell Thulani when an EAS build is needed.
- Once Git is set up, `EAS_NO_VCS` is no longer needed.

---

## 2. Stages

### Stage 0: Safe start
- Git: confirm `git --version`, `git init` in the Focus folder, `.gitignore` covering `src/config.ts`, `.env*`, `node_modules`, build output, any key files. Check nothing secret is staged. First commit: "Focus 0.7.0 baseline".
- Create a private GitHub repo and push (Thulani signs in once; her GitHub login exists).
- Put `docs/focus-roadmap.md`, `docs/FOCUS_BIG_BUILD.md` and `docs/design/*` in the repo.
- Generate `src/theme` from the tokens and switch the existing screens to it (teal goes, dusty rose comes in). Light and dark.
- Add a simple feature switches module (on/off per feature, in Focus settings).

### Stage 1: Quick fixes and the dev report
- Roadmap list A, items 1 to 8 (tablet Dash style for spaces, weather on the Dash, clear of Samsung's taskbar, 24-hour times, Cook dinner labelled once, job search as an ordered list, NHS England as a "Due 23 Nov" deadline with countdown alerts, tablet Settings button and panel).
- Item 14, dev report: activity log, dictation vs what Focus made of it, "Note for Claude" button (saves note, screen and context), Claude call count and cost, private items hidden unless chosen, "Download report".

### Stage 2: Foundations
- Items 9 and 16: profile (people, places, anchors, routines as data), anchors, the three kinds of change, editable "Your routine" page, changes by check-in with a "this moves…" confirmation, drift noticing (ask once).
- Move every hard-coded personal detail out of code into Thulani's profile.
- Tests: anchor moves cascade; exceptions revert; life stages start on their date; the flexibility test suite in the roadmap (bedtime drift, extra day, nursery to school, kitten, new job, moving house, holiday) works by data change alone.

### Stage 3: Capture, people, onboarding
- Item 18, "Before I forget": files to Shopping or the next list; trigger from time, place, person or none; asks one question if unclear.
- Item 19, people: rhythms, nudges at good moments, drafts in her texting style that open in WhatsApp or Messages, contact logged by saying it, phone only.
- Item 15, onboarding: "What's important to you?" and "Who matters to you?", spaces in the user's own words, private ones phone only automatically.
- Item 21, phone Today "Just for you": phone only section, eye button to hide and show it.

### Stage 4: Meals and money
- Item 12, meals: setup chat (health goals phone only), one recipe a day on the Cook dinner checkpoint, "What's in your fridge?", "Shall we go shopping?", shopping list email drafted for her to send.
- Item 20, money check-up: statement upload (PDF or CSV) to the Edge Function, summary only, debts asked not guessed, goal, neutral plan options, guardrail wording ("a friendly guide, not a financial adviser", MoneyHelper and StepChange for debt). Phone only, never spoken.
- Money plan workbook: read only from OneDrive (built in Stage 5 when Microsoft is connected; until then, stub the reader).

### Stage 5: Integrations (switches)
- Microsoft (Graph): sign in once via Supabase Edge Function OAuth. Delegated, read only: User.Read, offline_access, Mail.Read, Calendars.Read, Files.Read. Tell Thulani the exact redirect URI to add in her Azure app registration.
- Outlook email (spec Phase 7: suggestions into a "From your email" review, nothing added without yes), diary, OneDrive money workbook.
- Gmail if time allows.
- Location: finish spec Phase 5 plus item 13 (big shop vs top-up shop, "Want to save this place?"). Locations stay on the phone.
- Likely needs an EAS build: say so up front.

### Stage 6: PA features and trips
- Roadmap list F, items 1 to 13: protecting your time, tradespeople, subscriptions, documents, trip modes (countdown, holiday, work trip, re-entry day), research for you, big projects, weekly look-ahead, family view, home admin, inventories, study planning, adapting tone.

### Stage 7: Tablet
- Phase 1b: Dash style screens, floating task card over YouTube, Spotify playlist per room.
- Room mode on the tablet (mockup "Room mode and Hey Focus"): big Start and Stop, Lost momentum, I'm avoiding this.
- **Do not build a wake word.** Picovoice is out. Keep the big mic button; "Hey Google, open Focus" is the stopgap. openWakeWord is a later job.

### Stage 8: Life gaps
- Roadmap list D as small spaces and templates: Sav's admin, Sav's ill mode, survival mode, renewals, home maintenance, birthdays, events, pets, OU study, hobbies, car, house search. Work mode stays parked.

---

## 3. Not in this build
- No wake word, no Picovoice.
- No TrueLayer or any live bank connection.
- No sending, paying, unsubscribing or posting by Focus.
- No new paid services or Azure resources.

---

## 4. Stage report (every stage, then stop)
1. What changed, in plain English.
2. Screens touched, each with the mockup it matches.
3. "Doesn't match yet" list.
4. Tests: passing count, anything new.
5. Ship: OTA or EAS build needed (and runtime version if bumped).
6. Anything Thulani has to do (sign-ins, settings, permissions).
7. Commit hash.
