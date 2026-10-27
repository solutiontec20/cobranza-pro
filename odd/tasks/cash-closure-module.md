# Módulo de cierre de caja (apertura, viáticos, gastos, cierre)

## Objective
Construir el módulo de cierre de caja diario, tanto para el cobrador (registrar gastos y enviar
su cierre) como para el administrador/supervisor (registrar apertura y viáticos, aprobar/rechazar
gastos, validar el cierre), siguiendo exactamente la regla de negocio provista por el usuario.

## Problem
El esquema ya tenía `cash_closures`/`cash_movements` y las RPCs `submit_cash_closure`/
`validate_cash_closure`, pero:
1. El cálculo de "efectivo esperado" sumaba **todos** los movimientos sin distinguir el medio de
   pago — un cobro por Yape/Plin/transferencia inflaba incorrectamente el efectivo que el cobrador
   debía entregar, violando la regla "los pagos digitales no forman parte del efectivo físico".
2. No existía el concepto de apertura (dinero inicial) ni de viáticos (dinero para gastos de
   trabajo) ni de gastos operativos con aprobación — greenfield total (confirmado por
   investigación exhaustiva, cero referencias en todo el repo).
3. El módulo "Control Diario" admin seguía fixture-backed (`InMemoryDailyControlRepository`), sin
   relación real con cierre de caja.

## Authorized scope
- Nueva tabla `cash_expenses` (gasto operativo con flujo de aprobación: pending → approved/
  rejected). Solo al aprobarse genera una fila en `cash_movements` (`movement_type='operating_expense'`,
  `outflow`); rechazado nunca toca el efectivo.
- Función privada `private.collector_expected_cash(collector_id, business_date)`:
  `Apertura + Viáticos + Cobranza en efectivo − Préstamos en efectivo − Gastos aprobados en
  efectivo`, ignorando explícitamente cobros por yape/plin/transferencia.
- Vista `public.collector_cash_day_breakdown` para que el frontend muestre el desglose sin
  reinventar la agregación (hereda RLS de `cash_movements` vía `security_invoker`).
- Nuevas RPCs: `register_cash_opening`, `register_cash_allowance` (admin/supervisor),
  `request_cash_expense` (cobrador para sí mismo, o admin/supervisor en su nombre),
  `review_cash_expense` (aprobar/rechazar, admin/supervisor).
- `submit_cash_closure`/`validate_cash_closure` reescritas para usar la función privada y exigir
  una observación cuando el monto entregado difiere del esperado (regla explícita del usuario).
- Frontend: modelo/repositorio/adapter `cash-closure.*`, dos stores (`CashClosureStore` admin,
  `CollectorCashClosureStore` cobrador), dos pantallas nuevas (`/admin/cierre-caja`,
  `/cobrador/cierre-caja`) con sus enlaces de navegación en el sidebar.

## Constraints
- No se tocó el módulo "Control Diario" existente (sigue fixture-backed; es un reporte de
  cronograma/mora, concepto distinto al cierre de caja pedido ahora).
- No se inventaron reglas no mencionadas: la categorización de viáticos (combustible, peajes,
  pasajes, estacionamiento, alimentación, otros) usa exactamente las categorías que el usuario
  enumeró, mapeadas a un enum `cash_expense_category`.
- Los desembolsos de préstamo y los gastos operativos se tratan siempre como efectivo (coherente
  con la regla de negocio: son operaciones físicas de campo), sin añadir un filtro por
  `payment_method` para ellos, a diferencia de las cobranzas que sí se filtran por medio de pago.
- Una vez un cierre está `validated`, ninguna RPC de apertura/viático/gasto permite modificar los
  movimientos de ese día — protege el historial cerrado, mismo patrón que "no se puede editar un
  préstamo con historial" ya usado en el resto del sistema.

## Delivery

### Strategy
1. Migración SQL `20261025130000_cash_closure_operations.sql`: enums, tabla `cash_expenses` + RLS,
   función privada de cálculo, vista de desglose, 4 RPCs nuevas, reescritura de
   `submit_cash_closure`/`validate_cash_closure`.
2. Test pgTAP `cash_closure_operations_test.sql` (31 aserciones) reproduciendo el ejemplo exacto
   del usuario (apertura 1000 + viático 100 + cobro efectivo 650 − préstamo 600 − gasto 50 = 1100)
   más guardas de rol, duplicados, rechazo sin motivo, RLS y bloqueo post-validación.
