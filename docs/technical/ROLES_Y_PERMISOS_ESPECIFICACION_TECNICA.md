# Especificación técnica del módulo de Roles y Permisos

> **Estado:** Propuesta técnica previa a implementación  
> **Aplicación:** CobranzaPro  
> **Modelo recomendado:** RBAC híbrido en PostgreSQL/Supabase  
> **Usuarios iniciales:** Administradores y supervisores

## 1. Decisión propuesta

Se propone implementar un módulo propio de **Roles y Permisos** sobre PostgreSQL/Supabase, sin
incorporar inicialmente un servicio externo de autorización.

La solución no debe reemplazar los roles técnicos actuales `admin`, `supervisor` y `collector`.
Estos roles representan clases de usuario vinculadas a reglas de negocio existentes, como la
propiedad de cartera, el horario de acceso del cobrador y las operaciones financieras permitidas.

Sobre esa base se agregará una segunda capa configurable:

- **Rol base:** define qué clase de usuario es la persona.
- **Rol de acceso:** agrupa permisos configurables para módulos y acciones.
- **Permiso:** autoriza una acción concreta, por ejemplo `clients.view` o `loans.update`.

El frontend utilizará los permisos para navegación y experiencia de usuario. PostgreSQL y los RPC
seguirán siendo la autoridad final de seguridad.

## 2. Recomendación sobre frameworks

Sí existen herramientas de autorización, pero no todas resuelven correctamente este proyecto.

| Alternativa | Ventajas | Desventajas para CobranzaPro | Decisión |
|---|---|---|---|
| PostgreSQL + Supabase RLS/RPC | Sin infraestructura adicional, integrado con la base, transaccional y compatible con el plan actual | Requiere diseñar y probar el catálogo de permisos | **Recomendado** |
| Supabase Custom Claims | Patrón oficial para RBAC y RLS; evita algunas consultas | Los permisos en el JWT pueden quedar desactualizados hasta renovar la sesión | Evaluar después, no en la primera versión |
| CASL | Biblioteca TypeScript pequeña y expresiva para ocultar o habilitar UI | No reemplaza por sí sola la autorización PostgreSQL/RLS; duplicaría reglas | No necesario inicialmente |
| Cerbos OSS | Motor de políticas completo y gratuito si se autohospeda | Agrega un servicio, despliegue, disponibilidad y llamadas de autorización | Sobreingeniería para el tamaño actual |

La solución propuesta es “manual” únicamente en el sentido de que el modelo se implementa dentro
del proyecto. No se improvisará autorización: se aplicará el patrón estándar RBAC con tablas de
roles, permisos, asignaciones, funciones de autorización, auditoría y pruebas de denegación.

## 3. Objetivos

- Crear roles personalizados desde la aplicación.
- Seleccionar qué módulos puede visualizar cada rol.
- Definir acciones permitidas dentro de cada módulo.
- Asignar un rol de acceso a cada usuario administrativo.
- Ocultar rutas, opciones y botones no autorizados.
- Impedir también las operaciones directamente en Supabase.
- Auditar cada creación, modificación y asignación de permisos.
- Aplicar cambios de permisos sin mantener accesos inseguros en sesiones antiguas.
- Conservar las reglas especiales de cobradores y operaciones financieras.

## 4. Alcance recomendado para la primera versión

Los roles configurables se aplicarán inicialmente a usuarios de back-office cuyo rol base sea:

- `admin`
- `supervisor`

Los cobradores conservarán su flujo fijo durante la primera versión:

- Solo pueden acceder a su propia cartera.
- Mantienen el horario de 07:00 a 20:00, hora de Lima.
- No adquieren acceso administrativo mediante un rol configurable.
- No pueden modificar las reglas de acceso ni asignarse permisos.

Intentar convertir también a `collector` en un rol totalmente dinámico elevaría considerablemente
el riesgo porque su identidad se utiliza actualmente para propiedad de datos, RLS, horarios y RPC.

## 5. Situación actual

### 5.1 Roles técnicos

La base utiliza el enum `public.app_role`:

```text
admin | supervisor | collector
```

`profiles.role` alimenta:

- `private.current_app_role()`.
- Políticas RLS.
- Validaciones dentro de RPC financieros.
- Restricción de cartera por cobrador.
- Horario operativo del cobrador.
- Guards y redirecciones de Angular.
- Visibilidad actual del menú.

