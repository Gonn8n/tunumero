import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";

/** GET ?batch= → estado del lote para la página de retorno */
export async function GET(req: Request) {
  const batch = new URL(req.url).searchParams.get("batch") ?? "";
  if (!batch) return NextResponse.json({ error: "Falta batch" }, { status: 400 });
  const supabase = createServerSupabase();
  const { data: rows } = await supabase.from("tickets").select("status").eq("batch_id", batch);
  const list = (rows ?? []) as { status: string }[];
  if (list.length === 0) return NextResponse.json({ found: false });
  const paid = list.some((t) => t.status === "confirmado");
  const cancelled = list.every((t) => t.status === "cancelado");
  const { data: pay } = await supabase
    .from("mp_payments")
    .select("status")
    .eq("batch_id", batch)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return NextResponse.json({
    found: true,
    paid,
    cancelled,
    mp: (pay as { status?: string } | null)?.status ?? null
  });
}
