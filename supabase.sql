-- SORTEO tunumero — pegar en Supabase SQL Editor (proyecto existente)
create table if not exists public.raffle_settings (
  id int primary key default 1,
  title text not null default 'Gran Sorteo Tunumero',
  subtitle text default 'Moto 0km + $500.000 en efectivo',
  description text default 'Sorteo por lotería. Se venden números del 0 al 4999. ¡Elegí el tuyo!',
  prize_image_url text,
  draw_date timestamptz default now() + interval '30 days',
  ticket_price numeric(12,2) not null default 2000,
  currency text not null default 'ARS',
  whatsapp_number text not null default '5491100000000',
  alias text default 'TUNUMERO.SORTEO',
  transfer_holder text default 'Sorteo Tunumero',
  transfer_cbu text default '0000003100000000000000',
  transfer_bank text default 'Mercado Pago',
  min_number int not null default 0,
  max_number int not null default 4999,
  site_enabled boolean not null default true,
  updated_at timestamptz default now(),
  updated_by uuid,
  constraint single_row check (id = 1),
  constraint settings_range_valid check (min_number >= 0 and max_number <= 99999 and min_number <= max_number)
);

-- Pausa comercial: la home muestra una página de mantenimiento neutral y
-- se bloquean reservas/giros nuevos. El panel admin sigue disponible.
alter table public.raffle_settings add column if not exists site_enabled boolean not null default true;
alter table public.raffle_settings add column if not exists site_pause_message text;
alter table public.raffle_settings add column if not exists site_pause_until timestamptz;

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  number int not null check (number >= 0 and number <= 99999),
  nombre text not null,
  apellido text not null,
  dni text not null,
  telefono text not null,
  status text not null default 'pendiente'
    check (status in ('pendiente','reservado','confirmado','cancelado')),
  source text not null default 'web' check (source in ('web','admin')),
  created_by uuid,
  confirmed_by uuid,
  confirmed_at timestamptz,
  cancelled_by uuid,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists tickets_number_active_uniq
  on public.tickets (number) where (status in ('pendiente','reservado','confirmado'));
create index if not exists tickets_status_idx on public.tickets (status);
create index if not exists tickets_dni_idx on public.tickets (dni);

create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  is_super boolean not null default false,
  created_at timestamptz default now()
);

-- Superadmin: puede pausar el sitio y reiniciar el sorteo.
alter table public.admin_profiles add column if not exists is_super boolean not null default false;

alter table public.raffle_settings enable row level security;
alter table public.tickets enable row level security;
alter table public.admin_profiles enable row level security;

drop policy if exists "settings public read" on public.raffle_settings;
create policy "settings public read" on public.raffle_settings for select using (true);
drop policy if exists "settings admin write" on public.raffle_settings;
create policy "settings admin write" on public.raffle_settings
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Los tickets NO se leen ni se insertan directo desde el navegador:
-- la home y el alta de reservas pasan por API server-side con service role.
-- Esto evita exponer nombre/DNI/teléfono y evita que el cliente forje premios.
drop policy if exists "tickets public insert pendiente" on public.tickets;
drop policy if exists "tickets public read active numbers" on public.tickets;
drop policy if exists "tickets admin all" on public.tickets;
create policy "tickets admin all" on public.tickets
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
revoke all on public.tickets from anon;

drop policy if exists "profiles admin read" on public.admin_profiles;
create policy "profiles admin read" on public.admin_profiles
  for select using (auth.role() = 'authenticated');

-- Cada admin puede crear/editar SOLO su propia fila (para el nombre visible desde el panel)
drop policy if exists "profiles self insert" on public.admin_profiles;
create policy "profiles self insert" on public.admin_profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "profiles self update" on public.admin_profiles;
create policy "profiles self update" on public.admin_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- El flag is_super NO se puede cambiar desde la app (solo SQL Editor / service role).
create or replace function public.protect_super_flag()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' and new.is_super then
      raise exception 'El flag is_super solo se modifica desde el SQL Editor'
        using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.is_super is distinct from old.is_super then
      raise exception 'El flag is_super solo se modifica desde el SQL Editor'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_super on public.admin_profiles;
create trigger trg_protect_super
  before insert or update on public.admin_profiles
  for each row execute function public.protect_super_flag();

insert into public.raffle_settings (id) values (1)
  on conflict (id) do nothing;

