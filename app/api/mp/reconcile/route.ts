import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";

/** POST {batch_id} (solo admin) → busca el pago en MP por external_reference y confirma si está aprobado.
 *  Cubre webhooks perdidos o demorados (sandbox). */
export async function POST(req: Request) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!process.env.MP_ACCESS_TOKEN) {
    return NextResponse.json({ error: "Falta MP_ACCESS_TOKEN en el servidor." }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const batchId = String((body as { batch_id?: string }).batch_id ?? "");
  if (!batchId) return NextResponse.json({ error: "Falta batch_id" }, { status: 400 });

  try {
    const res = await fetch(
      `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(batchId)}`,
      { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
    );
    if (!res.ok) {
      return NextResponse.json({ error: `MP respondió ${res.status}` }, { status: 502 });
    }
    const j = await res.json().catch(() => ({}));
    const results = (j?.results ?? []) as { id: number; status: string; transaction_amount: number }[];
    const approved = results.find((p) => String(p.status) === "approved");
    if (!approved) {
      const states = results.map((p) => String(p.status)).join(", ") || "sin pagos";
      return NextResponse.json({ ok: false, found: results.length > 0, detail: `En MP: ${states}. Todavía no hay pago aprobado.` });
    }
    const { error: rpcError } = await supabase.rpc("mp_confirm_batch", {
      p_batch: batchId,
      p_payment_id: String(approved.id),
      p_amount: Number(approved.transaction_amount ?? 0)
    });
    if (rpcError) {
      return NextResponse.json({ error: `Pago aprobado en MP (#${approved.id}) pero falló: ${rpcError.message}. Corré el SQL.` }, { status: 500 });
    }
    return NextResponse.json({ ok: true, payment_id: String(approved.id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error al consultar MP" }, { status: 500 });
  }
}