3. `pnpm db:types` + `prettier` sobre el archivo regenerado.
4. Modelo (`core/models/cash-closure.model.ts`), cálculo puro
   (`core/calculations/cash-closure-calculations.ts`, mismo patrón que `loan-calculations.ts`),
   interfaz de repositorio, adapter Supabase con 13 tests de mapeo/errores.
5. Dos stores (`CashClosureStore` admin, `CollectorCashClosureStore` cobrador) con sus specs.
6. Dos pantallas (`modules/admin/cash-closure/`, `modules/collector/cash-closure/`), rutas nuevas
   en `admin.routes.ts`/`collector.routes.ts`, enlaces nuevos en `shell/sidebar/sidebar.ts`.

### Verification evidence
- `pnpm supabase db lint --local --level error` → sin errores.
- `pnpm supabase test db` → **211/211 tests** (31 nuevos en `cash_closure_operations_test.sql`,
  incluyendo el escenario exacto del ejemplo del usuario).
- `pnpm test:ci` → **117/117 tests** (16 archivos), 36 tests nuevos entre modelo/adapter/stores.
- `pnpm build` → build de producción exitoso; nuevos chunks `cash-closure` (admin y cobrador)
  generados correctamente.
- `pnpm e2e` → spec de login sigue pasando; ambos chunks `cash-closure` compilan sin error en el
  servidor de desarrollo.
- `pnpm supabase db push` (confirmado explícitamente por el usuario) → migración aplicada al
  proyecto remoto "Cobranza Pro Dev"; `pnpm supabase migration list` confirma sincronización
  completa entre local y remoto.

## Bug fix: cobrador veía "no tenés permiso" al usar cierre de caja

### Problem
Un cobrador reportó que la vista de cierre de caja le mostraba que no tenía permiso para realizar
la acción, pese a ser efectivamente un cobrador activo.

### Root cause
Las 6 RPCs de cierre de caja resuelven el rol del actor con `private.current_app_role()` y luego
comparan directamente (`v_role <> 'collector'`, `v_role not in (...)`) sin verificar primero si el
rol se resolvió. `current_app_role()` devuelve `NULL` —no un error— cuando el perfil está inactivo,
tiene `must_change_pin = true` (p. ej. justo después de que un admin resetea el PIN de un cobrador),
o la sesión JWT es anterior a `credentials_invalid_before` (ver
`20261020165847_secure_collector_pin_management.sql`). Por la lógica de tres valores de SQL,
`NULL <> 'collector'` y `NULL NOT IN (...)` evalúan a `NULL`, y `IF NULL THEN...END IF` nunca se
ejecuta: para `submit_cash_closure`, `register_cash_opening`, `register_cash_allowance` y
`review_cash_expense` esto **bypaseaba silenciosamente la validación de rol** (hueco de seguridad
real, aunque acotado); para `request_cash_expense` el `if/elsif/else` sí lo atrapaba, pero con el
mensaje genérico `'Insufficient privileges'`, que el adapter no traducía específicamente y caía al
mensaje genérico "No tenés permisos para realizar esta acción." — exactamente la confusión que
reportó el usuario.

### Authorized scope (fix)
- Agregar la misma guarda explícita NULL-safe que ya usa `register_payment`
  (`if v_role is null then raise exception 'Active application profile required' using errcode =
  '42501'; end if;`) justo después de resolver el rol, en las 6 RPCs de cierre de caja.
- Traducir ese mensaje específico en el adapter del frontend a un mensaje claro en español que
  explica la causa real (PIN pendiente de cambio / sesión vencida) en vez de "sin permisos".

### Delivery
1. Migración nueva `20261025140000_cash_closure_operational_profile_guard.sql` (`create or replace
   function` sobre las 6 RPCs, nunca se edita una migración ya aplicada).
2. `supabase/seed.sql`: el Cobrador C se siembra con `must_change_pin = true` a propósito (demo de
   cambio de PIN forzado) y la demo de cierre de caja corre como ese mismo usuario, así que ahora
   falla con la nueva guarda. Se agregó un `update profiles set must_change_pin = false` puntual
   antes de la sección de demo de cierre de caja y su restauración (`= true`) inmediatamente
   después — es un ajuste de bookkeeping sobre la tabla `profiles`, nunca sobre la contraseña/PIN
   real de Supabase Auth, así que las credenciales de demo documentadas no cambian.