-- No permitir achicar el rango si hay tickets ACTIVOS fuera del nuevo rango
create or replace function public.check_range_shrink()
returns trigger language plpgsql as $$
declare
  fuera int;
begin
  if new.min_number is distinct from old.min_number
     or new.max_number is distinct from old.max_number then
    select count(*) into fuera from public.tickets
      where status in ('pendiente','reservado','confirmado')
        and (number < new.min_number or number > new.max_number);
    if fuera > 0 then
      raise exception 'Hay % número(s) activos fuera del nuevo rango. Cancelalos antes de achicar.', fuera;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_range_shrink on public.raffle_settings;
create trigger trg_range_shrink
  before update on public.raffle_settings
  for each row execute function public.check_range_shrink();

-- ============ FOTOS DEL SORTEO (máx 3, Storage + tabla) ============

-- Bucket público para las fotos
insert into storage.buckets (id, name, public)
  values ('raffle-images', 'raffle-images', true)
  on conflict (id) do update set public = true;

-- Lectura pública de fotos
drop policy if exists "raffle images public read" on storage.objects;
create policy "raffle images public read" on storage.objects
  for select using (bucket_id = 'raffle-images');

-- Solo admins (autenticados) suben / reemplazan / borran
drop policy if exists "raffle images admin write" on storage.objects;
create policy "raffle images admin write" on storage.objects
  for insert with check (bucket_id = 'raffle-images' and auth.role() = 'authenticated');

drop policy if exists "raffle images admin update" on storage.objects;
create policy "raffle images admin update" on storage.objects
  for update using (bucket_id = 'raffle-images' and auth.role() = 'authenticated')
  with check (bucket_id = 'raffle-images');

drop policy if exists "raffle images admin delete" on storage.objects;
create policy "raffle images admin delete" on storage.objects
  for delete using (bucket_id = 'raffle-images' and auth.role() = 'authenticated');

