# Focus: the full build spec ("nirvana")

For Claude Code, working in Thulani's Focus folder on her laptop. This is everything Focus should become, in the order to build it. Build **one phase at a time**. Before starting a phase, tell Thulani in plain words what you're about to build and ask "want me to build it?". When a phase is done, tick it off at the bottom of this file.

Thulani has ADHD, is between jobs, and is a single mum to Sav (Savannah), who is a toddler at nursery on weekdays. Focus is her personal PA: she talks to it the way she'd talk to a person, and it turns that into a calm plan for the house, the job search and her day. It runs on her Samsung phone and a Samsung Galaxy Tab S10 FE on a magnetic wall mount.

---

## 0. Rules that apply to everything

### How Focus should feel
- **Personal first.** Built around her life, not a generic to-do app.
- **No made-up times.** Only things with a real time get one: appointments, pick up, drop off, cooking, the gym, bins night, interviews, and real deadlines. Everything else is an ordered "next" list. Nothing is ever shown as late or missed unless it had a real time.
- **No shame language.** Nothing red, no "overdue". Things roll over. Partly done counts. Late is just information for a better plan. Wind down leads with wins.
- **She talks in prose, not lists.** Claude pulls out only the tasks and actions and ignores the rest. A job is only ticked when she says it's finished. If something is unclear, Focus asks one short, friendly question, like a PA checking in, at most two rounds, always skippable.
- **Ask before acting.** Focus suggests, she confirms. Focus never sends, pays, unsubscribes, deletes or adds things in other apps without her yes.
- **Evenings with Sav:** no house jobs between pick up and Sav's bedtime (about 17:15 to 19:30). Evening house jobs wait until after 19:30.
- **Hallway last.** Rubbish and things to go out collect there on the way round.
- **Plain British English** in everything Focus says. Warm, short, never preachy.

### Privacy (never break these)
- **Just for me** (private notes), **Money**, **sleep**, **check-ins**, **momentum and avoidance logs** never leave the phone. They are never uploaded to Supabase and never appear on the tablet, never read out loud, and never mixed into shared lists. `src/lib/sync.ts` enforces this; keep its tests passing and add to them for anything new.
- The tablet is a **shared screen**. Anything private dumped on the tablet is not saved there.
- Health data: sleep only, phone only.
- Locations stay on the phone.

### Security (never break these)
- The Anthropic key lives only in Supabase Edge Function secrets (`focus-claude`). Never in the app, the code, chat, screenshots or GitHub.
- The app holds only the Supabase URL and publishable key (`src/config.ts`). Never the secret or service role key. **Never edit or commit `src/config.ts`.**
- Email and other sign-in tokens (Outlook, Gmail, Spotify) live in Supabase, server side, never on the phone.
- Row level security on every table: only her account can read or write her rows.
- Payments are always human approved. Focus never pays anything.

### Engineering rules
- Expo SDK 58, expo-router (tabs), TypeScript, AsyncStorage state (`src/lib/store.tsx`), expo-notifications, Supabase.
- Keep logic in plain files with no React Native imports where possible (like `time.ts`, `nudges.ts`, `sync.ts`, `leftovers.ts`, `marks.ts`) so it can be tested with `npm test`.
- Every phase: add tests for the logic, then `npm test` and `npx tsc --noEmit` must both pass.
- Saved data must never be lost: migrations go through `applySetup` with a new setup version; never save over data that couldn't be read.
- **Quick update or full build?** JavaScript-only changes go out as a quick update: `npx eas-cli@latest update --channel preview --message "..."`. Anything that adds a native package, a permission or an Android manifest change needs a full build: `npx eas-cli@latest build -p android --profile preview`, with the version in `app.json` bumped (the runtime version follows it). In a new PowerShell window run `$env:EAS_NO_VCS=1` first. Say clearly at the end of each phase which one it needs.
- Phone layout and tablet layout live in the same app. `src/lib/device.ts`: `isTabletDevice()` and `useDashMode()` (tablet, landscape, at least 900 wide). Tablet screens use `DashShell` and the dark palette `D` in `src/components/TabletDash.tsx`.

