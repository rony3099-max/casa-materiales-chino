-- Run this after schema.sql.
-- It allows sellers to sell products, which requires updating stock,
-- and to mark credit sales as paid.

drop policy if exists "products staff update stock" on public.products;
create policy "products staff update stock"
on public.products for update
to authenticated
using (public.is_staff())
with check (public.is_staff());

drop policy if exists "sales staff update paid status" on public.sales;
create policy "sales staff update paid status"
on public.sales for update
to authenticated
using (public.is_staff())
with check (public.is_staff());
