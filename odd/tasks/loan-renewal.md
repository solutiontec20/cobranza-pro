# Renovación de préstamos (loan renewal)

## Objective
Permitir que un cobrador (o admin/supervisor) renueve el préstamo de un cliente —cerrando el
préstamo actual y abriendo uno nuevo vinculado al anterior— en vez de tener que registrar al
cliente como nuevo cada vez que termina su ciclo de crédito.

## Problem
El esquema ya tenía columnas e índices preparados para renovaciones (`loans.previous_loan_id`,
`loans_previous_loan_unique_idx`, enum `loan_status` con el valor `'renewed'`, comentario en
`disbursed_amount` sobre renovaciones), pero **ninguna RPC los usaba**: `admin_create_loan`
siempre rechaza con `'Customer already has an active loan'` si el cliente ya tiene un préstamo
activo, y no existía ningún camino —ni en frontend ni en backend— para cerrar un préstamo y abrir
uno nuevo vinculado.

## Why
Pedido explícito del usuario: evitar crear un cliente nuevo cada vez que se renueva un crédito
("si no renovamos estaríamos creando nuevos clientes y serían muchos clientes"), aplicando la
regla de negocio confirmada: **a los morosos (más de 5 días de atraso acumulado) no se les
renueva; a los que están al día o ya pagaron su préstamo completo, sí.**

## Authorized scope
- Nueva RPC `public.renew_loan` (admin/supervisor/cobrador de su propia cartera) que cierra el
  préstamo anterior (`status='renewed'`, `closed_at`, `close_reason='renewed'`) y crea uno nuevo
  con `previous_loan_id` apuntando al anterior, dentro de la misma transacción.
- Reglas aplicadas server-side: solo se puede renovar un préstamo `active` o `paid`; se bloquea si
  el cliente tiene más de 5 días de atraso acumulado (`installment_balances.overdue_days`, el
  mismo umbral que `customer_financial_status.is_blacklisted`); el nuevo capital debe ser al
  menos el saldo pendiente del préstamo anterior; el monto efectivamente entregado en efectivo
  (`disbursed_amount` y el movimiento de caja) es `nuevo_capital − saldo_pendiente_anterior`.
- Frontend: botón "Renovar préstamo" en el detalle del cobrador (`modules/collector/client-detail`)
  y en el detalle del admin (`modules/admin/loans/loan-detail`), ambos deshabilitados/con aviso
  cuando el cliente es moroso, reutilizando el mismo `LOAN_REPOSITORY`/RPC.
- Regeneración de `database.types.ts` (formateado con `prettier` para minimizar el diff de un
  regenerador no-prettier).

