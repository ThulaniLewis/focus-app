// A small map to check a place's pin and circle: OpenStreetMap tiles (free, no key), pin in the middle.
// With onMove, she can drag the map under the pin to nudge it, like most map apps.
import React, { useRef, useState } from 'react';
import { type GestureResponderEvent, Image, View } from 'react-native';
import { dragPin, metresPerPx, TILE, tilesFor, zoomFor } from '../lib/mapTiles';
import { radius, useColors, withAlpha } from '../theme';
import { Icon } from './Icon';
import { T } from './ui';

/** OpenStreetMap asks apps to say who they are when loading tiles. */
const TILE_HEADERS = { 'User-Agent': 'Focus-home-planner/0.8 (personal app)' };

export function MapPreview({
  lat,
  lon,
  radiusM,
  width,
  height = 200,
  onMove,
}: {
  lat: number;
  lon: number;
  radiusM: number;
  width: number;
  height?: number;
  /** Called with the new pin when she lets go after dragging the map. */
  onMove?: (p: { lat: number; lon: number }) => void;
}) {
  const c = useColors();
  const [drag, setDrag] = useState({ dx: 0, dy: 0 });
  const zoom = zoomFor(lat, radiusM, Math.min(Math.max(width, 1), height));
  const start = useRef<{ x: number; y: number } | null>(null);
  const pageXY = (e: GestureResponderEvent) => ({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
  const touch = onMove
    ? {
        onStartShouldSetResponder: () => true,
        // Keep the drag even if the screen around it would like to scroll.
        onResponderTerminationRequest: () => false,
        onResponderGrant: (e: GestureResponderEvent) => {
          start.current = pageXY(e);
        },
        onResponderMove: (e: GestureResponderEvent) => {
          const from = start.current;
          if (!from) return;
          const now = pageXY(e);
          setDrag({ dx: now.x - from.x, dy: now.y - from.y });
        },
        onResponderRelease: (e: GestureResponderEvent) => {
          const from = start.current;
          start.current = null;
          setDrag({ dx: 0, dy: 0 });
          if (!from) return;
          const now = pageXY(e);
          const dx = now.x - from.x;
          const dy = now.y - from.y;
          if (Math.abs(dx) + Math.abs(dy) > 2) onMove(dragPin(lat, lon, zoom, dx, dy));
        },
        onResponderTerminate: () => {
          start.current = null;
          setDrag({ dx: 0, dy: 0 });
        },
      }
    : {};
  if (width <= 0) return null;
  const r = radiusM / metresPerPx(lat, zoom);
  // A tile's width spare all round, so dragging doesn't show blank edges.
  const spare = onMove ? TILE : 0;
  const tiles = tilesFor(lat, lon, zoom, width + spare * 2, height + spare * 2);
  return (
    <View
      accessible
      accessibilityLabel={`Map of the place, with a ${Math.round(radiusM)} metre circle`}
      accessibilityHint={onMove ? 'Drag the map to move the pin' : undefined}
      {...touch}
      style={{ width, height, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: c.surfaceSunken }}
    >
      {tiles.map((t) => (
        <Image key={t.key} source={{ uri: t.url, headers: TILE_HEADERS }} style={{ position: 'absolute', left: t.x - spare + drag.dx, top: t.y - spare + drag.dy, width: TILE, height: TILE }} />
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
