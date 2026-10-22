import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabaseAdmin";
import { fetchActiveNumbers } from "@/lib/serverData";
import { pickFreeNumbers } from "@/lib/tickets";

interface SpinRow {
  id: string;
  session_key: string;
  segment_id: string | null;
  label: string;
  kind: "discount" | "bonus" | "multiplier";
  value: number;
  expires_at: string;
  used_at: string | null;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** POST { numbers, form, spin? } — alta de reserva validada y con premio revalidado en servidor. */
export async function POST(req: Request) {
  try {
    const supabase = createServiceSupabase();
    const body = await req.json().catch(() => ({}));
    const numbersRaw = (body as { numbers?: unknown }).numbers;
    const formRaw = (body as { form?: Record<string, unknown> }).form ?? {};
    const spinInput = (body as { spin?: { spin_id?: unknown; session_key?: unknown } | null }).spin ?? null;

    const numbers = Array.isArray(numbersRaw) ? numbersRaw.map((n) => Number(n)) : [];
    if (numbers.length < 1 || numbers.length > 60) {
      return NextResponse.json({ error: "Elegí entre 1 y 60 números." }, { status: 400 });
    }
    if (new Set(numbers).size !== numbers.length || !numbers.every(Number.isInteger)) {
      return NextResponse.json({ error: "La selección de números no es válida." }, { status: 400 });
    }

    const nombre = text(formRaw.nombre, 80);
    const apellido = text(formRaw.apellido, 80);
    const dni = text(formRaw.dni, 20);
    const telefono = text(formRaw.telefono, 30);
    if (!nombre || !apellido || !dni || !telefono) {
      return NextResponse.json({ error: "Completá Nombre, Apellido, DNI y Teléfono." }, { status: 400 });
    }

    const { data: settings, error: settingsError } = await supabase
      .from("raffle_settings")
      .select("site_enabled,min_number,max_number")
      .eq("id", 1)
      .single();
    if (settingsError || !settings) {
      return NextResponse.json({ error: "No se pudo leer la configuración del sorteo." }, { status: 500 });
    }
    if ((settings as { site_enabled?: boolean }).site_enabled === false) {
      return NextResponse.json(
        { error: "El sitio está en mantenimiento. Probá de nuevo más tarde." },
        { status: 423 }
      );
    }

    const min = Number((settings as { min_number?: number }).min_number ?? 0);
    const max = Number((settings as { max_number?: number }).max_number ?? 4999);
    if (!numbers.every((n) => n >= min && n <= max)) {
      return NextResponse.json({ error: `Los números deben estar entre ${min} y ${max}.` }, { status: 400 });
    }

    let spin: SpinRow | null = null;
    if (spinInput?.spin_id) {
      const spinId = String(spinInput.spin_id);
      const sessionKey = String(spinInput.session_key ?? "").slice(0, 64);
      if (!sessionKey) {
        return NextResponse.json({ error: "Premio inválido." }, { status: 400 });
      }
      const { data: row, error: spinError } = await supabase
        .from("wheel_spins")
        .select("*")
        .eq("id", spinId)
        .maybeSingle();
      if (spinError) {
        return NextResponse.json({ error: "No se pudo validar el premio." }, { status: 500 });
      }
      const candidate = row as SpinRow | null;
      const expired = candidate ? new Date(candidate.expires_at).getTime() <= Date.now() : true;
      if (!candidate || candidate.session_key !== sessionKey || candidate.used_at || expired) {
        return NextResponse.json(
          { code: "prize", error: "Tu premio de la ruleta venció. Podés reservar igual sin premio." },
          { status: 409 }
        );
      }
      if (!["discount", "bonus", "multiplier"].includes(candidate.kind) || !(Number(candidate.value) > 0)) {
        return NextResponse.json({ code: "prize", error: "El premio no es válido." }, { status: 409 });
      }
      spin = candidate;
    }

    let extraCount = 0;
    if (spin) {
      if (spin.kind === "bonus") extraCount = Math.floor(Number(spin.value));
      if (spin.kind === "multiplier") {
        extraCount = Math.max(0, Math.round(numbers.length * (Number(spin.value) - 1)));
      }
    }
    if (numbers.length + extraCount > 200) {
      return NextResponse.json(
        { code: "prize", error: "El premio supera el máximo permitido. Podés reservar sin premio." },
        { status: 400 }
      );
    }

    let taken: number[];
    try {
      taken = await fetchActiveNumbers(supabase, min, max);
    } catch {
      return NextResponse.json({ error: "No se pudo verificar la disponibilidad." }, { status: 500 });
    }
    const takenSet = new Set(taken);
    if (numbers.some((n) => takenSet.has(n))) {
      return NextResponse.json(
        { error: "Uno de los números se acaba de ocupar. Revisá la selección." },
        { status: 409 }
      );
    }

    const extras = extraCount > 0
      ? pickFreeNumbers(extraCount, takenSet, numbers, min, max)
      : [];
    if (extras.length < extraCount) {
      return NextResponse.json(
        { error: "No hay suficientes números libres para aplicar el premio." },
        { status: 409 }
      );
    }

    const batchId = crypto.randomUUID();

    if (spin) {
      const { data: claimed, error: claimError } = await supabase
        .from("wheel_spins")
        .update({ used_at: new Date().toISOString(), used_batch_id: batchId })
        .eq("id", spin.id)
        .eq("session_key", spin.session_key)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .select("id")
        .maybeSingle();
      if (claimError || !claimed) {
        return NextResponse.json(
          { code: "prize", error: "Tu premio de la ruleta venció. Podés reservar igual sin premio." },
          { status: 409 }
        );
      }
    }

    const prizeCols = spin
      ? { prize_label: spin.label, prize_kind: spin.kind, prize_value: Number(spin.value) }
      : {};
    const base = {
      nombre,
      apellido,
      dni,
      telefono,
      status: "pendiente",
      source: "web",
      batch_id: batchId
    };
    const rows = [
      ...numbers.map((number) => ({ ...base, number, is_bonus: false, ...prizeCols })),
      ...extras.map((number) => ({ ...base, number, is_bonus: true, ...prizeCols }))
    ];

    const { error: insertError } = await supabase.from("tickets").insert(rows);
    if (insertError) {
      if (spin) {
        await supabase
          .from("wheel_spins")
          .update({ used_at: null, used_batch_id: null })
          .eq("id", spin.id)
          .eq("used_batch_id", batchId);
      }
      const conflict = insertError.code === "23505" || /duplicate|unique/i.test(insertError.message);
      return NextResponse.json(
        { error: conflict ? "Uno de los números se acaba de ocupar. Revisá la selección." : "No se pudo guardar la reserva." },
        { status: conflict ? 409 : 500 }
      );
    }

    const selected = [...numbers].sort((a, b) => a - b);
    const allNumbers = [...selected, ...extras].sort((a, b) => a - b);
    return NextResponse.json({
      ok: true,
      batch_id: batchId,
      numbers: allNumbers,
      selected,
      extras,
      prize: spin
        ? { label: spin.label, kind: spin.kind, value: Number(spin.value), expiresAt: spin.expires_at }
        : null
    });
  } catch (error) {
    console.error("[reservations] error:", error);
    return NextResponse.json({ error: "No se pudo procesar la reserva." }, { status: 500 });
  }
}
