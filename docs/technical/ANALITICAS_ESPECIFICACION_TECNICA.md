# Especificación técnica del módulo de Analíticas

> **Estado:** Propuesta técnica previa a implementación  
> **Aplicación:** CobranzaPro  
> **Usuarios:** Administradores y supervisores

## 1. Decisión propuesta

Se propone separar el análisis histórico y comparativo del Dashboard administrativo mediante
un nuevo módulo lazy llamado **Analíticas**.

El Dashboard conservará una visión operativa y resumida del estado actual del negocio. El nuevo
módulo permitirá estudiar la evolución diaria, semanal, mensual y anual sin sobrecargar la interfaz
principal ni ejecutar consultas analíticas cuando el usuario no las necesita.

La separación debe ser funcional y técnica: no basta con mover el HTML. También deben trasladarse
los componentes de gráficos, el estado de las series financieras y sus consultas Supabase.

## 2. Objetivos

- Mantener el Dashboard enfocado en decisiones operativas inmediatas.
- Proporcionar análisis histórico y comparaciones entre periodos.
- Descargar el JavaScript de gráficos solamente al ingresar a Analíticas.
- Evitar consultas Supabase analíticas durante la carga normal del Dashboard.
- Conservar el patrón Model + Repository + Adapter + Store del proyecto.
- Definir correctamente la semántica histórica de cada indicador.
- Mantener una experiencia mobile-first, accesible y comprensible.

## 3. Situación actual

El Dashboard administrativo contiene actualmente:

- Indicadores generales de cartera.
- Distribución de riesgo.
- Rendimiento de cobradores.
- Series financieras con granularidad diaria, semanal, mensual y anual.
- Controles para cambiar el periodo y la fecha de referencia.

Además, `AdminDashboardStore.load()` solicita simultáneamente el resumen, el rendimiento de
cobradores y la serie financiera. Por lo tanto, el usuario descarga y consulta información
analítica incluso cuando solo necesita una visión general.

El RPC `admin_dashboard_financial_series` ya proporciona periodos y métricas financieras. En una
primera etapa puede reutilizarse desde Analíticas sin duplicar la lógica SQL.

## 4. Responsabilidades por módulo

### 4.1 Dashboard administrativo

El Dashboard debe responder: **¿Cómo se encuentra el negocio ahora y qué requiere atención?**

Debe conservar:

- Capital prestado actual.
- Saldo pendiente actual.
- Cobranza de hoy o del periodo operativo vigente.
- Morosidad actual.
- Cantidad de clientes y préstamos activos.
- Distribución actual del riesgo.
- Rendimiento resumido por cobrador.
- Alertas operativas importantes.
- Acceso visible a **Ver análisis detallado**.

Debe retirar:

- Gráficos históricos detallados.
- Selector diario, semanal, mensual y anual.
- Navegación entre ventanas históricas.
- Estado y carga de las series financieras.
- Consultas financieras que no sean necesarias para el resumen operativo.

### 4.2 Analíticas

Analíticas debe responder: **¿Cómo evolucionó el negocio durante un periodo y por qué?**

Debe incluir:

- Selector de granularidad: diaria, semanal, mensual y anual.
- Navegación al periodo anterior y siguiente.
- Fecha o ventana de referencia visible.
- Comparación contra el periodo anterior cuando exista una definición aprobada.
- Cobranza recibida.
- Intereses generados.
- Préstamos desembolsados.
- Gastos operativos y viáticos.
- Utilidad neta.
- Evolución temporal mediante gráficos.
- Resumen tabular equivalente a los gráficos.
- Estados de carga, error, reintento y ausencia de datos.

## 5. Arquitectura Angular

### 5.1 Ruta

```text
/admin/analiticas
```

La ruta será accesible únicamente para administradores y supervisores, respetando los guards ya
aplicados al área administrativa.

```ts
{
  path: 'analiticas',
  title: 'Analíticas | CobranzaPro',
  loadComponent: () => import('./analytics/analytics'),
  providers: [
    AnalyticsStore,
    {
      provide: ANALYTICS_REPOSITORY,
      useClass: SupabaseAnalyticsRepository,
    },
  ],
}
```

### 5.2 Estructura propuesta

```text
src/app/
├── core/
│   ├── models/analytics.model.ts
│   ├── repositories/analytics.repository.ts
│   └── adapters/supabase-analytics.repository.ts
└── modules/admin/analytics/
    ├── analytics.ts
    ├── analytics.html
    ├── analytics.store.ts
    ├── analytics.store.spec.ts
    ├── analytics-calculations.ts
    ├── analytics-calculations.spec.ts
    ├── financial-series-chart.ts
    └── financial-series-chart.spec.ts
```

Los componentes analíticos permanecerán dentro del módulo mientras no exista otro consumidor real.
No deben moverse a `shared/` de manera preventiva.

### 5.3 Patrón de datos

El módulo seguirá el patrón vigente:

1. `analytics.model.ts`: contratos TypeScript independientes de Supabase.
2. `analytics.repository.ts`: interfaz e `InjectionToken`.
3. `supabase-analytics.repository.ts`: llamadas RPC y mapeo snake_case a camelCase.
4. `analytics.store.ts`: estado con Signals y manejo de carga/error.
5. `admin.routes.ts`: providers limitados a la ruta lazy.

