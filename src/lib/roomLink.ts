import { slug } from './time';
// Room sticker links: focus://room/kitchen (and a few shapes NFC apps write instead).
// Returns the room slug, or null if the link isn't a room link.
export function roomFromLink(url: string | null | undefined): string | null {
  if (!url) return null;
  const s = url.trim();
  // focus://room/kitchen, focus:///room/kitchen, focus:room/kitchen, exp+focus://room/kitchen
  const m = s.match(/^[a-z0-9+.-]*focus:\/{0,3}(?:--\/)?room\/([^/?#]+)/i);
  if (!m) return null;
  const room = slug(decodeURIComponent(m[1]));
  return room || null;
}
