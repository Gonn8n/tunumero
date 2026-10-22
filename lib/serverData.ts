import type { SupabaseClient } from "@supabase/supabase-js";

/** Números activos del rango, por chunks (Supabase limita filas por request). */
export async function fetchActiveNumbers(
  supabase: SupabaseClient,
  min: number,
  max: number
): Promise<number[]> {
  const out: number[] = [];
  const CHUNK = 1000;
  for (let from = 0; ; from += CHUNK) {
    const { data, error } = await supabase
      .from("tickets")
      .select("number")
      .in("status", ["pendiente", "reservado", "confirmado"])
      .gte("number", min)
      .lte("number", max)
      .order("number")
      .range(from, from + CHUNK - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data.map((r: { number: number }) => r.number));
    if (data.length < CHUNK) break;
  }
  return out;
}
