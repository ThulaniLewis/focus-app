# Claude Code brief 1b: Location fixes before commit (updated 25 Nov 2026, 01:00)

Paste this into Claude Code in the Focus folder. It follows on from brief 1 (`focus-cc-brief-1-personal-location.md`) and every rule in `docs/FOCUS_BIG_BUILD.md`. Everything here must also carry over to brief 2 (Focus Spaces), so nothing personal goes in code.

**Do not commit to Git until all three fixes are done and Thulani has tested them on her phone.** Stop and report after each fix.

**Decision (25 Nov):** Thulani is happy to pay for Google Maps Platform. Use **Google Routes API** for live traffic and **Google Places API** for address search. This replaces the free geocoder and free router in brief 1. All Google calls go through Supabase Edge Functions. The key lives in Supabase secrets only, never in the app. Thulani creates the Google Cloud project, turns on billing and the two APIs, and adds the key. Tell her exactly what to click.

**Keep costs tiny:**
- Restrict the key to the Routes API and Places API only.
- Set a daily quota on each API in Google Cloud and a monthly budget alert (ask Thulani what amount she wants, suggest a low one).
- Use Places autocomplete session tokens so a search plus pick counts as one session.
- Ask for only the fields you need (field masks).
- Cache travel times for a few minutes so repeat checks don't make new calls.
- Report expected monthly calls and cost in the stage report. Her use should sit at or near Google's free monthly allowance.

---

## Fix 1: Typing an address finds nothing

**What happens now:** On the Places screen, "use where I am now" works. Typing an address returns nothing, no suggestions and no error.

**First, find out why the current search failed and report it** (function not deployed, wrong URL or token, geocoder blocking the request, search not firing, or results not shown). Fix whatever was wrong in the app side, since Google search goes through the same path.

**Then switch to Google Places:**
- Autocomplete as she types: debounce about 300 ms, start after 3 characters, UK only, biased to her current position if location is on.
- Full UK postcodes work on their own.
- On pick, fetch the place's location (name, address, lat and lng only), confirm the pin on the map, let her drag it if slightly off, save.
- If nothing is found: "Couldn't find that. Try the postcode." Never a blank list.
- If Google is down, say so and offer "Use where I am now".

**Test:** her home postcode, "Sainsbury's Sydenham", Sav's nursery address in Elmers End, a typo, and no signal.

---

## Fix 2: Places know what they are (replaces the rule builder)

**What happens now:** Every place gets the same toggles, like "show my shopping list" or "don't show my shopping list". That makes no sense for most places. Showing the shopping list is useful when she's going shopping, not when she's dropping Sav at nursery or going to work.

**What she wants:** Each place has a **type**, and the type decides what Focus does there. She doesn't build rules. Focus already knows what a nursery or an office is for, and tells her in one plain sentence what it will do.

**Place types and what each one does** (types and behaviours are data, not code, so more can be added later):

