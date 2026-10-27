# Módulo "Mis Clientes" del cobrador

## Objective
Construir, con datos reales de Supabase, el módulo "Mis Clientes" para el rol `collector`
(dashboard de cobranza del día, listado "Mis Clientes" y detalle de cliente con registro de
pago), tomando como referencia visual `mvp/cobranzapro_app.html`. El lado admin ya tiene este
flujo implementado sobre Supabase (`modules/admin/clients`, `modules/admin/loans`); el lado
cobrador seguía sobre el mock `AppStoreService` (dato local, legacy, documentado en AGENTS.md).

## Problem
`modules/collector/*` (`collection-dashboard.store.ts`, `clients.ts`, `dashboard.ts`,
`client-detail.ts`) leía/escribía exclusivamente contra `AppStoreService` (estado en memoria +
localStorage, sin RLS, sin RPC reales). Esto significa que:
- Un cobrador no veía su cartera real ni podía registrar pagos reales (no se tocaba
  `register_payment`).
- No existía ninguna forma de que un cobrador agregara un cliente nuevo contra el esquema real.

## Why
AGENTS.md ya señala esta brecha explícitamente ("Legacy code — do not extend" /
"el cobrador no puede editar un pago... debe notificar al administrador" es una regla de negocio
pedida por el usuario) y exige seguir el patrón repository + adapter + store por ruta en vez de
extender el mock.

## Authorized scope
- Migrar `modules/collector/*` (dashboard, clientes, detalle de cliente) de `AppStoreService` a
  Supabase real, reutilizando las RPCs ya existentes: `collector_list_portfolio`,
  `collector_create_customer_loan`, `register_payment`.
- Permitir que el cobrador cree un cliente nuevo (único camino real soportado por el esquema:
  cliente + primer préstamo atómico vía `collector_create_customer_loan`).
- El cobrador puede ver su historial de pagos pero no editarlos/anularlos; si detecta un pago
  incorrecto, el UI le permite preparar un mensaje con los datos del pago para notificar al
  administrador por canal externo (llamada/WhatsApp) — sin tabla/migración nueva, decisión tomada
  por indisponibilidad del usuario para resolver la ambigüedad y por ser el cambio más chico que
  no compromete nada (ver "Constraints").
- Responsive mobile-first, consistente con el resto del módulo cobrador.

## Constraints
- No tocar `modules/admin/*` salvo mover 3 funciones puras (`calculateLoanSummary`, `firstDueOn`,
  `toDateInput`) de `modules/admin/loans/loan-calculations.ts` a
  `core/calculations/loan-calculations.ts`, dejando un re-export en el archivo original para no
  romper los imports existentes de `loans.ts` / `loan-detail.ts` / `loans.store.spec.ts`.
- No tocar `AppStoreService` (todavía usado por `modules/admin/dashboard/dashboard.ts`).
- No crear tabla/migración/RPC nueva para "notificar al administrador": el esquema actual no
  tiene ninguna infraestructura de notificaciones/disputas (solo `void_payment`, admin/supervisor
  only). Se preguntó al usuario con `ask_user`; la pregunta fue descartada sin responder, así que
  se procede con la opción de menor alcance (solo UI, sin backend nuevo), reversible y ampliable
  después si se pide una notificación persistida.
- El cobrador solo puede agregar un cliente creándole su primer préstamo en el mismo paso: es la
  única operación que el esquema actual permite para un `collector` (no existe RLS insert directo
  para `loans`, y la única RPC de creación de cliente para collector es atómica
  cliente+préstamo).

## Delivery

### Strategy
1. Mover cálculos puros compartidos a `core/calculations/loan-calculations.ts`.
2. Nuevo modelo + repositorio + adapter Supabase para el portafolio del cobrador
   (`collector-portfolio.model.ts`, `collector-portfolio.repository.ts`,
   `supabase-collector-portfolio.repository.ts`), con tests de adapter.
3. Reescribir `CollectionDashboardStore` para consumir el repositorio real (deja de ser
   `providedIn: 'root'`, pasa a proveerse por ruta).
4. Nuevo `CollectorLoanStore` (solo `loadDetail` + `registerPayment`, sin editar/anular) que
   reutiliza `LOAN_REPOSITORY`/`SupabaseLoanRepository` ya existente.
5. Reestructurar `collector.routes.ts` para proveer stores/repos compartidos a las 3 rutas.
6. Actualizar `dashboard.ts/html`, `clients.ts` (+ diálogo "Nuevo cliente"), `client-detail.ts/html`
   (detalle + pago real + historial de pagos solo lectura + "Reportar un problema").

### Verification evidence
Se documenta al final de la implementación (comandos ejecutados y resultado real).

- `pnpm test:ci` → 13 archivos de test, **72 tests pasaron** (incluye 26 tests nuevos: adapter
  `supabase-collector-portfolio.repository.spec.ts` (11), `collection-dashboard.store.spec.ts` (9),
  `collector-loan.store.spec.ts` (5), y 1 caso `.each` adicional). Ningún test existente se rompió.
- `pnpm build` → build de producción exitoso (los únicos warnings son preexistentes: presupuesto de
  bundle inicial y módulos CommonJS de `exceljs`/`jspdf`/`canvg`, ya presentes antes de este cambio).
- `pnpm e2e` → el único spec existente (`e2e/auth/login.spec.ts`) sigue pasando; el dev server
  compila sin errores los nuevos chunks lazy `dashboard`, `clients` y `client-detail` del cobrador.
- No se corrió `pnpm supabase test db` / `db lint` porque no se tocó ningún archivo de
  `supabase/` (se reutilizaron RPCs ya existentes y probadas en `supabase/tests/`).

