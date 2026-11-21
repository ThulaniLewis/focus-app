// Lets Focus be chosen as the tablet's home screen (Settings > Apps > Choose default apps > Home app).
// Nothing changes until you pick it there, and you can switch back to One UI Home any time.
const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withHomeScreen(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    const main = app?.activity?.find((a) => a.$['android:name'] === '.MainActivity') ?? app?.activity?.[0];
    if (!main) return cfg;
    const filters = main['intent-filter'] ?? [];
    const has = filters.some((f) => (f.category ?? []).some((c) => c.$['android:name'] === 'android.intent.category.HOME'));
    if (!has)
      filters.push({
        action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
        category: [
          { $: { 'android:name': 'android.intent.category.HOME' } },
          { $: { 'android:name': 'android.intent.category.DEFAULT' } },
        ],
      });
    main['intent-filter'] = filters;
    return cfg;
  });
};
