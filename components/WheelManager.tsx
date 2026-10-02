"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import type { WheelConfig, WheelKind, WheelSegment } from "@/lib/tickets";
import { SparkIcon, TrashIcon } from "./icons";

const inputCls =
  "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-white/10 dark:bg-night-800";

const KIND_LABEL: Record<WheelKind, string> = {
  discount: "% OFF",
  bonus: "+ chances",
  multiplier: "x pack"
};

const DAYS = [
  { v: 1, label: "Lun" },
  { v: 2, label: "Mar" },
  { v: 3, label: "Mié" },
  { v: 4, label: "Jue" },
  { v: 5, label: "Vie" },
  { v: 6, label: "Sáb" },
  { v: 0, label: "Dom" }
];

/** Pestaña Ruleta: maestro, vigencia, ventana diaria, premios, timers y upsell */
export default function WheelManager({ say }: { say: (t: string, ok?: boolean) => void }) {
  const [cfg, setCfg] = useState<WheelConfig | null>(null);
  const [draft, setDraft] = useState({
    enabled: false,
    starts_at: "",
    ends_at: "",
    daily_from: "",
    daily_to: "",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    prize_minutes: 20,
    upsell_enabled: true,
    upsell_seconds: 20
  });
  const [segs, setSegs] = useState<WheelSegment[]>([]);
  const [spins, setSpins] = useState({ total: 0, used: 0 });
  const [busy, setBusy] = useState(false);
  const [nu, setNu] = useState({ label: "", kind: "discount" as WheelKind, value: 10, weight: 10 });

  const toLocal = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const p = (x: number) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const toISO = (local: string) => (local ? new Date(local).getTime() ? new Date(local).toISOString() : null : null);

  const load = async () => {
    const supabase = createClient();
    const { data: c } = await supabase.from("wheel_config").select("*").eq("id", 1).single();
    if (c) {
      const cc = c as WheelConfig;
      setCfg(cc);
      setDraft({
        enabled: cc.enabled,
        starts_at: toLocal(cc.starts_at),
        ends_at: toLocal(cc.ends_at),
        daily_from: cc.daily_from ?? "",
        daily_to: cc.daily_to ?? "",
        weekdays: cc.weekdays?.length ? cc.weekdays : [0, 1, 2, 3, 4, 5, 6],
        prize_minutes: cc.prize_minutes ?? 20,
        upsell_enabled: cc.upsell_enabled ?? true,
        upsell_seconds: cc.upsell_seconds ?? 20
      });
    }
    const { data: s } = await supabase.from("wheel_segments").select("*").order("sort_order", { ascending: true });
    if (s) setSegs(s as WheelSegment[]);
    const { count: total } = await supabase.from("wheel_spins").select("id", { count: "exact", head: true });
    const { count: unused } = await supabase.from("wheel_spins").select("id", { count: "exact", head: true }).is("used_at", null);
    setSpins({ total: total ?? 0, used: (total ?? 0) - (unused ?? 0) });
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("wheel_config").update({
      enabled: draft.enabled,
      starts_at: toISO(draft.starts_at),
      ends_at: toISO(draft.ends_at),
      daily_from: draft.daily_from || null,
      daily_to: draft.daily_to || null,
      weekdays: draft.weekdays,
      prize_minutes: Math.max(1, Math.min(180, Math.floor(Number(draft.prize_minutes) || 20))),
      upsell_enabled: draft.upsell_enabled,
      upsell_seconds: Math.max(5, Math.min(120, Math.floor(Number(draft.upsell_seconds) || 20)))
    }).eq("id", 1);
    setBusy(false);
    say(error ? `Error: ${error.message}` : "Ruleta actualizada.", !error);
    if (!error) load();
  };

  const toggleDay = (v: number) => {
    setDraft((d) => ({
      ...d,
      weekdays: d.weekdays.includes(v) ? d.weekdays.filter((x) => x !== v) : [...d.weekdays, v].sort()
    }));
  };

  const segToggle = async (s: WheelSegment) => {
    const supabase = createClient();
    const { error } = await supabase.from("wheel_segments").update({ active: !s.active }).eq("id", s.id);
    say(error ? `Error: ${error.message}` : `Premio ${!s.active ? "activado" : "pausado"}.`, !error);
    if (!error) load();
  };

  const segRemove = async (s: WheelSegment) => {
    if (!confirm(`¿Eliminar "${s.label}"?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("wheel_segments").delete().eq("id", s.id);
    say(error ? `Error: ${error.message}` : "Premio eliminado.", !error);
    if (!error) load();
  };

  const segAdd = async () => {
    const val = Number(nu.value);
    const w = Math.floor(Number(nu.weight));
    if (!nu.label.trim() || !(val > 0) || !Number.isInteger(w) || w < 0) {
      say("Premio inválido: nombre, valor > 0 y peso entero ≥ 0.", false);
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("wheel_segments").insert({
      label: nu.label.trim(), kind: nu.kind, value: val, weight: w,
      active: true, sort_order: segs.length
    });
    setBusy(false);
    say(error ? `Error: ${error.message}` : `Premio "${nu.label.trim()}" creado.`, !error);
    if (!error) {
      setNu({ label: "", kind: "discount", value: 10, weight: 10 });
      load();
    }
  };

  const totalW = segs.filter((s) => s.active).reduce((a, s) => a + Number(s.weight), 0);

  return (
    <div className="space-y-4">
      {/* Interruptor maestro */}
      <section className="rounded-2xl border border-brand-100 bg-white p-5 shadow-card dark:border-white/10 dark:bg-night-850">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-bold">
            <SparkIcon className="h-5 w-5 text-brand-600 dark:text-brand-300" />
            Ruleta de premios
          </h2>
          <button
            onClick={() => setDraft((d) => ({ ...d, enabled: !d.enabled }))}
            aria-pressed={draft.enabled}
            className={`relative h-9 w-16 shrink-0 rounded-full transition ${draft.enabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-night-700"}`}
          >
            <span className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow transition-all ${draft.enabled ? "left-8" : "left-1"}`} />
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {draft.enabled ? "Activa (si el horario lo permite)." : "Apagada: los clientes no la ven."}
          {" "}Giros: <b className="tnum">{spins.total}</b> · premios usados: <b className="tnum">{spins.used}</b>
        </p>

        {/* Vigencia */}
        <h3 className="mt-4 text-sm font-bold">Vigencia (vacío = sin límite)</h3>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="text-xs font-medium">Desde
            <input type="datetime-local" value={draft.starts_at}
              onChange={(e) => setDraft({ ...draft, starts_at: e.target.value })}
              className={`${inputCls} mt-1`} />
          </label>
          <label className="text-xs font-medium">Hasta
            <input type="datetime-local" value={draft.ends_at}
              onChange={(e) => setDraft({ ...draft, ends_at: e.target.value })}
              className={`${inputCls} mt-1`} />
          </label>
        </div>

        {/* Ventana diaria */}
        <h3 className="mt-4 text-sm font-bold">Horario diario (hora Argentina, vacío = todo el día)</h3>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-xs font-medium">Desde
            <input type="time" value={draft.daily_from}
              onChange={(e) => setDraft({ ...draft, daily_from: e.target.value })}
              className={`${inputCls} tnum mt-1`} />
          </label>
          <label className="text-xs font-medium">Hasta
            <input type="time" value={draft.daily_to}
              onChange={(e) => setDraft({ ...draft, daily_to: e.target.value })}
              className={`${inputCls} tnum mt-1`} />
          </label>
        </div>

        {/* Días */}
        <h3 className="mt-4 text-sm font-bold">Días permitidos</h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DAYS.map((d) => (
            <button key={d.v} onClick={() => toggleDay(d.v)} aria-pressed={draft.weekdays.includes(d.v)}
              className={`h-10 min-w-[52px] rounded-xl border px-3 text-sm font-bold transition active:scale-95 ${
                draft.weekdays.includes(d.v)
                  ? "border-transparent bg-brand-600 text-white shadow-glow"
                  : "border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-400"
              }`}>
              {d.label}
            </button>
          ))}
        </div>
      </section>

      {/* Timers y upsell */}
      <section className="rounded-2xl border border-brand-100 bg-white p-5 shadow-card dark:border-white/10 dark:bg-night-850">
        <h3 className="font-bold">Tiempos y upsell</h3>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-xs font-medium">Validez del premio (min)
            <input type="number" min={1} max={180} value={draft.prize_minutes}
              onChange={(e) => setDraft({ ...draft, prize_minutes: Number(e.target.value) })}
              className={`${inputCls} tnum mt-1`} />
          </label>
          <label className="text-xs font-medium">Countdown upsell (seg)
            <input type="number" min={5} max={120} value={draft.upsell_seconds}
              onChange={(e) => setDraft({ ...draft, upsell_seconds: Number(e.target.value) })}
              className={`${inputCls} tnum mt-1`} />
          </label>
        </div>
        <button onClick={() => setDraft((d) => ({ ...d, upsell_enabled: !d.upsell_enabled }))}
          aria-pressed={draft.upsell_enabled}
          className="mt-2 flex h-11 w-full items-center justify-between rounded-xl border border-slate-200 px-3 text-sm font-semibold dark:border-white/10">
          <span>Upsell "Última oportunidad"</span>
          <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${draft.upsell_enabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-night-700"}`}>
            {draft.upsell_enabled ? "Activado" : "Apagado"}
          </span>
        </button>
        <button onClick={save} disabled={busy}
          className="mt-3 h-12 w-full rounded-xl bg-brand-600 font-bold text-white shadow-glow transition hover:bg-brand-700 active:scale-[.98] disabled:opacity-50">
          {busy ? "Guardando…" : "Guardar ruleta"}
        </button>
      </section>

      {/* Catálogo de premios */}
      <section className="rounded-2xl border border-brand-100 bg-white p-5 shadow-card dark:border-white/10 dark:bg-night-850">
        <h3 className="font-bold">Premios de la ruleta</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          El peso define la probabilidad (peso ÷ total {totalW || "—"}).
        </p>
        <div className="mt-3 space-y-2">
          {segs.map((s) => (
            <div key={s.id} className={`rounded-2xl border p-3 ${s.active ? "border-brand-200 dark:border-white/10" : "border-slate-200 opacity-60 dark:border-white/5"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold">{s.label}</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button onClick={() => segToggle(s)} aria-pressed={s.active}
                    className={`h-9 rounded-lg px-3 text-xs font-bold transition ${s.active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-night-700"}`}>
                    {s.active ? "Activo" : "Pausado"}
                  </button>
                  <button onClick={() => segRemove(s)} aria-label={`Eliminar ${s.label}`}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 text-rose-600 transition dark:border-rose-500/30 dark:text-rose-300">
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="tnum mt-1 text-sm text-slate-500 dark:text-slate-400">
                {KIND_LABEL[s.kind as WheelKind] ?? s.kind} · valor {Number(s.value)} · peso {s.weight}
                {totalW > 0 && s.active ? ` · ${Math.round((Number(s.weight) / totalW) * 100)}%` : ""}
              </p>
            </div>
          ))}
          {segs.length === 0 && (
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500 dark:bg-night-800">Sin premios. La ruleta no se muestra sin premios activos.</p>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-dashed border-brand-300 p-3 dark:border-white/15">
          <label className="col-span-2 text-xs font-medium">Nombre
            <input value={nu.label} onChange={(e) => setNu({ ...nu, label: e.target.value })}
              placeholder="20% de descuento" className={`${inputCls} mt-1`} />
          </label>
          <label className="text-xs font-medium">Tipo
            <select value={nu.kind} onChange={(e) => setNu({ ...nu, kind: e.target.value as WheelKind })}
              className={`${inputCls} mt-1`}>
              <option value="discount">% descuento</option>
              <option value="bonus">+ chances</option>
              <option value="multiplier">x pack</option>
            </select>
          </label>
          <label className="text-xs font-medium">Valor
            <input type="number" min={1} value={nu.value}
              onChange={(e) => setNu({ ...nu, value: Number(e.target.value) })}
              className={`${inputCls} tnum mt-1`} />
          </label>
          <label className="col-span-2 text-xs font-medium">Peso (probabilidad relativa)
            <input type="number" min={0} value={nu.weight}
              onChange={(e) => setNu({ ...nu, weight: Number(e.target.value) })}
              className={`${inputCls} tnum mt-1`} />
          </label>
          <button onClick={segAdd} disabled={busy}
            className="col-span-2 h-11 rounded-xl bg-brand-600 text-sm font-bold text-white shadow-glow transition hover:bg-brand-700 disabled:opacity-50">
            {busy ? "Guardando…" : "Agregar premio"}
          </button>
        </div>
      </section>
    </div>
  );
}
