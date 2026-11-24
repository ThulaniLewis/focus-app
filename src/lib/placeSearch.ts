// Address search for Places, through the focus-places Edge Function (no key on the phone).
import { supabase } from './supabase';

export type AddressHit = { name: string; address: string; lat: number; lon: number };

export async function searchAddress(q: string, near?: { lat: number; lon: number } | null): Promise<{ results: AddressHit[] } | { error: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('focus-places', { body: { q, near: near ?? undefined }, timeout: 15000 });
    if (error) {
      const status = (error as any)?.context?.status;
      if (status === 401 || status === 403) return { error: 'Sign in (Settings > Account) to search for addresses.' };
      if (status === 404) return { error: "Address search isn't set up in Supabase yet (focus-places)." };
      if (status === 429) return { results: [] };
      return { error: "Couldn't reach the address search. Check you're online." };
    }
    const results = Array.isArray(data?.results) ? (data.results as AddressHit[]).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon)) : [];
    return { results };
  } catch {
    return { error: "Couldn't reach the address search. Check you're online." };
  }
}
