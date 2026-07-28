-- Casa de Materiales El Chino - Supabase schema
-- Run this file in Supabase Dashboard > SQL Editor.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('admin', 'seller')),
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null,
  price numeric(12, 2) not null check (price >= 0),
  stock numeric(12, 2) not null default 0 check (stock >= 0),
  unit text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  ticket text not null unique,
  customer text not null default 'Mostrador',
  payment_method text not null,
  status text not null check (status in ('pagado', 'fiado')),
  total numeric(12, 2) not null check (total >= 0),
  sale_date timestamptz not null default now(),
  paid_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name text not null,
  unit text not null,
  qty numeric(12, 2) not null check (qty > 0),
  price numeric(12, 2) not null check (price >= 0),
  subtotal numeric(12, 2) not null check (subtotal >= 0)
);

create table if not exists public.credits (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references public.sales(id) on delete set null,
  customer text not null,
  phone text,
  items_text text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  credit_date date not null default current_date,
  notes text,
  status text not null default 'pendiente' check (status in ('pendiente', 'pagado')),
  paid_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.credit_payments (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid not null references public.credits(id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  method text not null default 'Pago de fiado',
  paid_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.current_user_role() in ('admin', 'seller');
$$;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.credits enable row level security;
alter table public.credit_payments enable row level security;

drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles admin manage" on public.profiles;
create policy "profiles admin manage"
on public.profiles for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "products staff read" on public.products;
create policy "products staff read"
on public.products for select
to authenticated
using (public.is_staff());

drop policy if exists "products admin write" on public.products;
create policy "products admin write"
on public.products for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "sales staff read" on public.sales;
create policy "sales staff read"
on public.sales for select
to authenticated
using (public.is_staff());

drop policy if exists "sales staff insert" on public.sales;
create policy "sales staff insert"
on public.sales for insert
to authenticated
with check (public.is_staff());

drop policy if exists "sales admin update delete" on public.sales;
create policy "sales admin update delete"
on public.sales for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "sales admin delete" on public.sales;
create policy "sales admin delete"
on public.sales for delete
to authenticated
using (public.is_admin());

drop policy if exists "sale_items staff read" on public.sale_items;
create policy "sale_items staff read"
on public.sale_items for select
to authenticated
using (public.is_staff());

drop policy if exists "sale_items staff insert" on public.sale_items;
create policy "sale_items staff insert"
on public.sale_items for insert
to authenticated
with check (public.is_staff());

drop policy if exists "sale_items admin manage" on public.sale_items;
create policy "sale_items admin manage"
on public.sale_items for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "credits staff read" on public.credits;
create policy "credits staff read"
on public.credits for select
to authenticated
using (public.is_staff());

drop policy if exists "credits staff insert" on public.credits;
create policy "credits staff insert"
on public.credits for insert
to authenticated
with check (public.is_staff());

drop policy if exists "credits staff mark paid" on public.credits;
create policy "credits staff mark paid"
on public.credits for update
to authenticated
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "credits admin delete" on public.credits;
create policy "credits admin delete"
on public.credits for delete
to authenticated
using (public.is_admin());

drop policy if exists "credit_payments staff read" on public.credit_payments;
create policy "credit_payments staff read"
on public.credit_payments for select
to authenticated
using (public.is_staff());

drop policy if exists "credit_payments staff insert" on public.credit_payments;
create policy "credit_payments staff insert"
on public.credit_payments for insert
to authenticated
with check (public.is_staff());

drop policy if exists "credit_payments admin delete" on public.credit_payments;
create policy "credit_payments admin delete"
on public.credit_payments for delete
to authenticated
using (public.is_admin());

create index if not exists idx_sales_sale_date on public.sales(sale_date);
create index if not exists idx_sales_status on public.sales(status);
create index if not exists idx_sale_items_sale_id on public.sale_items(sale_id);
create index if not exists idx_credits_status on public.credits(status);
create index if not exists idx_credit_payments_paid_at on public.credit_payments(paid_at);