El store debe utilizar `resource()` o un mecanismo equivalente con `AbortSignal` para evitar que una
respuesta anterior reemplace el resultado de un periodo seleccionado posteriormente.

## 6. Carga diferida y rendimiento

La separación solo será efectiva si se cumplen todas estas condiciones:

1. El Dashboard no importa componentes de Analíticas.
2. Chart.js y los componentes de gráficos se importan únicamente desde la ruta de Analíticas.
3. `AdminDashboardStore.load()` deja de ejecutar `loadFinancialSeries()`.
4. `AnalyticsStore` se crea solamente al activar `/admin/analiticas`.
5. Los cambios de periodo producen una sola consulta y cancelan la anterior cuando corresponde.

El diseño responsive por CSS no evita descargar JavaScript. La reducción real se obtiene con la
frontera lazy de la ruta y eliminando las consultas analíticas del Dashboard.

No se propone inicialmente:

- Agregar una segunda librería de gráficos.
- Crear caché global.
- Implementar materialized views.
- Incorporar un motor genérico de BI.
- Agregar índices sin evidencia de consultas lentas.

Para el volumen previsto de usuarios, estas soluciones serían sobreingeniería antes de contar con
mediciones reales.

## 7. Definición de indicadores

No todos los indicadores pueden tratarse como una suma dentro de un rango de fechas.

| Tipo | Indicadores | Regla temporal |
|---|---|---|
| Flujo | Cobros, intereses, desembolsos, gastos y utilidad | Movimientos ocurridos dentro del periodo |
| Estado | Saldo pendiente, clientes activos y morosidad | Fotografía al cierre del periodo |
| Conteo de eventos | Nuevos clientes, nuevos préstamos y pagos | Registros creados u ocurridos dentro del periodo |

### 7.1 Ejemplo de flujo

```text
Cobrado mensual = pagos contabilizados desde el primer hasta el último día del mes.
```

### 7.2 Ejemplo de estado

```text
Saldo pendiente mensual = saldo existente al cierre del último día del mes.
```

Aplicar el mismo filtro de fechas a todos los KPI generaría resultados financieros incorrectos.
Antes de implementar nuevos indicadores históricos, el cliente debe aprobar si cada KPI representa
un flujo del periodo o una fotografía al cierre.

## 8. Periodos

La primera versión conservará el comportamiento ya definido por la serie financiera:

| Granularidad | Ventana propuesta |
|---|---|
| Diaria | Días del mes seleccionado |
| Semanal | Últimas 12 semanas hasta la semana de referencia |
| Mensual | Últimos 12 meses hasta el mes de referencia |
| Anual | Últimos 5 años hasta el año de referencia |

Todas las fechas de negocio deben calcularse con `America/Lima` y los helpers compartidos existentes.
La interfaz debe mostrar claramente los límites inclusivos del periodo consultado.

## 9. Contratos Supabase

### 9.1 Primera etapa

Reutilizar `admin_dashboard_financial_series` desde `SupabaseAnalyticsRepository`. Aunque su nombre
contenga `dashboard`, no se justifica una migración nueva solo para renombrar una función estable.

El contrato existente entrega:

- Cobranza.
- Intereses.
- Desembolsos de préstamos.
- Gastos aprobados.
- Utilidad neta.
- Etiquetas y límites de cada intervalo.

### 9.2 Extensiones posteriores

Solo deben agregarse RPC nuevos cuando se necesiten métricas con una semántica diferente, por
ejemplo indicadores históricos de estado calculados a una fecha de corte.

Cada RPC nuevo debe:

- Crearse mediante una migración aditiva.
- Validar explícitamente el rol admin o supervisor.
- Usar el mínimo privilegio necesario.
- Revocar ejecución a `public` y `anon`.
- Conceder ejecución explícita a `authenticated`.
- Respetar reglas de cierres validados, anulaciones y fechas contables.
- Contar con pruebas pgTAP de permisos, límites temporales y totales.

## 10. Estado y concurrencia

El store debe exponer como mínimo:

```ts
granularity
referenceDate
series
loading
error
```

Comportamiento requerido:

- La selección de periodo solicita datos únicamente cuando cambia realmente.
- Las respuestas antiguas no sobrescriben la selección actual.
- El error de Analíticas no afecta el Dashboard.
- La interfaz permite reintentar una consulta fallida.
- No se ejecutan consultas por cada pulsación del usuario.
- La fecha de referencia se valida antes de consultar Supabase.

No se necesita una caché global en la primera versión. Si se detectan navegaciones repetidas y
consultas costosas, se podrá evaluar una caché acotada por granularidad y fecha de referencia.

## 11. Experiencia de usuario

### 11.1 Estructura visual

```text
Analíticas
[Diario | Semanal | Mensual | Anual]       [Anterior] Periodo [Siguiente]

[Ingresos] [Intereses] [Gastos] [Utilidad neta]

[Evolución financiera]

[Desembolsos frente a cobros]   [Gastos por categoría]

[Detalle tabular del periodo]
```

