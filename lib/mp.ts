import { MercadoPagoConfig } from "mercadopago";
import type { createServerSupabase } from "@/lib/supabaseServer";

/** Cliente MP (solo servidor — el Access Token nunca sale al front) */
export function mpClient() {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error("Falta MP_ACCESS_TOKEN en el servidor.");
  return new MercadoPagoConfig({ accessToken: token });
}

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** ¿Cobro con MP habilitado? (tolerante: si el SQL aún no se corrió, responde configurando=false) */
export async function mpStatus(
  supabase: ReturnType<typeof createServerSupabase>
): Promise<{ ready: boolean; enabled: boolean; reason?: string }> {
  if (!process.env.MP_ACCESS_TOKEN) {
    return { ready: false, enabled: false, reason: "Falta MP_ACCESS_TOKEN en el servidor." };
  }
  const { data, error } = await supabase.from("raffle_settings").select("*").eq("id", 1).single();
  if (error) {
    return { ready: false, enabled: false, reason: "Pagos no configurados (falta correr el SQL)." };
  }
  const s = data as { mp_enabled?: boolean } | null;
  if (s && s.mp_enabled === false) {
    return { ready: true, enabled: false, reason: "Cobro con MercadoPago pausado." };
  }
  return { ready: true, enabled: true };
}
