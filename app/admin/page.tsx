"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import ThemeToggle from "@/components/ThemeToggle";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { totalNumbers, HARD_MIN, HARD_MAX, adminWhatsappLink, type Ticket } from "@/lib/tickets";
import {
  CheckIcon, ChatIcon, ClockIcon, CogIcon, LogoutIcon, PlusIcon,
  ShieldIcon, TicketIcon, UsersIcon, XIcon
} from "@/components/icons";

type Tab = "pendiente" | "reservado" | "confirmado" | "cancelado" | "reservar" | "config";

const inputCls =
  "h-12 w-full rounded-xl border border-slate-300 bg-white px-4 dark:border-white/10 dark:bg-night-800";

export default function AdminPanel() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [tab, setTab] = useState<Tab>("pendiente");
  const [userEmail, setUserEmail] = useState("");
  const [settings, setSettings] = useState({
    title: "", subtitle: "", description: "", draw_date: "",
    ticket_price: 2000, whatsapp_number: "", alias: "",
    transfer_holder: "", transfer_cbu: "", transfer_bank: "",
    min_number: 0, max_number: 4999
  });
  const [manual, setManual] = useState({ number: "", nombre: "", apellido: "", dni: "", telefono: "" });
  const [msg, setMsg] = useState("");
  const [msgOk, setMsgOk] = useState(true);
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
    const { data: tk } = await supabase.from("tickets").select("*").order("created_at", { ascending: false }).limit(2000);
    if (tk) setTickets(tk as Ticket[]);
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
    tab === "reservar" || tab === "config" ? false : t.status === tab
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
    { key: "transfer_cbu", label: "CBU" },
    { key: "transfer_bank", label: "Banco / Billetera" }
  ] as const;

  return (
    <div className="min-h-dvh">
      <div className="relative overflow-hidden bg-gradient-to-b from-brand-800 to-brand-600 pb-6 text-white">
        <div className="bg-blueprint absolute inset-0" aria-hidden="true" />
        <header className="relative mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur" aria-label="Volver al sitio">
              <TicketIcon className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-lg font-extrabold leading-tight tracking-tight">Panel Admin</h1>
              <p className="tnum truncate text-xs text-brand-100">{userEmail}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button onClick={logout} className="flex h-11 items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 text-sm font-semibold backdrop-blur transition hover:bg-white/20">
              <LogoutIcon className="h-4 w-4" />
              Salir
            </button>
          </div>
        </header>

        <section className="relative mx-auto grid max-w-5xl grid-cols-2 gap-2 px-4 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((s) => (
            <div key={s.label} className="overflow-hidden rounded-2xl bg-white text-slate-900 shadow-card dark:bg-night-850 dark:text-white">
              <div className={`h-1 ${s.bar}`} />
              <div className="flex items-center gap-2.5 p-3.5">
                <span className={s.ring}><s.icon className="h-5 w-5" /></span>
                <div>
                  <p className="tnum font-num text-2xl font-extrabold leading-none">{s.value}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{s.label}</p>
                </div>
              </div>
            </div>
          ))}
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

        <nav aria-label="Secciones del panel" className="flex gap-1 overflow-x-auto rounded-2xl border border-brand-100 bg-white p-1.5 dark:border-white/10 dark:bg-night-850">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold transition ${
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

        {(tab !== "reservar" && tab !== "config") && (
          <div className="overflow-x-auto rounded-2xl border border-brand-100 bg-white shadow-card dark:border-white/10 dark:bg-night-850">
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
                    <td className="p-3 font-medium">{t.nombre} {t.apellido}</td>
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
          </section>
        )}
      </main>
    </div>
  );
}
