import { NextResponse } from "next/server";
import { Payment } from "mercadopago";
import { createServerSupabase } from "@/lib/supabaseServer";
import { mpClient } from "@/lib/mp";

/** Extrae el payment id que manda MP (query legacy ?data.id= / ?id= o JSON {data:{id}}) */
async function paymentId(req: Request): Promise<string | null> {
  const url = new URL(req.url);
  const q = url.searchParams.get("data.id") ?? url.searchParams.get("id");
  if (q) return q;
  try {
    const body = await req.json();
    const id = body?.data?.id ?? body?.dataId ?? body?.id;
    return id ? String(id) : null;
  } catch {
    return null;
  }
}

async function handle(req: Request) {
  const supabase = createServerSupabase();
  const pid = await paymentId(req);
  if (!pid) return NextResponse.json({ ok: true }); // ping de MP sin pago, se ignora
  if (!process.env.MP_ACCESS_TOKEN) return NextResponse.json({ ok: true });

  try {
    // La verdad viene de la API de MP, nunca del body del webhook
    const pay = new Payment(mpClient());
    const info = await pay.get({ id: pid });
    const status = String(info.status ?? "");
    const batchId = String(info.external_reference ?? "");
    const amount = Number(info.transaction_amount ?? 0);
    if (!batchId) return NextResponse.json({ ok: true });

    // Registra/actualiza el pago
    const { data: pend } = await supabase
      .from("mp_payments")
      .select("id,amount")
      .eq("batch_id", batchId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const expected = Number((pend as { amount?: number } | null)?.amount ?? NaN);

    if (status === "approved" && (!Number.isFinite(expected) || amount + 1 >= expected)) {
      // Acredita el lote completo (pendientes del batch) + marca pago aprobado
      const now = new Date().toISOString();
      await supabase
        .from("tickets")
        .update({ status: "confirmado", confirmed_at: now, updated_at: now })
        .eq("batch_id", batchId)
        .eq("status", "pendiente");
      if (pend) {
        await supabase
          .from("mp_payments")
          .update({ status: "approved", mp_payment_id: String(info.id ?? pid) })
          .eq("id", (pend as { id: string }).id);
      } else {
        await supabase.from("mp_payments").insert({
          batch_id: batchId,
          mp_payment_id: String(info.id ?? pid),
          status: "approved",
          amount,
          currency: String(info.currency_id ?? "ARS")
        });
      }
    } else if (status === "approved") {
      // Monto menor al esperado: revisión manual, NO se confirma solo
      if (pend) {
        await supabase
          .from("mp_payments")
          .update({ status: "review", mp_payment_id: String(info.id ?? pid) })
          .eq("id", (pend as { id: string }).id);
      }
    } else if (status === "rejected" || status === "cancelled") {
      if (pend) {
        await supabase
          .from("mp_payments")
          .update({ status: "rejected", mp_payment_id: String(info.id ?? pid) })
          .eq("id", (pend as { id: string }).id);
      }
    }
  } catch {
    // Se responde 200 igual para no encolar reintentos infinitos; el admin ve el pendiente
  }
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}
