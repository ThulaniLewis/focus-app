# Claude Code brief 1: Personal Focus, location, skips and wind down (updated 24 Nov 2026)

Paste this into Claude Code in the Focus folder. It follows every rule in `docs/FOCUS_BIG_BUILD.md` (security, privacy, no made up times, build to the mockups, life is data not code). Where this brief and that file disagree, ask Thulani.

Run this **before** brief 2. Brief 2 makes a second app from the same code, so everything built here carries over to it.

Work in three stages. **Stop and report after each one** (format at the bottom of `docs/FOCUS_BIG_BUILD.md`).

- **Stage A:** location always on (section 1)
- **Stage B:** skipping, wind down and Focus's questions (sections 2 to 4)
- **Stage C:** "Are you going to make it?" (section 5), which needs Stage A

Nothing in any stage mentions Sav, her places, her shops or her times in code. All of it comes from her profile, so brief 2 can reuse it.

---

## Stage A: Location always on

**Goal:** Focus on Thulani's phone always knows whether she is at home or out, with no buttons. It logs every arrival and departure like clocking in and out, and brings her the shopping list when she leaves home or reaches her food shop.

Full detail of the ask is in the project doc `focus-next-improvements.md`, section "Location: in the next full build". Copy it into `docs/` if it isn't there.

