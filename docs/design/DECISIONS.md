# Design decisions that override the mockups

Where the built app deliberately differs from a mockup, it's written down here. The mockup files stay as they were; this file wins.

## Tablet Dash rail (21 Nov 2026)

Mockup: "Tablet Dash, fixed" (`improvements/project/Main.dc.html`) shows four rail buttons: Today, Spaces, Week, Settings.

Decision: keep the six-button rail, top to bottom: **Today, Spaces, Home, Shop, Kitchen, Sav**, then **Settings** at the bottom. The mic floats above Samsung's taskbar strip, as in the mockup. It's more useful on the kitchen wall than the mockup's four.

## Tablet settings panel: "Exit to Samsung home" (21 Nov 2026)

Mockup: "Tablet settings panel" (`improvements/project/TabletSettings.dc.html`) has an "Exit to Samsung home" button.

Decision: wait for the Stage 5 EAS build. It needs a native module (`expo-intent-launcher`), so it can't go out over the air. Queued in `docs/next-eas-build.md`.

## Dev report (21 Nov 2026)

Mockup: "Dev report and note for Claude" (`improvements/project/DevReport.dc.html`) shows Claude cost in £ and a downloaded file.

Decision: cost stays in **$**, because Anthropic's list prices are in dollars and there's no made-up exchange rate. "Download report" shares the report as **text** through Android's share sheet; no file.

## Places screens, built without mockups (Brief 1 Stage A, 24 Nov 2026)

No mockup exists yet for **Places**, **Place** (add or change one), **Places log**, **Setup checklist**, or the "Home since 17:42" line and "Location has stopped" card on Today.

Decision (Thulani, 24 Nov): build them in the existing theme and components, matching Settings and Today, and review them on the phone. Mockups can follow and win if they differ.

## Places: map and address search (24 Nov 2026)

Brief: "type or search an address like Google Maps … then confirm the pin on a map".

Decision (Thulani, 24 Nov): no Google Maps (it needs a key with billing). The pin is checked on a small **OpenStreetMap** map picture (free, no key, no new native module) with the circle drawn on. It isn't draggable: to move the pin, search again or stand there and tap **Use where I am now**. Address suggestions come from **Photon** (free OpenStreetMap search) through the `focus-places` Edge Function. Nominatim isn't used because its rules don't allow search-as-you-type.

## Places: what isn't in Stage A

- **Camera** is on the brief's checklist, but nothing in Focus uses the camera yet, so there's no camera permission to ask for. It joins the checklist with the first feature that needs it.
- **Onboarding step**: onboarding is Stage 3. Until then a "Tell Focus where home is" card on Today opens Add home.
- **Arriving at the food shop with an empty list**: no pop-up, the same as leaving home with an empty list.

## Places know what they are (Brief 1b Fix 2, 25 Nov 2026)

Mockups: `docs/design/places-fix2-mockups.html`, approved by Thulani on 25 Nov. Her yes didn't pick between the open questions at the bottom of the file, so these were built as drawn:

- **Home** has no switch: arriving and leaving are always logged, and nothing pops up at home.
- **A place reminder** goes off **full screen** on arriving, like the shop pop-up.
- **"Did you …?"** comes **as she leaves** (once the 2-minute hold confirms she's gone), once only.
- **The work routine** is **its own screen** ("At work"), opened full screen on arriving.

Also decided while building:

- **Types and behaviours are data** (`src/lib/placeTypes.ts`). Food shop: shopping list. Nursery or school: leave-by and reminders. Work: work routine and reminders. Family, gym, other: reminders (the gym also ticks a task). Home and food shop take no reminders, as in the brief's table.
- **The leave-by line on a nursery** comes from the trips she already has: tasks with a time whose place is the travel-times place she links (for example "Nursery"). Fix 3 makes the time live with traffic.
- **The I'm home routine** in the brief's Home row doesn't exist yet, so Home has no switch for it. It joins Home when that routine is built.
- **Reminders by talking** work in dumps now. Wind down has no talking yet; it gets them when Stage B rebuilds it as a conversation.
- **Day-before warning** is a notification at 18:00 the day before, if the reminder isn't done by then. "Draft a message" opens the share sheet with a draft; she sends it herself.
- **Any supermarket** (off by default) asks Google once per spot she has stood still at for 4 minutes, at most 6 times a day, and only with things on the list. Only her position goes to Google, rounded to about 10 m.

## Brief 1b Fix 2 addition: tasks linked to places (25 Nov 2026)

Mockups: the New and Changed boards in `docs/design/places-fix2-mockups.html`. Thulani said "whatever makes the most logical step" to the four open questions, so:

- **Not yet** waits for the leaving nudge. Focus doesn't ask again while she's still there (firm, not nagging).
- **Which types take linked tasks:** Child's nursery or school, Family and Other. Work already shows its work list on arrival and the gym ticks itself, so they don't. Food shop and Home don't. It's data in `placeTypes.ts`, so it's easy to change.
- **Existing tasks:** no one-off sweep. She links an existing task from the place's screen ("Link a task to here"). New tasks get the suggestion as they're added (dump and Add to a space).
- **Pick up** is a linked task like drop off: arriving asks "Have you picked Sav up?". Same rule for every linked task, and it never ticks by itself.

Also: "Not today" is Skip today (a repeating task skips the day; a one-off isn't asked about again that day). Done ticks the task with the arrival time from the Places log. Links live in the phone-only places store, never synced.
