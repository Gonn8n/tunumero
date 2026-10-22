import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente SOLO servidor. Usa la service role key y bypassa RLS.
 * Nunca importar desde un componente "use client".
 */
export function createServiceSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor. Configurala en Vercel y .env.local.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