### 11.2 Mobile

- KPI en una grilla de dos columnas o bloques apilados.
- Un gráfico principal por bloque.
- Controles de periodo operables con teclado y táctiles.
- Etiquetas visibles; no depender exclusivamente de hover.
- Tabla transformada en tarjetas o scroll horizontal controlado.
- Alternativa tabular o textual para interpretar cada gráfico.
- Skeleton durante la carga y mensaje accionable ante errores.

### 11.3 Navegación

El menú administrativo incluirá **Analíticas** como opción independiente. El Dashboard mostrará un
acceso contextual, por ejemplo **Ver análisis detallado**, sin duplicar los controles analíticos.

## 12. Seguridad

- Acceso de interfaz: administradores y supervisores.
- Guards de Angular: control de navegación y experiencia de usuario.
- RPC de PostgreSQL: autorización real y obligatoria.
- Ningún cálculo financiero sensible debe confiar únicamente en el frontend.
- Los datos deben respetar anulaciones, pagos contabilizados y cierres de caja validados.
- Los errores Supabase deben traducirse mediante `AppError` antes de mostrarse.

## 13. Estrategia de pruebas

### 13.1 Unitarias

- Cambios de granularidad y fecha.
- Prevención de consultas cuando el valor no cambia.
- Última respuesta válida frente a solicitudes superpuestas.
- Manejo de carga, error, reintento y datos vacíos.
- Cálculos de comparación entre periodos.

### 13.2 Adaptador

- Nombre y argumentos del RPC.
- Mapeo snake_case a camelCase.
- Conversión segura de valores numéricos.
- Traducción de errores de permisos y conexión.

### 13.3 Base de datos

- Acceso permitido para admin y supervisor.
- Acceso rechazado para collector y anon.
- Límites de cada periodo.
- Actividad en el último día del periodo.
- Exclusión o reversión correcta de pagos anulados.
- Cálculo de utilidad y gastos.
- Periodos sin movimientos.

### 13.4 E2E y responsive

- La ruta `/admin/analiticas` se carga desde el menú.
- El cambio de granularidad actualiza el periodo y los resultados.
- Mobile, tablet y desktop no presentan overflow horizontal inesperado.
- Un cobrador no puede acceder a la ruta.
- El build genera un chunk lazy independiente para Analíticas.

## 14. Fases de implementación

### Fase 1. Definición funcional

- Aprobar con el cliente el significado de cada KPI.
- Clasificar cada indicador como flujo, estado o conteo de eventos.
- Confirmar las ventanas diaria, semanal, mensual y anual.

### Fase 2. Extracción técnica

- Crear ruta y estructura de Analíticas.
- Crear Repository, Adapter y Store.
- Mover los gráficos financieros existentes.
- Reutilizar el RPC financiero actual.

### Fase 3. Simplificación del Dashboard

- Retirar controles y gráficos históricos.
- Eliminar la carga de series desde `AdminDashboardStore`.
- Mantener indicadores operativos y rendimiento de cobradores.
- Incorporar el enlace a Analíticas.

### Fase 4. Extensión controlada

- Agregar únicamente KPI históricos aprobados.
- Crear RPC adicionales cuando exista una diferencia semántica real.
- Medir consultas antes de agregar índices, cachés o preagregaciones.

### Fase 5. Verificación

- Ejecutar pruebas unitarias y del adaptador.
- Ejecutar pgTAP.
- Ejecutar build y revisar chunks.
- Ejecutar smoke responsive y E2E crítico.

## 15. Criterios de aceptación

- [ ] El Dashboard carga sin solicitar la serie financiera histórica.
- [ ] Analíticas se descarga únicamente al visitar su ruta.
- [ ] Admin y supervisor pueden ingresar; collector no puede acceder.
- [ ] Los cuatro periodos muestran límites y etiquetas comprensibles.
- [ ] Los indicadores respetan su definición de flujo o estado.
- [ ] Las respuestas antiguas no reemplazan selecciones nuevas.
- [ ] Cada gráfico tiene una alternativa tabular o textual.
- [ ] La interfaz funciona en mobile, tablet y desktop.
- [ ] Las consultas financieras cuentan con pruebas pgTAP.
- [ ] El build confirma un chunk lazy independiente.

## 16. Fuera de alcance inicial

- Plataforma de inteligencia de negocios genérica.
- Constructor dinámico de reportes.
- Exportaciones nuevas no solicitadas.
- Materialized views o procesos programados de preagregación.
- Realtime para información histórica.
- Nueva librería de gráficos.
- Predicciones o modelos de inteligencia artificial.
- Comparaciones o KPI sin definición funcional aprobada.

## 17. Decisión funcional pendiente

Antes de implementar nuevos KPI históricos, debe aprobarse para cada uno:

1. Nombre y propósito.
2. Fórmula exacta.
3. Si representa un movimiento del periodo o un estado al cierre.
4. Fecha contable utilizada.
5. Tratamiento de anulaciones y correcciones.
6. Comparación esperada contra el periodo anterior.

Sin esta definición, una gráfica puede ser visualmente correcta pero financieramente engañosa.

