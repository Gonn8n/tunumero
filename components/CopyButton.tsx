"use client";
import { useState } from "react";
import { CheckIcon, CopyIcon } from "./icons";

export default function CopyButton({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setOk(true);
      setTimeout(() => setOk(false), 1800);
    } catch {
      /* portapapeles no disponible */
    }
  };
  return (
    <button
      onClick={copy}
      aria-label={`Copiar ${label}`}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-brand-400 hover:text-brand-600 active:scale-90 dark:border-white/10 dark:text-slate-400 dark:hover:text-brand-300"
    >
      {ok ? <CheckIcon className="h-4 w-4 text-emerald-500" /> : <CopyIcon className="h-4 w-4" />}
    </button>
  );
}
