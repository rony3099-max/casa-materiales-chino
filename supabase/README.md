# Supabase setup

Esta carpeta prepara la migracion de la app a Supabase.

## Pasos

1. Crea un proyecto en Supabase.
2. En Supabase, abre **SQL Editor**.
3. Copia y ejecuta el contenido de `schema.sql`.
4. Copia y ejecuta el contenido de `final-policies.sql`.
5. Crea usuarios en **Authentication > Users**:
   - Administrador
   - Vendedor
6. Copia el `id` de cada usuario y agrega su perfil en SQL:

```sql
insert into public.profiles (id, full_name, role)
values
  ('ID_DEL_ADMIN', 'Administrador', 'admin'),
  ('ID_DEL_VENDEDOR', 'Vendedor', 'seller');
```

7. En **Project Settings > API**, copia:
   - Project URL
   - publishable public key

Con esos dos datos se conecta la app al proyecto.

## Roles

- `admin`: acceso completo.
- `seller`: ventas, fiado e historial.

## Nota importante

La app ya esta configurada para conectarse al proyecto de Supabase indicado en `app.js`.
