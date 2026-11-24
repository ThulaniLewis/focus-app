// A small map to check a place's pin and circle: OpenStreetMap tiles (free, no key), pin in the middle.
import React from 'react';
import { Image, View } from 'react-native';
import { metresPerPx, TILE, tilesFor, zoomFor } from '../lib/mapTiles';
import { radius, useColors, withAlpha } from '../theme';
import { Icon } from './Icon';
import { T } from './ui';

/** OpenStreetMap asks apps to say who they are when loading tiles. */
const TILE_HEADERS = { 'User-Agent': 'Focus-home-planner/0.8 (personal app)' };

export function MapPreview({ lat, lon, radiusM, width, height = 200 }: { lat: number; lon: number; radiusM: number; width: number; height?: number }) {
  const c = useColors();
  if (width <= 0) return null;
  const zoom = zoomFor(lat, radiusM, Math.min(width, height));
  const r = radiusM / metresPerPx(lat, zoom);
  const tiles = tilesFor(lat, lon, zoom, width, height);
  return (
    <View
      accessible
      accessibilityLabel={`Map of the place, with a ${Math.round(radiusM)} metre circle`}
      style={{ width, height, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: c.surfaceSunken }}
    >
      {tiles.map((t) => (
        <Image key={t.key} source={{ uri: t.url, headers: TILE_HEADERS }} style={{ position: 'absolute', left: t.x, top: t.y, width: TILE, height: TILE }} />
      ))}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: width / 2 - r,
          top: height / 2 - r,
          width: r * 2,
          height: r * 2,
          borderRadius: r,
          borderWidth: 2,
          borderColor: c.primary,
          backgroundColor: withAlpha(c.primary, 0.15),
        }}
      />
      <View pointerEvents="none" style={{ position: 'absolute', left: width / 2 - 14, top: height / 2 - 28 }}>
        <Icon name="map-pin" size={28} color={c.primaryStrong} />
      </View>
      <View style={{ position: 'absolute', right: 0, bottom: 0, backgroundColor: withAlpha(c.surface, 0.85), paddingHorizontal: 4, borderTopLeftRadius: 4 }}>
        <T v="caption" muted>© OpenStreetMap contributors</T>
      </View>
    </View>
  );
}
