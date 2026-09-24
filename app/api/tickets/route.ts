import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";

/** PATCH { id, action: 'confirm' | 'cancel', cancel_reason? } — registra quién confirma/cancela */
export async function PATCH(req: Request) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { id, action, cancel_reason } = body as { id: string; action: string; cancel_reason?: string };
  if (!id || !["confirm", "cancel"].includes(action)) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }

  const patch =
    action === "confirm"
      ? { status: "confirmado", confirmed_by: user.id, confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      : { status: "cancelado", cancelled_by: user.id, cancelled_at: new Date().toISOString(), cancel_reason: cancel_reason ?? "", updated_at: new Date().toISOString() };

  const { error } = await supabase.from("tickets").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, confirmed_by: action === "confirm" ? user.id : undefined });
}