-- Tabla de fotos (orden + URL pública)
create table if not exists public.raffle_images (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  storage_path text not null,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

alter table public.raffle_images enable row level security;

drop policy if exists "images public read" on public.raffle_images;
create policy "images public read" on public.raffle_images for select using (true);

drop policy if exists "images admin all" on public.raffle_images;
create policy "images admin all" on public.raffle_images
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Tope: máximo 3 fotos
create or replace function public.check_max_images()
returns trigger language plpgsql as $$
declare
  total int;
begin
  select count(*) into total from public.raffle_images;
  if total >= 3 then
    raise exception 'Máximo 3 fotos. Eliminá o reemplazá una existente.';
  end if;
  return new;
end $$;

drop trigger if exists trg_max_images on public.raffle_images;
create trigger trg_max_images
  before insert on public.raffle_images
  for each row execute function public.check_max_images();

-- Fotos de ejemplo (solo si la tabla está vacía, para ver el diseño en local)
insert into public.raffle_images (image_url, storage_path, sort_order)
  select 'https://picsum.photos/seed/tunumero1/800/600', 'seed/tunumero1', 0
  where not exists (select 1 from public.raffle_images)
  union all
  select 'https://picsum.photos/seed/tunumero2/800/600', 'seed/tunumero2', 1
  where not exists (select 1 from public.raffle_images)
  union all
  select 'https://picsum.photos/seed/tunumero3/800/600', 'seed/tunumero3', 2
  where not exists (select 1 from public.raffle_images);

-- ============ HISTORIAL DE MOVIMIENTOS (auditoría) ============

create table if not exists public.ticket_history (
  id bigint generated always as identity primary key,
  ticket_id uuid not null,
  number int not null,
  action text not null,
  actor_id uuid,
  detail text,
  created_at timestamptz default now()
);

create index if not exists ticket_history_ticket_idx on public.ticket_history (ticket_id);
create index if not exists ticket_history_number_idx on public.ticket_history (number);
create index if not exists ticket_history_created_idx on public.ticket_history (created_at desc);

alter table public.ticket_history enable row level security;

drop policy if exists "history admin read" on public.ticket_history;
create policy "history admin read" on public.ticket_history
  for select using (auth.role() = 'authenticated');

-- Registra automáticamente cada alta y cada cambio de estado.
-- SECURITY DEFINER: el trigger escribe aunque el actor sea anónimo (reserva web).
create or replace function public.log_ticket_movement()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ticket_history (ticket_id, number, action, actor_id, detail)
      values (new.id, new.number, new.status, new.created_by, new.source);
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.ticket_history (ticket_id, number, action, actor_id, detail)
      values (new.id, new.number, new.status,
        coalesce(new.confirmed_by, new.cancelled_by, new.created_by),
        new.cancel_reason);
  end if;
  return new;
end $$;

drop trigger if exists trg_ticket_history on public.tickets;
create trigger trg_ticket_history
  after insert or update on public.tickets
  for each row execute function public.log_ticket_movement();

-- ============ PROMOS (packs configurables, ej. 3 x $5000) ============

create table if not exists public.promos (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Promo',
  quantity int not null check (quantity >= 2 and quantity <= 100),
  price numeric(12,2) not null check (price >= 0),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

alter table public.promos enable row level security;

drop policy if exists "promos public read" on public.promos;
create policy "promos public read" on public.promos for select using (true);

drop policy if exists "promos admin all" on public.promos;
create policy "promos admin all" on public.promos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Lote de reserva múltiple (agrupa los números de una misma compra)
alter table public.tickets add column if not exists batch_id uuid;
create index if not exists tickets_batch_idx on public.tickets (batch_id);

-- Promo de ejemplo (solo si no hay ninguna)
insert into public.promos (name, quantity, price, sort_order)
  select 'Promo 3', 3, 5000, 0
  where not exists (select 1 from public.promos);

-- ============ RULETA DE PREMIOS (Opción A: maestro + 1 ventana) ============

-- Config global (1 fila): maestro, vigencia, ventana diaria ART, días, timers
create table if not exists public.wheel_config (
  id int primary key default 1,
  enabled boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  daily_from text, -- 'HH:MM' America/Argentina, null = todo el día
  daily_to text,
  weekdays int[] not null default array[0,1,2,3,4,5,6], -- 0=domingo
  prize_minutes int not null default 20,
  upsell_enabled boolean not null default true,
  upsell_seconds int not null default 20,
  constraint wheel_single_row check (id = 1)
);

-- Catálogo de premios: discount (% off) | bonus (+N chances) | multiplier (x2/x3)
create table if not exists public.wheel_segments (
  id uuid primary key default gen_random_uuid(),
  label text not null default 'Premio',
  kind text not null check (kind in ('discount','bonus','multiplier')),
  value numeric(12,2) not null check (value > 0),
  weight int not null default 10 check (weight >= 0),
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz default now()
);

-- Giros: 1 vigente por sesión; el servidor elige el premio (el front solo anima)
create table if not exists public.wheel_spins (
  id uuid primary key default gen_random_uuid(),
  session_key text not null,
  segment_id uuid references public.wheel_segments(id) on delete set null,
  label text not null,
  kind text not null,
  value numeric(12,2) not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_batch_id uuid,
  created_at timestamptz default now()
);
create index if not exists wheel_spins_session_idx on public.wheel_spins (session_key);

alter table public.wheel_config enable row level security;
alter table public.wheel_segments enable row level security;
alter table public.wheel_spins enable row level security;

drop policy if exists "wheel config public read" on public.wheel_config;
create policy "wheel config public read" on public.wheel_config for select using (true);
drop policy if exists "wheel config admin all" on public.wheel_config;
create policy "wheel config admin all" on public.wheel_config
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "wheel segments public read" on public.wheel_segments;
create policy "wheel segments public read" on public.wheel_segments for select using (true);
drop policy if exists "wheel segments admin all" on public.wheel_segments;
create policy "wheel segments admin all" on public.wheel_segments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Spins: el navegador NO lee ni escribe esta tabla directo.
-- La API de ruleta usa service role; el admin autenticado puede ver todo.
drop policy if exists "wheel spins public read" on public.wheel_spins;
drop policy if exists "wheel spins anon insert" on public.wheel_spins;
drop policy if exists "wheel spins mark used" on public.wheel_spins;
drop policy if exists "wheel spins admin all" on public.wheel_spins;
create policy "wheel spins admin all" on public.wheel_spins
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
revoke all on public.wheel_spins from anon;

insert into public.wheel_config (id) values (1)
  on conflict (id) do nothing;

-- Catálogo inicial estilo referencia: 30/20/10% off, x2/x3, +1/+3/+5
insert into public.wheel_segments (label, kind, value, weight, sort_order)
  select * from (values
    ('30% de descuento', 'discount', 30, 8, 0),
    ('+5 chances', 'bonus', 5, 10, 1),
    ('x2 tu pack', 'multiplier', 2, 14, 2),
    ('10% de descuento', 'discount', 10, 22, 3),
    ('+3 chances', 'bonus', 3, 16, 4),
    ('20% de descuento', 'discount', 20, 12, 5),
    ('x3 tu pack', 'multiplier', 3, 8, 6),
    ('+1 chance', 'bonus', 1, 10, 7)
  ) as v(label, kind, value, weight, sort_order)
  where not exists (select 1 from public.wheel_segments);

-- Premio aplicado por lote de reserva (misma fila por número del batch)
alter table public.tickets add column if not exists prize_label text;
alter table public.tickets add column if not exists prize_kind text;
alter table public.tickets add column if not exists prize_value numeric(12,2);
alter table public.tickets add column if not exists is_bonus boolean not null default false;

-- ============ MERCADOPAGO (Checkout Pro + confirmación automática) ============

-- Interruptor de cobro con MP (visible en Config del admin)
alter table public.raffle_settings add column if not exists mp_enabled boolean not null default true;

-- Pagos: 1 fila por intento (pendiente) → se actualiza al llegar el webhook
create table if not exists public.mp_payments (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  mp_preference_id text,
  mp_payment_id text,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','review')),
  amount numeric(12,2) not null,
  currency text not null default 'ARS',
  payer_email text,
  created_at timestamptz default now()
);
create index if not exists mp_payments_batch_idx on public.mp_payments (batch_id);
create index if not exists mp_payments_payment_idx on public.mp_payments (mp_payment_id);

alter table public.mp_payments enable row level security;

-- Solo el admin autenticado lee esta tabla desde el panel.
-- La API server-side (checkout, webhook, status) usa service role y bypassa RLS.
drop policy if exists "mp payments admin read" on public.mp_payments;
create policy "mp payments admin read" on public.mp_payments
  for select using (auth.role() = 'authenticated');
drop policy if exists "mp payments admin all" on public.mp_payments;
create policy "mp payments admin all" on public.mp_payments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "mp payments api insert" on public.mp_payments;
drop policy if exists "mp payments api update" on public.mp_payments;
drop policy if exists "mp payments api read" on public.mp_payments;
revoke all on public.mp_payments from anon;

-- Confirmación por webhook: SOLO pendiente → confirmado del mismo lote.
-- SECURITY DEFINER y ejecutable SOLO por service_role: si estuviera expuesta al
-- navegador, cualquiera podría confirmar su lote sin pagar. La API server-side
-- re-consulta el pago a MercadoPago antes de llamar a esta función.
create or replace function public.mp_confirm_batch(p_batch uuid, p_payment_id text, p_amount numeric)
returns text language plpgsql security definer set search_path = public as $$
declare
  pendientes int;
  esperado numeric;
begin
  if p_batch is null or p_payment_id is null or p_amount is null or p_amount <= 0 then
    return 'invalid';
  end if;
  -- El monto aprobado por MP debe cubrir el último intento de checkout del lote.
  select amount into esperado
    from public.mp_payments
    where batch_id = p_batch and status = 'pending'
    order by created_at desc
    limit 1;
  if found and p_amount + 1 < esperado then
    raise exception 'El monto pagado (%) no coincide con el esperado (%)', p_amount, esperado
      using errcode = '22003';
  end if;
  select count(*) into pendientes from public.tickets
    where batch_id = p_batch and status = 'pendiente';
  if pendientes = 0 then
    return 'nothing';
  end if;
  update public.tickets
    set status = 'confirmado', confirmed_at = now(), updated_at = now()
    where batch_id = p_batch and status = 'pendiente';
  update public.mp_payments
    set status = 'approved', mp_payment_id = p_payment_id
    where batch_id = p_batch and status = 'pending';
  if not found then
    insert into public.mp_payments (batch_id, mp_payment_id, status, amount)
      values (p_batch, p_payment_id, 'approved', p_amount);
  end if;
  return 'ok';
end $$;

revoke all on function public.mp_confirm_batch(uuid, text, numeric) from public;
revoke all on function public.mp_confirm_batch(uuid, text, numeric) from anon, authenticated;
grant execute on function public.mp_confirm_batch(uuid, text, numeric) to service_role;

-- ============ PREMIOS DEL SORTEO (podio del hero) ============

-- Lista ordenada de premios: [{"label":"MOTO HONDA WAVE 2026"}, ...]
alter table public.raffle_settings add column if not exists prizes jsonb not null default '[]'::jsonb;

-- Seed: deja cargados los 3 premios si la lista está vacía y limpia el subtítulo
-- que tenía el texto pegado como una sola línea.
update public.raffle_settings
set prizes = '[{"label":"MOTO HONDA WAVE 2026"},{"label":"MOTO GILERA 110 2021"},{"label":"BICI RODADO 29"}]'::jsonb,
    subtitle = case when subtitle ilike '1er premio%' then null else subtitle end
where id = 1 and (prizes is null or prizes = '[]'::jsonb);

-- ============ SUPERADMIN + PAUSA DEL SITIO + REINICIO ============

-- ¿El usuario logueado es superadmin?
create or replace function public.admin_is_super()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_super from public.admin_profiles where user_id = auth.uid()), false);
$$;
revoke all on function public.admin_is_super() from public;
grant execute on function public.admin_is_super() to authenticated;

