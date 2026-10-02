"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatShort } from "@/lib/tickets";

interface Props {
  open: boolean;
  seconds: number;
  nowCount: number;
  nowTotal: number;
  addCount: number;
  addExtra: number;
  currency: string;
  onAccept: () => void;
  onDecline: () => void;
}

/** Upsell "Última oportunidad": propone agrandar el pedido con countdown; si expira, sigue como está */
export default function LastChanceModal({
  open, seconds, nowCount, nowTotal, addCount, addExtra, currency, onAccept, onDecline
}: Props) {
  const [left, setLeft] = useState(seconds);
  const done = useRef(false);

  useEffect(() => {
    if (!open) return;
    done.current = false;
    setLeft(seconds);
    const t = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          clearInterval(t);
          if (!done.current) {
            done.current = true;
            onDecline();
          }
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const finalCount = nowCount + addCount;
  const finalTotal = nowTotal + addExtra;

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-night-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm animate-pop-in rounded-3xl border-2 border-rose-500 bg-white p-6 text-center shadow-card dark:bg-night-850">
        <span className="tnum font-num mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-rose-600 text-4xl font-extrabold text-white">
          {left}
        </span>
        <p className="mt-3 text-sm font-bold uppercase tracking-widest text-rose-600">Última oportunidad</p>
        <h3 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight">
          Sumá {addCount} chances por {formatShort(addExtra)} más
        </h3>

        <dl className="mt-4 rounded-2xl bg-slate-100 p-4 text-left text-sm dark:bg-night-800">
          <div className="flex items-center justify-between gap-2">
            <dt>Ahora llevás</dt>
            <dd className="tnum font-num font-bold">{nowCount} chances · {formatShort(nowTotal)}</dd>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-rose-600">
            <dt>Sumás</dt>
            <dd className="tnum font-num font-bold">+{addCount} chances · +{formatShort(addExtra)}</dd>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatShort(Math.round(addExtra / Math.max(1, addCount)))} cada una</p>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-300 pt-2 dark:border-white/10">
            <dt>Te llevás</dt>
            <dd className="tnum font-num text-lg font-extrabold text-emerald-600">
              {finalCount} chances · {formatShort(finalTotal)}
            </dd>
          </div>
        </dl>

        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          Ese es el total a transferir si sumás estas chances.
        </p>
        <button onClick={onAccept}
          className="mt-3 min-h-[52px] w-full rounded-2xl bg-rose-600 px-4 py-3 font-bold text-white transition hover:brightness-110 active:scale-[.98]">
          Sí, quiero {finalCount} chances por {formatShort(finalTotal)}
        </button>
        <button onClick={onDecline} className="mt-2 h-11 w-full font-medium text-slate-500 underline underline-offset-2 dark:text-slate-400">
          No, seguir con mis {nowCount} chances
        </button>
        <p className="mt-1 text-xs text-slate-400">
          La oferta se cierra en {left} segundos y tu pedido sale como está. {currency}
        </p>
      </div>
    </div>,
    document.body
  );
}
