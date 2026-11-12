import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { isConfigured, supabaseAnonKey, supabaseUrl } from "./config.js";

export function createSupabase() {
  if (!isConfigured()) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export function redirectUrl() {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  return url.toString();
}

export async function signInWithGoogle(supabase) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirectUrl() },
  });
  if (error) throw error;
}

export async function signOut(supabase) {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
