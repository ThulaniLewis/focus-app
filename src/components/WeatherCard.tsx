// The weather card on the Dash ("Tablet Dash, fixed"). Refreshes every 30 minutes; shows nothing
// until a town is set in Settings, or if the weather can't be reached.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { forecastUrl, parseForecast, type Weather, weatherAdvice, type WeatherPlace } from '../lib/weather';
import { Icon } from './Icon';
import { L, useDash } from './TabletDash';

const EVERY_MS = 30 * 60000;

export function useWeather(place: WeatherPlace | null | undefined, on: boolean): Weather | null {
  const [w, setW] = useState<Weather | null>(null);
  useEffect(() => {
    if (!place || !on) return;
    let alive = true;
    const load = () =>
      fetch(forecastUrl(place))
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => alive && j && setW(parseForecast(j, new Date())))
        .catch(() => {}); // offline: keep the last one
    load();
    const t = setInterval(load, EVERY_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [place, on]);
  return place && on ? w : null;
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
