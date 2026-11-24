# Queued for the next EAS build

Things that live in the native app, so an over-the-air update can't change them. Do them all in one go at the next `eas build --profile preview`.

## Brief 1 Stage A: location always on (needs this build to work at all)

- [x] **Version bumped to 0.8.0** in `app.json` (`runtimeVersion` follows it, policy appVersion). Builds on 0.7.0 won't get Stage A over the air.
- [x] **Android permissions** added: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION` (plus the existing `USE_FULL_SCREEN_INTENT`, `POST_NOTIFICATIONS`). `expo-location` foreground service switched on.
- [x] **Native code** in `modules/focus-alarm`: `showPlacePopup` (the full screen "shopping list?" at the shop) and `batteryUnrestricted` (for the setup checklist).
- [ ] **Supabase**: deploy the new `focus-places` Edge Function (`supabase functions deploy focus-places`). It uses the existing `ALLOWED_EMAILS` secret; no new secrets.

## From Stage 0: dusty rose outside the JS

- [ ] **App icon and adaptive icon.** `assets/icon.png`, `adaptive-icon.png`, `android-icon-foreground.png`, `android-icon-monochrome.png` and the SVGs in `docs/design/logo/` are still the teal and amber logo. Needs rose artwork first (from the brand pack), then new PNGs.
- [ ] **Adaptive icon background.** `app.json` `android.adaptiveIcon.backgroundColor` is `#35676A` (teal). Set it from the tokens to match the new icon.
- [ ] **Splash screen.** `app.json` `expo-splash-screen` backgrounds are `#F6F4EF` / `#161A1C` (old palette) and `splash-icon.png` / `splash-icon-dark.png` are the teal logo. Use `bg` light `#FBF3F4` and dark `#1C1719`, plus the new icon.
- [ ] **App background.** `app.json` `backgroundColor` `#F6F4EF` should become `bg` light `#FBF3F4`.
- [ ] **Notification colour.** `app.json` `expo-notifications` `color` is `#35676A`. Use `primary` light `#9C4F67`.

## From Stage 1: decided to wait for the Stage 5 build

- [ ] **"Exit to Samsung home"** on the tablet Settings panel. Add `expo-intent-launcher` (`npx expo install expo-intent-launcher`) and launch the HOME intent with Samsung's launcher. See `docs/design/DECISIONS.md`.

Changing native config means a new runtime. This build is 0.8.0 (already bumped for Stage A); any further native change before it is built rides along in the same version.
