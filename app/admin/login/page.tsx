"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EyeIcon, EyeOffIcon, ShieldIcon, TicketIcon } from "@/components/icons";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const login = async () => {
    if (loading) return;
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("Credenciales inválidas. Revisá email y contraseña.");
      return;
    }
    router.push("/admin");
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-b from-brand-800 via-brand-700 to-brand-600 p-4">
      <div className="bg-blueprint absolute inset-0" aria-hidden="true" />
      <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-sky-400/30 blur-3xl" aria-hidden="true" />

      <main className="relative w-full max-w-sm animate-pop-in rounded-3xl bg-white p-7 shadow-card dark:bg-night-850">
        <Link href="/" className="flex items-center gap-2 font-extrabold tracking-tight text-brand-700 dark:text-brand-300">
          <TicketIcon className="h-5 w-5" />
          <span className="font-num">tunumero</span>
        </Link>
        <div className="mt-4 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-glow">
            <ShieldIcon className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Acceso Admin</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Ingresá con tu usuario registrado.</p>
          </div>
        </div>

        <label className="mt-5 block text-sm font-medium">
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            className="mt-1 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 dark:border-white/10 dark:bg-night-800"
          />
        </label>
        <label className="mt-3 block text-sm font-medium">
          Contraseña
          <span className="relative mt-1 block">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 pr-12 dark:border-white/10 dark:bg-night-800"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              aria-pressed={showPassword}
              className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:text-brand-600"
            >
              {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
            </button>
          </span>
        </label>
        {error && <p role="alert" className="mt-3 text-sm font-medium text-rose-500">{error}</p>}
        <button
          onClick={login}
          disabled={loading}
          className="mt-4 h-12 w-full rounded-xl bg-brand-600 font-semibold text-white shadow-glow transition hover:bg-brand-700 active:scale-[.98] disabled:opacity-60"
        >
          {loading ? "Ingresando…" : "Entrar al panel"}
        </button>
      </main>
    </div>
  );
}
