# Plan de Migración MVP → Angular 22 + PrimeNG 22

## Lo que tiene el MVP (análisis del monolito)

### Pantallas identificadas
| Pantalla | Rol | Ruta propuesta |
|---|---|---|
| Login (DNI + PIN) | Ambos | `/auth/login` |
| Dashboard Cobrador ("Mis cobranzas de hoy") | COBRADOR | `/cobrador` |
| Mis Clientes | COBRADOR | `/cobrador/clientes` |
| Detalle de Cliente + Pago | COBRADOR | `/cobrador/clientes/:id` |
| Dashboard Admin (KPIs globales + gráficos) | ADMIN | `/admin` |
| Gestión de Clientes | ADMIN | `/admin/clientes` |
| Gestión de Préstamos | ADMIN | `/admin/prestamos` |
| Gestión de Cobradores | ADMIN | `/admin/cobradores` |
| Control Diario (hoja tabular) | ADMIN | `/admin/control-diario` |
| Reportes | ADMIN | `/admin/reportes` |
| Auditoría | ADMIN | `/admin/auditoria` |
| Perfil | Ambos | `/perfil` |

### Lógica de negocio crítica identificada
- `getLoanOverdueDays()` → cálculo de días de atraso por préstamo
- `getClientRiskStatus()` → semáforo de riesgo (green/yellow/orange/red)
- `generateSchedule()` → generación de cuotas según frecuencia (DIARIO/SEMANAL/MENSUAL), saltando fines de semana en frecuencia diaria
- `registerPayment()` → imputación de pagos a cuotas + update de saldo
- `createLoan()` → creación de préstamo + cronograma
- `hasClientPaidToday()` → estado de cobranza del día

---

## Arquitectura propuesta

```
src/app/
├── core/
│   ├── config/
│   │   └── app-env.ts              (ya existe)
│   ├── models/                     (interfaces TypeScript)
│   │   ├── profile.model.ts
│   │   ├── client.model.ts
│   │   ├── loan.model.ts
│   │   ├── installment.model.ts
│   │   └── payment.model.ts
│   ├── services/
│   │   ├── auth.service.ts         (login, logout, currentUser signal)
│   │   ├── loan.service.ts         (registerPayment, createLoan, business logic)
│   │   └── theme.service.ts        (dark/light mode)
│   └── guards/
│       ├── auth.guard.ts           (ya existe, completar)
│       └── role.guard.ts           (ADMIN vs COBRADOR)
│
├── shared/
│   ├── components/
│   │   ├── shell/                  (sidebar + topnav + bottom-nav)
│   │   ├── kpi-card/               (tarjeta KPI reutilizable)
│   │   ├── client-card/            (tarjeta de cliente en lista)
│   │   └── status-badge/           (badge semáforo verde/amarillo/rojo)
│   └── pipes/
│       └── currency-pe.pipe.ts     (formato S/ con locale es-PE)
│
├── modules/
│   ├── auth/
│   │   ├── auth.routes.ts          (ya existe)
│   │   └── login/
│   │       ├── login.ts
│   │       └── login.html
│   ├── cobrador/
│   │   ├── cobrador.routes.ts
│   │   ├── dashboard/              (Mis cobranzas de hoy)
│   │   ├── clients/                (lista de mis clientes)
│   │   └── client-detail/          (detalle + registrar pago)
│   └── admin/
│       ├── admin.routes.ts
│       ├── dashboard/              (KPIs globales + gráficos)
│       ├── clients/
│       ├── loans/
│       ├── collectors/
│       ├── control-diario/
│       ├── reports/
│       └── audit/
```

## Mapeo de componentes MVP → PrimeNG

| MVP custom | PrimeNG equivalente |
|---|---|
| `.badge` | `p-tag` |
| `.card` / `.kpi-card` | `p-card` |
| `.btn` | `p-button` |
| `.form-input` | `p-inputtext` |
| `.form-select` | `p-select` |
| `.chip-btn` | `p-togglebutton` / `p-chip` |
| Modal overlay + bottom sheet | `p-dialog` (con breakpoints mobile) |
| `.fintech-table` | `p-table` |
| `.toast` | `p-toast` (MessageService) |
| Quick amount chips | `p-chip` clickeable |
| Stepper de monto | `p-inputnumber` |
| `.filter-chips-container` | `p-selectbutton` |
| Gráfico cobranza | `p-chart` (Chart.js) |
| Sidebar desktop | `p-menu` dentro de layout custom |
| Bottom nav mobile | layout custom (PrimeNG no tiene esto) |

## Decisiones de arquitectura clave

### Estado de la app
- `AuthService` expone `currentUser = signal<Profile | null>(null)`
- `ThemeService` expone `isDark = signal<boolean>()` y aplica la clase `.app-dark` al `<html>` (integrado con el Aura preset de PrimeNG)
- `LoanService` NO tiene estado propio — calcula derivados via `computed()` en cada componente que lo necesite

### Formularios
- Login → **Signal Forms** (Angular 22, simple, 2 campos)
- Nuevo préstamo → **Reactive Forms** (validaciones complejas, interdependencias)
- Registrar pago → **Signal Forms** (simple, un monto + notas)

### Datos (por ahora)
El MVP usa localStorage. La migración **mantiene esa capa** encapsulada en los services (preparando la interfaz para cuando conectemos Supabase). Los services tendrán métodos que mañana solo cambiamos de `localStorage` a llamada Supabase, sin tocar los componentes.

## Orden de ejecución

1. **Modelos TypeScript** — interfaces puras, sin dependencias
2. **Services core** — `AuthService`, `LoanService`, `ThemeService`
3. **Guards** — completar `auth.guard.ts`, agregar `role.guard.ts`
4. **Routing** — `app.routes.ts`, `cobrador.routes.ts`, `admin.routes.ts`
5. **Shell** — layout con sidebar + topnav + bottom nav mobile
6. **Login** — primera pantalla funcional
7. **Cobrador dashboard** — pantalla de mayor valor para campo
8. **Client detail + pago** — flujo core del cobrador
9. **Admin dashboard** — KPIs y gráficos
10. **Resto de pantallas admin** — clientes, préstamos, cobradores, auditoría

> [!IMPORTANT]
> El negocio financiero (`registerPayment`, `createLoan`, `generateSchedule`) vive SOLO en services con Vitest tests. Los componentes solo llaman al service y reaccionan al resultado. Nunca lógica de negocio en templates.
