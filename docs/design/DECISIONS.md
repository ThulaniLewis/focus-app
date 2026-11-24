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
