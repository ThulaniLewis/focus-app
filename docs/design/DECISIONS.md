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
