"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import type { Promo } from "@/lib/tickets";
import { TicketIcon, TrashIcon } from "./icons";

interface Props {
  promos: Promo[];
  newPromo: { name: string; quantity: number; price: number };
  setNewPromo: (v: { name: string; quantity: number; price: number }) => void;
  reload: () => void;
  say: (t: string, ok?: boolean) => void;
}

const inputCls =
  "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-white/10 dark:bg-night-800";

export default function PromoManager({ promos, newPromo, setNewPromo, reload, say }: Props) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Record<string, { quantity: number; price: number }>>({});

  const add = async () => {
    const qty = Math.floor(Number(newPromo.quantity));
    const price = Number(newPromo.price);
    if (!newPromo.name.trim() || !Number.isInteger(qty) || qty < 2 || qty > 100 || !(price >= 0)) {
      say("Promo inválida: nombre, cantidad 2–100 y precio ≥ 0.", false);
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("promos").insert({
      name: newPromo.name.trim(), quantity: qty, price,
      active: true, sort_order: promos.length
    });
    setBusy(false);
    say(error ? `Error: ${error.message}` : `Promo "${newPromo.name.trim()}" creada.`, !error);
    if (!error) reload();
  };

  const toggle = async (p: Promo) => {
    const supabase = createClient();
    const { error } = await supabase.from("promos").update({ active: !p.active }).eq("id", p.id);
    say(error ? `Error: ${error.message}` : `Promo ${!p.active ? "activada" : "pausada"}.`, !error);
    if (!error) reload();
  };

  const saveEdit = async (p: Promo) => {
    const e = editing[p.id];
    if (!e) return;
    const qty = Math.floor(Number(e.quantity));
    const price = Number(e.price);
    if (!Number.isInteger(qty) || qty < 2 || qty > 100 || !(price >= 0)) {
      say("Cantidad 2–100 y precio ≥ 0.", false);
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("promos").update({ quantity: qty, price }).eq("id", p.id);
    say(error ? `Error: ${error.message}` : "Promo actualizada.", !error);
    if (!error) {
      setEditing((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      reload();
    }
  };

  const remove = async (p: Promo) => {
    if (!confirm(`¿Eliminar "${p.name}"?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("promos").delete().eq("id", p.id);
    say(error ? `Error: ${error.message}` : "Promo eliminada.", !error);
    if (!error) reload();
  };

  return (
    <div className="mt-6 border-t border-slate-100 pt-5 dark:border-white/5">
      <h3 className="flex items-center gap-2 font-bold">
        <TicketIcon className="h-5 w-5 text-brand-600 dark:text-brand-300" />
        Promociones (packs)
      </h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Ej. "Promo 3 x $5000". El cliente elige el pack y el tablero limita la cantidad.
      </p>

      <div className="mt-3 space-y-2">
        {promos.map((p) => {
          const e = editing[p.id];
          return (
            <div key={p.id} className={`rounded-2xl border p-3 ${p.active ? "border-brand-200 dark:border-white/10" : "border-slate-200 opacity-60 dark:border-white/5"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold">{p.name}</p>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button onClick={() => toggle(p)} aria-pressed={p.active} disabled={busy}
                    className={`h-9 rounded-lg px-3 text-xs font-bold transition disabled:opacity-50 ${p.active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-night-700"}`}>
                    {p.active ? "Activa" : "Pausada"}
                  </button>
                  <button onClick={() => remove(p)} disabled={busy} aria-label={`Eliminar ${p.name}`}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 text-rose-600 transition disabled:opacity-40 dark:border-rose-500/30 dark:text-rose-300">
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {e ? (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <label className="text-xs">Cant.
                    <input type="number" min={2} max={100} value={e.quantity}
                      onChange={(ev) => setEditing({ ...editing, [p.id]: { ...e, quantity: Number(ev.target.value) } })}
                      className={`${inputCls} tnum mt-1`} />
                  </label>
                  <label className="text-xs">Precio
                    <input type="number" min={0} value={e.price}
                      onChange={(ev) => setEditing({ ...editing, [p.id]: { ...e, price: Number(ev.target.value) } })}
                      className={`${inputCls} tnum mt-1`} />
                  </label>
                  <div className="flex items-end gap-1">
                    <button onClick={() => saveEdit(p)} className="h-11 flex-1 rounded-xl bg-brand-600 text-xs font-bold text-white">OK</button>
                    <button onClick={() => setEditing((prev) => { const n = { ...prev }; delete n[p.id]; return n; })}
                      className="h-11 flex-1 rounded-xl border text-xs font-bold">X</button>
                  </div>
                </div>
              ) : (
                <div className="mt-1 flex items-center justify-between gap-2 text-sm">
                  <p className="tnum text-slate-500 dark:text-slate-400">
                    {p.quantity} números · ${Number(p.price).toLocaleString("es-AR")}
                  </p>
                  <button onClick={() => setEditing({ ...editing, [p.id]: { quantity: p.quantity, price: Number(p.price) } })}
                    className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold transition hover:border-brand-400 dark:border-white/10">
                    Editar
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {promos.length === 0 && (
          <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500 dark:bg-night-800">Sin promos. Solo se vende de a 1 número.</p>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-dashed border-brand-300 p-3 dark:border-white/15">
        <label className="col-span-2 text-xs font-medium">Nombre
          <input value={newPromo.name} onChange={(e) => setNewPromo({ ...newPromo, name: e.target.value })}
            placeholder="Promo 3" className={`${inputCls} mt-1`} />
        </label>
        <label className="text-xs font-medium">Cantidad
          <input type="number" min={2} max={100} value={newPromo.quantity}
            onChange={(e) => setNewPromo({ ...newPromo, quantity: Number(e.target.value) })}
            className={`${inputCls} tnum mt-1`} />
        </label>
        <label className="text-xs font-medium">Precio
          <input type="number" min={0} value={newPromo.price}
            onChange={(e) => setNewPromo({ ...newPromo, price: Number(e.target.value) })}
            className={`${inputCls} tnum mt-1`} />
        </label>
        <button onClick={add} disabled={busy}
          className="col-span-2 h-11 rounded-xl bg-brand-600 text-sm font-bold text-white shadow-glow transition hover:bg-brand-700 disabled:opacity-50">
          {busy ? "Guardando…" : "Agregar promo"}
        </button>
      </div>
    </div>
  );
}