### 1.1 Places, set by address
- A **Places** screen (Settings > Places) and an onboarding step. Type or search an address like Google Maps, with suggestions as you type, then confirm the pin on a map and save.
- The address lookup runs in a Supabase Edge Function. No key on the phone. Use a free geocoder (for example Nominatim or Photon, with a proper user agent and rate limiting). **Do not add a paid service without asking.**
- Each place has: name, type (home, food shop, family, nursery, gym, other), centre, radius (default 175 m for home, 120 m for shops, editable), and rules for what happens there (stored as data).
- Thulani sets up her places through the screen, not in code: Home, and her food shop (Sainsbury's in Sydenham). Mum and Dad's and nursery can be added after.

### 1.2 Home or not home, always
- Use `expo-location` geofencing with `expo-task-manager`, so it works with Focus closed.
- **Belt and braces, because Android geofences can be slow or miss events:**
  - Also run low power background location updates (balanced accuracy, about every 5 to 10 minutes or 200 m) and work out home or out from those.
  - On app open, check the current position and correct the state.
  - Ignore a change unless it holds for about 2 minutes, so there's no flicker at the edge of the circle.
  - Reconcile: if the log says "left home" but the next fix is inside the circle, log "arrived home" with the real time it was seen.
- Keep a single **where am I** state: at a named place, or out. Show it on Today as a small line ("Home since 17:42" or "Out since 09:10"). Phone only.

### 1.3 Clocking log
- Every arrival and departure is stored: place, arrived or left, time, and how it was detected (geofence, background fix, app open).
- A **Places log** screen with a simple day view: "Left home 08:05, Arrived nursery 08:21, Left nursery 08:24, Arrived home 08:41".
- On time or Late and the I'm home routine will use this later. For now, just make the log reliable.

### 1.4 What happens on arrival and departure (rules as data)
- **Leaving home with things on the shopping list:** one notification listing the items ("Batteries, bags, bin bags. Passing a shop?"). Nothing if the list is empty. At most once per departure.
- **Arriving at the food shop:** "Do you want to see your shopping list?" Tapping it opens the list. If Full screen notifications are allowed for Focus, use a full screen intent so it pops up like an alarm.
- **Arriving home:** log the time and update Today. No notification for now.
- **Shopping: more to come.** Thulani has more shopping asks on the way (her last message cut off). Build the list so more shopping rules can be added later as data.

### 1.5 Permissions setup
- One setup checklist screen, each item with a one line plain reason: location while using, location all the time, notifications, full screen notifications, exact alarms, calendar, microphone, camera.
- For location all the time and full screen notifications, open the right Android settings page and tick the item off when she comes back.
- Samsung: also guide her to set Focus battery use to **Unrestricted**, because Samsung's battery saver is the usual reason background location stops. Show this as a checklist item.
- If a permission is later turned off, Today shows a small card saying location has stopped, with one button to fix it.

### 1.6 Sync, because the list is added on the tablet
- If phone and tablet sync isn't built yet, build shopping list sync now: a Supabase table, row level security on her user id, and an offline copy on each device. The full sync can follow, but the shopping list must reach the phone.

### 1.7 Privacy
- Places, the where am I state and the clocking log are **phone only**. Never synced to the tablet, never read aloud.
- Add tests, in the same style as the sleep test, proving places and the log can't reach `localRows` or the sync layer.
- Store only what's needed. No location trail beyond the arrival and departure log. Background fixes are used to decide state, then thrown away.

### 1.8 Build
- New native modules and permissions: bump `runtimeVersion` from 0.7.0, **say so before building**, and tell Thulani an EAS build is needed.
- Android manifest: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `USE_FULL_SCREEN_INTENT`, `POST_NOTIFICATIONS`.

### 1.9 Tests
- Simulated route: home, out, shop, out, home, with fake position updates. The log and the notifications come out right.
- Edge flicker: hovering at the edge of the circle produces no extra entries.
- Missed geofence: a background fix alone still flips the state and logs it.
- Empty list on leaving: no notification.
- The phone only privacy tests (1.7).

### Stage A report
As well as the usual stage report, include exactly what Thulani has to tap on her Samsung (permissions, battery Unrestricted, full screen notifications) and a two day test plan: walk to the end of the road and back, a Sainsbury's trip, and a nursery run, then check the Places log matches what really happened.

---

## Stage B: Skipping, wind down and Focus's questions

**Design first.** Before building Stage B, add mockups to `docs/design/` for: the skip options, the third skip check-in, the new wind down thread (start, follow-ups, end card), and the "Focus is asking" card, in light and dark. Show them to Thulani and **wait for her yes** before building.

### 2. Skipping a task

**Two kinds of skip.** Any task that isn't done can be skipped two ways:
- **Skip today:** it comes back as normal. A recurring task (the gym) returns next time it's due. A one-off moves to tomorrow.
- **Skip for good:** it doesn't come back. This is for tasks that have been replaced by something else or no longer matter. On a recurring task, ask once: "Just this one, or stop this routine?"

**Three skips in a row:**
- Count skips in a row for each task. For daily tasks, three days. For weekly tasks, three times it was due.
- On the third, Focus asks once, kindly and with no guilt: *"This is the third time you've skipped this. What's getting in the way?"* The options are:
  - **Get rid of it**
  - **Make it smaller or less often**
  - **Move it to a better day or time**
  - **Something's stopping me** (she says what, and Focus suggests how it could help: a tiny first step, a different time, a room round, a reminder somewhere else)
  - **Keep it as it is.** Then don't ask about that task again for 14 days.
- Nothing changes without her yes. The skip history is kept so wind down and the dev report can use it.
- No shame language. Nothing red, nothing "overdue".

### 3. Wind down, rebuilt as a conversation with an end

The order matters. **The download comes first**, so she can just talk without thinking about Focus's questions.

1. **Start: just talk.** "How was today?" with a big mic, like sending a WhatsApp voice note. Typing works too. No interruptions while she talks.
2. **Then one message back from Focus** with what it pulled out, plus "I noticed a few things:" and **two or three things at most** that Focus spotted on its own, for example:
   - a task skipped three times in a row
   - she left the food shop with things still on the list (uses Stage A)
   - a room with nothing ticked
   - a diary item tomorrow with no prep
   - a fixed time she was late for
3. **Follow-ups one at a time.** Each can be answered by talking, with a quick option, or skipped.
4. **"Oh, I forgot" button**, always visible in wind down: for things she forgot to do or forgot to tell Focus. Sorted like a dump.
5. **New space spotted.** If what she says sounds like its own thing to track (for example "Bali 2027"), Focus asks: *"This sounds like something you'd want to track on its own. Want a space for Bali 2027?"* On yes, make the space from the right template (a trip, in this case) with her own name on it. Only on yes. This works the same in dumps and talk it through.
6. **A clear end, every time.** An end card: what was saved, what moved to tomorrow, tomorrow's first fixed thing, and the weather if it's in. One **Done** button closes it. A thread never just trails off.

Keep Just for me rules: anything personal from wind down stays phone only.

### 4. Make Focus's questions impossible to miss

At the moment, the only sign that Focus is asking something is the heading changing, and Thulani has missed it more than once.

- **Conversations show as a thread** (call and response, like a chat) in wind down, talk it through, dumps with follow-ups, and onboarding. Her words show as her messages (voice is transcribed). Focus's replies show as its messages. She can scroll back.
- **Every question from Focus is its own card** in the thread: a different colour from Focus's normal messages (from the theme tokens, not hand picked), labelled **"Focus is asking"** with a question icon, and its own answer buttons.
- When there's more than one question: "Question 1 of 2".
- A new question slides in with a gentle animation, so a change is obvious.
- **Tasks Focus pulls out show as task cards in the thread** with Add and Change, not as plain text, so they don't get buried.
- Every thread ends with the end card and Done (section 3, step 6).
- The rest of the app (Today, Spaces, rooms) stays as it is.

### Stage B tests
- Skip today on a daily task: back tomorrow. Skip for good on a one-off: never back.
- Three skips in a row triggers one check-in. "Keep it" means no check-in for 14 days.
- Wind down follow-ups never go over three, and the thread always ends with the end card.
- A new space is only made after yes.
- Question cards render in light and dark using theme tokens only.

---

## Stage C: "Are you going to make it?"

**Goal:** Focus knows where she is, what her next fixed thing is (such as pick up at 17:30), and what has to happen before it (shop, then cook). If the timings don't add up, it warns her early and helps her decide.

### 5.1 How it works
- Uses the where am I state from Stage A and the day's fixed times and the tasks tied to them (anchors).
- **Real travel times:** a free routing service (for example OpenRouteService or OSRM) through the Supabase function. Any key goes in Supabase secrets only. **Ask before using anything paid.** Use her usual way of getting around (car, walking, bus), set in her profile.
- Checks run when she leaves or arrives somewhere, and every 10 to 15 minutes when she's out and a fixed time is within the next 2 hours.
- **The sum:** travel time to the next fixed thing, plus the time the jobs before it need (for example a shop at home and cooking dinner, using learned job times where they exist), plus a small buffer, compared with the time left.

### 5.2 What she sees
- If it's tight: *"You're 25 minutes from home and pick up is at 17:30. Dinner's going to be tight. What do you want to do?"*
  - **Leave now**
  - **Swap to a quick dinner** (from her easy meals)
  - **Do the shop after pick up**
  - **Let them know I might be late** (Focus drafts the message, she sends it herself; Focus never sends)
- If it's going to be late for a pick up or another fixed time where that matters, use the alarm style alert that sounds through silent and vibrate.
- At most one warning per fixed thing, plus one more if it gets worse. No stacking.
- It shows as a "Focus is asking" card when she opens the app.

### Stage C tests
- Simulated afternoon: out at 16:30, 25 minutes away, pick up 17:30 with a 40 minute cook before it, gives one warning with the four options.
- Plenty of time: no warning.
- Getting worse: exactly one more warning.
- No location permission: the feature switches itself off quietly and says so in Settings.

### Stage C report
The usual stage report, plus what she needs to set (way of getting around, any route service key in Supabase secrets).
