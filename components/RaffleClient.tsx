"use client";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  isValidNumber, packOptions, formatMoney, quoteFor, whatsappBatchLink,
  type Promo
} from "@/lib/tickets";
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
  unitPrice: number;
  currency: string;
  promos: Promo[];
}

const PAGE_SIZE = 100;

const inputCls =
  "h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-slate-900 placeholder:text-slate-400 transition focus:border-brand-500 dark:border-white/10 dark:bg-night-800 dark:text-white dark:placeholder:text-slate-500";

export default function RaffleClient(props: Props) {
  const { taken, whatsapp, min, max, alias, cuit, titular, bank, unitPrice, currency, promos } = props;
  const supabase = createClient();
  const takenSet = useMemo(() => new Set(taken), [taken]);
  const packs = useMemo(() => packOptions(unitPrice, currency, promos), [unitPrice, currency, promos]);

  const [packId, setPackId] = useState("single");
  const pack = packs.find((p) => p.id === packId) ?? packs[0];
  const [selected, setSelected] = useState<number[]>([]);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [highlight, setHighlight] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ nombre: "", apellido: "", dni: "", telefono: "" });
  const [done, setDone] = useState(false);
  const [batch, setBatch] = useState<number[]>([]);
  const [error, setError] = useState("");

  const totalPages = Math.max(1, Math.ceil((max - min + 1) / PAGE_SIZE));
  const pageStart = min + page * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE - 1, max);
  const pageNumbers = useMemo(() => {
    const arr: number[] = [];
    for (let n = pageStart; n <= pageEnd; n++) arr.push(n);
    return arr;
  }, [pageStart, pageEnd]);

  const freeOnPage = pageNumbers.filter((n) => !takenSet.has(n)).length;

  // Cotización: pack fijo o (modo abierto) promo exacta / suma unitaria
  const quote = pack.open ? quoteFor(selected.length, unitPrice, promos) : { total: pack.price, promo: null };
  const canReserve = pack.open ? selected.length >= 1 : selected.length === pack.quantity;
  const reserveLabel = pack.open && quote.promo
    ? `${quote.promo.name} aplicada`
    : pack.open
      ? `${selected.length} número${selected.length === 1 ? "" : "s"}`
      : pack.quantity === 1 ? "número" : `${pack.quantity} números`;

  const toggle = (n: number) => {
    if (takenSet.has(n)) return;
    setSelected((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n);
      if (!pack.open && prev.length >= pack.quantity) return prev;
      return [...prev, n].sort((a, b) => a - b);
    });
  };

  const choosePack = (id: string) => {
    const p = packs.find((x) => x.id === id) ?? packs[0];
    setPackId(p.id);
    if (!p.open) setSelected((prev) => prev.slice(0, p.quantity));
  };

  const goToNumber = (n: number) => {
    setPage(Math.floor((n - min) / PAGE_SIZE));
    setHighlight(n);
  };

  const search = () => {
    const n = parseInt(q, 10);
    setDone(false);
    setError("");
    if (!isValidNumber(n, min, max)) {
      setError(`Ingresá un número entre ${min} y ${max}.`);
      return;
    }
    goToNumber(n);
    if (!takenSet.has(n)) {
      setSelected((prev) => {
        if (prev.includes(n)) return prev;
        if (!pack.open && prev.length >= pack.quantity) return prev;
        return [...prev, n].sort((a, b) => a - b);
      });
    }
  };

  const reserve = async () => {
    if (saving || !canReserve) return;
    if (!form.nombre.trim() || !form.apellido.trim() || !form.dni.trim() || !form.telefono.trim()) {
      setError("Completá Nombre, Apellido, DNI y Teléfono.");
      return;
    }
    setError("");
    setSaving(true);
    const batchId = crypto.randomUUID();
    const rows = selected.map((number) => ({
      number,
      nombre: form.nombre.trim(),
      apellido: form.apellido.trim(),
      dni: form.dni.trim(),
      telefono: form.telefono.trim(),
      status: "pendiente",
      source: "web",
      batch_id: batchId
    }));
    const { error } = await supabase.from("tickets").insert(rows);
    setSaving(false);
    if (error) {
      setError("Uno de los números se acaba de ocupar. Revisá la selección.");
      return;
    }
    setBatch([...selected]);
    setDone(true);
  };

  const openModal = () => {
    if (!canReserve) return;
    setDone(false);
    setError("");
    setShowModal(true);
  };

  const waNumbers = done ? batch : selected;
  const waPackName = !pack.open
    ? (pack.quantity === 1 ? "Número elegido" : pack.name)
    : quote.promo
      ? quote.promo.name
      : waNumbers.length === 1 ? "Número elegido" : "Números elegidos";
  const wa = whatsappBatchLink(whatsapp, {
    numbers: waNumbers,
    packName: waPackName,
    total: quote.total,
    currency,
    ...form
  });

  const fields = [
    { key: "nombre", label: "Nombre", auto: "given-name", numeric: false },
    { key: "apellido", label: "Apellido", auto: "family-name", numeric: false },
    { key: "dni", label: "DNI", auto: "off", numeric: true },
    { key: "telefono", label: "Teléfono", auto: "tel", numeric: true }
  ] as const;

  return (
    <div className="space-y-4">
      {/* Buscador */}
      <div className="rounded-3xl border border-brand-100 bg-white p-5 shadow-card dark:border-white/10 dark:bg-night-850 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-glow">
            <SearchIcon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold leading-tight">Buscá tu número</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Del {min} al {max} · o elegilo en el tablero</p>
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
          <button onClick={search} className="h-12 shrink-0 rounded-xl bg-brand-600 px-6 font-semibold text-white shadow-glow transition hover:bg-brand-700 active:scale-95">
            Buscar
          </button>
        </div>
        {error && <p role="alert" className="mt-2 text-sm font-medium text-rose-500">{error}</p>}
      </div>

      {/* Promos */}
      {packs.length > 1 && (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {packs.map((p) => (
            <button
              key={p.id}
              onClick={() => choosePack(p.id)}
              aria-pressed={packId === p.id}
              className={`flex h-11 items-center justify-center gap-1.5 truncate rounded-2xl border px-2 text-[13px] font-bold transition active:scale-95 sm:h-12 sm:px-4 sm:text-sm ${
                packId === p.id
                  ? "border-brand-600 bg-brand-600 text-white shadow-glow"
                  : "border-brand-200 bg-white text-brand-800 dark:border-white/10 dark:bg-night-850 dark:text-brand-200"
              }`}
            >
              <TicketIcon className="h-4 w-4 shrink-0" />
              <span className="truncate">{p.name} · {formatMoney(p.price, currency)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Tablero */}
      <div className="rounded-3xl border border-brand-100 bg-white p-4 shadow-card dark:border-white/10 dark:bg-night-850 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">Tablero <span className="tnum font-num text-brand-700 dark:text-brand-300">{pageStart}–{pageEnd}</span></h2>
          <div className="flex items-center gap-3 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-md border border-slate-300 bg-white dark:border-white/20 dark:bg-night-800" /> Libre</span>
            <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-md bg-brand-600" /> Elegido</span>
            <span className="flex items-center gap-1"><i className="h-3 w-3 rounded-md bg-rose-300 dark:bg-rose-500/50" /> Ocupado</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-5 gap-1.5 sm:grid-cols-10 sm:gap-2" role="group" aria-label="Tablero de números">
          {pageNumbers.map((n) => {
            const isTaken = takenSet.has(n);
            const isSel = selected.includes(n);
            const isHi = highlight === n;
            return (
              <button
                key={n}
                disabled={isTaken}
                onClick={() => toggle(n)}
                aria-pressed={isSel}
                aria-label={`Número ${n}${isTaken ? " ocupado" : isSel ? " elegido" : " libre"}`}
                className={`tnum flex h-11 items-center justify-center rounded-xl font-num text-sm font-bold transition active:scale-95 ${
                  isTaken
                    ? "cursor-not-allowed bg-rose-100 text-rose-300 dark:bg-rose-500/15 dark:text-rose-500/60"
                    : isSel
                      ? "bg-brand-600 text-white shadow-glow"
                      : "border border-slate-200 bg-white hover:border-brand-500 hover:text-brand-700 dark:border-white/10 dark:bg-night-800 dark:hover:border-brand-400"
                } ${isHi && !isTaken && !isSel ? "ring-2 ring-gold-400" : ""}`}
              >
                {n}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
            className="h-11 rounded-xl border border-slate-300 px-4 text-sm font-semibold transition hover:border-brand-500 disabled:opacity-40 dark:border-white/10">
            ← Anterior
          </button>
          <p className="tnum text-center text-xs text-slate-500 dark:text-slate-400">
            <span className="font-num font-bold text-slate-700 dark:text-slate-200">{freeOnPage}</span> libres aquí
          </p>
          <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            className="h-11 rounded-xl border border-slate-300 px-4 text-sm font-semibold transition hover:border-brand-500 disabled:opacity-40 dark:border-white/10">
            Siguiente →
          </button>
        </div>
        <div className="mt-2 flex items-center justify-center gap-2 text-sm">
          <label htmlFor="board-page" className="text-slate-500 dark:text-slate-400">Ir a:</label>
          <select id="board-page" value={page} onChange={(e) => setPage(Number(e.target.value))}
            className="h-11 max-w-[220px] rounded-xl border border-slate-300 bg-white px-3 font-num font-bold dark:border-white/10 dark:bg-night-800">
            {Array.from({ length: totalPages }, (_, i) => {
              const s = min + i * PAGE_SIZE;
              const e = Math.min(s + PAGE_SIZE - 1, max);
              return <option key={i} value={i}>{s}–{e}</option>;
            })}
          </select>
        </div>

        {/* Barra de selección */}
        <div className={`mt-4 rounded-2xl border p-4 transition ${selected.length > 0 ? "border-brand-500/40 bg-brand-50 dark:bg-brand-500/10" : "border-slate-100 dark:border-white/5"}`}>
          {selected.length === 0 ? (
            <p className="text-center text-sm text-slate-500 dark:text-slate-400">
              {pack.open
                ? `Tocá los números que quieras (${pack.name} · ${formatMoney(pack.price, currency)} c/u)`
                : `Tocá hasta ${pack.quantity} números (${pack.name} · ${formatMoney(pack.price, currency)})`}
            </p>
          ) : (
            <>
              <p className="text-sm">
                <b>Elegidos ({selected.length}{pack.open ? "" : `/${pack.quantity}`}):</b>{" "}
                <span className="tnum font-num font-bold text-brand-700 dark:text-brand-300">{selected.join(" · ")}</span>
              </p>
              <p className="tnum mt-1 text-sm font-bold">
                Total: {formatMoney(quote.total, currency)}
                {quote.promo && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">{quote.promo.name} aplicada</span>}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button onClick={() => setSelected([])} className="h-12 rounded-xl border border-slate-300 px-4 text-sm font-semibold transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-night-800">
                  Limpiar
                </button>
                <button onClick={openModal} disabled={!canReserve}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 font-semibold text-white shadow-glow transition hover:bg-brand-700 active:scale-[.98] disabled:opacity-50">
                  <CheckIcon className="h-5 w-5" />
                  Reservar · {formatMoney(quote.total, currency)}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal reserva */}
      {showModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-night-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[92dvh] w-full max-w-md animate-pop-in overflow-y-auto rounded-t-3xl bg-white shadow-card dark:bg-night-850 sm:rounded-3xl">
            <div className="bg-gradient-to-r from-brand-700 to-brand-500 px-5 py-4 text-white sm:px-6 sm:py-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium uppercase tracking-widest text-brand-100">Reservando {pack.open ? reserveLabel : pack.quantity > 1 ? pack.name : ""}</p>
                <button onClick={() => setShowModal(false)} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 transition hover:bg-white/25">
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
              <p className="tnum mt-1 font-num text-3xl font-extrabold tracking-tight sm:text-4xl">
                {(done ? batch : selected).join(" · ")}
              </p>
              <p className="mt-1 text-sm font-semibold text-brand-100">Total: {formatMoney(quote.total, currency)}</p>
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
                <button onClick={reserve} disabled={saving}
                  className="mt-4 h-12 w-full rounded-xl bg-brand-600 font-semibold text-white shadow-glow transition hover:bg-brand-700 active:scale-[.98] disabled:opacity-60">
                  {saving ? "Reservando…" : `Reservar ${reserveLabel}`}
                </button>
              </div>
            ) : (
              <div className="p-5 text-center sm:p-6">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                  <CheckIcon className="h-7 w-7" />
                </span>
                <h3 className="mt-3 text-lg font-bold">¡Reserva registrada!</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Quedó <b>pendiente de pago</b>. Enviá el comprobante de pago por WhatsApp para que un administrador lo valide.
                </p>
                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-left dark:border-white/10 dark:bg-night-800">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Alias para abonar</p>
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
                <a href={wa} target="_blank" rel="noreferrer"
                  className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#1faa55] px-4 py-3 font-bold text-white transition hover:brightness-110 active:scale-[.98]">
                  <ChatIcon className="h-5 w-5" />
                  Confirmar por WhatsApp
                </a>
                <button onClick={() => setShowModal(false)} className="mt-2 h-11 w-full rounded-xl border border-slate-300 font-medium transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-night-800">
                  Cerrar
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
