"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckIcon, ClockIcon, XIcon } from "@/components/icons";

function PagoInner() {
  const params = useSearchParams();
  const estado = params.get("estado") ?? "pendiente";
  const batch = params.get("batch") ?? "";
  const [paid, setPaid] = useState<boolean | null>(null);

  useEffect(() => {
    if (!batch) return;
    let stop = false;
    let tries = 0;
    const poll = async () => {
      tries++;
      try {
        const res = await fetch(`/api/mp/status?batch=${encodeURIComponent(batch)}`);
        const j = await res.json().catch(() => ({}));
        if (stop) return;
        if (j.paid) {
          setPaid(true);
          return;
        }
        if (tries < 20) window.setTimeout(poll, 3000);
        else setPaid(false);
      } catch {
        if (tries < 20 && !stop) window.setTimeout(poll, 3000);
        else if (!stop) setPaid(false);
      }
    };
    poll();
    return () => { stop = true; };
  }, [batch]);

  const ok = paid === true || (paid === null && estado === "exito");
  const bad = estado === "error";

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center">
      {paid === null && !bad ? (
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
          <ClockIcon className="h-8 w-8 animate-pulse" />
        </span>
      ) : ok ? (
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
          <CheckIcon className="h-8 w-8" />
        </span>
      ) : (
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
          <XIcon className="h-8 w-8" />
        </span>
      )}
      <h1 className="mt-4 text-2xl font-extrabold tracking-tight">
        {paid === null && !bad
          ? "Confirmando tu pago…"
          : ok
            ? "¡Pago acreditado!"
            : bad
              ? "El pago no se completó"
              : "Pago en revisión"}
      </h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        {paid === null && !bad
          ? "Estamos verificando con MercadoPago. Esto tarda unos segundos."
          : ok
            ? "Tus números quedaron confirmados. ¡Mucha suerte!"
            : bad
              ? "Podés intentarlo de nuevo o pagar por transferencia."
              : "Un administrador va a revisar tu pago. Te avisamos por WhatsApp."}
      </p>
      <div className="mt-6 flex w-full flex-col gap-2">
        <Link href="/" className="flex h-12 items-center justify-center rounded-xl bg-brand-600 font-semibold text-white shadow-glow transition hover:bg-brand-700">
          Volver al sorteo
        </Link>
        {(bad || paid === false) && (
          <Link href="/" className="flex h-12 items-center justify-center rounded-xl border border-slate-300 font-semibold transition hover:bg-slate-50 dark:border-white/10">
            Intentar de nuevo
          </Link>
        )}
      </div>
    </div>
  );
}

export default function PagoPage() {
  return (
    <Suspense>
      <PagoInner />
    </Suspense>
  );
}
