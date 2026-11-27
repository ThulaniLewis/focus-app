// The little map on a place: which OpenStreetMap tiles to show and where. Plain maths, tested.
export const TILE = 256;

/** Where a point sits on the world map at a zoom, in pixels. */
export function worldPx(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = TILE * 2 ** zoom;
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}

/** Metres per pixel at this latitude and zoom. */
export const metresPerPx = (lat: number, zoom: number) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;

/** The zoom that fits a circle of this radius in a box of this size, with room round it. */
export function zoomFor(lat: number, radiusM: number, boxPx: number): number {
  for (let z = 18; z > 10; z--) if ((radiusM / metresPerPx(lat, z)) * 2 * 1.6 <= boxPx) return z;
  return 11;
}

/** The tiles that cover a box centred on the point, with where each one goes. */
export function tilesFor(lat: number, lon: number, zoom: number, width: number, height: number) {
  const c = worldPx(lat, lon, zoom);
  const left = c.x - width / 2;
  const top = c.y - height / 2;
  const max = 2 ** zoom;
  const out: { url: string; key: string; x: number; y: number }[] = [];
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx++)
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty++) {
      if (ty < 0 || ty >= max) continue;
      const wx = ((tx % max) + max) % max;
      out.push({ key: `${zoom}/${tx}/${ty}`, url: `https://tile.openstreetmap.org/${zoom}/${wx}/${ty}.png`, x: tx * TILE - left, y: ty * TILE - top });
    }
  return out;
}

/** The point at a place on the world map: the opposite of worldPx. */
export function latLonAt(x: number, y: number, zoom: number): { lat: number; lon: number } {
  const n = TILE * 2 ** zoom;
  const lon = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return { lat, lon };
}

/** Where the pin lands when the map under it is dragged by (dx, dy) pixels. The pin stays in the middle. */
export function dragPin(lat: number, lon: number, zoom: number, dx: number, dy: number): { lat: number; lon: number } {
  const c = worldPx(lat, lon, zoom);
  return latLonAt(c.x - dx, c.y - dy, zoom);
}
