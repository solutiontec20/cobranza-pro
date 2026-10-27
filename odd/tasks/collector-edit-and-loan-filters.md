# Edición de datos de cobradores + filtros del módulo de préstamos

## Objective
Agregar al módulo admin de cobradores la posibilidad de editar nombre y teléfono de un
cobrador existente (hasta ahora solo se podía activar/desactivar y restablecer PIN), y
agregar filtros de búsqueda rápida al módulo de préstamos (hasta ahora sin ningún filtro).

## Problem
1. `modules/admin/collectors/` solo exponía `create`, `setActive` y `resetPin` — no había
   forma de corregir un nombre mal escrito o actualizar un teléfono sin pasar por soporte/SQL
   manual.
2. `modules/admin/loans/` listaba todos los préstamos sin filtros: ni búsqueda de texto, ni
   por estado, cobrador o frecuencia — con una cartera grande, encontrar un préstamo puntual
   requería scroll manual por la tabla paginada.

## Why
El usuario lo pidió explícitamente ("agregale una funcionalidad más para poder editar sus
datos como nombre, dni, etc" + "agrégale algunos filtros, para buscar más rápido según tu
criterio" — delegando el diseño concreto de los filtros).

## Authorized scope

### Edición de cobradores
- Nueva RPC `admin_update_collector_profile(p_collector_id, p_full_name, p_reason, p_phone
  default null)`, admin-only, reason obligatorio (mismo patrón que `admin_set_collector_active`
  / `admin_update_loan`), valida nombre no vacío y formato de teléfono peruano
  (`^9[0-9]{8}$`).
- **DNI explícitamente NO editable** — decisión confirmada con el usuario vía `ask_user`: el
  DNI es también el identificador de login (`${dni}@auth.cobranzapro.local`); editarlo
  requeriría una Edge Function nueva para resincronizar el email de Supabase Auth, fuera de
  alcance de este cambio. El diálogo de edición muestra el DNI como campo deshabilitado/
  informativo.
- Nuevo botón "Editar" (ícono lápiz) en las tarjetas móviles y la tabla desktop de
  `collectors.html`, junto a "Restablecer PIN" y "Activar/Desactivar", con el mismo patrón de
  diálogo + formulario + motivo obligatorio ya usado para esas dos acciones.

### Filtros de préstamos
- Campo `clientDni` agregado a `LoanListItem` (ya existía `document_number` en la tabla
  `customers`, solo faltaba seleccionarlo — sin migración ni cambio de RPC).
- `LoansStore` expone: búsqueda de texto libre (cliente, DNI, cobrador — sin distinguir
  acentos, mismo patrón que `CollectorsStore`/`DailyControlStore`), filtro por estado
  (`LoanStatusFilter`), filtro por cobrador (`collectorOptions()` derivado de los préstamos
  cargados, sin pedir una lista aparte), filtro por frecuencia, y `clearFilters()`.
- Barra de filtros nueva en `loans.ts` (solo visible cuando hay préstamos cargados), con grid
  responsive (`minmax(0, …)` + `min-w-0` + `styleClass="w-full"`, mismo patrón aplicado antes
  al arreglo de Control Diario) para que no se desborde en viewports intermedios.
- Distinción de estados vacíos: "Todavía no hay préstamos" (cero préstamos en total) vs. "No
  encontramos coincidencias" (hay préstamos pero ninguno pasa los filtros activos) — mismo
  patrón que Collectors.
- El DNI del cliente también se muestra ahora en las tarjetas/tabla de préstamos (antes solo
  nombre), aprovechando el nuevo campo.

## Constraints
- No se tocó el flujo de creación de cobradores ni de reset de PIN.
- No se inventó una regla de negocio de "quién puede editar": se mantuvo admin-only, igual que
  `create`/`setActive`/`resetPin` en la UI actual (gateado por `authService.isAdmin()`).
- No se agregó paginación/filtrado server-side para préstamos: la cartera actual es pequeña y
  `list()` ya trae todo sin parámetros: los filtros son 100% client-side sobre los datos ya
  cargados, igual que en Collectors/Daily Control — evita tocar RPCs ni añadir latencia de red
  por cada cambio de filtro.
- `admin_update_collector_profile` reutiliza exactamente el patrón de autorización/auditoría
  de `admin_set_collector_active` (rol admin, reason→`app.audit_reason`, trigger
  `profiles_audit_update` ya existente registra el cambio).

## Delivery

### Strategy
1. Migración `20261026000000_admin_update_collector_profile.sql` con la RPC nueva.
2. Tests pgTAP agregados a `admin_collector_management_test.sql` (10 aserciones nuevas:
   forbidden collector/supervisor, reason/nombre/teléfono inválidos, not-found, éxito, DNI sin
   cambios, auditoría) — `plan(27)` → `plan(37)`.
3. `pnpm db:types` + `prettier` para regenerar `database.types.ts`.
4. `UpdateCollectorInput` en el modelo, `update()` en la interfaz de repositorio y el adapter
   Supabase (con traducción de errores a español), `update()` + `editingCollectorId` en
   `CollectorsStore`, diálogo de edición en `collectors.ts`/`.html`.
5. `clientDni` agregado a `LoanListItem`; `supabase-loan.repository.ts` selecciona
   `document_number` en `list()` y `getDetail()`.
6. Filtros (`query`, `statusFilter`, `collectorFilter`, `frequencyFilter`,
   `filteredLoans`, `collectorOptions`, `clearFilters`) en `LoansStore`; barra de filtros +
   estados vacíos distinguidos en `loans.ts`.
7. Tests unitarios: `collectors.store.spec.ts` (+2 casos: update exitoso, update con error),
   `loans.store.spec.ts` (+7 casos: búsqueda, por estado, por cobrador, por frecuencia,
   combinados, collectorOptions, clearFilters), `supabase-loan.repository.spec.ts` y
   `supabase-loan-detail.repository.spec.ts` actualizados con `clientDni` en sus fixtures,
   `collector-loan.store.spec.ts` (módulo cobrador) actualizado por el campo nuevo requerido
   en `LoanListItem`.

### Verification evidence
- `pnpm supabase db lint --local --level error` → sin errores.
- `pnpm supabase test db` → **227/227 tests, 11/11 archivos PASS**
  (`admin_collector_management_test.sql` con 37/37 aserciones).
- `pnpm test:ci` → **121/121 tests, 16/16 archivos PASS** (`collectors.store.spec.ts` 6 tests,
  `loans.store.spec.ts` 21 tests).
- `pnpm build` → build de producción exitoso (chunk `collectors` 72.7kB→89.5kB, `loans`
  47.3kB→57.7kB por los filtros/diálogo nuevos; warnings preexistentes sin cambios).
- `pnpm e2e` → spec de login sigue pasando (1/1).
- `pnpm supabase db push` (confirmado por el usuario) → migración aplicada al proyecto remoto
  "Cobranza Pro Dev"; `pnpm supabase migration list` confirma 20/20 migraciones sincronizadas.
