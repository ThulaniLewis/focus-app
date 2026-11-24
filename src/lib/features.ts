// Feature switches. Every feature can be turned off in Focus settings without breaking the rest.
// A feature is on unless switched off. Switches are kept on this device only (never synced), so the
// phone and tablet can differ. New features add themselves to FEATURES and check featureOn().
import type { Settings } from './types';

export type FeatureId = 'sleep' | 'punctuality' | 'weather' | 'places';

export type Feature = { id: FeatureId; name: string; about: string };

/** In the order they show in Settings. Names match the mockups' titles. */
export const FEATURES: Feature[] = [
  { id: 'sleep', name: 'Sleep', about: 'Reads last night from Health Connect and offers a lighter day after a short night. Phone only.' },
  { id: 'weather', name: 'Weather', about: 'Shows the weather for your town under the date on Today, and on the tablet Dash. Only the town is sent to Open-Meteo, never where you are.' },
  { id: 'places', name: 'Home or out', about: 'Notices when you arrive at and leave your places, keeps a log of it, and brings your shopping list when you leave home or reach your food shop. Phone only: your places never leave this phone.' },
  { id: 'punctuality', name: 'On time or late', about: 'Asks how a drop-off or appointment went, and suggests a new leave-by time if you keep running late.' },
];

export function featureOn(settings: Pick<Settings, 'features'>, id: FeatureId): boolean {
  return settings.features?.[id] !== false;
}

/** The settings patch that switches one feature on or off. */
export function switchFeature(settings: Pick<Settings, 'features'>, id: FeatureId, on: boolean): Pick<Settings, 'features'> {
  return { features: { ...settings.features, [id]: on } };
}
