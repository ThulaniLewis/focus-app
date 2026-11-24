// Keeps location going on the phone: starts or stops the background tracking as places and the switch
// change, and takes one fresh look each time Focus comes to the front. Draws nothing.
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { featureOn } from '../lib/features';
import { useGeo } from '../lib/geoStore';
import { useDeviceRole } from '../lib/device';
import { checkNow, syncTracking } from '../lib/location';
import { useStore } from '../lib/store';

export function PlacesHost() {
  const { state } = useStore();
  const role = useDeviceRole();
  const geo = useGeo();
  const on = role === 'phone' && featureOn(state.settings, 'places');
  const placesKey = JSON.stringify(geo.places.map((p) => [p.id, p.lat, p.lon, p.radiusM]));

  useEffect(() => {
    syncTracking({ on, places: geo.places }).catch(() => {});
    // placesKey stands for the places: only their circles matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, placesKey]);

  useEffect(() => {
    if (!on) return;
    const look = () => {
      checkNow().catch(() => {});
      syncTracking({ on, places: geo.places }).catch(() => {});
    };
    look();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') look();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, placesKey]);

  return null;
}
