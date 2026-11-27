// Address search for Places, through the focus-places Edge Function (Google Places; the key stays in Supabase).
// One session token per search: typing and the one pick that ends it are billed by Google as one session.
import { supabase } from './supabase';

export type Suggestion = { placeId: string; name: string; address: string };
export type AddressHit = { name: string; address: string; lat: number; lon: number };
/** What went wrong, so the screen can say the right thing. 'down' offers "Use where I am now". */
export type SearchProblem = { error: string; kind: 'signin' | 'down' | 'offline' };

export const NOT_FOUND = "Couldn't find that. Try the postcode.";

/** A version 4 UUID, which is what Google asks for as a session token. Not a secret, so Math.random is fine. */
export function newSession(): string {
  const h = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16));
  h[12] = 4;
  h[16] = (h[16] & 3) | 8;
  const s = h.map((n) => n.toString(16)).join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

async function call(body: Record<string, unknown>): Promise<{ data: any } | SearchProblem> {
  try {
    const { data, error } = await supabase.functions.invoke('focus-places', { body, timeout: 12000 });
    if (!error) return { data };
    const res = (error as any)?.context as Response | undefined;
    const status = res?.status;
    if (status === 401 || status === 403) return { error: 'Sign in (Settings > Account) to search for addresses.', kind: 'signin' };
    if (status === 429) return { data: null };
    if (status === 404) {
      const why = await res?.json?.().catch(() => null);
      if (why?.error === 'not-found') return { data: { notFound: true } };
    }
    // No answer at all (no signal), or our function didn't run.
    if (!status) return { error: "No signal. Try again when you're online, or use where you are now.", kind: 'offline' };
    return { error: "Address search isn't working right now. You can use where you are now instead.", kind: 'down' };
  } catch {
    return { error: "No signal. Try again when you're online, or use where you are now.", kind: 'offline' };
  }
}

/** Suggestions as she types. `near` is rounded to about 1 km before it leaves the phone. */
export async function suggestAddress(q: string, session: string, near?: { lat: number; lon: number } | null): Promise<{ results: Suggestion[] } | SearchProblem> {
  const rough = near ? { lat: Math.round(near.lat * 100) / 100, lon: Math.round(near.lon * 100) / 100 } : undefined;
  const r = await call({ action: 'suggest', q, session, near: rough });
  if ('error' in r) return r;
  if (r.data === null) return { results: [] }; // too quick: the next keystroke asks again
  const results = Array.isArray(r.data?.results) ? (r.data.results as Suggestion[]).filter((s) => typeof s?.placeId === 'string') : [];
  return { results };
}

/** Where the picked suggestion is. Ends the Google session, so make a new token after. */
export async function placeFor(s: Suggestion, session: string): Promise<{ hit: AddressHit } | SearchProblem | { notFound: true }> {
  const r = await call({ action: 'place', placeId: s.placeId, session });
  if ('error' in r) return r;
  if (r.data?.notFound) return { notFound: true };
  const p = r.data?.place;
  if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return { notFound: true };
  return { hit: { name: s.name, address: p.address || s.address, lat: p.lat, lon: p.lon } };
}