3. `src/app/core/adapters/supabase-cash-closure.repository.ts`: nuevo helper privado
   `operationalProfileError(message, error)` que detecta el mensaje `'Active application profile
   required'` y devuelve un `AppError('AUTH_UNAUTHORIZED', ...)` con un mensaje claro: *"Tu cuenta
   no está habilitada para operar todavía: completá el cambio de tu PIN o volvé a iniciar sesión.
   Si el problema sigue, contactá a un administrador."* Se invoca como primer chequeo en los 6
   traductores de error (`openingError`, `allowanceError`, `expenseError`, `reviewError`,
   `submitError`, `validateError`).
4. `supabase/tests/cash_closure_operations_test.sql`: `plan(31)` → `plan(35)`; se agregó un 4to
   perfil de prueba (Cobrador D, `must_change_pin = true`) y una nueva sección 12 con 2
   `throws_ok` (errcode `42501`, mensaje `'Active application profile required'` para
   `request_cash_expense` y `submit_cash_closure`) + 2 `is()` que confirman que no se creó ninguna
   fila (ni gasto ni cierre) para ese cobrador — prueba de regresión contra el bypass silencioso.

### Verification evidence
- `pnpm supabase db reset` → migraciones + seed aplican limpio (único warning: reinicio de Kong,
  preexistente en todos los resets anteriores de esta sesión, no relacionado).
- `pnpm supabase db lint --local --level error` → sin errores.
- `pnpm supabase test db` → **215/215 tests, 11/11 archivos PASS** (`cash_closure_operations_test.sql`
  ahora con 35/35 aserciones, incluyendo las 4 nuevas de regresión).
- `pnpm test:ci` → **117/117 tests, 16/16 archivos PASS**, incluyendo
  `supabase-cash-closure.repository.spec.ts` (13 tests) sin romperse con el nuevo helper.
- `pnpm build` → build de producción exitoso, sin nuevos errores (warnings preexistentes de
  presupuesto de bundle y dependencias CommonJS, no relacionados con este cambio).
- `pnpm e2e` → spec de login sigue pasando (1/1).
- `pnpm supabase db push` (confirmado explícitamente por el usuario) → migración
  `20261025140000_cash_closure_operational_profile_guard.sql` aplicada al proyecto remoto
  "Cobranza Pro Dev"; `pnpm supabase migration list` confirma sincronización completa (18/18
  migraciones) entre local y remoto.

## Bug fix #2 (real root cause): falta de GRANT en la vista de desglose — y consolidación de módulos duplicados

### Problem
El usuario reportó que, **después** del fix anterior, tanto la vista de admin como la de cobrador
seguían mostrando "no tenés permisos para realizar esta acción" — ya no solo en una acción
puntual, sino apenas se abría la pantalla. También señaló que había dos flujos de cierre de caja
coexistiendo: el nuevo módulo real (`/admin/cierre-caja`, `/cobrador/cierre-caja`) y una sección
"Cierre operativo del día" dentro de Control Diario, marcada como "Datos de prueba"/"Flujo de
propuesta" (100% fixture, `InMemoryDailyControlRepository`).

### Root cause (real)
`public.collector_cash_day_breakdown` (creada en `20261025130000_cash_closure_operations.sql`)
**nunca recibió un `grant select ... to authenticated`** — a diferencia de `cash_movements`/
`cash_closures`/`cash_expenses`, que sí lo tienen explícito justo después de su `create policy`. Un
`CREATE VIEW` desnudo en PostgreSQL no otorga SELECT a ningún rol salvo al propietario. Como
`SupabaseCashClosureRepository.fetchDays()` consulta esa vista PRIMERO en cada carga de pantalla
(tanto `listDay` del admin como `getOwnDay` del cobrador), la consulta fallaba con "permission
denied for view collector_cash_day_breakdown" (42501) para **cualquier** usuario autenticado,
sin importar el rol — porque el rechazo ocurría al nivel del GRANT, antes de evaluar RLS o la
lógica de rol de las RPCs. El adapter no tiene una traducción específica para ese mensaje, así que
caía al genérico "No tenés permisos para realizar esta acción.", justo lo que vieron ambos roles
al simplemente abrir la pantalla (no solo al ejecutar una acción puntual).

Esto explica por qué el pgTAP no lo detectó: la sección 7 de `cash_closure_operations_test.sql`
consultaba la vista con `results_eq` pero sin `set local role authenticated` primero, corriendo
como superusuario (`postgres`), que ignora los GRANT por completo.

