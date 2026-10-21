import { TicketIcon } from "@/components/icons";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center bg-slate-50 p-6 dark:bg-night-950">
      <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-card dark:border-white/10 dark:bg-night-850">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-glow">
          <TicketIcon className="h-7 w-7" />
        </span>
        <p className="mt-4 font-num text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white">404</p>
        <h1 className="mt-2 text-lg font-bold">Página no encontrada</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          El sitio que buscás no está disponible.
        </p>
      </div>
    </div>
  );
}