Por esta razón, cambiar el enum para convertirlo en una lista de roles creados por el usuario no es
seguro ni incremental.

### 5.2 Autorización frontend

Actualmente `AuthService` calcula condiciones como:

- `isAdmin`
- `isSupervisor`
- `isCollector`

Los guards separan las áreas `/admin` y `/cobrador`, y el menú utiliza esas mismas categorías. Esta
capa mejora la experiencia de usuario, pero no debe considerarse una barrera de seguridad.

### 5.3 Autorización backend

PostgreSQL valida el usuario mediante `auth.uid()`, el perfil activo, el cambio obligatorio de PIN,
la vigencia de credenciales y, para cobradores, el horario de operación. Varias políticas y RPC
comparan directamente `admin`, `supervisor` o `collector`.

El nuevo RBAC debe agregarse sin eliminar estas condiciones de dominio.

## 6. Modelo conceptual

### 6.1 Rol base

Representa la clase operativa del usuario:

| Rol base | Responsabilidad |
|---|---|
| `admin` | Administración de la empresa y operaciones sensibles |
| `supervisor` | Supervisión operativa con permisos configurables |
| `collector` | Cobranza de cartera propia bajo reglas especiales |

### 6.2 Rol de acceso

Es un conjunto configurable de permisos. Ejemplos:

- Administrador general.
- Supervisor de créditos.
- Supervisor de caja.
- Auditor de solo lectura.
- Operador de clientes.

### 6.3 Permiso

Es una capacidad estable definida por el sistema:

```text
recurso.acción
```

Ejemplos:

```text
clients.view
clients.create
clients.update
loans.view
loans.create
cash_closure.validate
roles.manage
```

Los usuarios podrán crear roles y seleccionar permisos existentes, pero no inventar códigos de
permiso. Cada código debe corresponder a una acción implementada y protegida por el sistema.

## 7. Modelo de datos propuesto

Se recomienda guardar las tablas de control de acceso en el schema `private` y exponer únicamente
RPC controlados.

### 7.1 `private.access_roles`

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` | Identificador |
| `slug` | `text` | Código estable y único |
| `name` | `text` | Nombre visible |
| `description` | `text` | Propósito del rol |
| `active` | `boolean` | Permite asignaciones y uso |
| `is_system` | `boolean` | Impide editar roles reservados |
| `created_by` | `uuid` | Usuario creador |
| `created_at` | `timestamptz` | Fecha de creación |
| `updated_at` | `timestamptz` | Última modificación |

### 7.2 `private.access_permissions`

| Campo | Tipo | Descripción |
|---|---|---|
| `code` | `text` | Clave estable, por ejemplo `loans.update` |
| `module` | `text` | Agrupador visual |
| `action` | `text` | Acción autorizada |
| `label` | `text` | Etiqueta de interfaz |
| `description` | `text` | Explicación funcional |
| `risk_level` | `text` | `normal`, `sensitive` o `restricted` |
| `active` | `boolean` | Habilitación del permiso |

Esta tabla será sembrada por migraciones. No debe permitirse crear permisos arbitrarios desde el
frontend.

### 7.3 `private.access_role_permissions`

| Campo | Tipo | Descripción |
|---|---|---|
| `role_id` | `uuid` | Rol configurable |
| `permission_code` | `text` | Permiso asignado |
| `granted_by` | `uuid` | Actor que lo concedió |
| `granted_at` | `timestamptz` | Fecha de concesión |

La clave primaria será compuesta por `role_id` y `permission_code`.

### 7.4 `private.profile_access_roles`

| Campo | Tipo | Descripción |
|---|---|---|
| `profile_id` | `uuid` | Usuario de `public.profiles` |
| `role_id` | `uuid` | Rol de acceso asignado |
| `assigned_by` | `uuid` | Actor que realizó la asignación |
| `assigned_at` | `timestamptz` | Fecha de asignación |

`profile_id` será único para admitir **un rol de acceso por usuario** en la primera versión. Esto
evita la complejidad de combinar permisos de varios roles.

### 7.5 `private.access_control_audit_log`

Se recomienda una tabla específica porque el log privado actual está restringido a determinadas
acciones existentes.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` | Identificador |
| `actor_id` | `uuid` | Usuario que realizó el cambio |
| `action` | `text` | Creación, actualización, asignación o desactivación |
| `target_type` | `text` | `role`, `permission_set` o `profile_assignment` |
| `target_id` | `uuid` | Entidad modificada |
| `before_data` | `jsonb` | Estado anterior |
| `after_data` | `jsonb` | Estado posterior |
| `reason` | `text` | Motivo obligatorio |
| `created_at` | `timestamptz` | Fecha del evento |

