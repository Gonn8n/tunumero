# Pendientes — Plataforma Tunumero

Actualizado: 22/10/2026

Estado actual: el sitio está funcional con reservas, MercadoPago, ruleta de premios, podio de premios editable, superadmin, reinicio del sorteo y pausa neutral con mensaje/fecha editable. Las reservas y los pagos ahora pasan por API server-side con service role; falta aplicar el SQL nuevo, configurar la service key, desplegar y validar los flujos en producción.

---

## 1. Bloqueantes para cerrar la entrega

- [ ] Correr el `supabase.sql` actualizado en Supabase (columnas `site_enabled`, `site_pause_message` y `site_pause_until`; trigger de protección; RPCs `admin_is_super`, `set_site_enabled(boolean,text,timestamptz)` y `reset_raffle`; policies nuevas sin lectura/escritura anónima de tickets, pagos ni giros).
- [ ] Configurar `SUPABASE_SERVICE_ROLE_KEY` en `.env.local` y en Vercel (solo servidor, nunca `NEXT_PUBLIC_`).
- [ ] Verificar que `anexaria@gmail.com` quedó con `is_super = true`:
  ```sql
  select u.email, p.is_super
  from public.admin_profiles p
  join auth.users u on u.id = p.user_id
  where lower(u.email) = 'anexaria@gmail.com';
  ```
- [ ] Desplegar el commit con estos cambios en Vercel (o redeploy manual).
- [ ] Probar pausa del sitio: `/` muestra la página de mantenimiento (sin 404), mensaje y fecha visibles, WhatsApp correcto, `/admin` sigue accesible y el alta de reservas/giros queda bloqueada. Reactivar y confirmar que vuelve a funcionar.
- [ ] Probar seguridad con la anon key: tickets y pagos sin lectura, `mp_confirm_batch` denegada e inserción directa de tickets denegada. Crear una reserva con premio y verificar que el servidor decide los números de regalo.
- [ ] Verificar que el registro público de Supabase Auth esté deshabilitado. Las policies de admin permiten a cualquier usuario autenticado leer tickets; si se habilita el registro, hay que migrar a una allowlist de admins.
- [ ] Probar reinicio del sorteo desde el admin (escribir `REINICIAR`) y desde `reset_raffle.sql`. Descargar el Excel antes de borrar datos reales.
- [ ] Probar un pago de MercadoPago de punta a punta: checkout, webhook, `/pago` y botón "Verificar MP". Confirmar que el pedido se acredita solo.
- [ ] Revisar mobile y desktop después del deploy: podio de premios, chips de números, badges de pago y modales nuevos.

## 2. Comercial

- [ ] Revisar y validar los precios de `PLAN-COMERCIAL.md`.
- [ ] Definir moneda de cobro y mecanismo de ajuste (ARS por IPC o USD anual).
- [ ] Definir contrato, facturación y forma de cobro mensual.
- [ ] Definir onboarding por cliente: instancia dedicada, credenciales de MercadoPago, dominio y accesos.
- [ ] Definir política de impago: días de gracia, pausa, retención de datos y costo de reactivación.
- [ ] Definir límites de soporte, tiempos de respuesta y adicionales.
- [ ] Preparar propuesta comercial en PDF para enviar al cliente.

## 3. Mejoras futuras (no bloqueantes)

- [ ] Autogestión de superadmins desde el panel (hoy solo por SQL).
- [ ] Multi-sorteo simultáneo o multi-tenant (hoy una instancia por cliente).
- [ ] Emails transaccionales de confirmación de compra.
- [ ] Página de bases y condiciones / información legal del sorteo.
- [ ] Analítica de ventas y embudo de conversión.
- [ ] Cobro recurrente del abono del servicio (link de suscripción de MercadoPago).
- [ ] Revisión final de accesibilidad, performance y SEO.
- [ ] Política de backups y restauración documentada.
- [ ] Rate limiting en `/api/reservations` y `/api/wheel` para evitar reservas/giros masivos.
- [ ] Limitar giros de ruleta por IP/dispositivo: hoy `session_key` la genera el cliente y se puede regenerar para obtener más premios.
- [ ] Tests automatizados de los flujos críticos (reserva, pago, reinicio, pausa).

---

## Orden sugerido

1. SQL + superadmin + service key.
2. Deploy y pruebas de pausa/reinicio.
3. Pruebas de seguridad (anon key, premios, confirmación MP).
4. Prueba de pago real.
5. Cierre comercial y propuesta al cliente.
