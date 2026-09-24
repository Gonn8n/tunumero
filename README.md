# Tunumero — sitio de sorteo (rango configurable, techo 99999)

Next.js 14 + Tailwind + Supabase + next-themes. Deploy pensado para `tunumero.vercel.app`.

## 1. Supabase
1. En tu proyecto existente: SQL Editor → pegar `supabase.sql` → Run.
2. Authentication → Add user (tantos admins como quieras, email+password).
3. Opcional: `admin_profiles(user_id, display_name)` para nombre visible.
4. Ajustá `whatsapp_number` en `raffle_settings` (solo dígitos, ej `5491100000000`).

## 2. Local
```bash
cp .env.example .env.local  # y completá keys
npm install
npm run dev
```

## 3. Vercel
- Import repo → Project Name `tunumero` → env `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` → Deploy.

## Rutas
- `/` pública: info sorteo, buscador, sugerencias (misma terminación + cercanos), modal Nombre/Apellido/DNI/Teléfono + botón WhatsApp.
- `/admin/login` login Supabase Auth.
- `/admin` cards (disponibles/reservados/pendientes/confirmados/cancelados) + tabs + reservar manual + config (premio, fecha, precio, alias único, transferencia, WhatsApp, **rango mínimo/máximo**). Confirmar pago guarda `confirmed_by`. Achicar el rango se bloquea si hay números activos fuera (UI + trigger DB).
