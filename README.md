# Casa de Materiales El Chino - Punto de venta

Aplicación web sencilla para administrar ventas, inventario, fiados, historial, cortes de caja y reportes.

## Cómo ejecutar

No requiere instalación ni base de datos externa.

1. Abre el archivo `index.html` en un navegador moderno.
2. Inicia sesión con uno de los usuarios iniciales.
3. La app cargará datos de ejemplo automáticamente.
4. Los datos se guardan en `localStorage` del navegador.

## Usuarios iniciales de Supabase

- Administrador: `admin@elchino.local` / `Admin12345`
- Vendedor: `ventas@elchino.local` / `Ventas12345`

El administrador tiene acceso completo. El vendedor solo puede entrar a Ventas, Fiado e Historial.

## Compartir como app en otros dispositivos

La app ya está preparada como PWA instalable.

### Publicar en Netlify

1. Entra a [Netlify Drop](https://app.netlify.com/drop).
2. Arrastra la carpeta completa `casa-materiales-el-chino-pos`.
3. Netlify generará un enlace público.
4. Abre ese enlace desde computadora, tablet o celular.
5. En celular/tablet, usa **Agregar a pantalla de inicio**.

### Publicar en Vercel

También se puede subir como proyecto estático. La carpeta raíz del sitio es:

```text
casa-materiales-el-chino-pos
```

No requiere comando de build.

### Nota PWA

El modo instalable funciona cuando la app se abre desde `https://...` o `http://localhost`. No funciona completamente desde `file:///...`, porque los navegadores no permiten service workers en archivos locales.

Ruta del proyecto:

```text
C:\Users\rony3\Documents\New project\casa-materiales-el-chino-pos
```

## Módulos incluidos

- Dashboard con ventas del día, tickets, fiado pendiente y productos más vendidos.
- Inventario con alta, edición, eliminación, búsqueda y alerta de poca existencia.
- Ventas con carrito, cálculo automático, ticket, impresión y descarga.
- Corte de caja por fecha.
- Historial de ventas con búsqueda y reimpresión.
- Fiado con clientes pendientes, edición, eliminación y marcado como pagado.
- Reportes con gráficas simples de ventas semanales, mensuales, productos más vendidos y pagado vs fiado.

## Reglas de negocio

- Cada venta descuenta inventario automáticamente.
- Si no hay existencia suficiente, la app muestra una alerta.
- Las ventas pagadas entran al corte del día.
- Las ventas fiadas quedan pendientes y no entran al corte.
- Al marcar un fiado como pagado, entra al corte del día en que se pagó.

## Estructura

```text
casa-materiales-el-chino-pos/
  index.html
  styles.css
  app.js
  README.md
```

## Nota sobre almacenamiento

Esta versión ya está configurada para Supabase. También mantiene una copia local temporal en el navegador para que la pantalla responda rápido.

## Migración a Supabase

Ya se incluye una carpeta `supabase/` con:

- `schema.sql`: tablas, relaciones, roles y políticas iniciales.
- `final-policies.sql`: permisos adicionales para que el vendedor pueda vender, descontar inventario y marcar fiados como pagados.
- `README.md`: pasos para crear el proyecto y conectar usuarios.

La app usa el Project URL y la publishable public key de Supabase para que todos los dispositivos compartan la misma información.
