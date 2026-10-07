import { NextResponse } from "next/server";
import { Preference } from "mercadopago";
import { createServerSupabase } from "@/lib/supabaseServer";
import { mpClient, mpStatus, siteUrl } from "@/lib/mp";
import { bestQuote, type Promo } from "@/lib/tickets";

interface BatchTicket {
  id: string;
  number: number;
  status: string;
  is_bonus?: boolean;
  nombre: string;
  prize_kind?: string | null;
  prize_value?: number | null;
}

/** POST {batch_id} → crea la preferencia de pago con el total calculado EN EL SERVIDOR */
export async function POST(req: Request) {
  const supabase = createServerSupabase();
  const st = await mpStatus(supabase);
  if (!st.ready || !st.enabled) {
    return NextResponse.json({ error: st.reason ?? "Pagos no disponibles." }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const batchId = String((body as { batch_id?: string }).batch_id ?? "");
  if (!batchId) return NextResponse.json({ error: "Falta batch_id" }, { status: 400 });

  const { data: rows } = await supabase.from("tickets").select("*").eq("batch_id", batchId);
  const tickets = (rows ?? []) as BatchTicket[];
  const payable = tickets.filter((t) => t.status === "pendiente");
  if (tickets.length === 0) return NextResponse.json({ error: "Reserva no encontrada." }, { status: 404 });
  if (payable.length === 0) {
    return NextResponse.json({ error: "Esta reserva ya fue procesada." }, { status: 400 });
  }

  // Total server-side: misma regla del front (promos + premio validado en la reserva)
  const { data: s } = await supabase.from("raffle_settings").select("ticket_price,currency").eq("id", 1).single();
  const unitPrice = Number((s as { ticket_price?: number } | null)?.ticket_price ?? 2000);
  const currency = String((s as { currency?: string } | null)?.currency ?? "ARS");
  const { data: pr } = await supabase.from("promos").select("*").eq("active", true);
  const promos = (pr ?? []) as Promo[];
  const paid = payable.filter((t) => !t.is_bonus);
  const q = bestQuote(paid.length, unitPrice, promos);
  const first = payable[0];
  const disc = first.prize_kind === "discount" ? Number(first.prize_value ?? 0) : 0;
  const total = disc > 0 && q.total > 0 ? Math.max(1, Math.round(q.total * (1 - disc / 100))) : Math.max(1, Math.round(q.total));
  const nums = paid.map((t) => t.number).sort((a, b) => a - b);

  try {
    const pref = new Preference(mpClient());
    const base = siteUrl();
    const back = (estado: string) => `${base}/pago?estado=${estado}&batch=${batchId}`;
    const result = await pref.create({
      body: {
        items: [
          {
            id: "tunumero",
            title: `Sorteo tunumero — ${paid.length} número${paid.length === 1 ? "" : "s"} (${nums.slice(0, 12).join(", ")}${nums.length > 12 ? "…" : ""})`,
            quantity: 1,
            unit_price: total,
            currency_id: currency === "ARS" ? "ARS" : currency
          }
        ],
        payer: { name: String(first.nombre ?? "Participante") },
        external_reference: batchId,
        notification_url: `${base}/api/mp/webhook`,
        back_urls: { success: back("exito"), pending: back("pendiente"), failure: back("error") },
        auto_return: "approved"
      }
    });
    const prefId = String(result.id ?? "");
    // Registra el intento (si la tabla no existe, el pago igual funciona; el admin no verá el registro)
    await supabase.from("mp_payments").insert({
      batch_id: batchId,
      mp_preference_id: prefId || null,
      status: "pending",
      amount: total,
      currency
    });
    return NextResponse.json({
      ok: true,
      init_point: result.init_point ?? result.sandbox_init_point,
      preference_id: prefId
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de MercadoPago";
    return NextResponse.json({ error: `No se pudo crear el pago: ${msg}` }, { status: 502 });
  }
}
