import { CalendarIcon, ChatIcon, ClockIcon, TicketIcon } from "@/components/icons";
import ThemeToggle from "@/components/ThemeToggle";
import { DEFAULT_PAUSE_MESSAGE } from "@/lib/tickets";

interface Props {
  message?: string | null;
  until?: string | null;
  whatsapp?: string | null;
  unavailable?: boolean;
}

function formatUntil(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) return null;
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires"
  }).format(date);
}

function whatsappLink(value?: string | null): string | null {
  const phone = (value ?? "").replace(/\D/g, "");
  if (!phone || phone === "5491100000000") return null;
  const text = encodeURIComponent("Hola, consulto por mi reserva del sorteo.");
  return `https://wa.me/${phone}?text=${text}`;
}

export default function Maintenance({ message, until, whatsapp, unavailable = false }: Props) {
  const body = unavailable
    ? "El sitio no está disponible en este momento. Volvé a intentar en unos minutos."
    : (message?.trim() || DEFAULT_PAUSE_MESSAGE);
  const untilText = unavailable ? null : formatUntil(until);
  const wa = whatsappLink(whatsapp);

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-gradient-to-b from-brand-800 via-brand-700 to-brand-600 text-white">
      <div className="bg-blueprint absolute inset-0" aria-hidden="true" />
      <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-sky-400/25 blur-3xl" aria-hidden="true" />
      <div className="absolute -left-24 bottom-10 h-80 w-80 rounded-full bg-blue-950/40 blur-3xl" aria-hidden="true" />

      <header className="relative mx-auto flex w-full max-w-3xl items-center justify-between p-4">
        <span className="flex items-center gap-2 font-extrabold tracking-tight">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <TicketIcon className="h-5 w-5" />
          </span>
          <span className="font-num text-xl">tunumero</span>
        </span>
        <ThemeToggle />
      </header>

      <main className="relative mx-auto flex w-full max-w-md flex-1 items-center px-4 pb-10">
        <section className="w-full animate-fade-up rounded-3xl bg-white p-7 text-center text-slate-900 shadow-card dark:bg-night-850 dark:text-white">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            <ClockIcon className="h-8 w-8" />
          </span>

          <p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
            {unavailable ? "Sitio no disponible" : "Mantenimiento"}
          </p>
          <h1 className="mt-2 text-2xl font-extrabold leading-tight tracking-tight">
            {unavailable ? "Volvé a intentar en un rato" : "Volvemos en breve"}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{body}</p>

          {untilText && (
            <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">
              <CalendarIcon className="h-4 w-4" />
              Regreso estimado: {untilText}
            </p>
          )}

          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left dark:border-emerald-500/20 dark:bg-emerald-500/10">
            <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">
              Tus reservas siguen guardadas
            </p>
            <p className="mt-1 text-sm leading-relaxed text-emerald-800/80 dark:text-emerald-200/80">
              Tus números y reservas ya realizadas no se pierden.
            </p>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-slate-400 dark:text-slate-500">
            Si tenías una reserva en curso, escribinos y la revisamos.
          </p>

          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 font-semibold text-white shadow-glow transition hover:bg-brand-700 active:scale-[.98]"
            >
              <ChatIcon className="h-5 w-5" />
              Escribinos por WhatsApp
            </a>
          )}
        </section>
      </main>

      <footer className="relative pb-6 text-center text-xs text-white/70">
        Gracias por la paciencia · tunumero
      </footer>
    </div>
  );
}
