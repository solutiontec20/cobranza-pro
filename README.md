# CobranzaPro

Sistema web para la gestión de préstamos, cobranzas, clientes, cuotas, pagos, saldos y atrasos.

La aplicación está orientada inicialmente a un equipo pequeño de administración y cobradores, con una única base de datos central y control de acceso por roles y Row Level Security (RLS).

## Stack

- Angular 22
- TypeScript 6
- PrimeNG 22
- PrimeUI Aura
- Tailwind CSS 4
- Supabase
  - Auth
  - PostgreSQL
  - Row Level Security
  - RPC / funciones PostgreSQL
- Vitest para pruebas unitarias y lógica de negocio
- Playwright para E2E
- pnpm
- Netlify para el frontend

## Principios del proyecto

- SPA / CSR. No se usa SSR.
- Mobile-first y responsive.
- Arquitectura por funcionalidades.
- Signals para estado local y derivado.
- Lazy loading para módulos funcionales.
- PrimeNG como librería principal de UI.
- Tailwind principalmente para layout, spacing y responsive.
- Supabase concentra autenticación, base de datos, RLS y operaciones transaccionales.
- Las reglas financieras críticas deben ser testeables y auditables.
- No se elimina físicamente historial financiero importante.
- No se agregan librerías sin una necesidad concreta.

## Estructura de la aplicación

```text
src/
├── app/
│   ├── core/
│   │   ├── config/
│   │   ├── supabase/
│   │   └── errors/
│   │
│   ├── modules/
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── customers/
│   │   ├── collectors/
│   │   ├── loans/
│   │   ├── payments/
│   │   └── overdue/
│   │
│   ├── shared/
│   │   ├── ui/
│   │   ├── pipes/
│   │   ├── validators/
│   │   ├── utils/
│   │   ├── constants/
│   │   └── types/
│   │
│   ├── shell/
│   │   ├── sidebar/
│   │   ├── topbar/
│   │   └── app-shell.ts
│   │
│   ├── app.config.ts
│   ├── app.routes.ts
│   ├── app.spec.ts
│   └── app.ts
│
├── env.d.ts
├── index.html
├── main.ts
└── styles.css
```

### `core/`

Infraestructura global de la aplicación.

Ejemplos:

- configuración de variables de entorno;
- cliente de Supabase;
- manejo global de errores;
- servicios o providers realmente globales.

`core/` no debe convertirse en una carpeta genérica para lógica de negocio.

### `modules/`

Agrupa las funcionalidades principales del sistema.

Cada módulo funcional debe contener su propia UI, servicios, modelos, rutas y lógica específica cuando corresponda.

Ejemplo:

```text
modules/
└── loans/
    ├── loan-list/
    ├── loan-detail/
    ├── loan-form/
    ├── calculations/
    ├── loan.model.ts
    ├── loan.service.ts
    └── loan.routes.ts
```

La lógica propia del dominio se mantiene dentro de su módulo. Por ejemplo, cálculos de préstamos o distribución de pagos no deben moverse a `shared/utils`.

### `shared/`

Código realmente reutilizado por varias funcionalidades.

Ejemplos:

- componentes visuales reutilizables;
- pipes;
- validators;
- utilidades genéricas;
- constantes globales;
- tipos compartidos.

No mover código a `shared/` solo porque podría reutilizarse algún día. Debe existir una necesidad real de reutilización.

### `shell/`

Contiene la estructura visual persistente de la zona autenticada.

Ejemplo:

```text
AppShell
├── Topbar
├── Sidebar
└── router-outlet
    ├── Dashboard
    ├── Clientes
    ├── Préstamos
    └── Pagos
```

La ruta de login queda fuera del shell.

## Routing

La aplicación usa rutas lazy.

Ejemplo conceptual:

```text
/login
  -> Auth

/
  -> AppShell
      /dashboard
      /clientes
      /prestamos
      /pagos
```

Los archivos de rutas de cada módulo viven dentro de su feature:

```text
modules/auth/auth.routes.ts
modules/dashboard/dashboard.routes.ts
modules/customers/customers.routes.ts
```

Para componentes o rutas lazy se puede usar `default export` para simplificar imports dinámicos.

Ejemplo:

```ts
export default class Login {}
```

```ts
loadComponent: () => import('./login/login')
```

## Lógica financiera

La lógica financiera no debe vivir dentro de componentes de UI.

Ejemplo:

```text
modules/loans/calculations/
├── calculate-loan.ts
├── calculate-loan.spec.ts
├── generate-schedule.ts
└── generate-schedule.spec.ts
```

La intención es mantener funciones puras y testeables para:

- interés;
- total a devolver;
- cuotas;
- cronogramas;
- redondeos;
- pagos parciales;
- pagos adelantados;
- atraso;
- saldos.

Las reglas financieras definitivas solo deben implementarse cuando estén confirmadas con el cliente.

## Supabase

La configuración de Supabase vive dentro del mismo repositorio.

```text
supabase/
├── migrations/
├── tests/
│   ├── rls/
│   ├── rpc/
│   └── constraints/
├── seed.sql
├── config.toml
└── .gitignore
```

### Migraciones

Todos los cambios de esquema deben versionarse mediante migraciones.

Crear una nueva migración:

```bash
pnpm supabase migration new nombre_migracion
```

No usar el SQL Editor de producción como flujo normal para cambiar el esquema.

El mismo conjunto de migraciones debe aplicarse primero a UAT y luego a PROD.

