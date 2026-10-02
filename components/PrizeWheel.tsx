"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { WheelPrize, WheelSegment } from "@/lib/tickets";
import { XIcon } from "./icons";

interface Props {
  segments: WheelSegment[];
  sessionKey: string;
  prizeMinutes: number;
  onPrize: (p: WheelPrize) => void;
  onClose: () => void;
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** Ruleta de premios: el servidor elige, el front solo anima hasta el ángulo ganador */
export default function PrizeWheel({ segments, sessionKey, prizeMinutes, onPrize, onClose }: Props) {
  const n = Math.max(1, segments.length);
  const arc = 360 / n;
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [prize, setPrize] = useState<WheelPrize | null>(null);
  const [error, setError] = useState("");
  const [left, setLeft] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const wedges = useMemo(() => {
    const cx = 200;
    const cy = 200;
    const r = 188;
    return segments.map((s, i) => {
      const a0 = i * arc;
      const a1 = a0 + arc;
      const p0 = polar(cx, cy, r, a0);
      const p1 = polar(cx, cy, r, a1);
      const large = arc > 180 ? 1 : 0;
      return {
        s,
        d: `M ${cx} ${cy} L ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} Z`,
        mid: a0 + arc / 2
      };
    });
  }, [segments, arc]);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const tick = (expiresAt: string) => {
    if (timer.current) clearInterval(timer.current);
    const update = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) {
        setLeft("00:00");
        if (timer.current) clearInterval(timer.current);
        return;
      }
      const m = Math.floor(ms / 60000);
      const sec = Math.floor((ms % 60000) / 1000);
      setLeft(`${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`);
    };
    update();
    timer.current = setInterval(update, 1000);
  };

  const spin = async () => {
    if (spinning) return;
    setSpinning(true);
    setError("");
    try {
      const res = await fetch("/api/wheel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "spin", session_key: sessionKey })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.prize) throw new Error(j.error ?? "No se pudo girar");
      const p = j.prize as WheelPrize;
      // Ángulo: el centro del segmento ganador debe quedar arriba (270° en coords SVG rotadas)
      let idx = segments.findIndex((s) => s.id === p.segmentId);
      if (idx < 0) idx = 0;
      const center = idx * arc + arc / 2;
      const jitter = (Math.random() - 0.5) * arc * 0.5; // cae dentro del segmento, no siempre al centro
      const turns = 5 + Math.floor(Math.random() * 2);
      const target = turns * 360 + (270 - center + jitter);
      // Parte desde la rotación actual normalizada para un giro continuo
      const base = Math.ceil(rotation / 360) * 360;
      setRotation(base + target);
      window.setTimeout(() => {
        setPrize(p);
        setSpinning(false);
        tick(p.expiresAt);
      }, 5400);
    } catch (e) {
      setSpinning(false);
      setError(e instanceof Error ? e.message : "Error al girar");
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-night-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm animate-pop-in overflow-hidden rounded-3xl bg-white shadow-card dark:bg-night-850">
        <div className="relative bg-gradient-to-b from-slate-50 to-white px-5 pb-2 pt-5 text-center dark:from-night-800 dark:to-night-850">
          <div className="absolute right-3 top-3 flex gap-2">
            <button onClick={onClose} aria-label="Cerrar ruleta"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100 dark:border-white/10 dark:text-slate-300">
              <XIcon className="h-4 w-4" />
            </button>
          </div>
          <p className="font-num text-xl font-extrabold tracking-tight">
            TU<span className="text-brand-600">NUMERO</span>
          </p>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">Ruleta de premios</p>

          {/* Ruleta */}
          <div className="relative mx-auto mt-3 aspect-square w-full max-w-[320px]">
            {/* Puntero */}
            <div className="absolute -top-1 left-1/2 z-10 -translate-x-1/2">
              <div className="h-0 w-0 border-x-[11px] border-t-[18px] border-x-transparent border-t-slate-900 dark:border-t-white" />
            </div>
            <svg viewBox="0 0 400 400" className="h-full w-full drop-shadow-xl" role="img" aria-label="Ruleta de premios">
              <circle cx="200" cy="200" r="196" fill="none" stroke="#0f172a" strokeWidth="10" />
              <g
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transformOrigin: "200px 200px",
                  transition: spinning ? "transform 5.2s cubic-bezier(0.12, 0.8, 0.08, 1)" : "none"
                }}
              >
                {wedges.map((w, i) => (
                  <g key={w.s.id}>
                    <path d={w.d} fill={i % 2 === 0 ? "#1d4ed8" : "#f1f5f9"} stroke="#0f172a" strokeWidth="1.5" />
                    <text
                      x="200"
                      y="200"
                      textAnchor="middle"
                      transform={`rotate(${w.mid} 200 200) translate(0 -118)`}
                      className="font-num"
                      fontSize={arc < 40 ? 13 : 16}
                      fontWeight={800}
                      fill={i % 2 === 0 ? "#ffffff" : "#0f172a"}
                    >
                      {w.s.label.split(" ").slice(0, 2).join(" ")}
                    </text>
                    <text
                      x="200"
                      y="200"
                      textAnchor="middle"
                      transform={`rotate(${w.mid} 200 200) translate(0 -100)`}
                      fontSize="10"
                      fontWeight={600}
                      fill={i % 2 === 0 ? "#bfdbfe" : "#64748b"}
                    >
                      {w.s.label.split(" ").slice(2).join(" ").toUpperCase()}
                    </text>
                  </g>
                ))}
              </g>
              <circle cx="200" cy="200" r="62" fill="#ffffff" stroke="#0f172a" strokeWidth="4" />
              <text x="200" y="192" textAnchor="middle" fontSize="17" fontWeight={800} fill="#0f172a" className="font-num">TU N°</text>
              <text x="200" y="212" textAnchor="middle" fontSize="11" fontWeight={700} fill="#1d4ed8">GIRÁ Y GANÁ</text>
            </svg>
          </div>
        </div>

        <div className="p-5 pt-3">
          {!prize ? (
            <>
              <p className="text-center text-sm font-semibold text-brand-700 dark:text-brand-300">
                {n} premios · Un giro
              </p>
              <h3 className="mt-1 text-center text-2xl font-extrabold tracking-tight">
                Girás y <span className="text-brand-600">ganás.</span>
              </h3>
              <p className="mt-1 text-center text-sm text-slate-500 dark:text-slate-400">
                Descuentos y chances extra para tu compra.
              </p>
              {error && <p role="alert" className="mt-2 text-center text-sm font-medium text-rose-500">{error}</p>}
              <button onClick={spin} disabled={spinning}
                className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-night-950 py-3.5 font-bold text-white transition hover:brightness-125 active:scale-[.98] disabled:opacity-60 dark:bg-brand-600">
                {spinning ? "Girando…" : "Girar y descubrir mi premio →"}
              </button>
              <p className="mt-2 text-center text-xs text-slate-400">
                Tenés {prizeMinutes} minutos para usar tu premio.
              </p>
            </>
          ) : (
            <>
              <p className="text-center text-sm font-bold text-brand-600">🏆 Premio desbloqueado</p>
              <h3 className="mt-1 text-center text-3xl font-extrabold tracking-tight">¡GANASTE!</h3>
              <p className="mx-auto mt-2 w-fit rounded-xl border border-brand-200 bg-brand-50 px-4 py-2 text-center font-num text-xl font-extrabold text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200">
                {prize.label}
              </p>
              <p role="status" className="tnum mx-auto mt-2 w-fit rounded-xl bg-slate-100 px-4 py-2 text-center text-sm font-semibold text-slate-600 dark:bg-night-800 dark:text-slate-300">
                ⏱ Tenés <b>{left || "--:--"}</b> para crear el pedido
              </p>
              <button onClick={() => onPrize(prize)}
                className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-night-950 py-3.5 font-bold text-white transition hover:brightness-125 active:scale-[.98] dark:bg-brand-600">
                Utilizar mi premio ahora →
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
