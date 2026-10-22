import type { Metadata } from "next";
import { cache } from "react";
import { createServiceSupabase } from "@/lib/supabaseAdmin";
import { fetchActiveNumbers } from "@/lib/serverData";
import RaffleClient from "@/components/RaffleClient";
import PhotoGallery, { type GalleryPhoto } from "@/components/PhotoGallery";
import Maintenance from "@/components/Maintenance";
import ThemeToggle from "@/components/ThemeToggle";
import Link from "next/link";
import { totalNumbers, MIN_NUMBER, MAX_NUMBER, placeLabel, DEFAULT_PAUSE_MESSAGE, type Promo } from "@/lib/tickets";
import { CalendarIcon, CashIcon, ShieldIcon, TicketIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

const PODIUM = [
  { box: "border-gold-400/60 bg-gold-400/10", badge: "bg-gold-400 text-night-950" },
  { box: "border-slate-300/80 bg-slate-100 dark:border-white/15 dark:bg-white/5", badge: "bg-slate-300 text-night-900" },
  { box: "border-amber-600/40 bg-amber-600/10", badge: "bg-amber-700 text-white" }
];
const PODIUM_FALLBACK = {
  box: "border-brand-200 bg-brand-50 dark:border-white/10 dark:bg-white/5",
  badge: "bg-brand-600 text-white"
};

const FALLBACK = {
  title: "Gran Sorteo Tunumero",
  subtitle: "Moto 0km + $500.000 en efectivo",
  description: "Buscá tu número favorito y reservalo en segundos.",
  prizes: [] as { label: string }[],
  draw_date: null as string | null,
  ticket_price: 2000,
  currency: "ARS",
  whatsapp_number: "5491100000000",
  alias: "TUNUMERO.SORTEO",
  transfer_holder: "Sorteo Tunumero",
  transfer_cbu: "0000003100000000000000",
  transfer_bank: "Mercado Pago",
  min_number: MIN_NUMBER,
  max_number: MAX_NUMBER,
  site_enabled: true,
  site_pause_message: DEFAULT_PAUSE_MESSAGE as string | null,
  site_pause_until: null as string | null,
  mp_enabled: true
};

type SiteSettings = typeof FALLBACK;

const getSite = cache(async (): Promise<{ settings: SiteSettings; error: boolean }> => {
  try {
    const supabase = createServiceSupabase();
    const { data: s, error } = await supabase.from("raffle_settings").select("*").eq("id", 1).single();
    if (error || !s) {
      if (error) console.error("[home] no se pudo leer raffle_settings:", error.message);
      return { settings: FALLBACK, error: true };
    }
    return { settings: { ...FALLBACK, ...(s as Partial<SiteSettings>) }, error: false };
  } catch (e) {
    console.error("[home] configuración del sitio no disponible:", e instanceof Error ? e.message : e);
    return { settings: FALLBACK, error: true };
  }
});

export async function generateMetadata(): Promise<Metadata> {
  const { settings, error } = await getSite();
  if (error || settings.site_enabled === false) {
    return {
      title: "Volvemos en breve · tunumero",
      robots: { index: false, follow: false }
    };
  }
  return {};
}

export default async function Home() {
  const { settings, error } = await getSite();
  if (error || settings.site_enabled === false) {
    return (
      <Maintenance
        message={settings.site_pause_message}
        until={settings.site_pause_until}
        whatsapp={settings.whatsapp_number}
        unavailable={error}
      />
    );
  }

  const supabase = createServiceSupabase();
  const min0 = Number(settings.min_number ?? MIN_NUMBER);
  const max0 = Number(settings.max_number ?? MAX_NUMBER);
  let taken: number[] = [];
  let photos: GalleryPhoto[] = [];
  let promos: Promo[] = [];

  try {
    taken = await fetchActiveNumbers(supabase, min0, max0);
  } catch {
    return (
      <Maintenance
        message={settings.site_pause_message}
        until={settings.site_pause_until}
        whatsapp={settings.whatsapp_number}
        unavailable
      />
    );
  }

  try {
    const { data: img } = await supabase
      .from("raffle_images")
      .select("id,image_url,sort_order")
      .order("sort_order", { ascending: true })
      .limit(3);
    if (img) photos = img as GalleryPhoto[];
  } catch { /* fotos opcionales */ }
  try {
    const { data: pr } = await supabase
      .from("promos")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (pr) promos = pr as Promo[];
  } catch { /* promos opcionales */ }

  const date = settings.draw_date
    ? new Date(settings.draw_date).toLocaleString("es-AR", { dateStyle: "long", timeStyle: "short" })
    : "Fecha a confirmar";

  const min = Number(settings.min_number ?? MIN_NUMBER);
  const max = Number(settings.max_number ?? MAX_NUMBER);
  const total = totalNumbers(min, max);
  const inRange = new Set(taken.filter((n) => n >= min && n <= max));
  const disponibles = total - inRange.size;
  const price = `$${Number(settings.ticket_price).toLocaleString("es-AR")}`;
  const rawPrizes = (settings as { prizes?: unknown }).prizes;
  const prizes = (Array.isArray(rawPrizes) ? rawPrizes : [])
    .map((p) => (p && typeof p === "object" ? String((p as { label?: unknown }).label ?? "").trim() : ""))
    .filter(Boolean)
    .map((label) => ({ label }));

  return (
    <div className="min-h-dvh">
      {/* Franja superior azul */}
      <div className="relative overflow-hidden bg-gradient-to-b from-brand-800 via-brand-700 to-brand-600 pb-10 text-white">
        <div className="bg-blueprint absolute inset-0" aria-hidden="true" />
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-sky-400/30 blur-3xl" aria-hidden="true" />
        <div className="absolute -left-24 top-24 h-72 w-72 rounded-full bg-blue-950/50 blur-3xl" aria-hidden="true" />

        <header className="relative mx-auto flex max-w-3xl items-center justify-between p-4">
          <Link href="/" className="flex items-center gap-2 font-extrabold tracking-tight">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
              <TicketIcon className="h-5 w-5" />
            </span>
            <span className="font-num text-xl">tunumero</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/admin"
              className="flex h-11 items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 text-sm font-semibold backdrop-blur transition hover:bg-white/20"
            >
              <ShieldIcon className="h-4 w-4" />
              Admin
            </Link>
          </div>
        </header>

        {/* Boleto */}
        <section className="relative mx-auto max-w-3xl px-4">
          <div className="animate-fade-up overflow-hidden rounded-3xl bg-white text-slate-900 shadow-card dark:bg-night-850 dark:text-white">
            <div className="flex flex-col sm:flex-row">
              {/* Stub */}
              <div className="relative flex flex-row items-center justify-between gap-4 bg-gradient-to-br from-brand-700 to-brand-500 p-6 text-white sm:w-60 sm:flex-col sm:justify-center sm:text-center">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-100">Valor</p>
                  <p className="tnum font-num text-4xl font-extrabold tracking-tight">{price}</p>
                  <p className="mt-1 text-xs text-brand-100">{settings.currency} · por número</p>
                </div>
                <div className="rounded-2xl bg-night-950/30 px-4 py-2 backdrop-blur">
                  <p className="tnum font-num text-sm font-bold">{disponibles} / {total}</p>
                  <p className="text-[11px] text-brand-100">disponibles</p>
                </div>
                <span className="ticket-perf absolute bottom-0 left-4 right-4 hidden h-px text-white sm:block" aria-hidden="true" />
              </div>
              {/* Cuerpo */}
              <div className="flex-1 p-6">
                <p className="inline-flex items-center gap-1.5 rounded-full bg-gold-400/20 px-3 py-1 text-xs font-bold uppercase tracking-widest text-gold-500 dark:text-gold-300">
                  Sorteo activo
                </p>
                <h1 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
                  {settings.title}
                </h1>
                {settings.subtitle && (
                  <p className="mt-1 text-lg font-semibold text-brand-700 dark:text-brand-300">{settings.subtitle}</p>
                )}
                {prizes.length > 0 && (
                  <ul className="mt-3 grid gap-2 sm:grid-cols-3">
                    {prizes.map((p, i) => {
                      const tone = PODIUM[i] ?? PODIUM_FALLBACK;
                      return (
                        <li key={`${i}-${p.label}`} className={`flex items-center gap-2.5 rounded-2xl border p-2.5 sm:flex-col sm:justify-center sm:gap-1 sm:p-3 sm:text-center ${tone.box}`}>
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold ${tone.badge}`}>
                            {i + 1}°
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[10px] font-bold uppercase tracking-[0.16em] opacity-70">{placeLabel(i)} premio</span>
                            <span className="block break-words text-sm font-bold leading-tight">{p.label}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{settings.description}</p>
                <div className="mt-4 flex flex-wrap gap-2 text-sm">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 font-medium text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">
                    <CalendarIcon className="h-4 w-4" />
                    {date}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 font-medium text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">
                    <CashIcon className="h-4 w-4" />
                    {price} {settings.currency}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <main className="mx-auto max-w-3xl space-y-4 p-4 pb-16">
        <PhotoGallery photos={photos} />
        <section className="-mt-2 animate-fade-up" style={{ animationDelay: "120ms" }}>
          <RaffleClient
            taken={taken}
            whatsapp={settings.whatsapp_number}
            min={min}
            max={max}
            alias={settings.alias ?? "—"}
            cuit={settings.transfer_cbu ?? "—"}
            titular={settings.transfer_holder ?? "—"}
            bank={settings.transfer_bank ?? "—"}
            unitPrice={Number(settings.ticket_price)}
            currency={settings.currency}
            promos={promos}
            mpEnabled={(settings as { mp_enabled?: boolean }).mp_enabled !== false}
          />
        </section>

        <footer className="pt-2 text-center text-xs text-slate-400 dark:text-slate-500">
          tunumero · sorteos del {min} al {max}
        </footer>
      </main>
    </div>
  );
}
