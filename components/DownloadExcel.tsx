"use client";
import { useState } from "react";
import type { Ticket } from "@/lib/tickets";

interface Props {
  tickets: Ticket[];
  tab: string;
  adminNames: Record<string, string>;
  disabled?: boolean;
}

const HEADERS = ["N°", "Nombre", "Apellido", "DNI", "Teléfono", "Estado", "Origen", "Confirmado por", "Creado"];

export default function DownloadExcel({ tickets, tab, adminNames, disabled }: Props) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    if (busy || tickets.length === 0) return;
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const rows = tickets.map((t) => ({
        "N°": t.number,
        Nombre: t.nombre,
        Apellido: t.apellido,
        DNI: { v: String(t.dni), t: "s" },
        "Teléfono": { v: String(t.telefono), t: "s" },
        Estado: t.status,
        Origen: t.source === "admin" ? "Admin" : "Web",
        "Confirmado por":
          t.confirmed_by && adminNames[t.confirmed_by] ? adminNames[t.confirmed_by] : "",
        Creado: t.created_at
          ? new Date(t.created_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })
          : ""
      }));
      const ws = XLSX.utils.json_to_sheet(rows, { header: HEADERS });
      // Ancho de columnas legible
      ws["!cols"] = [{ wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 18 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, tab.slice(0, 28));
      const date = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `tunumero-${tab}-${date}.xlsx`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={download}
      disabled={disabled || busy || tickets.length === 0}
      aria-label={`Descargar Excel de ${tab} (${tickets.length} registros)`}
      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-glow transition hover:bg-brand-700 active:scale-[.98] disabled:opacity-50 sm:w-auto"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
        <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
        <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </svg>
      {busy ? "Generando…" : `Excel (${tickets.length})`}
    </button>
  );
}