---

## 1. Where Focus is now (v0.6)

Already built, don't rebuild:
- Today, Spaces, centre mic (Dump), Week, Wind down. Rooms by floor, NFC room stickers (`focus://room/<slug>`), shopping in aisle order, Just for me.
- Dumps sorted by Claude through the `focus-claude` function, with the check-in loop (questions, tick rule, Done / Started some left / Leave as it is).
- Start and Stop on any job, room rounds, "talk it through", "I've lost momentum" (5 more minutes, one tiny thing, break then come back, stop for now), What's next after Stop, hallway last.
- No made-up times (flex jobs, "after Sav's in bed"), gentle "Next up" check-ins, real-time nudges every 15 minutes until ticked or the next checkpoint (leave-by times, 19:30 Sav asleep, 21:00 wind down), one notification stack per job, Done/Snooze clear them, loud alarm-style alerts for leave now, deadlines (start by, an hour left, due now) and timers.
- Notification tap takes you to the job and flashes it.
- Phone and tablet sync through Supabase (`focus_items`, one row per task and per shared setting), private things never uploaded.
- Tablet: Dash (clock, Now, Leave by, Next, Shopping, rail), night mode, kitchen timers, Sav's bedtime pictures, Apps sheet, Focus as the home screen, keep awake.

---

## Phase 1: Tablet room view and task mode

From the tablet mockups "Room view: Kitchen" and "Task mode: kitchen round" (1280x800, dark). Only in dash mode; the phone keeps its room screen.

**Room view** (`src/app/(tabs)/room/[slug].tsx` inside `DashShell`). Two columns, padding 32/36, gap 28, left `1fr`, right `400px`.
- Left: "THIS TABLET IS IN THE" (18px, muted, letter spacing 1), the room name (display font, 64px, real capitals via `roomNameOf`), a ghost "Change room" button that opens a sheet of rooms.
- A card (`#1F2528`, border `#323A3E`, radius 24) with today's jobs for the room. Rows: minimum height 92, 36px tick box, title 28px, a 19px muted subline ("About 10 min", "After Sav's in bed", or a real time). Chips: "Started, some left" (amber `#3A2F1C` / `#F0D9A8`), "Nice to have" (plain). Done rows sink to the bottom, struck through, "Done 07:20" in teal.
- Right: amber card (radius 28): "ROOM ROUND", "N jobs left" (40px), "Last time it took 32 min. Do them in any order." from `settings.roundLog` (hide if no history), a big start button (min height 76) calling `startRound(slug)`. Label: "Start your bedroom" for her own bedroom, otherwise "Start the <Room name>" with its capitals.
- Below: a teal-soft card "GRAB WHILE YOU'RE HERE" / "ON YOUR WAY UP" from the grab lines, and a small muted hint: "Lift the tablet off the mount and it asks which room it's in now, or tap a room sticker."