-- Activar/pausar la web (solo superadmin). Con site_enabled=false:
-- la home muestra una página de mantenimiento neutral y se bloquean
-- reservas/giros nuevos. El mensaje y la fecha son editables.
drop function if exists public.set_site_enabled(boolean);
create or replace function public.set_site_enabled(
  p_enabled boolean,
  p_message text default null,
  p_until timestamptz default null
)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_enabled boolean := coalesce(p_enabled, true);
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_until timestamptz := p_until;
begin
  if not public.admin_is_super() then
    raise exception 'Solo el superadmin puede activar o pausar el sitio'
      using errcode = '42501';
  end if;
  if v_message is not null and char_length(v_message) > 500 then
    raise exception 'El mensaje no puede superar los 500 caracteres'
      using errcode = '22001';
  end if;
  if not v_enabled and v_until is not null and v_until <= now() then
    raise exception 'La fecha de regreso debe ser futura'
      using errcode = '22007';
  end if;
  update public.raffle_settings
    set site_enabled = v_enabled,
        site_pause_message = case
          when v_enabled then site_pause_message
          else coalesce(v_message, site_pause_message, 'Estamos actualizando el sitio. Volvemos pronto.')
        end,
        site_pause_until = case when v_enabled then null else v_until end,
        updated_at = now(),
        updated_by = auth.uid()
    where id = 1;
  return v_enabled;