| Type | What Focus does there |
|---|---|
| **Home** | Logs arriving and leaving. Starts the I'm home routine on arrival. **Does not** push the shopping list when she leaves. |
| **Food shop** | On arrival: "Do you want to see your shopping list?" Only if the list has things on it. |
| **Child's nursery or school** (linked to the child) | Drop off and pick up times, with the live leave by time from Fix 3. On arrival, any **place reminders** for it (see below). Any tasks linked here, Focus asks about when you arrive. |
| **Work or office** | On arrival: a **work routine** card with today's meetings from her calendar, her work to do list, and her leave by time for the next fixed thing (for example pick up). |
| **Family** (for example Mum and Dad's) | Place reminders only, for example "Take Mum's dish back". |
| **Gym** | Logs the visit so the gym task ticks itself. Place reminders. |
| **Other** | Place reminders. Any tasks linked here, Focus asks about when you arrive. |

Each place shows its behaviour as plain sentences, each with an on or off switch. For example on the nursery: *"When you arrive at Sav's nursery, Focus will show you anything you need to tell them."* No switches that don't fit the place type.

**Place reminders** (the main new thing):
- A reminder tied to arriving at or leaving a place, once or every time.
- Made by talking or typing, anywhere: in a dump, wind down, or on the place. Focus spots when a task belongs to a place. Example: she says "Sav's going in late on Friday, I need to tell nursery". Focus makes: *"When you arrive at Sav's nursery, remind you to tell staff Sav will be in late on Friday."* and asks yes, no or change.
- It goes off at the next arrival at that place before the date it's about (Friday). If she won't be at the place before then, Focus warns her the day before so she can phone or message instead.
- Ticks off when she says done. If she leaves without ticking it, one nudge: "Did you tell them?"

**Tasks linked to places** (added 25 Nov; works alongside place types and place reminders):
- Any task can be linked to one of her saved places. When a task names a saved place, Focus suggests the link and she says yes, no or change. Example: "Drop Sav to nursery" links to Sav's nursery.
- When she arrives and a linked task is due that day, Focus asks: *"You're at Sav's nursery. Have you dropped Sav off?"* **Done**, **Not yet**, **Not today** (the same as Skip today).
- Done ticks the task off using the real arrival time from the Places log.
- If she leaves without answering, one nudge: *"Did you drop Sav off?"* Nothing after that.
- By default it always asks and never ticks the task off by itself. The gym keeps its auto tick.
- One card per arrival: linked tasks and place reminders show together. If both are still open when she leaves, one nudge covers both: *"Did you drop Sav off and tell them about Friday?"*
- Which types take linked tasks is data, like the other behaviours (child's nursery or school, and other, to start), so it carries over to Spaces. Nothing personal in code.
- **Privacy:** task links and these prompts are phone only, never synced and never on the tablet.

**Shopping list, smarter:**
- No notification on leaving home.
- Shows on arriving at a food shop place.
- Optional setting, off by default: "Any supermarket, not just mine". With it on, if she's inside a supermarket that isn't one of her places and the list has things on it, Focus asks once.

**Work routine:** for now, only meetings, to do list and leave by time. **Parked for later (Focus 5.0):** suggesting places to eat near the office. Don't build it, just add it to the roadmap.

**Key places setup:** in onboarding and Settings > Places, Focus asks for the places she'll use all the time, one type at a time: "Where's home?", "Where do you do your food shop?", "Do you work from an office? Where?", "Where's Sav's nursery?", "Anywhere else you go a lot, like family or the gym?" Each is saved with its type. She can skip any.

**Design first:** mockups of the Places list, a place's screen (sentences and switches, its linked tasks and reminders), a place reminder card when it goes off (with any linked tasks on the same card), and linking a task to a place when adding it, light and dark, in `docs/design/`. Show Thulani and wait for her yes before building.

**Test:**
- Leaving home with things on the list: no notification.
- Arriving at the food shop with an empty list: nothing.
- "Tell nursery Sav's late Friday" in a dump makes one place reminder after yes, and it shows on arriving at nursery on Thursday.
- No nursery visit before Friday: one warning the day before.
- Arriving at the office: work routine card with today's meetings.
- No place type has a switch that doesn't belong to it.
- Linked tasks: arriving with a linked task due shows the prompt; nothing due, no prompt; leaving without answering gives one nudge only; a linked task plus a place reminder show on one card; Done ticks the task with the arrival time from the Places log.
- Nothing about Sav, nursery, Sainsbury's or her office is in code. All of it comes from her profile, so brief 2 can reuse it.

---

## Fix 3: Live travel time with traffic, and moving the task

**What she wants:** For a trip like home to Sav's nursery, Focus works out how long it will really take right now, with live traffic. If that changes when she needs to leave, Focus moves the task and tells her why.

**Service:** Google Routes API, Compute Routes, with `routingPreference: TRAFFIC_AWARE` (not TRAFFIC_AWARE_OPTIMAL unless needed, it costs more for little gain here). Way of getting around comes from her profile. For walking, traffic doesn't apply, so use a plain route.

**How it works:**
- Trips are made from her places: a start, an end, and the fixed time she must arrive (for example nursery drop off by a set time, pick up at 17:30).
- Focus works out a **leave by** time: live travel time plus a small buffer.
- Checks: about 60 minutes before the leave by time, again at 30 and 15 minutes, and when she leaves somewhere. No more than that.
- **The fixed time never moves. The leave by time and the tasks before it can.**
- If live travel time changes the leave by time by more than about 5 minutes, Focus moves it and tells her, with the reason and the numbers:
  *"I've moved leaving for nursery to 08:00. Traffic is heavier than usual, so it's 28 minutes today instead of 15."*
  Compare against the route's usual time (the no traffic duration Google returns) to say "heavier than usual". If Google gives a cause, say it. Don't make one up.
- Tasks before the trip that no longer fit get moved too, and the message says which ones moved and where to.
- Every change has **Undo**. One message per change, no stacking. If it gets worse again, one more message.
- If the new leave by time is very close or already passed, use the alarm style alert from brief 1 Stage C.
- Never tells anyone she's late. If it suggests letting someone know, Focus drafts the message and she sends it herself.
- No location permission or Google unavailable: falls back to the last known usual time and says so in Settings.

**Privacy:** trips, leave by times, place reminders and travel checks are phone only, same as the rest of location. Send Google only the two points, nothing about her.

**Test:**
- Normal traffic: no change, no message.
- Heavy traffic adds 13 minutes: leave by moves, one message with the reason, a task before it moves, Undo puts it all back.
- Traffic clears: leave by moves back once, one message.
- Google down: fallback times used, no crash.
- Call count for a normal day stays within the limits above.

---

## Report after all three
What caused Fix 1, the exact Google Cloud setup steps for Thulani (project, billing, APIs, key restrictions, quotas, budget alert, where to paste the key in Supabase), expected monthly calls and cost, whether a new EAS build is needed, and a test plan for one real nursery run and one office day.
