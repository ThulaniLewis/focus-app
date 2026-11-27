// focus-places: address search for Settings > Places, with suggestions as you type. Google Places API (New).
//
// Two calls from the phone, both POST:
//   { action: 'suggest', q, session, near? }  -> { results: [{ placeId, name, address }] }
//   { action: 'place', placeId, session }      -> { place: { address, lat, lon } }
//   { action: 'nearby-shop', lat, lon }        -> { shop: { name } | null }   ("any supermarket", off by default)
// `session` is one Google session token per search, so typing plus one pick is billed as one session.
// The pick asks Google for formattedAddress and location only (the Essentials price). The name comes from the
// suggestion, never from Google's displayName, which would put the whole session on a dearer price.
//
// The Google key lives only in Supabase secrets (GOOGLE_MAPS_API_KEY). Never in the app.
//
// Sign-in: deployed with Supabase's own JWT check off (--no-verify-jwt), like focus-claude. The check happens
// HERE instead, before any Google call: a real signed-in user (asked of Supabase Auth) whose email is on ALLOWED_EMAILS. Everyone else
// is turned away. This function spends a paid Google key: never remove or weaken that check.
//
// Deploy: supabase functions deploy focus-places --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';

const AUTOCOMPLETE = 'https://places.googleapis.com/v1/places:autocomplete';
const DETAILS = 'https://places.googleapis.com/v1/places/';
const NEARBY = 'https://places.googleapis.com/v1/places:searchNearby';

/** Per person, at most one call every 0.25 s and 60 a minute. Google's daily quota is the hard stop. */
const MIN_GAP_MS = 250;
const PER_MINUTE = 60;
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

/** Google's session tokens are URL-safe base64; the phone sends a UUID. */
const SESSION = /^[A-Za-z0-9_-]{8,64}$/;
const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

/** Signed in and on the allowed list, or a reason to turn the caller away. */
async function caller(req: Request): Promise<{ id: string } | Response> {
  const allowed = (Deno.env.get('ALLOWED_EMAILS') ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return json({ error: 'Server not set up: add the ALLOWED_EMAILS secret.' }, 500);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'Not signed in' }, 401);
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  // Asks Supabase Auth itself, so an app key, an expired token or a made-up one all fail here.
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return json({ error: 'Not signed in' }, 401);
  if (!allowed.includes((data.user.email ?? '').toLowerCase())) return json({ error: 'Not allowed' }, 403);
  return { id: data.user.id };
}

async function google(url: string, init: RequestInit, key: string, fieldMask: string): Promise<any | Response> {
  let r: Response;
  try {
    r = await fetch(url, {
      ...init,
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': fieldMask },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return json({ error: 'google-down' }, 502);
  }
  if (!r.ok) {
    // Log Google's reason for the Supabase logs (never the key), but tell the phone only that it's down.
    console.error('google', r.status, (await r.text().catch(() => '')).slice(0, 300));
    return json({ error: r.status === 429 ? 'google-busy' : 'google-down' }, 502);
  }
  return await r.json().catch(() => ({}));
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  // Who is calling? Checked before anything else, so nobody without a sign-in ever reaches Google.
  const who = await caller(req);
  if (who instanceof Response) return who;

  const key = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!key) return json({ error: 'Server not set up: add the GOOGLE_MAPS_API_KEY secret.' }, 500);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  if (tooSoon(who.id, Date.now())) return json({ error: 'Slow down' }, 429);

  if (body?.action === 'nearby-shop') {
    // Is she inside a supermarket? Only her position goes to Google, rounded to about 10 m, and only
    // when she has switched "any supermarket" on and stood still somewhere new with things on her list.
    const lat = Math.round(Number(body?.lat) * 10000) / 10000;
    const lon = Math.round(Number(body?.lon) * 10000) / 10000;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return json({ error: 'Bad request' }, 400);
    const request = {
      includedTypes: ['supermarket', 'grocery_store'],
      maxResultCount: 1,
      rankPreference: 'DISTANCE',
      languageCode: 'en-GB',
      locationRestriction: { circle: { center: { latitude: lat, longitude: lon }, radius: 60 } },
    };
    const g = await google(NEARBY, { method: 'POST', body: JSON.stringify(request) }, key, 'places.displayName');
    if (g instanceof Response) return g;
    const name = g?.places?.[0]?.displayName?.text;
    return json({ shop: typeof name === 'string' && name ? { name: name.slice(0, 80) } : null });
  }

  const session = String(body?.session ?? '');
  if (!SESSION.test(session)) return json({ error: 'Bad request' }, 400);

  if (body?.action === 'suggest') {
    const q = String(body?.q ?? '').trim().slice(0, 120);
    if (q.length < 3) return json({ results: [] });
    const request: Record<string, unknown> = { input: q, sessionToken: session, includedRegionCodes: ['gb'], regionCode: 'gb', languageCode: 'en-GB' };
    // Near where she is, rounded on the phone to about 1 km. Bias only: places further away still come up.
    const lat = Number(body?.near?.lat);
    const lon = Number(body?.near?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      request.locationBias = { circle: { center: { latitude: lat, longitude: lon }, radius: 20000 } };
    }
    const g = await google(AUTOCOMPLETE, { method: 'POST', body: JSON.stringify(request) }, key, 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat');
    if (g instanceof Response) return g;
    const results = (g?.suggestions ?? [])
      .map((s: any) => s?.placePrediction)
      .filter((p: any) => p && typeof p.placeId === 'string')
      .slice(0, 6)
      .map((p: any) => {
        const name = String(p.structuredFormat?.mainText?.text ?? p.text?.text ?? 'Place');
        const rest = String(p.structuredFormat?.secondaryText?.text ?? '');
        return { placeId: p.placeId, name, address: rest ? `${name}, ${rest}` : String(p.text?.text ?? name) };
      });
    return json({ results });
  }

  if (body?.action === 'place') {
    const placeId = String(body?.placeId ?? '');
    if (!PLACE_ID.test(placeId)) return json({ error: 'Bad request' }, 400);
    const params = new URLSearchParams({ sessionToken: session, languageCode: 'en-GB', regionCode: 'gb' });
    const g = await google(`${DETAILS}${encodeURIComponent(placeId)}?${params}`, { method: 'GET' }, key, 'formattedAddress,location');
    if (g instanceof Response) return g;
    const lat = Number(g?.location?.latitude);
    const lon = Number(g?.location?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json({ error: 'not-found' }, 404);
    return json({ place: { address: String(g?.formattedAddress ?? ''), lat, lon } });
  }

  return json({ error: 'Bad request' }, 400);
});