### Entornos Supabase

```text
Supabase Free
├── cobranza-uat
│   └── datos ficticios / pruebas
└── cobranza-prod
    └── datos reales
```

Flujo esperado:

```text
migration
   ↓
UAT
   ↓
pruebas
   ↓
validación
   ↓
PROD
```

## Seguridad

- La seguridad no debe depender solamente del frontend.
- RLS es obligatorio en las tablas con datos restringidos por usuario o cobrador.
- Un cobrador nunca debe poder acceder a la cartera de otro cobrador.
- Nunca exponer `service_role`, secret keys ni credenciales de base de datos en Angular.
- Las operaciones financieras críticas deben ejecutarse de forma transaccional.
- Los pagos y cambios financieros importantes deben conservar auditoría.

## Variables de entorno

El proyecto usa `@ngx-env/builder`.

Variables frontend esperadas:

```env
NG_APP_PRIMENG_UI_KEY=
NG_APP_SUPABASE_URL=
NG_APP_SUPABASE_PUBLISHABLE_KEY=
```

`.env` no se versiona.

Usar `.env.template` como referencia.

Nunca colocar en frontend:

```env
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_SECRET_KEY=
DATABASE_PASSWORD=
```

## UI, tema e idioma

- PrimeNG Aura es el tema principal.
- La aplicación inicia en dark mode.
- Locale principal: `es-PE`.
- PrimeNG usa traducciones al español.
- Tailwind CSS 4 se usa principalmente para layout y responsive.

`styles.css` debe mantenerse simple:

```css
@import 'tailwindcss';
@import 'tailwindcss-primeui';

@custom-variant dark (&:where(.app-dark, .app-dark *));
```

No crear un segundo sistema de colores en Tailwind si PrimeNG ya proporciona los tokens necesarios.

## Instalación

Requisitos principales:

- Node.js compatible con Angular 22
- pnpm 11
- Git

Instalar dependencias:

```bash
pnpm install
```

Crear `.env` tomando como referencia:

```text
.env.template
```

## Desarrollo local

```bash
pnpm start
```

Aplicación:

```text
http://localhost:4200
```

## Build

```bash
pnpm build
```

El build de producción se genera en `dist/`.

## Tests

### Unit tests / lógica de negocio

Vitest:

```bash
pnpm test
```

Los tests `*.spec.ts` permanecen junto al código que prueban.

Ejemplo:

```text
calculate-loan.ts
calculate-loan.spec.ts
```

### E2E

Playwright:

```bash
pnpm e2e
```

Modo UI:

```bash
pnpm e2e:ui
```

Navegador visible:

```bash
pnpm e2e:headed
```

Reporte:

```bash
pnpm e2e:report
```

Los E2E viven en:

```text
e2e/
├── auth/
├── customers/
├── loans/
├── payments/
└── security/
```

Priorizar journeys críticos, no detalles visuales menores.

### Base de datos / RLS / RPC

Los tests de PostgreSQL y seguridad viven en:

```text
supabase/tests/
```

Debe existir cobertura para casos como:

```text
Cobrador A NO puede acceder a la cartera de Cobrador B.
```

## Deploy

### UAT

```text
Pull Request
   ↓
Netlify Deploy Preview
   ↓
Supabase UAT
   ↓
revisión y pruebas
```

### Producción

```text
merge a main
   ↓
Netlify Production
   ↓
Supabase PROD
```

La aplicación productiva no debe usar datos de prueba.

## Package manager

Este proyecto usa exclusivamente:

```text
pnpm
```

No utilizar npm ni yarn para gestionar dependencias del proyecto.

Versión configurada:

```text
pnpm 11.15.1
```

## Desarrollo asistido por IA

El repositorio está preparado para agentes de desarrollo.

### Reglas del proyecto

```text
AGENTS.md
```

Contiene decisiones técnicas y restricciones que los agentes deben respetar.

### Skills

```text
.agents/skills/
```

Contiene skills especializados instalados para Angular, testing, Supabase, diseño y otras tareas.

### MCP

```text
.antigravity/mcp.json
.agents/mcp_config.json
```

Se usan para integrar herramientas como:

- Angular CLI;
- Playwright;
- Supabase UAT;
- Supabase PROD en modo read-only;
- GitHub;
- Netlify.

Nunca guardar tokens privados o credenciales sensibles dentro del repositorio.

## Convenciones de desarrollo

- Mantener componentes pequeños y enfocados.
- Preferir Signals para estado local.
- Usar rutas lazy para features.
- Usar PrimeNG antes de construir componentes equivalentes desde cero.
- No crear wrappers de PrimeNG sin una necesidad concreta.
- Mantener lógica del dominio fuera de componentes visuales.
- Evitar `any`; usar tipos estrictos.
- No duplicar reglas de negocio entre frontend y base de datos cuando una operación debe ser transaccional.
- Preferir implementaciones simples que preserven seguridad, integridad financiera y mantenibilidad.

## Estado del proyecto

La aplicación está siendo construida como la primera versión funcional definitiva, no como un MVP descartable.

El alcance inicial contempla:

- autenticación;
- administración de usuarios/cobradores;
- clientes y cartera;
- préstamos;
- cuotas y cronogramas;
- pagos;
- saldos;
- atrasos y morosidad;
- dashboard operativo;
- auditoría;
- seguridad por RLS.

Algunas reglas de negocio financieras aún deben confirmarse antes de su implementación definitiva.