La modificación y su auditoría deben ejecutarse dentro de la misma transacción.

## 8. Roles del sistema

La migración inicial debe crear roles reservados para mantener compatibilidad:

### 8.1 Administrador del sistema

- Acceso completo.
- No editable desde la interfaz.
- No desactivable.
- Único rol que puede administrar roles y asignaciones inicialmente.
- El sistema debe impedir que desaparezca el último administrador del sistema.

### 8.2 Supervisor predeterminado

- Replica el acceso actual del supervisor.
- Puede ajustarse posteriormente mediante una migración o una decisión funcional aprobada.

### 8.3 Roles personalizados

- Pueden crearse, editarse, activarse y desactivarse.
- No pueden recibir permisos marcados como `restricted`.
- No pueden modificar roles de sistema.
- No pueden otorgar permisos superiores a los del actor que administra el rol.

## 9. Catálogo inicial de permisos

El catálogo debe definir acciones reales, no solamente “ver” y “editar”. En operaciones financieras,
aprobar o anular representa un riesgo diferente a modificar datos comunes.

| Módulo | Permisos propuestos |
|---|---|
| Dashboard | `dashboard.view` |
| Analíticas | `analytics.view` |
| Clientes | `clients.view`, `clients.create`, `clients.update`, `clients.reassign`, `clients.deactivate` |
| Préstamos | `loans.view`, `loans.create`, `loans.update`, `loans.void` |
| Pagos | `payments.view`, `payments.register`, `payments.void` |
| Cobradores | `collectors.view`, `collectors.manage`, `collectors.reset_pin` |
| Control diario | `daily_control.view`, `daily_control.export` |
| Cierre de caja | `cash_closure.view`, `cash_closure.submit`, `cash_closure.validate` |
| Solicitudes | `correction_requests.view`, `correction_requests.resolve`, `correction_requests.reject` |
| Auditoría | `audit.view` |
| Roles | `roles.view`, `roles.manage` |

Reglas recomendadas:

- Una acción de modificación exige también el permiso de visualización del módulo.
- La interfaz selecciona automáticamente `view` al marcar una acción dependiente.
- El RPC de guardado valida nuevamente las dependencias.
- `roles.manage` y otras capacidades restringidas no se asignan a roles personalizados inicialmente.
- Los permisos de anulación, validación y restablecimiento de PIN se muestran con una advertencia.

## 10. Funciones y RPC propuestos

### 10.1 Autorización interna

```text
private.has_permission(p_permission_code text) returns boolean
private.require_permission(p_permission_code text) returns void
```

`has_permission` debe:

1. Obtener el usuario con `auth.uid()`.
2. Validar que el perfil siga operativo mediante las reglas existentes.
3. Mantener las restricciones especiales del rol base.
4. Obtener el rol de acceso activo asignado.
5. Comprobar el permiso solicitado.
6. Denegar por defecto ante cualquier estado incompleto.

No debe confiar en datos enviados por Angular ni en `localStorage`.

### 10.2 Contexto del usuario

```text
current_access_context()
```

Debe devolver:

- Rol base.
- Rol de acceso.
- Permisos efectivos.
- Versión o fecha de actualización del acceso.
- Estado operativo del usuario.

### 10.3 Administración

```text
admin_list_access_roles()
admin_get_access_role(p_role_id)
admin_create_access_role(p_name, p_description, p_permission_codes, p_reason)
admin_update_access_role(p_role_id, p_name, p_description, p_permission_codes, p_reason)
admin_set_access_role_active(p_role_id, p_active, p_reason)
admin_list_access_assignments()
admin_assign_access_role(p_profile_id, p_role_id, p_reason)
```

Las operaciones deben ser atómicas y validar:

- Actor autorizado.
- Rol objetivo existente y activo.
- Permisos pertenecientes al catálogo.
- Dependencias entre permisos.
- Prohibición de autoescalamiento.
- Prohibición de modificar roles reservados.
- Existencia de al menos un administrador del sistema.
- Auditoría obligatoria.

## 11. Integración con los RPC y RLS existentes