**Task mode**, shown on the room screen while a round (or a single job's timer) is running in that room. Columns `430px` and `1fr`.
- Left amber card: "<ROOM> ROUND" plus a chip ("Kitchen tag" if opened from NFC, else "Started here"); a 300px ring counting elapsed time against "of about N min" (from round history or the sum of estimates; elapsed in the middle at 84px); a line "Started 19:45. I'll check in at 20:05: still on the kitchen?"; buttons "Pause" (ghost) and "Stop and tell me" (opens the round stop flow).
- Right: "<Room> jobs" (40px), with the clock and "Next: <next fixed thing> HH:MM" on the right. The first open job is the "ON IT NOW" card (teal soft) with its title, a "First step: …" line when one can be taken from the job, and "Done" / "Some left" buttons (Some left = started, as in the stop flow). Other jobs as tick rows.
- The 20 minute check-in: a gentle local notification on the device running the round ("Still on the kitchen? Tap to stop or keep going"). This is the one nudge allowed on the tablet besides timers.

**"I'm avoiding this"** (ghost button on both screens, and on the phone's room screen). A sheet asks "What's making it hard?":
- "There's too much" → "Rubbish only, 10 minutes. Then you can stop."
- "I don't know where things go" → "Take a bin bag, a basket for other rooms, and a 'no home yet' box. Sort the box another day." Then offer to add "Sort the no home box" to the next of her dad's Saturdays.
- "It has to look perfect" → "Just the bits people see: sofa, table, a clear path. Good enough to sit down in."
- "Something in there I don't want to deal with" → "Put it in a box with a note. We'll plan that bit separately." Then offer a private Just for me note (phone only).
- Each has "Start 10 minutes" (starts the round with a 10 minute come-back nudge). Log reason and choice in `settings.momentumLog` (phone only, extend the type with choice `avoid` and a `reason`).
- If the same room is skipped or avoided three days running, the next time it's suggested, Focus offers the avoidance sheet first instead of the job.

Tests: the start label, the "last time" line, avoidance logging stays out of `localRows`. **Quick update** unless something native is added.

---

## Phase 2: Something's come up, and waiting mode

- A "Something's come up" button on Today (phone and Dash). She says or types what's happened ("gas engineer at 11", "Sav's off sick", "running late", "something broke").
- Claude (new tool in `claude.ts`, prompt in a pure file) returns: short jobs to add at the top (for a visitor: clear the path to where they need to go, a quick tidy where they'll walk), any real-time event (the engineer at 11:00), and what to move. Nothing is dropped; fixed times like pick up stay. Show "Added to the top" and "Moved back: Gym 10:00 → 14:00" for her to confirm before saving.
- "Sav's off sick": Sav is home today, so the plan switches to Sav-home rules (no house jobs needing quiet, nothing that needs leaving), offers to tell nursery (draft a message for her to send herself), and moves today's bigger jobs to the next free day.
- **Waiting mode**: while waiting for someone (or with under 30 minutes before a fixed time), the Dash Now tile and Today show "While you wait" with three 10-minute jobs (smallest estimates, not in rooms the visitor needs).
- Tests: the merge and the "nothing dropped" rule. Quick update.

---

## Phase 3: On time or late

- Fixed times with a place (nursery drop and pick up first) get "On time / Late" when ticked, with "roughly how late?" 5, 10, 20, 30+.
- Keep a log (phone and synced, it's not private). Show the pattern kindly: "Late 4 of the last 5, by about 20 minutes. That's just information, not a telling off."
- After five logged drops with a clear pattern, suggest a plan that fits: nursery is fine any time from 8:00 to 8:30, so offer "Plan for an 08:20 drop?", which moves the up-by and leave-by times with it. One tap to accept, one to say not yet.
- Later (phase 5) location fills this in automatically.
- Tests: pattern maths and the suggestion. Quick update.

---

## Phase 4: Sleep, and naps after a short night (phone only)

- Read last night's sleep from Health Connect (Samsung Health and her sleep tracker write there). Read permission for sleep sessions only. Needs `react-native-health-connect` or the Expo module equivalent, plus manifest permissions: **full build**.
- After under 6 hours, Today shows a card: "A short night, about 5 hours. Better than the night before. Want an easier day?" Show me / Not today.
- "Show me" offers: a 20 to 30 minute nap slot early afternoon while Sav's at nursery, the biggest job moved earlier or to her dad's next Saturday, an earlier wind down. She decides; Focus only offers.
- Sleep is never synced, never on the tablet, never spoken. Add a test that sleep can't reach `localRows`.

---

## Phase 5: Location check-ins

Because Focus thinks she's at home cooking when she's actually at her mum's.
- Places: Home, Mum and Dad's, Sav's nursery, her usual food shop (she sets them by standing there and tapping "This is …", or by address). Geofences with `expo-location` + `expo-task-manager`, background location "Allow all the time". **Full build.** Locations stay on the phone.
- Arriving or leaving logs the time (home at 17:42, left nursery at 08:21).
- **Away from home** (out of the Home fence for 20+ minutes): house jobs, cooking and "Next up" check-ins pause automatically, exactly like "Pause Home" for the day. Back home: "Welcome back. Want to pick up where you left off?" with what's still realistic before Sav's bedtime.
- **At Mum and Dad's** around dinner time: ask once, "Having dinner at your mum's?" Yes skips today's cook dinner without counting it as missed.
- **Nursery**: arriving fills in On time / Late automatically (phase 3).
- **Food shop**: arriving opens the shopping list (food first, in aisle order).
- **In the car** (moving fast): hold non-urgent nudges until she stops.
- Tests: the pause rules as pure functions.

---

## Phase 6: Alarms and routines

The vibe of her Google Home routines, driven by what Focus knows.
- **Real wake-up alarm** at the worked-out time (up-by), full-screen and loud, with snooze. Needs exact alarm and full-screen intent permissions and an alarm activity: **full build**.
- **Morning:** after the alarm, Focus greets her out loud (expo-speech), says the time, the weather, how she slept (phone only, so only on the phone), the first thing in the diary, when to leave, and anything to grab.
- **I'm home:** on arriving home (phase 5) or tapping the front door sticker: what's waiting, what's for dinner, anything due tonight.
- **Bedtime / wind down:** tomorrow's weather, first thing and wake-up time, what rolled over. Then quiet.
- **Never out loud:** Just for me, Money, sleep, or anything phone only.
- On the tablet, routines can speak through the tablet speaker (shared things only).
- Check later whether Google Home's APIs allow triggering routines on the kitchen display; until then, Focus speaks on its own devices.

---

## Phase 7: Email (both inboxes)

- Connect Outlook/Hotmail (Microsoft Graph) and Gmail through OAuth handled by Supabase Edge Functions. Tokens stay in Supabase.
- A scheduled function reads new mail and asks Claude to pull out: dates (goes in the diary on the right day), things to do, replies needed, job updates (into Job search), bills (into Money, phone only), Sav's nursery things (into Sav).
- Everything arrives as a suggestion in a "From your email" review, the same as dumps. Nothing is added without her yes.
- **Wishlist meets inbox:** items she saves to a wishlist get matched against sale or discount emails from that seller.
- **Unsubscribe suggestions** (later, only if useful): senders she never opens; she taps yes; Focus never does it on its own.
- Later: send diary invites to her email.

---

## Phase 8: Saved (links and screenshots)

- Share target: "Share → Focus" from any app saves the link or image. Needs an intent filter: **full build**.
- Screenshots: with permission, read new screenshots and sort them.
- Claude sorts into Jobs, To buy, Recipes, Events, Read later, with a next step where there is one ("closes Friday: add to the plan?").

---

## Phase 9: Screen time nudges

- With usage access permission, notice long scrolling while a job is due: "30 minutes scrolling. You said you'd do the bins. Want one tiny thing?" (links to the momentum options). Gentle, at most one an hour, never during wind down or Sav time. **Full build** (native module for UsageStats).

---

## Phase 10: Music and speakers

- **Playing tile** on the Dash: what's playing on the tablet, with play, pause, skip, using Android media controls (MediaSession / notification listener). **Full build.**
- **Spotify:** start a playlist for a room round ("Kitchen playlist").
- **Denon HEOS:** local network control (TCP port 1255): play, pause, volume, mute, favourites, and Denon groups. Focus's own groups can mix Denon with Google speakers by starting both (not perfectly in sync; say so). Tie into routines (I'm home: music in the kitchen at low volume; room round: music in that room; bedtime: all off).
- **Tapo** smart plugs and lights later.

---

## Phase 11: Work mode

- One setting, and Focus asks when it hears she's got a job.
- If work calendar and email can connect, read meetings. If the employer blocks that, a quick start-of-day check-in (how many meetings, what needs doing, how much time to give it) and an end-of-day close.
- House jobs move to after Sav's bedtime, weekends and her dad's Saturdays.

---

## Phase 12: Glow Up

- Glow Up stays her fitness, food and body app (it needs notifications adding first).
- "Have you eaten?" lives in Glow Up for now: breakfast, lunch, what she ate, the plan for dinner, with suggestions.
- Focus reads only what it needs through Health Connect or a shared Supabase setup: gym sessions done or missed, meal plans for the shopping list.

---

## Phase 13: ADHD support extras

One at a time, each tested with her before the next:
- **Body double mode:** "Work with me": a calm screen with a timer, checking in every 10 minutes.
- **Time blindness:** a shrinking visual countdown for the current job; a Now and Next view; heads-ups 10 and 5 minutes before fixed times.
- **Getting started:** every job gets a tiny first step; a "Pick for me" button; never more than three choices on screen.
- **Hyperfocus guard:** a gentle nudge when a job runs well past its estimate, and a hard stop before pick up.
- **Out of sight, out of mind:** a home screen widget on the phone with Now and Next (**full build**).
- **Energy, not just time:** a 10 second morning check-in (low, okay, good) plus last night's sleep; on low days, smallest jobs first and nice-to-haves dropped.
- **Small rewards:** streaks for showing up, not perfection; a weekly "look how far the house has come" with before and after room photos.
- **A home for everything:** a launch pad by the front door and a "no home yet" box per room, sorted once a week.
- **Decision fatigue:** default dinners for busy nights; a weekly meal plan feeding the shopping list; Sav's clothes laid out the night before.

---

## Phase 14: Plan my day with Claude

- A button on Today's focus card: Claude re-ranks the day using the job tracker, the house, the diary, last night's sleep and energy, and any deadlines, keeping every rule above (no made-up times, evenings with Sav, hallway last). She sees the suggested order and accepts it or tweaks it.

---

## Phase 15: Engineering housekeeping (a quiet day)

- Install Git, create a private GitHub repo, push the code (never `src/config.ts`, never keys; add it to `.gitignore`). Then builds work without `EAS_NO_VCS`.
- Set up ESLint with the Expo config and fix the existing warnings in small batches.
- Delete the old July Focus web app on Vercel.
- Move Glow Up onto the same Supabase setup and delete its old Anthropic key.

---

## Progress

Tick each when done and shipped.

- [x] Phase 1: Tablet room view and task mode, "I'm avoiding this" (shipped 2026-11-20 as a quick update to preview, runtime 0.6.0)
- [x] Phase 2: Something's come up, waiting mode (shipped 2026-11-20 as a quick update to preview, runtime 0.6.0)
- [x] Phase 3: On time or late (shipped 2026-11-20 as a quick update to preview, runtime 0.6.0)
- [x] Phase 4: Sleep and naps (full build 0.7.0, 2026-11-20; needs installing on the phone)
- [ ] Phase 5: Location check-ins (native groundwork already in 0.7.0: expo-location with background location, expo-task-manager; can ship as a quick update)
- [ ] Phase 6: Alarms and routines (native groundwork already in 0.7.0: `modules/focus-alarm`, exact alarm and full-screen intent; can ship as a quick update)
- [ ] Phase 7: Email
- [ ] Phase 8: Saved links and screenshots
- [ ] Phase 9: Screen time nudges
- [ ] Phase 10: Music and speakers
- [ ] Phase 11: Work mode
- [ ] Phase 12: Glow Up
- [ ] Phase 13: ADHD support extras
- [ ] Phase 14: Plan my day with Claude
- [ ] Phase 15: Engineering housekeeping