### Authorized scope (fix + decisión del usuario)
- Otorgar `GRANT SELECT` a `authenticated` sobre la vista (migración nueva, nunca se edita la ya
  aplicada).
- Decisión explícita del usuario (`ask_user`): mantener **solo** el módulo real `/cierre-caja`
  (RPCs de Supabase) como flujo oficial, y eliminar la sección fixture "Cierre operativo del día"
  de Control Diario para no confundir a los usuarios en producción con datos de prueba
  superpuestos al flujo real.

### Delivery
1. Migración `20261025150000_grant_cash_day_breakdown_select.sql`: `grant select on
   public.collector_cash_day_breakdown to authenticated;`.
2. `cash_closure_operations_test.sql`: nueva aserción `has_table_privilege('authenticated', ...,
   'SELECT')` sobre la vista, más una repetición de la verificación del desglose (sección 7) bajo
   `set local role authenticated` como collector A real — para que una futura regresión de este
   tipo sea detectada por el propio rol `authenticated`, no solo por el superusuario de pgTAP.
   `plan(35)` → `plan(37)`.
3. Eliminación de "Cierre operativo del día" (fixture) de Control Diario, conservando intacto el
   reporte de cartera (programado/cobrado/mora), que sigue siendo una funcionalidad legítima y
   separada:
   - `daily-control.model.ts`: se quitan `DailyCashClosure*`/`DailyCashMovement*`/
     `DailyPaymentMethod`/`Submit|ValidateDailyCashClosureInput`.
   - `daily-control.repository.ts`: la interfaz pierde `listClosures`/`submitClosure`/
     `validateClosure`.
   - `in-memory-daily-control.repository.ts`: se quita el `Map` de cierres, la generación de
     fixtures de movimientos/cierres y los 3 métodos; se conserva `listCollectors`/`getReport`.
   - `daily-control.store.ts`: se quitan `closures`, `selectedClosureId`, `selectedClosure`,
     `focusClosure`, `validateSelected`, `setClosures`.
   - `daily-control.ts`/`.html`: se quita toda la sección "Cierre operativo del día" (navegación
     por cobrador, panel de movimientos, acción de validar), el `TextareaModule` que solo usaba
     esa sección, y los métodos/signals asociados (`validationObservation`, `focusClosure`,
     `validateClosure`, `closureStatusLabel`, `closureStatusSeverity`, `movementLabel`,
     `formatDateTime`).
   - Specs actualizados (`in-memory-daily-control.repository.spec.ts`,
     `daily-control.store.spec.ts`) quitando los casos de cierre, conservando los de reporte.
4. Responsive de los filtros de Control Diario: la grilla usaba columnas de ancho fijo
   (`13rem_18rem_14rem_minmax(14rem,1fr)_auto`) sin `min-w-0` en los `<label>` ni `styleClass`/
   ancho completo en `p-datepicker`/`p-select` — en viewports donde el contenido disponible
   (restando el sidebar) era menor a la suma fija de esas columnas, los campos se desbordaban.
   Fix: columnas envueltas en `minmax(0, …)` para que puedan encogerse, `min-w-0` en cada
   `<label>`/contenedor, y `styleClass="w-full"` en `p-datepicker`/`p-select` (mismo patrón ya
   usado en el módulo de cierre de caja) para que ocupen el ancho de su celda.

### Verification evidence
- `pnpm supabase db reset` → migraciones + seed aplican limpio.
- `pnpm supabase db lint --local --level error` → sin errores.
- `pnpm supabase test db` → **217/217 tests, 11/11 archivos PASS**
  (`cash_closure_operations_test.sql` con 37/37, incluyendo la nueva verificación de GRANT bajo el
  rol `authenticated`).
- `pnpm test:ci` → **112/112 tests, 16/16 archivos PASS** (specs de Control Diario reducidos y
  verdes tras quitar los casos de cierre fixture).
- `pnpm build` → build de producción exitoso; el chunk `daily-control` bajó de ~82.7 kB a ~50.3 kB
  tras quitar la UI/lógica de cierre fixture.
- `pnpm e2e` → spec de login sigue pasando (1/1).
- `pnpm supabase db push` → migración `20261025150000_grant_cash_day_breakdown_select.sql`
  aplicada al proyecto remoto "Cobranza Pro Dev" (continuación directa del mismo flujo de fix ya
  autorizado explícitamente por el usuario en este hilo).
