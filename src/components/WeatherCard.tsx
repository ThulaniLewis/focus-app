// The weather card on the Dash ("Tablet Dash, fixed"). Refreshes every 30 minutes. With no town it
// says "Set your town in Settings"; if the weather can't be reached it says so, never just nothing.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { forecastUrl, parseForecast, type Weather, weatherAdvice, weatherNote, type WeatherPlace, type WeatherView } from '../lib/weather';
import { Icon } from './Icon';
import { L, useDash } from './TabletDash';

const EVERY_MS = 30 * 60000;

/** The weather for the town, with the reason when there isn't any. Null when the feature is switched off. */
export function useWeather(place: WeatherPlace | null | undefined, on: boolean): WeatherView | null {
  const [w, setW] = useState<Weather | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const lat = place?.lat;
  const lon = place?.lon;
  useEffect(() => {
    if (lat === undefined || lon === undefined || !on) return;
    let alive = true;
    const load = async () => {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 15000);
      try {
        const r = await fetch(forecastUrl({ name: '', lat, lon }), { signal: ctl.signal });
        if (!r.ok) throw new Error(`error ${r.status}`);
        const parsed = parseForecast(await r.json(), new Date());
        if (!parsed) throw new Error('unexpected answer');
        if (alive) {
          setW(parsed);
          setFailed(null);
        }
      } catch (e) {
        // Keep the last forecast if there is one; otherwise say why there isn't one.
        if (alive) setFailed(ctl.signal.aborted ? 'The weather service took too long.' : `Couldn't get the forecast (${String((e as any)?.message ?? e)}).`);
      } finally {
        clearTimeout(timer);
      }
    };
    load();
    const t = setInterval(load, EVERY_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [lat, lon, on]);
  if (!on) return null;
  if (!place) return { kind: 'no-town' };
  if (w) return { kind: 'ok', weather: w };
  return failed ? { kind: 'error', message: failed } : { kind: 'loading' };
}

/** The Dash header's weather slot: the card, or a note saying what's missing. */
export function WeatherSlot({ view, leaveAt }: { view: WeatherView; leaveAt?: Date | null }) {
  const D = useDash();
  if (view.kind === 'ok') return <WeatherCard weather={view.weather} leaveAt={leaveAt} />;
  const note = weatherNote(view);
  return (
    <View style={{ backgroundColor: D.tile, borderWidth: 1, borderColor: D.line, borderRadius: 24, paddingVertical: 16, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', gap: 18 }}>
      <Icon name="cloud" size={40} color={D.muted} />
      <View style={{ flexShrink: 1 }}>
        <L size={24} display lines={1}>{note.title}</L>
        {note.detail ? <L size={16} color={D.muted} lines={2}>{note.detail}</L> : null}
      </View>
    </View>
  );
}

export function WeatherCard({ weather, leaveAt }: { weather: Weather; leaveAt?: Date | null }) {
  const D = useDash();
  return (
    <View style={{ backgroundColor: D.tile, borderWidth: 1, borderColor: D.line, borderRadius: 24, paddingVertical: 16, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', gap: 18 }}>
      <Icon name={weather.rainFrom ? 'cloud-rain' : 'cloud'} size={40} color={D.primary} />
      <View style={{ flexShrink: 1 }}>
        <L size={28} display lines={1}>{`${weather.temp}°, ${weather.summary}`}</L>
        <L size={18} color={D.muted} lines={1}>{weatherAdvice(weather, leaveAt)}</L>
      </View>
    </View>
  );
}
