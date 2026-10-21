# Tunumero — sitio de sorteo (rango configurable, techo 99999)

Next.js 14 + Tailwind + Supabase + next-themes. Deploy pensado para `tunumero.vercel.app`.

## 1. Supabase
1. En tu proyecto existente: SQL Editor → pegar `supabase.sql` → Run (re-ejecutable, crea lo que falte: bucket `raffle-images`, tabla `raffle_images`, policies, triggers, RPCs).
2. Authentication → Add user (tantos admins como quieras, email+password).
3. Opcional: `admin_profiles(user_id, display_name)` para nombre visible.
4. Ajustá `whatsapp_number` en `raffle_settings` (solo dígitos, ej `5491100000000`).

### Superadmin
`supabase.sql` marca automáticamente como superadmin a **anexaria@gmail.com** (si ese usuario ya existe en Authentication). Para marcar otra cuenta:

```sql
insert into public.admin_profiles (user_id, display_name, is_super)
select id,
       coalesce(nullif(raw_user_meta_data->>'display_name', ''), split_part(email, '@', 1)),
       true
from auth.users
where lower(email) = 'otro@email.com'
on conflict (user_id) do update set is_super = true;
```

El flag `is_super` **solo** se puede cambiar desde el SQL Editor: un trigger bloquea la autopromoción desde la app. El superadmin puede pausar el sitio y reiniciar el sorteo; un admin común no ve esas opciones y los RPCs le devuelven error de permiso.

### Pausar el sitio (impago)
- Config → **Sitio público** → *Pausar sitio* (solo superadmin, con confirmación).
- Con el sitio pausado, `/` responde **404** (`app/not-found.tsx`), las reservas web se rechazan por RLS y `/api/wheel` bloquea giros nuevos. `/admin` sigue accesible y `/pago` + webhooks de MP siguen funcionando para acreditar pagos ya iniciados.
- Se reactiva desde el mismo botón.

### Reiniciar el sorteo
- **Desde el admin**: Config → *Zona de peligro* → *Reiniciar sorteo* (solo superadmin). Pide escribir `REINICIAR` y llama al RPC `reset_raffle()`, que devuelve los conteos borrados.
- **Manual**: ejecutar `reset_raffle.sql` en el SQL Editor.
- Ambos borran `tickets`, `ticket_history`, `mp_payments` y `wheel_spins`. Conservan configuración, premios, promos, fotos, catálogo de ruleta y admins. Las fotos del bucket no se eliminan.

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
