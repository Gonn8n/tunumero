# Tunumero — sitio de sorteo (rango configurable, techo 99999)

Next.js 14 + Tailwind + Supabase + next-themes. Deploy pensado para `tunumero.vercel.app`.

## 1. Supabase
1. En tu proyecto existente: SQL Editor → pegar `supabase.sql` → Run (re-ejecutable, crea lo que falte: bucket `raffle-images`, tabla `raffle_images`, policies, triggers, RPCs).
2. Authentication → Add user (tantos admins como quieras, email+password).
3. Opcional: `admin_profiles(user_id, display_name)` para nombre visible.
4. Ajustá `whatsapp_number` en `raffle_settings` (solo dígitos, ej `5491100000000`).
5. Para el flujo seguro, agregá `SUPABASE_SERVICE_ROLE_KEY` en `.env.local` y en Vercel. Es **solo servidor**: la home, el alta de reservas y MercadoPago la usan para no exponer DNI/teléfonos ni permitir que el navegador forje premios. Nunca la pongas con prefijo `NEXT_PUBLIC_`. Sin esta key, la home falla cerrada y muestra “Sitio no disponible”.

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
- Al pausar podés editar el **mensaje para clientes** y una **fecha estimada de regreso**. Ambos se guardan en `raffle_settings` (`site_pause_message`, `site_pause_until`) y se pueden cambiar después con *Editar mensaje* sin reactivar.
- Con el sitio pausado, `/` muestra una **página de mantenimiento neutral** (no 404). Las reservas web se rechazan en `/api/reservations`, los giros nuevos se bloquean y `/api/wheel` responde sin premios. `/admin` sigue accesible y `/pago` + webhooks de MP siguen funcionando para acreditar pagos ya iniciados.
- Se reactiva desde **Activar sitio**.
- El mensaje público no debe mencionar pagos, deudas ni suspensión.

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
- Import repo → Project Name `tunumero` → env `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` → Deploy.
- Verificá en Supabase Auth que el registro público esté deshabilitado; los admins se crean manualmente desde Authentication → Users.

## Rutas
- `/` pública: info sorteo, buscador, sugerencias (misma terminación + cercanos), modal Nombre/Apellido/DNI/Teléfono + botón WhatsApp. Si el sitio está pausado, muestra la página de mantenimiento.
- `/api/reservations` (POST): valida números, datos y premio de ruleta en el servidor; es el único camino para crear reservas web.
- `/admin/login` login Supabase Auth.
- `/admin` cards (disponibles/reservados/pendientes/confirmados/cancelados) + tabs + reservar manual + config (premio, fecha, precio, alias único, transferencia, WhatsApp, **rango mínimo/máximo**). Confirmar pago guarda `confirmed_by`. Achicar el rango se bloquea si hay números activos fuera (UI + trigger DB).
