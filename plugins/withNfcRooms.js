// Lets Android hand focus:// room stickers straight to Focus, without the "New tag collected" screen.
// Expo's own intentFilters setting prefixes every action with "android.intent.action.", which turns the
// NFC action into a name Android doesn't know, so the tag fell through to Android's tag reader.
// This writes the NFC filter onto the main activity by hand.
const { withAndroidManifest } = require('@expo/config-plugins');

const NDEF = 'android.nfc.action.NDEF_DISCOVERED';

module.exports = function withNfcRooms(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    const main = app?.activity?.find((a) => a.$['android:name'] === '.MainActivity') ?? app?.activity?.[0];
    if (!main) return cfg;
    main['intent-filter'] = (main['intent-filter'] ?? []).filter(
      (f) => !(f.action ?? []).some((a) => String(a.$['android:name']).includes('NDEF_DISCOVERED')),
    );
    main['intent-filter'].push({
      action: [{ $: { 'android:name': NDEF } }],
      category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      data: [{ $: { 'android:scheme': 'focus' } }],
    });
    return cfg;
  });
};
