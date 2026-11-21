# Queued for the next EAS build

Things that live in the native app, so an over-the-air update can't change them. Do them all in one go at the next `eas build --profile preview` (Stage 5 is likely to need one anyway).

## From Stage 0: dusty rose outside the JS

- [ ] **App icon and adaptive icon.** `assets/icon.png`, `adaptive-icon.png`, `android-icon-foreground.png`, `android-icon-monochrome.png` and the SVGs in `docs/design/logo/` are still the teal and amber logo. Needs rose artwork first (from the brand pack), then new PNGs.
- [ ] **Adaptive icon background.** `app.json` `android.adaptiveIcon.backgroundColor` is `#35676A` (teal). Set it from the tokens to match the new icon.
- [ ] **Splash screen.** `app.json` `expo-splash-screen` backgrounds are `#F6F4EF` / `#161A1C` (old palette) and `splash-icon.png` / `splash-icon-dark.png` are the teal logo. Use `bg` light `#FBF3F4` and dark `#1C1719`, plus the new icon.
- [ ] **App background.** `app.json` `backgroundColor` `#F6F4EF` should become `bg` light `#FBF3F4`.
- [ ] **Notification colour.** `app.json` `expo-notifications` `color` is `#35676A`. Use `primary` light `#9C4F67`.

When this goes in: changing native config means a new runtime. Bump `version` (and so `runtimeVersion`, policy appVersion) past 0.7.0, and say so before building.
