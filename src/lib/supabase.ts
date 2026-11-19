import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);

// Only the publishable key ever reaches the browser. Row Level Security guards every row.
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Turn a Supabase / Postgres error into a sentence a person can act on. */
export function errorMessage(err: unknown): string {
  if (!err) return 'Something went wrong';
  const e = err as { message?: string; details?: string; hint?: string; code?: string };
  const msg = e.message ?? String(err);
  if (/JWT|not signed in/i.test(msg)) return 'Your session has expired. Please sign in again.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Could not reach the server. Check your internet connection and try again.';
  if (e.code === '23505') return 'This record already exists.';
  if (/row-level security|permission denied/i.test(msg)) return 'You do not have permission to do this.';
  return msg.replace(/^ERROR:\s*/, '');
}

export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(errorMessage(error));
  return data as T;
}

export async function callAdminUsers(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    // functions.invoke wraps non-2xx responses; pull the JSON message out
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = await ctx.json();
        throw new Error(j.error ?? error.message);
      } catch (e) {
        if (e instanceof Error && e.message) throw e;
      }
    }
    throw new Error(error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data as { ok: boolean; user_id?: string };
}
