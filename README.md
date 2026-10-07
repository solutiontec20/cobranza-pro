# CobranzaPro

Sistema web de gestión de préstamos y cobranzas.

## Stack

- Angular 22
- PrimeNG 22
- Tailwind CSS 4
- Supabase
- Vitest
- Playwright
- pnpm

## Requisitos

- Node.js compatible con Angular 22
- pnpm 11
- Git

## Instalación

Instalar dependencias:

```bash
pnpm install
```

Crear el archivo local de variables de entorno tomando como referencia:

```text
.env.template
```

El archivo `.env` no debe subirse al repositorio.

## Desarrollo

Iniciar Angular:

```bash
pnpm start
```

La aplicación estará disponible en:

```text
http://localhost:4200
```

## Build

Crear un build de producción:

```bash
pnpm build
```

Los artefactos compilados se generan en `dist/`.

## Unit tests

Los tests unitarios y de lógica de negocio utilizan Vitest:

```bash
pnpm test
```

Los tests unitarios deben vivir junto al código que prueban, usando archivos `*.spec.ts`.

## E2E

Los journeys críticos utilizan Playwright:

```bash
pnpm e2e
```

Modo UI:

```bash
pnpm e2e:ui
```

Modo navegador visible:

```bash
pnpm e2e:headed
```

Abrir el último reporte:

```bash
pnpm e2e:report
```

Los tests E2E viven en:

```text
e2e/
```

## Supabase

La configuración de base de datos se versiona dentro de:

```text
supabase/
├── migrations/
├── tests/
└── seed.sql
```

Crear una migration:

```bash
pnpm supabase migration new nombre_migration
```

Reglas del proyecto:

- Los cambios de esquema deben versionarse como migrations.
- Los cambios deben probarse primero en UAT antes de pasar a producción.
- No modificar manualmente el esquema de producción como flujo normal de desarrollo.
- RLS es obligatorio para los límites de acceso entre administradores y cobradores.
- Las operaciones financieras críticas deben ser transaccionales y auditables.

## Entornos

### UAT

```text
Netlify Deploy Preview
        ↓
Supabase UAT
        ↓
datos ficticios
```

### Producción

```text
Netlify Production
        ↓
Supabase PROD
        ↓
datos reales
```

El acceso MCP de Supabase PROD debe mantenerse en modo `read_only`.

## Desarrollo asistido por IA

Las instrucciones generales del proyecto están en:

```text
AGENTS.md
```

Los skills instalados para agentes están en:

```text
.agents/skills/
```

La configuración MCP principal está en:

```text
.agents/mcp_config.json
```

La integración Angular MCP para Antigravity está en:

```text
.antigravity/mcp.json
```

## Package manager

Este proyecto utiliza exclusivamente pnpm.

No utilizar npm ni yarn para instalar dependencias o ejecutar scripts del proyecto.

## Estructura de pruebas

```text
src/app/**/*.spec.ts        → Vitest / Angular

e2e/**/*.spec.ts            → Playwright

supabase/tests/**/*.sql      → PostgreSQL / RLS / RPC
```

## Idioma y UI

- Idioma de la interfaz: español.
- Locale principal: `es-PE`.
- Diseño mobile-first.
- PrimeNG Aura es el tema visual principal.
- Tailwind CSS se usa principalmente para layout, spacing y responsive.