Agregar el módulo y ocultar botones no completa el requerimiento. Cada operación protegida debe
validar el permiso correspondiente en PostgreSQL.

Ejemplo conceptual:

```sql
perform private.require_permission('loans.update');
```

Esta verificación se agrega además de las reglas financieras existentes:

- Préstamo activo.
- Día de caja no validado.
- Propiedad de cartera.
- Motivo obligatorio.
- Pago contabilizado.
- Restricciones de anulación.

Los permisos no deben sustituir esas reglas; únicamente agregan una condición de acceso.

La migración debe realizarse módulo por módulo. No se recomienda reemplazar de forma masiva todas
las comparaciones de roles sin pruebas de paridad.

## 12. Arquitectura Angular

### 12.1 Estructura propuesta

```text
src/app/
├── core/
│   ├── models/access-control.model.ts
│   ├── repositories/access-control.repository.ts
│   ├── adapters/supabase-access-control.repository.ts
│   └── services/access-control.service.ts
└── modules/admin/access-control/
    ├── access-control.ts
    ├── access-control.html
    ├── access-control.store.ts
    ├── access-control.store.spec.ts
    └── role-permission-matrix.ts
```

### 12.2 Ruta

```text
/admin/roles
```

```ts
{
  path: 'roles',
  title: 'Roles y permisos | CobranzaPro',
  canMatch: [permissionCanMatch],
  data: { permission: 'roles.view' },
  loadComponent: () => import('./access-control/access-control'),
  providers: [
    AccessControlStore,
    {
      provide: ACCESS_CONTROL_REPOSITORY,
      useClass: SupabaseAccessControlRepository,
    },
  ],
}
```

### 12.3 Servicio de permisos

`AccessControlService` será un servicio de sesión y expondrá Signals:

```text
permissions
accessRole
loading
error
can(permission)
canAny(permissions)
reload()
```

El servicio obtiene `current_access_context()` después del login o al restaurar la sesión. Puede
conservar permisos en memoria para la experiencia de usuario, pero nunca se considera autoridad de
seguridad.

Ante un error al cargar permisos, debe fallar cerrado: no mostrar módulos administrativos cuya
autorización no pudo comprobarse.

### 12.4 Guards

Se agregará un guard reutilizable:

```text
permissionCanMatch
```

El guard leerá `route.data.permission` y esperará a que el contexto de permisos esté disponible.
Una denegación llevará al Dashboard o a una pantalla de acceso denegado, sin cerrar la sesión.

Los guards actuales de autenticación, cambio obligatorio de PIN, área administrativa y horario de
cobrador permanecerán activos.

### 12.5 Menú y acciones

Cada entrada administrativa declarará el permiso necesario:

```ts
{
  label: 'Préstamos',
  icon: 'pi pi-wallet',
  route: '/admin/prestamos',
  permission: 'loans.view',
}
```

El menú se derivará del catálogo estático de navegación y de los permisos efectivos. Los botones de
crear, editar, aprobar, rechazar o anular utilizarán el mismo vocabulario de permisos.

No se recomienda una directiva personalizada para la primera etapa si `@if (access.can(...))` es
suficiente. Una directiva solo se justifica si la repetición se vuelve significativa.

## 13. Experiencia de usuario

### 13.1 Pantalla principal

```text
Roles y permisos
[Crear rol]

[Roles] [Asignaciones]

Nombre                 Usuarios    Estado     Acciones
Administrador sistema  2           Activo     Ver
Supervisor de caja     1           Activo     Editar
Auditor                 1           Activo     Editar
```

### 13.2 Edición de rol

La edición mostrará una matriz agrupada por módulo:

```text
Módulo             Ver   Crear   Editar   Aprobar   Anular   Exportar
Clientes            ✓      ✓        ✓
Préstamos           ✓      ✓        ✓                  ✓
Cierre de caja      ✓                        ✓
```

Requisitos de UX:

- Signal Form para nombre, descripción y motivo.
- Permisos agrupados por módulo, no como lista plana extensa.
- Explicación de cada acción sensible.
- Advertencia antes de retirar permisos a usuarios activos.
- Guardar deshabilitado si no existen cambios reales.
- Confirmación para desactivar un rol.
- Identificación visible de roles reservados.
- Diseño responsive y operable con teclado.

### 13.3 Asignaciones

Debe permitir:

- Buscar por nombre o DNI.
- Visualizar rol base y rol de acceso.
- Asignar un rol activo.
- Solicitar motivo obligatorio.
- Mostrar qué usuarios perderán o ganarán acceso.

