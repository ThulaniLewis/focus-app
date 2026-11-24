// focus-places: address search for Settings > Places, with suggestions as you type.
//
// Uses Photon (photon.komoot.io), a free OpenStreetMap search with no key. Nominatim's rules don't allow
// search-as-you-type, so it isn't used. Only what she types is sent on (plus her weather town, roughly,
// to put nearby results first), never where the phone is.
//
// Same sign-in check as focus-claude: a signed-in user on ALLOWED_EMAILS. No new secrets needed.
// Deploy: supabase functions deploy focus-places
import { createClient } from 'npm:@supabase/supabase-js@2';

const PHOTON = 'https://photon.komoot.io/api/';
/** Identify ourselves, as OpenStreetMap services ask. No personal details. */
const USER_AGENT = 'Focus-home-planner/0.8 (personal app; Supabase edge function)';

/** Gentle on a free service: per person, at most one search every 0.7 s and 40 a minute. */
const MIN_GAP_MS = 700;
const PER_MINUTE = 40;
const recent = new Map<string, number[]>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function tooSoon(userId: string, now: number): boolean {
  const times = (recent.get(userId) ?? []).filter((t) => now - t < 60000);
  const last = times[times.length - 1];
  if ((last !== undefined && now - last < MIN_GAP_MS) || times.length >= PER_MINUTE) {
    recent.set(userId, times);
    return true;
  }
  times.push(now);
  recent.set(userId, times);
  return false;
}

/** "Sainsbury's, 31 Sydenham Road, London SE26 5EX" from Photon's parts. */
function label(p: any): { name: string; address: string } {
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const parts = [p.name, street, p.district ?? p.locality, p.city, p.postcode].filter(Boolean);
  const unique = parts.filter((x: string, i: number) => parts.indexOf(x) === i);
  return { name: String(p.name ?? street ?? unique[0] ?? 'Place'), address: unique.join(', ') };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const allowed = (Deno.env.get('ALLOWED_EMAILS') ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return json({ error: 'Server not set up: add the ALLOWED_EMAILS secret.' }, 500);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Not signed in' }, 401);
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return json({ error: 'Not signed in' }, 401);
  if (!allowed.includes((data.user.email ?? '').toLowerCase())) return json({ error: 'Not allowed' }, 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  const q = String(body?.q ?? '').trim().slice(0, 120);
  if (q.length < 3) return json({ results: [] });
  if (tooSoon(data.user.id, Date.now())) return json({ error: 'Slow down', results: [] }, 429);

  const params = new URLSearchParams({ q, limit: '6', lang: 'en' });
  // Near her town first (already rounded to about 10 km on the phone).
  if (Number.isFinite(body?.near?.lat) && Number.isFinite(body?.near?.lon)) {
    params.set('lat', String(Math.round(body.near.lat * 10) / 10));
    params.set('lon', String(Math.round(body.near.lon * 10) / 10));
  }
  let upstream: Response;
  try {
    upstream = await fetch(`${PHOTON}?${params}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  } catch {
    return json({ error: "Can't reach the address search right now", results: [] }, 502);
  }
  if (!upstream.ok) return json({ error: 'Address search is busy, try again in a moment', results: [] }, 502);
  const geo = await upstream.json().catch(() => null);
  const results = (geo?.features ?? [])
    .filter((f: any) => Array.isArray(f?.geometry?.coordinates))
    .map((f: any) => ({ ...label(f.properties ?? {}), lon: Number(f.geometry.coordinates[0]), lat: Number(f.geometry.coordinates[1]) }))
    .filter((r: any) => Number.isFinite(r.lat) && Number.isFinite(r.lon));
  return json({ results });
});
