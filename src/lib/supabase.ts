import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../config';

export const configured = !SUPABASE_URL.includes('YOUR-PROJECT-REF') && !SUPABASE_PUBLISHABLE_KEY.includes('PASTE');

export const supabase = createClient(
  configured ? SUPABASE_URL : 'https://placeholder.supabase.co',
  configured ? SUPABASE_PUBLISHABLE_KEY : 'placeholder',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Keep the sign-in fresh only while the app is open.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

/** Where the email's sign-in link sends you back to. Must be in Supabase's Redirect URLs. */
export const AUTH_REDIRECT = 'focus://auth';

/**
 * Finishes sign-in from the email link (focus://auth#access_token=…&refresh_token=…).
 * Returns null on success, an error message, or 'ignore' if the URL isn't a sign-in link.
 */
export async function signInFromLink(url: string): Promise<string | null | 'ignore'> {
  if (!url || !url.includes('auth')) return 'ignore';
  const parts = [url.split('#')[1] ?? '', url.split('?')[1]?.split('#')[0] ?? ''].join('&');
  const p = new URLSearchParams(parts);
  const err = p.get('error_description') || p.get('error');
  if (err) return err.replace(/\+/g, ' ');
  const access_token = p.get('access_token');
  const refresh_token = p.get('refresh_token');
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    return error ? error.message : null;
  }
  const code = p.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error ? error.message : null;
  }
  return 'ignore';
}
