import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createServerSupabase() {
  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return store.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            store.set({ name, value, ...options });
          } catch {
            /* Server Component read-only */
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            store.set({ name, value: "", ...options });
          } catch {
            /* ignore */
          }
        }
      }
    }
  );
}
