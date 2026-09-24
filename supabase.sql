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
  updated_at timestamptz default now(),
  updated_by uuid,
  constraint single_row check (id = 1),
  constraint settings_range_valid check (min_number >= 0 and max_number <= 99999 and min_number <= max_number)
);

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
  created_at timestamptz default now()
);

alter table public.raffle_settings enable row level security;
alter table public.tickets enable row level security;
alter table public.admin_profiles enable row level security;

drop policy if exists "settings public read" on public.raffle_settings;
create policy "settings public read" on public.raffle_settings for select using (true);
drop policy if exists "settings admin write" on public.raffle_settings;
create policy "settings admin write" on public.raffle_settings
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "tickets public insert pendiente" on public.tickets;
create policy "tickets public insert pendiente" on public.tickets
  for insert with check (
    status = 'pendiente' and source = 'web'
    and number >= (select min_number from public.raffle_settings where id = 1)
    and number <= (select max_number from public.raffle_settings where id = 1)
  );
drop policy if exists "tickets public read active numbers" on public.tickets;
create policy "tickets public read active numbers" on public.tickets
  for select using (status in ('pendiente','reservado','confirmado'));
drop policy if exists "tickets admin all" on public.tickets;
create policy "tickets admin all" on public.tickets
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "profiles admin read" on public.admin_profiles;
create policy "profiles admin read" on public.admin_profiles
  for select using (auth.role() = 'authenticated');

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
