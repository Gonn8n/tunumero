import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";

/** POST {batch_id} PÚBLICA (sin login): el comprador volvió de MP.
 *  Segura por diseño: solo confirma si la API de MP dice "approved" (idempotente).
 *  Cubre los casos donde el webhook no llegó o se demoró. */
export async function POST(req: Request) {
  const supabase = createServerSupabase();
  if (!process.env.MP_ACCESS_TOKEN) return NextResponse.json({ ok: false }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const batchId = String((body as { batch_id?: string }).batch_id ?? "");
  if (!batchId) return NextResponse.json({ error: "Falta batch_id" }, { status: 400 });

  // Atajo: si ya está confirmado, no molesta a la API de MP
  const { data: rows } = await supabase.from("tickets").select("status").eq("batch_id", batchId).limit(50);
  const list = (rows ?? []) as { status: string }[];
  if (list.length === 0) return NextResponse.json({ ok: false, detail: "Reserva no encontrada." });
  if (list.every((t) => t.status === "confirmado")) return NextResponse.json({ ok: true, already: true });

  try {
    const res = await fetch(
      `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(batchId)}`,
      { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
    );
    if (!res.ok) return NextResponse.json({ ok: false, detail: "MP no responde todavía." }, { status: 502 });
    const j = await res.json().catch(() => ({}));
    const results = (j?.results ?? []) as { id: number; status: string; transaction_amount: number }[];
    const approved = results.find((p) => String(p.status) === "approved");
    if (!approved) return NextResponse.json({ ok: false, detail: "El pago aún no acredita." });
    const { error: rpcError } = await supabase.rpc("mp_confirm_batch", {
      p_batch: batchId,
      p_payment_id: String(approved.id),
      p_amount: Number(approved.transaction_amount ?? 0)
    });
    if (rpcError) return NextResponse.json({ ok: false, detail: "Pago aprobado, terminando de registrar…" });
    return NextResponse.json({ ok: true, payment_id: String(approved.id) });
  } catch {
    return NextResponse.json({ ok: false, detail: "Reintentando…" });
  }
}
