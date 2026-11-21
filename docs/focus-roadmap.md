# Focus roadmap (from 20 Nov 2026)

The one place for what's planned, in what order, and every new idea. Read alongside `focus-build-spec.md` (the 15 phases). Nothing here goes to Code until Thulani says "write up for Code".

**Mockups:** "Focus v0.6: full app" (https://claude.ai/artifact/NoCaa25CcYaZeFtvnEEsx6), the same swipeable format as v0.5, with 20 new screens marked New; and the Design canvas "Focus improvements mockups" (https://claude.ai/artifact/VhagjXBUNyExWwfEZLYkVA).

**What Focus is:** a personal Claude with boundaries. It knows your life, talks like a good house manager, spots things and offers the next step, and never acts, sends, pays or judges without your yes.

Pace: Thulani's plan (20 Nov) is to have Claude Code build the whole roadmap out in one big push, then work back through it, testing and adjusting. Job search and the 30 December interview still come first.

---

## Build to the mockups (rule for every write-up)

Past builds didn't match the mockups, because Code on the laptop can't open claude.ai links. From now on:

1. **The mockups live in the repo.** `docs/design/focus-mockups-v0.6.html` (every screen, phone and tablet, light and dark) and `docs/design/focus-tokens.json` (the Focus brand pack: colours, fonts, spacing, radius). Thulani saves them there from the chat. Any new mockup gets added the same way.
2. **One theme file from the tokens.** Code generates `src/theme` from `focus-tokens.json` and uses only those values. No hand-picked colours, fonts or sizes.
3. **Match, don't improvise.** Each screen is built to match its mockup: layout, order, wording, colours, light and dark. If something can't match (Android limits, missing data), Code says so and asks before building it differently.
4. **Same names.** Each app screen uses its mockup's title (e.g. "Today", "Before I forget", "Money check-up"), so it's clear which mockup it answers to.
5. **Check side by side.** After each stage, Code lists the screens it touched with the mockup each one matches, and Thulani compares them on the device before approving the next stage. Differences go in a "Doesn't match yet" list in the stage report.

---

## Build rules from now on (flexibility)

Focus is built for Thulani first, but it has to be possible to strip it back to a bare framework later. So every new piece follows these rules:

1. **Life is data, not code.** People, places, times and routines live in a profile. The code never mentions Sav, 19:30, Niall or any of Thulani's places.
2. **Tasks hang off anchors, not clock times.** "Kitchen reset" is "after Sav's asleep", not 19:45. "Leave by" is "drop off minus travel". Move the anchor and everything that depends on it moves.
3. **Three kinds of change:**
   - Standing change: "Bedtime is 20:00 now" (from a date onward).
   - One-off exception: "Niall has her an extra day next Thursday" (that day only, then back to normal).
   - Life stage: "Sav starts school in September" (a bundle from a date: school run, term dates and holidays, after school club, PE kit days, new pick-up time). Trips are short life stages too (see F5).
4. **Change comes in by talking.** Say it in a check-in; Focus shows what will move and asks first. Drift noticing catches unspoken changes. Focus can prompt known ones ahead of time.
5. **Every integration is a switch.** Outlook, Gmail, diary, money source, location, tablet hub: each one is something a user turns on and connects to their own account.
6. **Every feature is switchable too.** A big build means some things won't land; each feature can be turned off in Focus settings without breaking the rest.

Test suite for flexibility: bedtime drift, Niall's extra day, nursery to school, the kitten arriving, a new job (work mode on), moving house, a holiday. Each should work by saying it, with no code change.

PA pattern for every proactive feature: Focus spots something, offers one next step, and waits for a yes. It never just adds things.

---

## Big build plan

**Before Code starts (Thulani):**
- Install Git on the laptop (git-scm.com, defaults), check with `git --version`. GitHub login already exists.
- Save `focus-mockups-v0.6.html` and `focus-tokens.json` into `docs/design/` in the Focus project.
- Install and quickly test 0.7.0 if possible, so there is a known-good version to fall back on.
- Microsoft app registration in her own Azure directory (Default Directory, not South London and Maudsley, where her Hotmail is only a guest): New registration "Focus", personal Microsoft accounts only, redirect URI added with Code. Secret straight into Supabase. Delegated permissions: User.Read, offline_access, Mail.Read, Calendars.Read, Files.Read. Create no paid Azure resources.

**Code, stage by stage, one commit each, tests passing and a mockup check before the next:**
0. Git set up safely (`src/config.ts` and keys ignored), first commit, private GitHub repo. Theme generated from `docs/design/focus-tokens.json`.
1. Quick fixes (list A) and the dev report (item 14).
2. Foundations: profile, anchors, the three kinds of change, editable routine page (items 9 and 16). Everything after builds on this.
3. Capture and people: quick capture (18), people (19), onboarding (15), phone Today "Just for you" (21).
4. Meals (12) and money (20).
5. Integrations as switches: Outlook, Gmail, diary, location (Phase 5 plus 13). These need a full EAS build.
6. PA features (list F) and trip modes.
7. Tablet: Phase 1b, Settings panel, room mode.
8. Life gaps (list D) as small spaces and templates.

Then: work back through it on the devices, using the dev report and "Note for Claude" to log what to keep, fix or switch off.

---

## A. Quick fixes

1. Spaces pages (Shopping, Home, Job search, Sav and the rest) use the phone layout on the tablet. Need the Dash style.
2. No weather on the Dash.
3. Samsung's bottom taskbar covers the Today Dash (mic and bottom of tiles). Other pages fine.
4. "Pick Sav up (latest 5:45)" gets cut off. Use 24-hour (17:45) or shorten.
5. Sav page shows "Cook dinner" twice (weekday 16:00, weekend 17:20). Label them or show only today's.
6. Routine Job search jobs show times ("Repeats 09:30"). Should be an ordered list; times only for interviews and real deadlines.
7. NHS England "Closes 23 Nov" sits at 22/11 10:00. Should be a "Due 23 Nov" deadline with countdown alerts.
8. Tablet Settings: a Settings button on the rail opening a panel with Android Settings, Focus settings, main apps, "Exit to Samsung home", and a Dash-style Focus settings page.

## B. Bigger features

9. **Editable core settings and exceptions.** Standing settings (Sav's bedtime, wind down, pick-up, Niall's usual days) on an editable routine page and changeable in a check-in; Focus confirms, then everything dependent moves. Dated one-off exceptions reshape that day, show on the Dash, then revert. Drift noticing: if Sav keeps going down around 8, ask once whether 20:00 is the new bedtime.
12. **Meals.** One-off setup chat: health goals (phone only), cooking confidence, tips wanted, what Sav eats, meals for both. Each day the "Cook dinner" checkpoint shows one suggested recipe with steps (not a menu). "What's in your fridge?" (ramble it) or "Shall we go shopping?" builds the shopping list and drafts an email of it; nothing sent without confirmation. Recipes and shopping list are shared (show on tablet). Links to Shopping and to Glow Up's "Have you eaten?".
13. **Location additions** (on top of spec Phase 5): different shops mean different things (big shop opens the full list; top-up shop like Tesco Express opens "grab a few bits"). Focus spots places visited often and asks "Want to save this place?" (instead of Google Maps). Locations stay on the phone.
14. **Dev report (feedback loop).** On-demand download containing: each dictation next to what Focus turned it into (tasks created, ticked, missed); activity log (ticked, skipped, snoozed, moved, Lost momentum, I'm avoiding this, room); "Note for Claude" button notes (with screen and context); Claude call count and cost. Private areas show as "private item" unless chosen. Shared into a Focus chat for review. Later this log powers drift noticing.
15. **Onboarding: "What's important to you?"** Open question with examples (Sav, home, allotment, money, job search, pets, study, hobbies, events). Each answer becomes a space in the user's own words with starter jobs. Private areas set phone only automatically. Add or remove later in Settings or a check-in. Also asks "Who matters to you?" (item 19).
16. **Life changes without code.** See build rules above. Move Thulani's life out of the code into a profile.
17. **"Hey Focus" wake word (parked).** Picovoice is now enterprise only (company email, 7-day trial), so not used. For now: "Hey Google, open Focus" and the tablet's big mic button. Later, on a quiet day: openWakeWord (free, open source, github.com/dscripka/openWakeWord), with a custom "Hey Focus" model from the free training notebook (or a training site, signing in by email, not GitHub, after checking cost and that it gives a .onnx or .tflite file). Tablet first; shared things only on the tablet ("That's on your phone" for private ones). Commands: what's next, I'm starting the kitchen, I'm done, add X to the list, lost momentum, Sav's asleep.
18. **Quick capture: "Before I forget".** "Hey Focus, before I forget, I need to buy batteries / ring the GP / take the bins out." Focus files it in the right place (buy goes to Shopping, do goes to the next list) and works out the reminder trigger from what was said: a real time ("at 6"), a place ("when I'm at Sainsbury's", using location), a person ("when I see Mum") or none (just the next list). If unclear, it asks one question. Nothing gets a made-up time.
19. **People: staying in touch.** Thulani is terrible at texting back, so Focus helps her reach out to the people who matter.
    - Onboarding (and any check-in) asks "Who matters to you?" and roughly how often she'd like to be in touch with each (e.g. a close friend every couple of weeks, an aunt monthly).
    - Gentle nudges at a good moment (not during Sav's bedtime or work): "It's been about three weeks since you spoke to X. Send a quick hello?" with a short draft in her own texting style, ready to copy or open in WhatsApp or Messages. Focus never sends anything itself.
    - She logs contact by saying it ("spoke to X today") or tapping done; that resets the clock. No reading of her messages.
    - Ties in with birthdays and gifts, and with things people mentioned ("X had her interview last week: ask how it went").
    - Unanswered messages: "before I forget, I need to reply to X" becomes a people nudge, not a buried task.
    - The people list is personal: phone only by default.
20. **Money: check-up and plan (phone only, never spoken).**
    - **Money check-up.** Thulani uploads current bank statements (PDF or CSV). Focus reads them once, then deletes the raw files; it keeps only the summary (totals and categories), never account numbers. It shows, plainly and kindly: money in vs out per month; fixed bills, subscriptions and everyday spending (food, transport, takeaways); anything that stands out, said gently ("Three streaming subscriptions, about £30 a month together").
    - **Debts and net position.** Focus asks rather than guesses: "Any cards, loans or overdrafts? Roughly what's owed, and the rate if you know it." Then shows the overall position: what you have, what you owe, the gap.
    - **"What's your goal?"** Clear a card, build a buffer, save for the house with land, or stop the month running out early.
    - **The plan.** Simple options laid out neutrally, e.g. highest interest first (saves most) or smallest debt first (quicker wins, often better with ADHD). She chooses. The plan becomes normal Focus: payday checkpoints, bill nudges, a monthly money check-in.
    - **Money plan workbook.** The ongoing plan lives in an Excel workbook (bills with due days, payday, budget, subscriptions, renewals, goals) that Focus reads but never edits; she edits it in Excel. Likely route: the workbook on OneDrive, read through Microsoft Graph, reusing the Outlook connection. Focus can draft the first version from the check-up.
    - **Guardrails.** A friendly guide, not a financial adviser: says so once, plainly, no lecturing. If debt looks heavy, it points to free proper help (MoneyHelper, StepChange). Never moves money, never judges ("That month was tight. Want to look at next month together?").
21. **Phone Today: "Just for you".** The phone's Today screen has a private section under the shared plan: money (payday, bills, renewals), people nudges, sleep, Just for me. Marked Phone only. An eye button hides the whole section with one tap (for when someone's looking at the phone) and shows it again with another. Never on the tablet, never read aloud.

## C. Thulani's integrations (as switches)

- Outlook/Hotmail and Gmail (spec Phase 7)
- Diary integration
- Location (spec Phase 5 plus item 13)
- Money: statement uploads and the Excel plan now (item 20). Bank data later, by one of: the bank's own personal developer access, if her bank offers one (Monzo and Starling may, to check); bills and renewals pulled from email (Phase 7); or monthly statement uploads. TrueLayer correction (20 Nov): its sandbox has only test data and production access is sales-led with no published pricing, aimed at companies, so it is not realistic for personal use. It belongs in launch thinking. Any bank link: read only, phone only, never payments.
- Tablet hub: Phase 1b (Dash style, floating task card over YouTube, Spotify playlist per room, 24-hour times), room mode.

## D. Life gaps

- Sav's admin: GP, dentist, jabs, nursery fees, funded childcare code reconfirmation every 3 months.
- "Sav's ill" mode: one tap reshapes the day when nursery's off.
- Survival mode: bad days show only Sav, food and sleep.
- Renewals and bills: car insurance, MOT, TV licence, phone contract (as Due deadlines).
- Home maintenance: boiler service, smoke alarm tests, mouse checks (quiet yearly or monthly jobs).
- Birthdays and gifts, nudged early enough to buy something.
- Events: big days (like Ascot) get a countdown prep checklist.
- Pets space (kitten: feeding, litter, vet and jab dates).
- OU degree: study blocks as checkpoints, assignments as Due deadlines.
- Hobbies: protected time for the novel, allotment and garden (weather-linked seasonal jobs).
- Car: MOT, service, insurance.
- House and land search as its own space.
- Work mode (spec Phase 11) parked until a new job starts.

## E. Things that will bite during development

- Failure modes: no signal, Claude or Supabase down, lost phone. Needs offline working and a data backup.
- Claude costs and prompt changes: track spend per call; keep a set of test dictations so prompt changes can't quietly make things worse.
- Upkeep: Expo SDK upgrades and Play Store yearly requirements.
- Big build risk: a lot changing at once makes bugs hard to trace. Stage by stage, commit each, keep tests passing, every feature switchable.

## F. PA features (from real PA job descriptions, 20 Nov)

The strongest two are 1 and 8: they turn Focus from a to-do app into an actual PA.

1. **Protecting your time.** Focus pushes back on over-commitment: "Saturday already has three things: swimming, the living room and the allotment. Want to move one, or offer Sunday?"
2. **Repairs and tradespeople.** Saved contacts (the plumber), chasing quotes, booked visits with windows ("boiler service Tue 8 to 12"), deliveries tracked from email.
3. **Subscriptions.** From the money check-up and plan (item 20), later from bank data; a nudge before a free trial turns into a payment. Phone only.
4. **Documents.** Where each important document is and when it expires ("Sav's passport: in the drawer, expires 2031"), warranties, driving licence and passport renewals.
5. **Travel and trip modes.** A trip space built from booking emails (itinerary, document checks). A trip is a short life stage: it starts on a date, reshapes everything, then reverts.
   - **Countdown before:** 5 days out, a "What to pack" list built from trip type, length, destination weather and who's going (Sav's essentials, Calpol, favourite toy if she's coming); missing items go on the shopping list. Home prep: Sav's care if she's not coming (one-off exception for Niall or Mum), kitten sitter, allotment watering, bins; meals stop planning fresh food. 2 days out: laundry. 1 day out: pack the bag, check passports and tickets. Departure day: a real leave-by time worked back from the flight or train.
   - **Holiday mode:** house jobs and routines pause and nothing counts as missed. Today shows only the itinerary, Sav's essentials and the odd "Have you eaten?". Gentle and quiet.
   - **Work trip or conference mode:** agenda, travel times and where to be, receipt photos captured for expenses, work things first. Home paused; Sav's days show who has her.
   - **Re-entry day:** "Welcome home. Here's a light day": unpack, a laundry load, a food shop. Bigger jobs come back over the next day or two.
6. **Research for you.** "Find me a plumber" or "compare nursery options" comes back as three options and a "Pick one" button, then a next step.
7. **Big projects.** Moving house or a renovation (house search, understairs build) as multi-step projects with their own spaces.
8. **Weekly look-ahead.** Sunday evening card: "Your next two weeks" with what's coming (jabs, renewals, interview) and one offered prep job ("Insurance renews 3 Dec: add a compare quotes job this week?").
9. **Keeping family in the loop.** Choose what Niall or Mum can see (e.g. Sav's days and pick-ups in a simple shared view), and nothing else.
10. **Home admin space.** Lease or mortgage, insurance, utilities, broadband, phone contracts, each with its renewal date and a nudge to shop around before it rolls over.
11. **Inventories and storage.** What's in the loft, under the stairs, and in the "no home yet" box. Ties in with the living room method.
12. **Study planning.** Revision and study time planned back from each OU deadline, not just the deadline.
13. **Adapting how it talks.** Gentler with fewer options on low days; pushier with more on good days. On a low day the look-ahead shows only the one thing that matters.

## Milestone: fresh start test

Once the full personal version works and the flexibility rules are in: install a separate "Focus Fresh" app (current Focus untouched), go through onboarding as a new user, talking the way a stranger would (rambling, out of order, forgetting things). Compare with the hand-built version: what it got right, what it missed (a missing question), what it couldn't represent (a missing building block). Needs GitHub first.

Later: run the onboarding interview with Elijah or Dad via a Claude chat (no code) and check their profile makes sense in the same building blocks.

---

## Someday, maybe (launch thinking, a year away at least; may stay personal)

- Positioning: "Tiimo plans your day. Focus runs your home." Tiimo: about 50k paying subscribers and 500k free users (Aug 2024), founded 2015, funded.
- Pricing idea: one standard price, around £5.99 a month or £59 a year, one month free, fair use on AI. Must stay above real Claude cost per user (from the dev report). Google takes 15% of subscriptions.
- Bank connection for other users: TrueLayer or a similar open banking provider (sales-led pricing, open banking rules, commercial terms).
- Developer help: a launch readiness sprint (security review, Play Store and subscriptions), roughly 6 to 10 days, £3,000 to £5,500 at UK contractor rates.
- Name: "Focus" is almost certainly taken. Check trademarks and domains.
- Legal: privacy policy, ICO registration, UK GDPR (health, money and children's data), account deletion and data export.
- Household option (tablet hub plus a co-parent) if people ask.
- Test with 5 to 10 parents with ADHD via Play Store testing; watch whether they still use it after a month.

## Parking lot (new ideas go here first)

-