El módulo asigna roles a perfiles existentes; no crea usuarios de Supabase Auth.

## 14. Prevención de escalamiento de privilegios

La implementación debe impedir:

- Que un usuario modifique su propio rol para obtener más permisos.
- Que un actor conceda permisos que no posee.
- Que un rol personalizado obtenga permisos restringidos.
- Que se modifique o desactive el rol administrador del sistema.
- Que se elimine o deshabilite al último administrador del sistema.
- Que una escritura directa en tablas públicas altere permisos.
- Que permisos almacenados en `localStorage` autoricen una operación.
- Que ocultar un botón sea la única protección.
- Que `service_role` llegue al frontend.

Las tablas privadas no tendrán acceso directo para `anon` ni `authenticated`. Las operaciones se
realizarán mediante RPC con autorización y auditoría explícitas.

## 15. Vigencia de permisos y sesiones

### 15.1 Primera versión recomendada

Las operaciones sensibles consultarán los permisos vigentes en PostgreSQL. Esto permite que una
revocación se aplique en la siguiente solicitud sin esperar a que caduque un JWT.

Para mantener la interfaz sincronizada:

- Recargar el contexto después del login.
- Recargar al volver a una pestaña visible.
- Recargar después de una asignación realizada por el usuario actual.
- Ante una respuesta `42501`, actualizar permisos y mostrar acceso denegado.

Cuando cambie el rol de un usuario o los permisos de su rol, puede actualizarse
`profiles.credentials_invalid_before` para invalidar sesiones existentes de los usuarios afectados.
Con el volumen actual, forzar un nuevo login es una solución segura y comprensible.

### 15.2 Custom Claims como optimización futura

Supabase permite agregar roles y permisos al JWT mediante un Custom Access Token Hook. Sin embargo,
los claims se actualizan cuando se emite o renueva el token. No se recomienda utilizar esta opción
en la primera versión porque complica la revocación inmediata.

Si se adopta posteriormente:

- Usar `app_metadata` o un hook controlado, nunca `user_metadata`.
- Mantener permisos sensibles validados contra la base.
- Definir renovación de sesión y versión de permisos.
- Documentar el tiempo máximo de revocación.

## 16. Costos y capacidad

La solución propuesta no requiere una suscripción adicional:

- Utiliza tablas y funciones PostgreSQL dentro del proyecto Supabase existente.
- El catálogo tendrá pocas decenas de permisos.
- Las asignaciones serán aproximadamente una por usuario.
- Los índices serán pequeños.
- Las comprobaciones se ejecutarán dentro de las operaciones ya existentes.

Índices mínimos:

```text
access_roles(slug)
access_role_permissions(role_id, permission_code)
profile_access_roles(profile_id)
profile_access_roles(role_id)
```

No se necesita Realtime, Redis ni un servicio externo para el volumen previsto.

## 17. Estrategia de migración

### Fase 1. Catálogo funcional

- Confirmar módulos y acciones con el cliente.
- Clasificar permisos normales, sensibles y restringidos.
- Confirmar un rol por usuario.
- Confirmar que los cobradores quedan fuera de la personalización inicial.

### Fase 2. Base de datos

- Crear tablas privadas mediante migración aditiva.
- Sembrar permisos y roles del sistema.
- Asignar roles compatibles a admin y supervisor existentes.
- Crear funciones de autorización y RPC administrativos.
- Crear auditoría transaccional.
- Agregar pruebas pgTAP antes de cambiar módulos productivos.

### Fase 3. Contexto de acceso Angular

- Crear modelos, repositorio, adaptador y servicio de permisos.
- Cargar permisos al iniciar o restaurar sesión.
- Agregar guard por permiso.
- Filtrar menú y acciones.
- Mantener las validaciones actuales de rol base.

### Fase 4. Módulo de Roles

- Crear listado de roles.
- Crear matriz de permisos.
- Crear asignaciones de usuarios.
- Incorporar motivos, confirmaciones y detección de cambios reales.

### Fase 5. Protección por módulo

Migrar de forma incremental:

1. Lectura del módulo.
2. Acciones de creación y modificación.
3. Acciones sensibles.
4. RLS y RPC relacionados.
5. Pruebas de permitido y denegado.

Un módulo solo se considera terminado cuando frontend y backend utilizan el mismo permiso.

