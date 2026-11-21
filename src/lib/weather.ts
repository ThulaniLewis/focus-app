// Weather on the Dash, from Open-Meteo (free, no key, no account). Only the town she typed in
// Settings is ever sent, as a rough position (rounded to about 10 km). Never the phone's location.
import { fmtTime } from './time';

export type WeatherPlace = { name: string; lat: number; lon: number };

export type Weather = {
  temp: number;
  high: number;
  low: number;
  /** "rain from 17:30", "dry today" */
  summary: string;
  /** When rain is likely to start in the next 12 hours, if it is. */
  rainFrom: Date | null;
  fetchedAt: number;
};

/** About 10 km: enough for the weather, not enough to find the house. */
export const roughly = (n: number) => Math.round(n * 10) / 10;

export function forecastUrl(p: WeatherPlace) {
  const q = new URLSearchParams({
    latitude: String(roughly(p.lat)),
    longitude: String(roughly(p.lon)),
    current: 'temperature_2m',
    hourly: 'precipitation_probability,precipitation',
    daily: 'temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: '2',
  });
  return `https://api.open-meteo.com/v1/forecast?${q.toString()}`;
}

export function geocodeUrl(name: string) {
  const q = new URLSearchParams({ name: name.trim(), count: '1', language: 'en', format: 'json' });
  return `https://geocoding-api.open-meteo.com/v1/search?${q.toString()}`;
}

export function parsePlace(json: any, typed: string): WeatherPlace | null {
  const r = json?.results?.[0];
  if (!r || !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) return null;
  return { name: typed.trim() || String(r.name), lat: roughly(r.latitude), lon: roughly(r.longitude) };
}

/** Rain counts when it's likely (60% or more) or already measurable. */
const RAIN_CHANCE = 60;
const RAIN_MM = 0.2;
const LOOK_AHEAD_H = 12;

export function parseForecast(json: any, now: Date): Weather | null {
  const temp = json?.current?.temperature_2m;
  const high = json?.daily?.temperature_2m_max?.[0];
  const low = json?.daily?.temperature_2m_min?.[0];
  if (![temp, high, low].every(Number.isFinite)) return null;
  const times: string[] = json?.hourly?.time ?? [];
  const chance: number[] = json?.hourly?.precipitation_probability ?? [];
  const mm: number[] = json?.hourly?.precipitation ?? [];
  let rainFrom: Date | null = null;
  const until = now.getTime() + LOOK_AHEAD_H * 3600000;
  for (let i = 0; i < times.length; i++) {
    const at = new Date(times[i]);
    // The hour that's under way counts, so rain "now" shows.
    if (at.getTime() + 3600000 <= now.getTime() || at.getTime() > until) continue;
    if ((chance[i] ?? 0) >= RAIN_CHANCE || (mm[i] ?? 0) >= RAIN_MM) {
      rainFrom = at;
      break;
    }
  }
  const summary = rainFrom ? (rainFrom.getTime() <= now.getTime() ? 'raining now' : `rain from ${fmtTime(rainFrom)}`) : 'dry for now';
  return { temp: Math.round(temp), high: Math.round(high), low: Math.round(low), summary, rainFrom, fetchedAt: now.getTime() };
}

/** The second line: a coat if rain starts before the next time she leaves, else the day's range. */
export function weatherAdvice(w: Weather, leaveAt: Date | null | undefined): string {
  if (w.rainFrom && leaveAt && w.rainFrom.getTime() <= leaveAt.getTime() + 30 * 60000) return `Take a coat when you leave at ${fmtTime(leaveAt)}`;
  return `High ${w.high}°, low ${w.low}°`;
}
