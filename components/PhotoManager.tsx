"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { ArrowDownIcon, ArrowUpIcon, ImageIcon, TrashIcon } from "./icons";

interface Photo {
  id: string;
  image_url: string;
  storage_path: string;
  sort_order: number;
}

const MAX_PHOTOS = 3;
const MAX_SIZE = 5 * 1024 * 1024;

export default function PhotoManager({ onMessage }: { onMessage: (t: string, ok?: boolean) => void }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const supabase = createClient();
    const { data } = await supabase.from("raffle_images").select("*").order("sort_order").limit(3);
    if (data) setPhotos(data as Photo[]);
  };

  useEffect(() => { load(); }, []);

  const uploadFile = async (file: File, order: number) => {
    const supabase = createClient();
    const path = `sorteo/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("raffle-images").upload(path, file, {
      contentType: file.type, upsert: false
    });
    if (upErr) throw new Error(upErr.message);
    const { data } = supabase.storage.from("raffle-images").getPublicUrl(path);
    const { error: insErr } = await supabase.from("raffle_images").insert({
      image_url: data.publicUrl, storage_path: path, sort_order: order
    });
    if (insErr) {
      await supabase.storage.from("raffle-images").remove([path]);
      throw new Error(insErr.message);
    }
  };

  const valid = (file: File) => {
    if (!file.type.startsWith("image/")) { onMessage("El archivo debe ser una imagen.", false); return false; }
    if (file.size > MAX_SIZE) { onMessage("La imagen supera los 5MB.", false); return false; }
    return true;
  };

  const handleAdd = async (file: File) => {
    if (photos.length >= MAX_PHOTOS || busy || !valid(file)) return;
    setBusy(true);
    try {
      await uploadFile(file, photos.length);
      onMessage("Foto agregada.");
      load();
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Error al subir.", false);
    }
    setBusy(false);
  };

  const handleReplace = async (photo: Photo, file: File) => {
    if (busy || !valid(file)) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const oldPath = photo.storage_path;
      const path = `sorteo/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("raffle-images").upload(path, file, {
        contentType: file.type, upsert: false
      });
      if (upErr) throw new Error(upErr.message);
      const { data } = supabase.storage.from("raffle-images").getPublicUrl(path);
      const { error: updErr } = await supabase.from("raffle_images").update({
        image_url: data.publicUrl, storage_path: path
      }).eq("id", photo.id);
      if (updErr) {
        await supabase.storage.from("raffle-images").remove([path]);
        throw new Error(updErr.message);
      }
      if (!oldPath.startsWith("seed/")) await supabase.storage.from("raffle-images").remove([oldPath]);
      onMessage("Foto reemplazada.");
      load();
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Error al reemplazar.", false);
    }
    setBusy(false);
  };

  const handleDelete = async (photo: Photo) => {
    if (busy || !confirm("¿Eliminar esta foto?")) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("raffle_images").delete().eq("id", photo.id);
    if (!error && !photo.storage_path.startsWith("seed/")) {
      await supabase.storage.from("raffle-images").remove([photo.storage_path]);
    }
    onMessage(error ? "Error al eliminar." : "Foto eliminada.", !error);
    // Reordena correlativos
    const rest = photos.filter((p) => p.id !== photo.id);
    await Promise.all(rest.map((p, i) =>
      supabase.from("raffle_images").update({ sort_order: i }).eq("id", p.id)
    ));
    setBusy(false);
    load();
  };

  const move = async (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= photos.length || busy) return;
    setBusy(true);
    const supabase = createClient();
    const a = photos[index], b = photos[j];
    await supabase.from("raffle_images").update({ sort_order: b.sort_order }).eq("id", a.id);
    await supabase.from("raffle_images").update({ sort_order: a.sort_order }).eq("id", b.id);
    setBusy(false);
    load();
  };

  return (
    <div className="mt-6 border-t border-slate-100 pt-5 dark:border-white/5">
      <h3 className="flex items-center gap-2 font-bold">
        <ImageIcon className="h-5 w-5 text-brand-600 dark:text-brand-300" />
        Fotos del sorteo ({photos.length}/{MAX_PHOTOS})
      </h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Se muestran en la portada. Click en una foto la amplía y se puede navegar entre ellas.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {photos.map((p, i) => (
          <div key={p.id} className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.image_url} alt={`Foto ${i + 1}`} className="aspect-[9/16] w-full object-cover" loading="lazy" />
            <div className="flex items-center justify-between gap-1 p-2">
              <div className="flex gap-1">
                <button onClick={() => move(i, -1)} disabled={i === 0 || busy} aria-label="Mover antes"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 transition hover:border-brand-400 disabled:opacity-40 dark:border-white/10">
                  <ArrowUpIcon className="h-4 w-4" />
                </button>
                <button onClick={() => move(i, 1)} disabled={i === photos.length - 1 || busy} aria-label="Mover después"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 transition hover:border-brand-400 disabled:opacity-40 dark:border-white/10">
                  <ArrowDownIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setReplaceId(p.id); replaceRef.current?.click(); }} disabled={busy}
                  className="h-9 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold transition hover:border-brand-400 disabled:opacity-40 dark:border-white/10">
                  Cambiar
                </button>
                <button onClick={() => handleDelete(p)} disabled={busy} aria-label="Eliminar foto"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 text-rose-600 transition hover:bg-rose-50 disabled:opacity-40 dark:border-rose-500/30 dark:text-rose-300">
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {photos.length < MAX_PHOTOS && (
          <button onClick={() => addRef.current?.click()} disabled={busy}
            className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 text-sm font-semibold text-brand-700 transition hover:border-brand-500 hover:bg-brand-50 disabled:opacity-50 dark:border-white/15 dark:text-brand-300 dark:hover:bg-night-800">
            <ImageIcon className="h-6 w-6" />
            {busy ? "Subiendo…" : "Agregar foto"}
          </button>
        )}
      </div>

      <input ref={addRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAdd(f); e.target.value = ""; }} />
      <input ref={replaceRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          const target = photos.find((p) => p.id === replaceId);
          if (f && target) handleReplace(target, f);
          e.target.value = "";
        }} />
    </div>
  );
}
