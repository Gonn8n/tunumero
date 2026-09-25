"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import ThemeToggle from "@/components/ThemeToggle";
import PhotoManager from "@/components/PhotoManager";
import DownloadExcel from "@/components/DownloadExcel";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { totalNumbers, HARD_MIN, HARD_MAX, adminWhatsappLink, type Ticket } from "@/lib/tickets";
import {
  CheckIcon, ChatIcon, ClockIcon, CogIcon, LogoutIcon, PlusIcon,
  ShieldIcon, TicketIcon, UsersIcon, XIcon
} from "@/components/icons";

type Tab = "pendiente" | "reservado" | "confirmado" | "cancelado" | "historial" | "reservar" | "config";

interface HistoryEntry {
  id: number;
  ticket_id: string;
  number: number;
  action: string;
  actor_id: string | null;
  detail: string | null;
  created_at: string;
}

const inputCls =
  "h-12 w-full rounded-xl border border-slate-300 bg-white px-4 dark:border-white/10 dark:bg-night-800";

export default function AdminPanel() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [tab, setTab] = useState<Tab>("pendiente");
  const [userEmail, setUserEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [settings, setSettings] = useState({
    title: "", subtitle: "", description: "", draw_date: "",
    ticket_price: 2000, whatsapp_number: "", alias: "",
    transfer_holder: "", transfer_cbu: "", transfer_bank: "",
    min_number: 0, max_number: 4999
  });
  const [manual, setManual] = useState({ number: "", nombre: "", apellido: "", dni: "", telefono: "" });
  const [msg, setMsg] = useState("");
  const [msgOk, setMsgOk] = useState(true);
  const [checking, setChecking] = useState(true);
  const [adminNames, setAdminNames] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [histFilter, setHistFilter] = useState("");
  const router = useRouter();

  const say = (text: string, ok = true) => { setMsg(text); setMsgOk(ok); };

  const load = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/admin/login");
      return;
    }
    setUserEmail(user.email ?? "");
    const { data: prof } = await supabase.from("admin_profiles").select("display_name").eq("user_id", user.id).single();
    if (prof?.display_name) setDisplayName(prof.display_name as string);
    setChecking(false);
    const { data: profs } = await supabase.from("admin_profiles").select("user_id,display_name");
    if (profs) {
      const map: Record<string, string> = {};
      for (const p of profs as { user_id: string; display_name: string }[]) {
        map[p.user_id] = p.display_name;
      }
      setAdminNames(map);
    }
    const { data: tk } = await supabase.from("tickets").select("*").order("created_at", { ascending: false }).limit(2000);
    if (tk) setTickets(tk as Ticket[]);
    const { data: hist } = await supabase.from("ticket_history").select("*").order("created_at", { ascending: false }).limit(300);
    if (hist) setHistory(hist as HistoryEntry[]);
    const { data: s } = await supabase.from("raffle_settings").select("*").eq("id", 1).single();
    if (s) setSettings({
      title: s.title ?? "", subtitle: s.subtitle ?? "", description: s.description ?? "",
      draw_date: s.draw_date ? s.draw_date.slice(0, 16) : "",
      ticket_price: s.ticket_price ?? 2000, whatsapp_number: s.whatsapp_number ?? "",
      alias: s.alias ?? "", transfer_holder: s.transfer_holder ?? "",
      transfer_cbu: s.transfer_cbu ?? "", transfer_bank: s.transfer_bank ?? "",
      min_number: s.min_number ?? 0, max_number: s.max_number ?? 4999
    });
  };

  useEffect(() => { load(); }, []);

  const count = (st: string) => tickets.filter((t) => t.status === st).length;
  const rMin = Number(settings.min_number ?? 0);
  const rMax = Number(settings.max_number ?? 4999);
  const total = totalNumbers(rMin, rMax);
  const activeNums = new Set(
    tickets.filter((t) => ["pendiente", "reservado", "confirmado"].includes(t.status)).map((t) => t.number)
  );
  const disponibles = total - Array.from(activeNums).filter((n) => n >= rMin && n <= rMax).length;

  const act = async (id: string, action: "confirm" | "cancel") => {
    const reason = action === "cancel" ? prompt("Motivo de cancelación:") ?? "" : "";
    const res = await fetch("/api/tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, cancel_reason: reason })
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      say(j.error ?? "Error al procesar.", false);
      return;
    }
    say(action === "confirm" ? "Pago confirmado y registrado a tu nombre." : "Ticket cancelado, número liberado.");
    load();
  };

  const reserveManual = async () => {
    const n = parseInt(manual.number, 10);
    if (!Number.isInteger(n) || n < rMin || n > rMax) { say(`Número inválido (${rMin}-${rMax}).`, false); return; }
    if (!manual.nombre.trim() || !manual.apellido.trim() || !manual.dni.trim() || !manual.telefono.trim()) {
      say("Completá todos los datos.", false);
      return;
    }
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("tickets").insert({
      number: n, nombre: manual.nombre.trim(), apellido: manual.apellido.trim(),
      dni: manual.dni.trim(), telefono: manual.telefono.trim(),
      status: "reservado", source: "admin", created_by: user?.id ?? null
    });
    say(error ? "Ese número ya está ocupado." : `Número ${n} reservado.`, !error);
    if (!error) { setManual({ number: "", nombre: "", apellido: "", dni: "", telefono: "" }); load(); }
  };

  const saveSettings = async () => {
    const newMin = Math.floor(Number(settings.min_number));
    const newMax = Math.floor(Number(settings.max_number));
    if (!Number.isInteger(newMin) || !Number.isInteger(newMax)
        || newMin < HARD_MIN || newMax > HARD_MAX || newMin > newMax) {
      say(`Rango inválido. Usá números entre ${HARD_MIN} y ${HARD_MAX}, con mínimo ≤ máximo.`, false);
      return;
    }
    // Pre-chequeo: no achicar si hay activos fuera del nuevo rango (la DB también lo bloquea)
    const fuera = Array.from(activeNums).filter((n) => n < newMin || n > newMax);
    if (fuera.length > 0) {
      say(`No se puede achicar: hay ${fuera.length} número(s) activos fuera del rango ${newMin}–${newMax}. Cancelalos primero.`, false);
      return;
    }
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("raffle_settings").update({
      title: settings.title, subtitle: settings.subtitle, description: settings.description,
      draw_date: settings.draw_date ? new Date(settings.draw_date).toISOString() : null,
      ticket_price: Number(settings.ticket_price),
      whatsapp_number: settings.whatsapp_number.replace(/\D/g, ""),
      alias: settings.alias, transfer_holder: settings.transfer_holder,
      transfer_cbu: settings.transfer_cbu, transfer_bank: settings.transfer_bank,
      min_number: newMin, max_number: newMax,
      updated_at: new Date().toISOString(), updated_by: user?.id ?? null
    }).eq("id", 1);
    say(error ? `Error al guardar: ${error.message}` : `Configuración guardada. Rango ${newMin}–${newMax} (${totalNumbers(newMin, newMax)} números).`, !error);
    if (!error) load();
  };

  const logout = async () => {
    await createClient().auth.signOut();
    router.push("/admin/login");
  };

  const rows = tickets.filter((t) =>
    tab === "reservar" || tab === "config" || tab === "historial" ? false : t.status === tab
  );

  const histRows = history.filter((h) =>
    histFilter === "" || String(h.number).includes(histFilter.replace(/\D/g, ""))
  );

  const stats = [
    { label: "Disponibles", value: disponibles, icon: TicketIcon, ring: "text-brand-600 dark:text-brand-300", bar: "bg-brand-500" },
    { label: "Pendientes", value: count("pendiente"), icon: ClockIcon, ring: "text-amber-500", bar: "bg-amber-400" },
    { label: "Reservados", value: count("reservado"), icon: UsersIcon, ring: "text-sky-500", bar: "bg-sky-400" },
    { label: "Confirmados", value: count("confirmado"), icon: CheckIcon, ring: "text-emerald-500", bar: "bg-emerald-500" },
    { label: "Cancelados", value: count("cancelado"), icon: XIcon, ring: "text-slate-400", bar: "bg-slate-400" }
  ];

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "pendiente", label: "Pendientes", count: count("pendiente") },
    { id: "reservado", label: "Reservados", count: count("reservado") },
    { id: "confirmado", label: "Confirmados", count: count("confirmado") },
    { id: "cancelado", label: "Cancelados", count: count("cancelado") },
    { id: "historial", label: "Historial" },
    { id: "reservar", label: "Reservar" },
    { id: "config", label: "Config" }
  ];

  const manualFields = [
    { key: "number", label: `Número (${rMin}-${rMax})`, numeric: true },
    { key: "nombre", label: "Nombre", numeric: false },
    { key: "apellido", label: "Apellido", numeric: false },
    { key: "dni", label: "DNI", numeric: false },
    { key: "telefono", label: "Teléfono", numeric: false }
  ] as const;

  const configFields = [
    { key: "title", label: "Título del sorteo" },
    { key: "subtitle", label: "Subtítulo / premio destacado" },
    { key: "description", label: "Descripción" },
    { key: "whatsapp_number", label: "WhatsApp admin (solo dígitos)" },
    { key: "alias", label: "Alias único de cobro" },
    { key: "transfer_holder", label: "Titular de la cuenta" },
    { key: "transfer_cbu", label: "CUIT" },
    { key: "transfer_bank", label: "Banco / Billetera" }
  ] as const;

  return (
    <div className="min-h-dvh">
      {checking && (
        <div className="fixed inset-0 z-50 flex min-h-dvh flex-col items-center justify-center gap-3 bg-gradient-to-b from-brand-800 to-brand-600 text-white">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-white/25 border-t-white" aria-hidden="true" />
          <p className="text-sm font-medium">Verificando acceso…</p>
        </div>
      )}
      <div className="relative overflow-hidden bg-gradient-to-b from-brand-800 to-brand-600 pb-6 text-white">
        <div className="bg-blueprint absolute inset-0" aria-hidden="true" />
        <header className="relative mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur" aria-label="Volver al sitio">
              <TicketIcon className="h-5 w-5" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-lg font-extrabold leading-tight tracking-tight">Panel Admin</h1>
              <p className="tnum max-w-[140px] truncate text-xs text-brand-100 sm:max-w-[220px]">{displayName || userEmail}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <button onClick={logout} aria-label="Cerrar sesión"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-white/10 backdrop-blur transition hover:bg-white/20 sm:w-auto sm:px-4 sm:text-sm sm:font-semibold">
              <LogoutIcon className="h-4 w-4" />
              <span className="hidden sm:inline sm:pl-2">Salir</span>
            </button>
          </div>
        </header>

        <section className="relative mx-auto max-w-5xl px-4">
          <div className="grid grid-cols-6 gap-2 lg:grid-cols-5">
          {stats.map((s, i) => (
            <div key={s.label} className={`${i < 2 ? "col-span-3" : "col-span-2"} overflow-hidden rounded-2xl bg-white text-slate-900 shadow-card lg:col-span-1 dark:bg-night-850 dark:text-white`}>
              <div className={`h-1 ${s.bar}`} />
              <div className="flex items-center gap-2 p-3">
                <span className={s.ring}><s.icon className="h-5 w-5 shrink-0" /></span>
                <div className="min-w-0">
                  <p className="tnum font-num text-xl font-extrabold leading-none sm:text-2xl">{s.value}</p>
                  <p className="mt-1 truncate text-[11px] font-medium text-slate-500 sm:text-xs dark:text-slate-400">{s.label}</p>
                </div>
              </div>
            </div>
          ))}
          </div>
        </section>
      </div>

      <main className="mx-auto max-w-5xl space-y-3 p-4 pb-16">
        <p className="tnum text-xs text-slate-400 dark:text-slate-500">
          Ocupados activos: {activeNums.size} / {total} (rango {rMin}–{rMax})
        </p>
        {msg && (
          <p role="status" className={`rounded-xl p-3 text-sm font-semibold ${msgOk ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300"}`}>
            {msg}
          </p>
        )}

        <nav aria-label="Secciones del panel" className="flex flex-wrap gap-1.5 rounded-2xl border border-brand-100 bg-white p-1.5 dark:border-white/10 dark:bg-night-850">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition sm:h-10 sm:px-3.5 ${
                tab === t.id ? "bg-brand-600 text-white shadow-glow" : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-night-800"
              }`}
            >
              {t.id === "reservar" && <PlusIcon className="h-4 w-4" />}
              {t.id === "config" && <CogIcon className="h-4 w-4" />}
              {t.label}
              {t.count !== undefined && (
                <span className={`tnum rounded-full px-1.5 text-xs ${tab === t.id ? "bg-white/20" : "bg-slate-100 dark:bg-night-700"}`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </nav>

        {tab === "historial" && (
          <div className="overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-card dark:border-white/10 dark:bg-night-850">
            <div className="border-b border-slate-100 p-3 dark:border-white/5">
              <input
                value={histFilter}
                onChange={(e) => setHistFilter(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder="Filtrar por número…"
                aria-label="Filtrar historial por número"
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-4 sm:max-w-xs dark:border-white/10 dark:bg-night-800"
              />
            </div>
            <div className="space-y-2 p-3 sm:hidden">
              {histRows.map((h) => (
                <article key={h.id} className="rounded-xl border border-slate-100 p-3 dark:border-white/5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="tnum font-num text-xl font-extrabold text-brand-700 dark:text-brand-300">{h.number}</p>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                      h.action === "confirmado" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : h.action === "cancelado" ? "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
                      : h.action === "reservado" ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                    }`}>
                      {h.action === "pendiente" ? "Reserva web" : h.action === "reservado" ? "Reserva admin" : h.action}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    {new Date(h.created_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
                    {" · "}
                    {h.actor_id && adminNames[h.actor_id] ? adminNames[h.actor_id] : h.actor_id ? "Admin" : "Cliente web"}
                    {h.detail && h.action === "cancelado" ? ` · Motivo: ${h.detail}` : ""}
                  </p>
                </article>
              ))}
              {histRows.length === 0 && (
                <p className="p-4 text-center text-sm text-slate-400">Sin movimientos todavía.</p>
              )}
            </div>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400 dark:border-white/5">
                    <th className="p-3">Fecha</th>
                    <th className="p-3">N°</th>
                    <th className="p-3">Movimiento</th>
                    <th className="p-3">Por</th>
                  </tr>
                </thead>
                <tbody>
                  {histRows.map((h) => (
                    <tr key={h.id} className="border-b border-slate-50 transition last:border-0 hover:bg-brand-50/50 dark:border-white/5 dark:hover:bg-night-800">
                      <td className="whitespace-nowrap p-3 text-slate-500 dark:text-slate-400">
                        {new Date(h.created_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="tnum p-3 font-num text-base font-extrabold text-brand-700 dark:text-brand-300">{h.number}</td>
                      <td className="p-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                          h.action === "confirmado" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                          : h.action === "cancelado" ? "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
                          : h.action === "reservado" ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                        }`}>
                          {h.action === "pendiente" ? "Reserva web" : h.action === "reservado" ? "Reserva admin" : h.action}
                        </span>
                        {h.detail && h.action === "cancelado" && (
                          <p className="mt-0.5 text-xs text-slate-400">Motivo: {h.detail}</p>
                        )}
                      </td>
                      <td className="p-3 text-slate-500 dark:text-slate-400">
                        {h.actor_id && adminNames[h.actor_id] ? adminNames[h.actor_id] : h.actor_id ? "Admin" : "Cliente web"}
                      </td>
                    </tr>
                  ))}
                  {histRows.length === 0 && (
                    <tr><td className="p-6 text-center text-slate-400" colSpan={4}>Sin movimientos todavía.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {(tab === "pendiente" || tab === "reservado" || tab === "confirmado" || tab === "cancelado") && (
          <div className="sm:flex sm:justify-end">
            <DownloadExcel tickets={rows} tab={tab} adminNames={adminNames} />
          </div>
        )}

        {(tab !== "reservar" && tab !== "config" && tab !== "historial") && (
          <div className="hidden overflow-x-auto rounded-2xl border border-brand-100 bg-white shadow-card sm:block dark:border-white/10 dark:bg-night-850">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wider text-slate-400 dark:border-white/5">
                  <th className="p-3">N°</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">DNI / Tel</th>
                  <th className="p-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="border-b border-slate-50 transition last:border-0 hover:bg-brand-50/50 dark:border-white/5 dark:hover:bg-night-800">
                    <td className="tnum p-3 font-num text-base font-extrabold text-brand-700 dark:text-brand-300">{t.number}</td>
                    <td className="p-3">
                      <p className="font-medium">{t.nombre} {t.apellido}</p>
                      {t.status === "confirmado" && t.confirmed_by && adminNames[t.confirmed_by] && (
                        <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                          Conf. por {adminNames[t.confirmed_by]}
                        </p>
                      )}
                    </td>
                    <td className="tnum p-3 text-slate-500 dark:text-slate-400">
                      {t.dni} /{" "}
                      <a
                        href={adminWhatsappLink(t)}
                        target="_blank"
                        rel="noreferrer"
                        title={`Escribir a ${t.nombre} por WhatsApp`}
                        aria-label={`Escribir a ${t.nombre} ${t.apellido} por WhatsApp`}
                        className="inline-flex items-center gap-1 font-semibold text-[#1faa55] underline-offset-2 hover:underline"
                      >
                        <ChatIcon className="h-4 w-4" />
                        {t.telefono}
                      </a>
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-2">
                        {(tab === "pendiente" || tab === "reservado") && (
                          <button onClick={() => act(t.id, "confirm")} className="flex h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 font-semibold text-white transition hover:bg-emerald-700 active:scale-95">
                            <CheckIcon className="h-4 w-4" />
                            Confirmar
                          </button>
                        )}
                        {(tab === "pendiente" || tab === "reservado" || tab === "confirmado") && (
                          <button onClick={() => act(t.id, "cancel")} className="flex h-10 items-center gap-1.5 rounded-xl border border-rose-200 px-3 font-semibold text-rose-600 transition hover:bg-rose-50 active:scale-95 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10">
                            <XIcon className="h-4 w-4" />
                            Cancelar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td className="p-6 text-center text-slate-400" colSpan={4}>Sin registros en esta sección.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {(tab !== "reservar" && tab !== "config" && tab !== "historial") && (
          <div className="space-y-2 sm:hidden">
            {rows.map((t) => (
              <article key={t.id} className="rounded-2xl border border-brand-100 bg-white p-4 shadow-card dark:border-white/10 dark:bg-night-850">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="tnum font-num text-2xl font-extrabold leading-none text-brand-700 dark:text-brand-300">{t.number}</p>
                    <p className="mt-1.5 truncate font-semibold">{t.nombre} {t.apellido}</p>
                    {t.status === "confirmado" && t.confirmed_by && adminNames[t.confirmed_by] && (
                      <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                        Conf. por {adminNames[t.confirmed_by]}
                      </p>
                    )}
                  </div>
                  <a
                    href={adminWhatsappLink(t)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Escribir a ${t.nombre} ${t.apellido} por WhatsApp`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1faa55]/10 text-[#1faa55]"
                  >
                    <ChatIcon className="h-5 w-5" />
                  </a>
                </div>
                <p className="tnum mt-2 text-sm text-slate-500 dark:text-slate-400">DNI {t.dni} · {t.telefono}</p>
                <div className="mt-3 flex gap-2">
                  {(tab === "pendiente" || tab === "reservado") && (
                    <button onClick={() => act(t.id, "confirm")} className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 font-semibold text-white transition hover:bg-emerald-700 active:scale-[.98]">
                      <CheckIcon className="h-4 w-4" />
                      Confirmar
                    </button>
                  )}
                  {(tab === "pendiente" || tab === "reservado" || tab === "confirmado") && (
                    <button onClick={() => act(t.id, "cancel")} className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-200 font-semibold text-rose-600 transition hover:bg-rose-50 active:scale-[.98] dark:border-rose-500/30 dark:text-rose-300">
                      <XIcon className="h-4 w-4" />
                      Cancelar
                    </button>
                  )}
                </div>
              </article>
            ))}
            {rows.length === 0 && (
              <p className="rounded-2xl border border-brand-100 bg-white p-6 text-center text-slate-400 dark:border-white/10 dark:bg-night-850">
                Sin registros en esta sección.
              </p>
            )}
          </div>
        )}

        {tab === "reservar" && (
          <section className="rounded-2xl border border-brand-100 bg-white p-5 shadow-card dark:border-white/10 dark:bg-night-850">
            <h2 className="flex items-center gap-2 font-bold">
              <PlusIcon className="h-5 w-5 text-brand-600 dark:text-brand-300" />
              Reservar número manualmente
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {manualFields.map((f) => (
                <label key={f.key} className="block text-sm font-medium">
                  {f.label}
                  <input
                    value={manual[f.key]}
                    inputMode={f.numeric ? "numeric" : undefined}
                    onChange={(e) => setManual({
                      ...manual,
                      [f.key]: f.numeric ? e.target.value.replace(/\D/g, "").slice(0, 4) : e.target.value
                    })}
                    className={`${inputCls} mt-1 ${f.key === "number" ? "font-num text-center text-xl font-bold" : ""}`}
                  />
                </label>
              ))}
            </div>
            <button onClick={reserveManual} className="mt-4 h-12 rounded-xl bg-brand-600 px-6 font-semibold text-white shadow-glow transition hover:bg-brand-700 active:scale-[.98]">
              Reservar
            </button>
          </section>
        )}

        {tab === "config" && (
          <section className="rounded-2xl border border-brand-100 bg-white p-5 shadow-card dark:border-white/10 dark:bg-night-850">
            <h2 className="flex items-center gap-2 font-bold">
              <CogIcon className="h-5 w-5 text-brand-600 dark:text-brand-300" />
              Info del sorteo y cobro
            </h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
              <ShieldIcon className="h-4 w-4" />
              Se usa un solo alias de cobro para todo el sorteo.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {configFields.map((f) => (
                <label key={f.key} className="block text-sm font-medium">
                  {f.label}
                  <input
                    value={settings[f.key]}
                    onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })}
                    className={`${inputCls} mt-1`}
                  />
                </label>
              ))}
              <label className="block text-sm font-medium">
                Fecha del sorteo
                <input
                  type="datetime-local"
                  value={settings.draw_date}
                  onChange={(e) => setSettings({ ...settings, draw_date: e.target.value })}
                  className={`${inputCls} mt-1`}
                />
              </label>
              <label className="block text-sm font-medium">
                Precio por número
                <input
                  type="number"
                  min={0}
                  value={settings.ticket_price}
                  onChange={(e) => setSettings({ ...settings, ticket_price: Number(e.target.value) })}
                  className={`${inputCls} tnum mt-1`}
                />
              </label>
              <label className="block text-sm font-medium">
                Número mínimo
                <input
                  type="number"
                  min={HARD_MIN}
                  max={HARD_MAX}
                  value={settings.min_number}
                  onChange={(e) => setSettings({ ...settings, min_number: Number(e.target.value) })}
                  className={`${inputCls} tnum mt-1`}
                />
              </label>
              <label className="block text-sm font-medium">
                Número máximo
                <input
                  type="number"
                  min={HARD_MIN}
                  max={HARD_MAX}
                  value={settings.max_number}
                  onChange={(e) => setSettings({ ...settings, max_number: Number(e.target.value) })}
                  className={`${inputCls} tnum mt-1`}
                />
              </label>
            </div>
            <p className="tnum mt-3 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-900 dark:bg-brand-500/10 dark:text-brand-200">
              Rango {rMin}–{rMax} · {total} números en juego
              {Array.from(activeNums).some((n) => n < rMin || n > rMax) &&
                " · Atención: hay activos fuera de este rango"}
            </p>
            <button onClick={saveSettings} className="mt-4 h-12 rounded-xl bg-brand-600 px-6 font-semibold text-white shadow-glow transition hover:bg-brand-700 active:scale-[.98]">
              Guardar cambios
            </button>
            <PhotoManager onMessage={say} />
          </section>
        )}
      </main>
    </div>
  );
}