end $$;
revoke all on function public.set_site_enabled(boolean, text, timestamptz) from public;
grant execute on function public.set_site_enabled(boolean, text, timestamptz) to authenticated;

-- Reinicio del sorteo (solo superadmin): borra clientes/reservas y datos
-- transaccionales. Conserva configuración, premios, promos, fotos y ruleta.
create or replace function public.reset_raffle()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_tickets int;
  c_history int;
  c_spins int;
  c_payments int;
begin
  if not public.admin_is_super() then
    raise exception 'Solo el superadmin puede reiniciar el sorteo'
      using errcode = '42501';
  end if;
  select count(*) into c_tickets from public.tickets;
  select count(*) into c_history from public.ticket_history;
  select count(*) into c_spins from public.wheel_spins;
  select count(*) into c_payments from public.mp_payments;
  delete from public.ticket_history;
  delete from public.wheel_spins;
  delete from public.mp_payments;
  delete from public.tickets;
  return jsonb_build_object(
    'tickets', c_tickets,
    'history', c_history,
    'spins', c_spins,
    'payments', c_payments
  );
end $$;
revoke all on function public.reset_raffle() from public;
grant execute on function public.reset_raffle() to authenticated;

-- Superadmin del proyecto: anexaria@gmail.com
-- Si el mail no existe en auth.users no inserta nada. No pisa el display_name
-- si la fila ya existe. Re-ejecutable.
insert into public.admin_profiles (user_id, display_name, is_super)
select id,
       coalesce(nullif(raw_user_meta_data->>'display_name', ''), split_part(email, '@', 1)),
       true
from auth.users
where lower(email) = 'anexaria@gmail.com'
on conflict (user_id) do update set is_super = true;
