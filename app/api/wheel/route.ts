import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabaseServer";
import { wheelActiveNow, type WheelConfig, type WheelSegment } from "@/lib/tickets";

/** GET → estado vigente (horario evaluado en el servidor) + catálogo activo */
export async function GET() {
  const supabase = createServerSupabase();
  const { data: cfg } = await supabase.from("wheel_config").select("*").eq("id", 1).single();
  const config = cfg as WheelConfig | null;
  const active = config ? wheelActiveNow(config) : false;
  let segments: WheelSegment[] = [];
  if (active) {
    const { data: segs } = await supabase
      .from("wheel_segments")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (segs) segments = segs as WheelSegment[];
  }
  return NextResponse.json({
    active: active && segments.length > 0,
    segments,
    prize_minutes: config?.prize_minutes ?? 20,
    upsell_enabled: config?.upsell_enabled ?? true,
    upsell_seconds: config?.upsell_seconds ?? 20,
    serverNow: new Date().toISOString()
  });
}

interface SpinRow {
  id: string;
  session_key: string;
  segment_id: string | null;
  label: string;
  kind: string;
  value: number;
  expires_at: string;
  used_at: string | null;
}

/** POST {op:'spin'|'validate'|'apply', ...} — el servidor elige y valida el premio */
export async function POST(req: Request) {
  const supabase = createServerSupabase();
  const body = await req.json().catch(() => ({}));
  const { op, session_key, spin_id, batch_id } = body as {
    op: string; session_key?: string; spin_id?: string; batch_id?: string;
  };
  const sessionKey = String(session_key ?? "").slice(0, 64);
  if (!sessionKey || !["spin", "validate", "apply"].includes(op)) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }

  const { data: cfg } = await supabase.from("wheel_config").select("*").eq("id", 1).single();
  const config = cfg as WheelConfig | null;
  const prizeMinutes = Math.max(1, Math.min(180, Number(config?.prize_minutes ?? 20)));

  if (op === "spin") {
    if (!config || !wheelActiveNow(config)) {
      return NextResponse.json({ error: "La ruleta no está activa en este momento." }, { status: 403 });
    }
    // Reutiliza el giro vigente de la sesión (1 premio por sesión)
    const { data: existing } = await supabase
      .from("wheel_spins")
      .select("*")
      .eq("session_key", sessionKey)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      const s = existing as SpinRow;
      return NextResponse.json({
        ok: true,
        prize: { spinId: s.id, segmentId: s.segment_id, label: s.label, kind: s.kind, value: Number(s.value), expiresAt: s.expires_at }
      });
    }
    const { data: segs } = await supabase
      .from("wheel_segments")
      .select("*")
      .eq("active", true)
      .gt("weight", 0)
      .order("sort_order", { ascending: true });
    const pool = (segs ?? []) as WheelSegment[];
    if (pool.length === 0) return NextResponse.json({ error: "Sin premios configurados." }, { status: 400 });
    // Sorteo ponderado por peso
    const totalW = pool.reduce((a, s) => a + Number(s.weight), 0);
    let r = Math.random() * totalW;
    let win = pool[0];
    for (const s of pool) {
      r -= Number(s.weight);
      if (r <= 0) { win = s; break; }
    }
    const expiresAt = new Date(Date.now() + prizeMinutes * 60_000).toISOString();
    const { data: ins, error } = await supabase
      .from("wheel_spins")
      .insert({
        session_key: sessionKey,
        segment_id: win.id,
        label: win.label,
        kind: win.kind,
        value: win.value,
        expires_at: expiresAt
      })
      .select("id")
      .single();
    if (error || !ins) return NextResponse.json({ error: "No se pudo registrar el giro." }, { status: 500 });
    return NextResponse.json({
      ok: true,
      prize: { spinId: (ins as { id: string }).id, segmentId: win.id, label: win.label, kind: win.kind, value: Number(win.value), expiresAt }
    });
  }

  // validate / apply: el spin debe existir, ser de la sesión, no usado y no expirado
  if (!spin_id) return NextResponse.json({ error: "Falta spin_id" }, { status: 400 });
  const { data: row } = await supabase.from("wheel_spins").select("*").eq("id", spin_id).maybeSingle();
  const s = row as SpinRow | null;
  if (!s || s.session_key !== sessionKey) {
    return NextResponse.json({ ok: false, error: "Premio inválido." }, { status: 403 });
  }
  if (s.used_at || new Date(s.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: "El premio venció. Girás de nuevo la próxima." }, { status: 410 });
  }
  if (op === "validate") {
    return NextResponse.json({
      ok: true,
      prize: { spinId: s.id, segmentId: s.segment_id, label: s.label, kind: s.kind, value: Number(s.value), expiresAt: s.expires_at }
    });
  }
  // apply: marca usado (1 sola vez, enforced también por RLS)
  const { error } = await supabase
    .from("wheel_spins")
    .update({ used_at: new Date().toISOString(), used_batch_id: batch_id ?? null })
    .eq("id", s.id)
    .is("used_at", null);
  if (error) return NextResponse.json({ ok: false, error: "El premio ya fue usado." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
