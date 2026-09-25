"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { isValidNumber, suggestNumbers, whatsappLink } from "@/lib/tickets";
import { createClient } from "@/lib/supabaseClient";
import { ChatIcon, CheckIcon, SearchIcon, TicketIcon, XIcon } from "./icons";
import CopyButton from "./CopyButton";

interface Props {
  taken: number[];
  whatsapp: string;
  min: number;
  max: number;
  alias: string;
  cuit: string;
  titular: string;
  bank: string;
}

const inputCls =
  "h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-slate-900 placeholder:text-slate-400 transition focus:border-brand-500 dark:border-white/10 dark:bg-night-800 dark:text-white dark:placeholder:text-slate-500";

export default function SearchNumber({ taken, whatsapp, min, max, alias, cuit, titular, bank }: Props) {
  const supabase = createClient();
  const takenSet = new Set(taken);
  const [q, setQ] = useState("");
  const [state, setState] = useState<"idle" | "free" | "taken">("idle");
  const [num, setNum] = useState<number | null>(null);
  const [suggest, setSuggest] = useState<number[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ nombre: "", apellido: "", dni: "", telefono: "" });
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const search = () => {
    const n = parseInt(q, 10);
    setDone(false);
    setError("");
    if (!isValidNumber(n, min, max)) {
      setError(`Ingresá un número entre ${min} y ${max}.`);
      return;
    }
    setNum(n);
    if (takenSet.has(n)) {
      setState("taken");
      setSuggest(suggestNumbers(n, takenSet, min, max));
    } else {
      setState("free");
    }
  };

  const reserve = async () => {
    if (num === null || saving) return;
    if (!form.nombre.trim() || !form.apellido.trim() || !form.dni.trim() || !form.telefono.trim()) {
      setError("Completá Nombre, Apellido, DNI y Teléfono.");
      return;
    }
    setError("");
    setSaving(true);
    const { error } = await supabase.from("tickets").insert({
      number: num,
      nombre: form.nombre.trim(),
      apellido: form.apellido.trim(),
      dni: form.dni.trim(),
      telefono: form.telefono.trim(),
      status: "pendiente",
      source: "web"
    });
    setSaving(false);
    if (error) {
      setError("Ese número se acaba de ocupar. Elegí otra sugerencia.");
      return;
    }
    setDone(true);
  };

  const wa = num !== null ? whatsappLink(whatsapp, { number: num, ...form }) : "#";

  const fields = [
    { key: "nombre", label: "Nombre", auto: "given-name", numeric: false },
    { key: "apellido", label: "Apellido", auto: "family-name", numeric: false },
    { key: "dni", label: "DNI", auto: "off", numeric: true },
    { key: "telefono", label: "Teléfono", auto: "tel", numeric: true }
  ] as const;

  return (
    <div className="rounded-3xl border border-brand-100 bg-white p-5 shadow-card dark:border-white/10 dark:bg-night-850 sm:p-7">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-glow">
          <SearchIcon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold leading-tight">Buscá tu número</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Del {min} al {max} · se asigna por orden de reserva</p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value.replace(/\D/g, "").slice(0, String(max).length || 4))}
          onKeyDown={(e) => e.key === "Enter" && search()}
          inputMode="numeric"
          aria-label="Número a buscar"
          placeholder="Ej: 123"
          className={`${inputCls} font-num text-center text-2xl font-bold tracking-widest`}
        />
        <button
          onClick={search}
          className="h-12 shrink-0 rounded-xl bg-brand-600 px-6 font-semibold text-white shadow-glow transition hover:bg-brand-700 active:scale-95"
        >
          Buscar
        </button>
      </div>
      {error && !showModal && (
        <p role="alert" className="mt-2 text-sm font-medium text-rose-500">{error}</p>
      )}

      {state === "free" && num !== null && (
        <div className="mt-4 animate-fade-up rounded-2xl border border-emerald-500/30 bg-emerald-50 p-4 dark:bg-emerald-500/10">
          <p className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-300">
            <CheckIcon className="h-5 w-5" />
            El <span className="font-num text-xl">{num}</span> está disponible
          </p>
          <button
            onClick={() => { setShowModal(true); setDone(false); setError(""); }}
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 font-semibold text-white shadow-glow transition hover:bg-brand-700 active:scale-[.98]"
          >
            <TicketIcon className="h-5 w-5" />
            Elegir este número
          </button>
        </div>
      )}

      {state === "taken" && num !== null && (
        <div className="mt-4 animate-fade-up rounded-2xl border border-amber-500/30 bg-amber-50 p-4 dark:bg-amber-500/10">
          <p className="font-semibold text-amber-800 dark:text-amber-200">
            El <span className="font-num">{num}</span> ya está ocupado. Probá con estos libres:
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {suggest.map((s) => (
              <button
                key={s}
                onClick={() => { setQ(String(s)); setNum(s); setState("free"); setError(""); }}
                className="tnum h-10 min-w-[3.5rem] rounded-xl border border-brand-200 bg-white px-3 font-bold text-brand-700 transition hover:border-brand-500 hover:bg-brand-50 active:scale-95 dark:border-white/10 dark:bg-night-800 dark:text-brand-300 dark:hover:bg-night-700"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {showModal && num !== null && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-night-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-md animate-pop-in overflow-hidden rounded-t-3xl bg-white shadow-card dark:bg-night-850 sm:rounded-3xl">
            <div className="max-h-[92dvh] overflow-y-auto">
            <div className="bg-gradient-to-r from-brand-700 to-brand-500 px-5 py-4 text-white sm:px-6 sm:py-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium uppercase tracking-widest text-brand-100">Reservando</p>
                <button onClick={() => setShowModal(false)} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25">
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
              <p className="tnum mt-1 font-num text-4xl font-extrabold tracking-tight sm:text-5xl">N° {num}</p>
            </div>

            {!done ? (
              <div className="p-5 sm:p-6">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {fields.map((f) => (
                    <label key={f.key} className="block text-sm font-medium">
                      {f.label} <span className="text-rose-500">*</span>
                      <input
                        value={form[f.key]}
                        autoComplete={f.auto}
                        inputMode={f.numeric ? "numeric" : undefined}
                        onChange={(e) => setForm({
                          ...form,
                          [f.key]: f.numeric ? e.target.value.replace(/\D/g, "") : e.target.value
                        })}
                        className={`${inputCls} mt-1 h-12 text-base`}
                      />
                    </label>
                  ))}
                </div>
                {error && <p role="alert" className="mt-3 text-sm font-medium text-rose-500">{error}</p>}
                <button
                  onClick={reserve}
                  disabled={saving}
                  className="mt-4 h-12 w-full rounded-xl bg-brand-600 font-semibold text-white shadow-glow transition hover:bg-brand-700 active:scale-[.98] disabled:opacity-60"
                >
                  {saving ? "Reservando…" : "Reservar número"}
                </button>
              </div>
            ) : (
              <div className="p-6 text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                  <CheckIcon className="h-7 w-7" />
                </span>
                <h3 className="mt-3 text-lg font-bold">¡Número reservado!</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Quedó <b>pendiente de pago</b>. Enviá el comprobante de pago por WhatsApp para que un administrador lo valide.
                </p>
                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-left dark:border-white/10 dark:bg-night-800">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Alias para abonar
                    </p>
                    <p className="tnum truncate font-mono text-sm font-bold">{alias}</p>
                  </div>
                  <CopyButton text={alias} label="Alias" />
                </div>
                <dl className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100 px-4 text-left text-sm dark:divide-white/5 dark:border-white/10">
                  {[
                    { label: "CUIT", value: cuit },
                    { label: "Titular", value: titular },
                    { label: "Banco / Billetera", value: bank }
                  ].map((r) => (
                    <div key={r.label} className="flex items-center justify-between gap-3 py-2">
                      <dt className="text-xs font-medium uppercase tracking-wider text-slate-400">{r.label}</dt>
                      <dd className="tnum truncate font-mono text-xs font-semibold">{r.value}</dd>
                    </div>
                  ))}
                </dl>
                <a
                  href={wa}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#1faa55] px-4 py-3 font-bold text-white transition hover:brightness-110 active:scale-[.98]"
                >
                  <ChatIcon className="h-5 w-5" />
                  Confirmar por WhatsApp
                </a>
                <button onClick={() => setShowModal(false)} className="mt-2 h-11 w-full rounded-xl border border-slate-300 font-medium transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-night-800">
                  Cerrar
                </button>
              </div>
            )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