## Constraints
- No tocar `admin_create_loan`/`admin_update_loan` (siguen siendo "crear nuevo" y "editar sin
  historial de pagos" respectivamente); la renovación es una operación nueva y separada.
- No inventar una tabla/columna nueva: se usó exactamente el esquema ya preparado
  (`previous_loan_id`, `close_reason`, `closed_at`) siguiendo el patrón ya establecido en
  `register_payment` para cerrar un préstamo (`status='paid'`).
- La verificación de "moroso" se calcula igual que `customer_financial_status.is_blacklisted`
  (`max(installment_balances.overdue_days) > 5`), no se inventó un umbral nuevo.

## Delivery

### Strategy
1. Migración SQL `20261024220000_loan_renewal.sql`: función `renew_loan` + grants.
2. Test pgTAP `loan_renewal_test.sql`: altas/bajas de elegibilidad (al día, moroso, pagado,
   cross-collector, admin-override), fixtures de `loans`/`installments` insertadas directamente
   con fechas relativas a `current_date` para que el resultado no dependa del día real en que
   corran los tests.
3. `pnpm db:types` + `prettier` sobre el archivo generado.
4. Modelo (`RenewLoanInput`/`RenewLoanResult`), interfaz `LoanRepository.renew`, implementación en
   `SupabaseLoanRepository` + traducción de errores + tests de adapter.
5. `CollectorLoanStore.renew()` y `LoansStore.renew()` (mismo patrón que `registerPayment`).
6. UI: diálogo de renovación en `client-detail.ts/html` (cobrador) y `loan-detail.ts` (admin),
   ambos con `canRenew()` computed que refleja la regla server-side.

### Verification evidence
- `pnpm supabase db lint --local --level error` → sin errores.
- `pnpm supabase test db` → **169/169 tests pasaron** (18 nuevos en `loan_renewal_test.sql`:
  cliente al día puede renovar, cliente moroso no puede, cliente que pagó todo puede renovar,
  un cobrador no puede renovar el préstamo de otro cobrador, un admin sí puede renovar cualquiera).
- `pnpm test:ci` → **81/81 tests** (13 archivos), incluye 10 tests nuevos de store/adapter.
- `pnpm build` → build de producción exitoso (mismos warnings preexistentes de `exceljs`/`jspdf`).
- `pnpm e2e` → el spec de login sigue pasando; los chunks `loan-detail`/`client-detail` compilan
  sin error con el nuevo diálogo.

## Seguimiento: el cobrador no podía renovar/crear préstamos (2026-10-25)

### Problem
Tras la entrega anterior, el usuario reportó que ni el admin ni el cobrador podían renovar en la
práctica. Investigación reveló dos causas reales:

1. **La migración de renovación nunca se publicó en el proyecto Supabase remoto.** `.env` apunta
   a `https://idwbhwfyfvyaqsefvlnc.supabase.co` ("Cobranza Pro Dev"), no al stack local. La
   migración `20261024220000_loan_renewal.sql` solo se había aplicado vía `supabase db reset`
   (local). `pnpm supabase migration list` confirmó que el remoto no tenía esa migración
   (columna "Remote" vacía para esa fecha) — por lo tanto la RPC `renew_loan` no existía en el
   entorno real que se estaba probando.
2. **Vacío real de funcionalidad para el cobrador**: no existía ningún camino para que un
   cobrador creara un préstamo a un cliente **existente** que no tuviera un préstamo elegible
   para renovar (por ejemplo, un cliente registrado por el admin sin préstamo inicial).
   `collector_create_customer_loan` solo cubre "cliente nuevo + primer préstamo" atómicamente.

### Authorized scope (ampliación)
- Nueva RPC `public.collector_create_loan(p_customer_id, p_principal, p_interest_rate,
  p_frequency, p_installment_count, p_started_on)`: crea un préstamo para un cliente que ya
  existe en la cartera del cobrador, con las mismas validaciones de `admin_create_loan`
  (un préstamo activo por cliente, cliente activo) pero autorizado solo para el cobrador dueño
  de ese cliente — mismo patrón de autorización que `renew_loan`.
- Frontend (cobrador, `client-detail.ts/html`): nuevo `canCreateLoan()` (true cuando
  `!canRenew()` y el cliente no es moroso) que muestra un botón "Crear préstamo" tanto cuando el
  cliente no tiene ningún préstamo como cuando su único préstamo no es renovable, con su propio
  diálogo (sin la lógica de "neteo de saldo anterior" que sí tiene la renovación).
- Confirmado con el usuario vía `ask_user` y publicadas ambas migraciones
  (`20261024220000_loan_renewal.sql`, `20261024221000_collector_create_loan.sql`) al proyecto
  remoto con `pnpm supabase db push` — verificado con `pnpm supabase migration list` que local y
  remoto quedaron sincronizados.

### Verification evidence (seguimiento)
- `pnpm supabase db lint --local --level error` → sin errores.
- `pnpm supabase test db` → **180/180 tests** (11 nuevos en `collector_create_loan_test.sql`).
- `pnpm test:ci` → **88/88 tests** (13 archivos), incluye 7 tests nuevos de store/adapter.
- `pnpm build` → build de producción exitoso.
- `pnpm e2e` → spec de login sigue pasando.
- `pnpm supabase db push` → ambas migraciones aplicadas al remoto; `migration list` confirma
  sincronización completa entre local y remoto.