### Fase 6. Despliegue

- Aplicar primero en DEV/UAT.
- Verificar asignaciones predeterminadas.
- Ejecutar pruebas de regresión de cobradores y finanzas.
- Realizar respaldo antes de producción.
- Aplicar migraciones.
- Validar al menos un administrador del sistema.
- Habilitar la interfaz de gestión después de validar el backend.

## 18. Estrategia de pruebas

### 18.1 pgTAP

- Admin del sistema puede administrar roles.
- Supervisor o rol sin permiso no puede administrar roles.
- Un usuario no puede autoasignarse permisos.
- No se puede retirar al último administrador.
- Un rol inactivo no concede permisos.
- Los cambios generan auditoría completa.
- Cada RPC protegido acepta y rechaza según el permiso.
- Los cobradores siguen limitados a su cartera.
- El horario del cobrador continúa vigente.
- La invalidación de credenciales sigue funcionando.
- Los cierres de caja validados siguen siendo inmutables.

### 18.2 Unitarias Angular

- `can()` y `canAny()`.
- Carga y error del contexto.
- Guard autorizado y denegado.
- Menú filtrado.
- Detección de cambios reales en roles.
- Dependencias de permisos.
- Estado de roles reservados.

### 18.3 E2E críticos

- Admin crea un rol limitado.
- Admin asigna el rol a un usuario.
- El usuario ve únicamente los módulos permitidos.
- Navegar manualmente a una ruta denegada no concede acceso.
- Una llamada directa a Supabase es rechazada.
- Retirar un permiso invalida o actualiza la sesión.
- El último administrador no puede eliminarse.

Los E2E no sustituyen las pruebas pgTAP, porque ocultar rutas no demuestra que RLS o RPC protejan la
información.

## 19. Criterios de aceptación

- [ ] Los roles base `admin`, `supervisor` y `collector` continúan funcionando.
- [ ] Un administrador del sistema puede crear y editar roles personalizados.
- [ ] Los roles seleccionan únicamente permisos definidos por el sistema.
- [ ] Cada usuario administrativo tiene un único rol de acceso activo.
- [ ] El menú y las rutas respetan permisos.
- [ ] Los botones y acciones respetan permisos.
- [ ] Las llamadas directas no autorizadas son rechazadas por PostgreSQL.
- [ ] Los cambios de acceso generan auditoría con antes, después, actor y motivo.
- [ ] No es posible el autoescalamiento.
- [ ] Siempre queda al menos un administrador del sistema.
- [ ] Los cambios de permisos se reflejan de manera segura en sesiones activas.
- [ ] Los cobradores mantienen propiedad de cartera y horario operativo.
- [ ] Las pruebas pgTAP cubren permitido, denegado y regresiones.
- [ ] El módulo se carga de forma lazy desde `/admin/roles`.

## 20. Fuera de alcance inicial

- Múltiples roles simultáneos por usuario.
- Permisos creados libremente desde la interfaz.
- Reglas ABAC basadas en importes, ciudades o atributos dinámicos.
- Autorización entre múltiples empresas o tenants.
- Motor externo como Cerbos u OpenFGA.
- Realtime para cambios de permisos.
- Personalización del flujo de cobradores.
- Sustitución completa de todas las políticas en una sola migración.
- Uso de permisos frontend como frontera de seguridad.

## 21. Decisiones funcionales pendientes

Antes de implementar, el cliente debe aprobar:

1. Qué módulos pueden configurarse.
2. Qué acciones necesita cada módulo.
3. Qué permisos se consideran restringidos.
4. Si `admin` y `supervisor` pueden recibir roles personalizados o solo supervisor.
5. Si el administrador del sistema es el único que administra roles.
6. Si una modificación de permisos debe forzar inmediatamente un nuevo login.
7. Confirmación de un único rol por usuario.

La recomendación inicial es:

- Configurar únicamente usuarios administrativos y supervisores.
- Mantener cobradores fuera del RBAC dinámico.
- Usar un solo rol por usuario.
- Reservar `roles.manage` al administrador del sistema.
- Forzar renovación de sesión cuando cambien permisos.

## 22. Referencias técnicas

- [Supabase: Custom Claims y Role-Based Access Control](https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac)
- [Supabase: Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks)
- [CASL: autorización para TypeScript](https://casl.js.org/)
- [Cerbos: alternativas administradas y open source](https://www.cerbos.dev/pricing)

