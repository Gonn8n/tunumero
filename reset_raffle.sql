-- ============================================================
-- REINICIO MANUAL DEL SORTEO (Supabase → SQL Editor → Run)
--
-- Borra clientes, reservas y datos transaccionales:
--   tickets, ticket_history, mp_payments, wheel_spins
--
-- CONSERVA: configuración del sorteo, premios del podio, promos,
-- fotos de la galería, premios/catálogo de la ruleta y admins.
--
-- No cancela pagos ya creados en MercadoPago (solo borra el registro
-- local). Un webhook que llegue después del reinicio no vuelve a crear
-- tickets: la función mp_confirm_batch no encuentra pendientes.
-- ============================================================

-- 1) Conteo previo (opcional, para revisar antes de borrar)
select
  (select count(*) from public.tickets)        as tickets,
  (select count(*) from public.ticket_history) as historial,
  (select count(*) from public.mp_payments)    as pagos_mp,
  (select count(*) from public.wheel_spins)    as giros_ruleta;

-- 2) Borrado transaccional
begin;
delete from public.ticket_history;
delete from public.wheel_spins;
delete from public.mp_payments;
delete from public.tickets;
commit;
