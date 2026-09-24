"use client";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeftIcon, ChevronRightIcon, ImageIcon, XIcon } from "./icons";

export interface GalleryPhoto {
  id: string;
  image_url: string;
  sort_order: number;
}

export default function PhotoGallery({ photos }: { photos: GalleryPhoto[] }) {
  const [open, setOpen] = useState<number | null>(null);

  const close = useCallback(() => setOpen(null), []);
  const step = useCallback(
    (dir: 1 | -1) => setOpen((cur) => (cur === null ? cur : (cur + dir + photos.length) % photos.length)),
    [photos.length]
  );

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close, step]);

  if (photos.length === 0) return null;

  return (
    <section aria-label="Fotos del sorteo" className="animate-fade-up overflow-hidden rounded-3xl border border-brand-100 bg-white shadow-card dark:border-white/10 dark:bg-night-850">
      <div className="grid grid-cols-3 gap-1.5 p-2 sm:gap-2 sm:p-3">
        {photos.map((p, i) => (
          <button
            key={p.id}
            onClick={() => setOpen(i)}
            aria-label={`Ampliar foto ${i + 1} de ${photos.length}`}
            className="group relative aspect-[9/16] overflow-hidden rounded-2xl bg-slate-100 dark:bg-night-800"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.image_url}
              alt={`Foto ${i + 1} del sorteo`}
              loading="lazy"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
            <span className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-night-950/60 text-white opacity-0 backdrop-blur transition group-hover:opacity-100">
              <ImageIcon className="h-4 w-4" />
            </span>
          </button>
        ))}
      </div>

      {open !== null && typeof document !== "undefined" && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Foto ${open + 1} de ${photos.length}`}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-night-950/90 p-4 backdrop-blur-sm"
          onClick={close}
        >
          <button
            onClick={close}
            aria-label="Cerrar"
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
          >
            <XIcon className="h-5 w-5" />
          </button>

          {photos.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); step(-1); }}
                aria-label="Foto anterior"
                className="absolute left-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 sm:left-6"
              >
                <ChevronLeftIcon className="h-6 w-6" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); step(1); }}
                aria-label="Foto siguiente"
                className="absolute right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25 sm:right-6"
              >
                <ChevronRightIcon className="h-6 w-6" />
              </button>
            </>
          )}

          <figure className="max-h-full animate-pop-in" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photos[open].image_url}
              alt={`Foto ${open + 1} del sorteo ampliada`}
              className="max-h-[80dvh] w-auto max-w-full rounded-2xl object-contain shadow-card"
            />
            <figcaption className="tnum mt-3 text-center font-num text-sm font-bold text-white/80">
              {open + 1} / {photos.length}
            </figcaption>
          </figure>
        </div>,
        document.body
      )}
    </section>
  );
}
