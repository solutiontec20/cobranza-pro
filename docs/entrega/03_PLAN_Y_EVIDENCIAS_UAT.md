# CobranzaPro — Plan y evidencias de pruebas UAT

**Validación funcional por usuarios del negocio**

| Campo editable | Información |
|---|---|
| Organización cliente | ______________________________ |
| Proyecto | CobranzaPro |
| Versión del sistema | ______________________________ |
| Commit evaluado | ______________________________ |
| Ambiente UAT | ______________________________ |
| Versión del documento | 0.1 |
| Fecha planificada | ____ / ____ / ______ |
| Elaborado por | Equipo TI |
| Responsable UAT del cliente | ______________________________ |
| Aprobado por | ______________________________ |

> **NOTA EDITORIAL — RETIRAR ANTES DE LA ENTREGA:** este documento contiene campos en blanco y marcadores de evidencia. Durante la ejecución deben completarse con resultados reales y capturas obtenidas en UAT. Antes de entregar la versión firmable, cada marcador debe reemplazarse por su evidencia o por la referencia al archivo aprobado, y esta nota debe eliminarse.

---

## 1. Control del documento

### 1.1 Historial de versiones

| Versión | Fecha | Descripción | Responsable |
|---|---|---|---|
| 0.1 | 12/11/2026 | Plan inicial y casos UAT basados en el alcance funcional implementado | Equipo TI |
| ____ | ____ / ____ / ______ | ______________________________________________ | __________________ |

### 1.2 Aprobaciones del plan

| Rol | Nombre | Conformidad | Fecha |
|---|---|---|---|
| Responsable funcional del cliente | __________________ | ☐ Sí ☐ No | ____ / ____ / ______ |
| Líder de UAT | __________________ | ☐ Sí ☐ No | ____ / ____ / ______ |
| Responsable técnico | __________________ | ☐ Sí ☐ No | ____ / ____ / ______ |

---

## 2. Propósito y forma de uso

Este documento guía la **prueba de aceptación de usuario (UAT)** de CobranzaPro. Su objetivo es que representantes del negocio confirmen, con datos ficticios y en un ambiente no productivo, que los flujos entregados permiten operar cobranzas, préstamos, correcciones y cierres conforme a las reglas acordadas.

### 2.1 Ruta rápida de ejecución

1. Aprobar alcance, ambiente, versión y responsables.
2. Preparar los datos ficticios definidos en la sección 8.
3. Ejecutar cada caso sin alterar el orden de sus pasos.
4. Registrar resultado obtenido, estado y evidencia.
5. Crear una incidencia por cada diferencia no esperada.
6. Repetir los casos afectados después de una corrección.
7. Completar el resumen, la declaración de aceptación y las firmas.

### 2.2 UAT frente a otras pruebas

| Tipo de prueba | Pregunta que responde | Responsable principal | Evidencia típica |
|---|---|---|---|
| Unitaria | ¿Una función o clase aislada calcula y valida correctamente? | Desarrollo | Resultado automatizado |
| Integración/SQL | ¿Base de datos, reglas, RPC y permisos colaboran correctamente? | Desarrollo/QA | Ejecución automatizada y logs |
| E2E | ¿La interfaz completa permite recorrer un flujo sin fallos técnicos? | QA/Desarrollo | Reporte automatizado, trazas y capturas |
| UAT | ¿El sistema satisface la operación real y es aceptable para el negocio? | Usuarios designados por el cliente | Resultado firmado, evidencia e incidencias |

UAT no reemplaza las pruebas técnicas. Tampoco debe convertirse en una sesión libre de exploración sin registro: cada conclusión necesita un caso, un resultado y una evidencia.

---

## 3. Alcance de UAT

### 3.1 Incluido

- acceso con DNI y PIN, cambio obligatorio de PIN, bloqueo por intentos y horario del cobrador;
- separación visible de roles y carteras;
- navegación adaptable, tema y cierre de sesión;
- Dashboard administrativo y ruta de cobranza del cobrador;
- gestión administrativa de cobradores;
- clientes, préstamos, cronogramas, pagos parciales y adelantados;
- rechazo de operaciones inválidas, renovación y restricción por atraso;
- solicitudes de corrección y notificaciones;
- Control diario y exportación CSV, Excel y PDF;
- solicitudes de viático y gasto;
- envío, validación y protección posterior del cierre de caja.

### 3.2 Fuera de alcance

| Elemento | Motivo |
|---|---|
| Auditoría | La pantalla actual está en construcción y no es operativa |
| Importación masiva desde Excel/CSV | No existe un flujo disponible en la interfaz |
| Fotografías de cliente o documento | No forman parte de la versión actual |
| Consulta externa de identidad | No existe integración activa |
| Exportación TXT | El módulo disponible exporta CSV, Excel y PDF |
| Rendimiento de producción y recuperación ante desastres | Requieren planes técnicos separados |

Una observación sobre estos elementos se registra como solicitud de evolución, no como defecto de la versión UAT.

---

## 4. Ambiente, versión y dispositivos

### 4.1 Ficha del ambiente

| Campo | Valor a completar |
|---|---|
| URL UAT | ______________________________________________ |
| Proyecto Supabase no productivo | ______________________________________________ |
| Rama | ______________________________________________ |
| Commit | ______________________________________________ |
| Fecha y hora de despliegue | ______________________________________________ |
| Responsable del despliegue | ______________________________________________ |
| Versión de datos semilla | ______________________________________________ |
| Fecha del último reinicio de datos | ______________________________________________ |
| Navegadores aprobados | ______________________________________________ |

**Reglas del ambiente:**

1. UAT debe estar separado de producción.
2. Solo se utilizan personas, documentos, teléfonos, direcciones y montos ficticios.
3. La semilla debe cargarse únicamente en el ambiente local/UAT autorizado, nunca en producción.
4. Las credenciales de prueba se entregan por un canal seguro y no se escriben en este documento.
5. El commit registrado debe permanecer estable durante un ciclo; cualquier despliegue obliga a actualizar la ficha.
6. Antes de un nuevo ciclo se decide si se conserva la información para retest o se restablece la semilla.

### 4.2 Dispositivos mínimos

| Perfil | Dispositivo/viewport | Navegador | Responsable | Resultado |
|---|---|---|---|---|
| Administrador | Escritorio, 1440 × 900 | __________ | __________ | ☐ Conforme ☐ No conforme |
| Supervisor | Escritorio, 1366 × 768 o superior | __________ | __________ | ☐ Conforme ☐ No conforme |
| Cobrador principal | Móvil, 360 × 800 | __________ | __________ | ☐ Conforme ☐ No conforme |
| Cobrador complementario | Móvil, 393 × 852 | __________ | __________ | ☐ Conforme ☐ No conforme |
| Tableta de control | 768 × 1024 | __________ | __________ | ☐ Conforme ☐ No conforme |

---

## 5. Organización y RACI

**R:** ejecuta. **A:** aprueba y responde por el resultado. **C:** asesora. **I:** recibe información.

| Actividad | Responsable funcional cliente | Usuarios clave | QA | Desarrollo | Soporte/infraestructura |
|---|:---:|:---:|:---:|:---:|:---:|
| Aprobar alcance y criterios | A | C | R | C | I |
| Preparar ambiente y semilla | I | I | C | R | R |
| Ejecutar casos | A | R | C | I | I |
| Registrar incidencias | A | R | C | I | I |
| Analizar causa técnica | I | C | R | R | C |
| Corregir y desplegar | I | I | C | R | C |
| Ejecutar retest | A | R | C | I | I |
| Aceptar o rechazar entrega | A | C | I | I | I |

### 5.1 Participantes

| Rol UAT | Nombre | Rol en CobranzaPro | Contacto |
|---|---|---|---|
| Líder UAT | __________________ | __________________ | __________________ |
| Usuario clave 1 | __________________ | Administrador | __________________ |
| Usuario clave 2 | __________________ | Supervisor | __________________ |
| Usuario clave 3 | __________________ | Cobrador | __________________ |
| Facilitador técnico | __________________ | No aplica | __________________ |

---

## 6. Criterios de entrada, salida y suspensión

### 6.1 Entrada

- [ ] Documento funcional y manual disponibles para consulta.
- [ ] Alcance UAT aprobado.
- [ ] Ambiente no productivo accesible y commit registrado.
- [ ] Datos ficticios cargados y verificados.
- [ ] Usuarios de los tres roles habilitados.
- [ ] Navegadores y dispositivos disponibles.
- [ ] Sin defectos técnicos conocidos que impidan iniciar sesión o registrar operaciones.
- [ ] Responsable de restaurar datos identificado.

### 6.2 Salida propuesta

Estos umbrales deben ser confirmados por el cliente antes de ejecutar:

- 100 % de casos críticos y altos ejecutados.
- 100 % de casos críticos aprobados.
- Sin incidencias S1 o S2 abiertas.
- Al menos 95 % de los casos ejecutados aprobados; cualquier excepción debe quedar aceptada por escrito.
- Evidencia y resultado obtenido registrados en cada caso.
- Retest completado para todas las correcciones incluidas en la entrega.
- Declaración final firmada.

### 6.3 Suspensión

El líder UAT puede suspender el ciclo si el ambiente no corresponde al commit declarado, los datos dejan de ser confiables, existe indisponibilidad general, se detecta exposición de datos reales o un defecto S1 impide continuar. La reanudación requiere registrar causa, corrección y nueva fecha.

---

## 7. Severidades y estados

### 7.1 Severidad de incidencias

| Código | Definición | Ejemplo |
|---|---|---|
| S1 Crítica | Pérdida/corrupción financiera, acceso no autorizado o flujo principal inutilizable sin alternativa | Un cobrador consulta otra cartera; un pago duplica el saldo |
| S2 Alta | Función principal incorrecta con impacto operativo significativo | No se puede registrar un pago válido o validar un cierre |
| S3 Media | Comportamiento incorrecto con alternativa temporal | Un filtro falla, pero el registro puede localizarse por otra vía |
| S4 Baja | Presentación, texto o mejora sin bloqueo operativo | Alineación visual o etiqueta poco clara |

### 7.2 Estado de casos

| Estado | Uso |
|---|---|
| No ejecutado | Aún no se inició |
| En ejecución | Prueba en curso |
| Aprobado | Resultado esperado confirmado |
| Aprobado con observación | El flujo es aceptable, pero existe una observación menor sin impacto operativo; debe quedar documentada |
| Fallido | Existe diferencia reproducible |
| Bloqueado | No puede continuar por ambiente, datos o dependencia |
| No aplica | Retirado con aprobación y justificación |
| Retest aprobado | La corrección fue validada |
| Retest fallido | La diferencia persiste o apareció una regresión |

---

## 8. Datos ficticios de prueba

Los identificadores siguientes son etiquetas, no credenciales. El equipo técnico debe preparar registros equivalentes y entregar los accesos por separado.

| Código | Preparación requerida |
|---|---|
| DAT-ADM | Administrador activo con PIN definitivo |
| DAT-SUP | Supervisor activo con PIN definitivo |
| DAT-COL-A | Cobrador activo con cartera A |
| DAT-COL-B | Cobrador activo con cartera B distinta |
| DAT-COL-TEMP | Cobrador activo obligado a cambiar PIN |
| DAT-CLI-PARCIAL | Cliente con préstamo activo y varias cuotas pendientes |
| DAT-CLI-ADELANTO | Cliente con préstamo activo y saldo suficiente para cubrir cuotas futuras |
| DAT-CLI-RENUEVA | Cliente al día, elegible para renovación |
| DAT-CLI-RESTRINGIDO | Cliente con más de cinco días calendario de atraso desde la cuota impaga más antigua |
| DAT-CLI-SIN-PRESTAMO | Cliente activo sin préstamo vigente |
| DAT-CIERRE | Día con apertura, cobranza, desembolso y cierre aún no validado |

Los montos se consignan en la hoja de ejecución antes de iniciar: capital S/ ______, cuota S/ ______, pago parcial S/ ______, adelanto S/ ______, viático S/ ______ y gasto S/ ______.

---

## 9. Cronograma editable

| Hito | Fecha | Hora | Responsable | Estado |
|---|---|---|---|---|
| Revisión del plan | ____ / ____ / ______ | ______ | __________________ | __________ |
| Preparación de ambiente | ____ / ____ / ______ | ______ | __________________ | __________ |
| Ciclo 1 — administrador/supervisor | ____ / ____ / ______ | ______ | __________________ | __________ |
| Ciclo 1 — cobrador móvil | ____ / ____ / ______ | ______ | __________________ | __________ |
| Análisis y correcciones | ____ / ____ / ______ | ______ | __________________ | __________ |
| Retest | ____ / ____ / ______ | ______ | __________________ | __________ |
| Cierre y firmas | ____ / ____ / ______ | ______ | __________________ | __________ |

---

## 10. Riesgos de ejecución

| Riesgo | Impacto | Mitigación | Responsable |
|---|---|---|---|
| Uso accidental de producción | Crítico | Validar URL/proyecto y mostrar banner UAT antes de ejecutar | __________________ |
| Datos insuficientes para escenarios financieros | Alto | Revisar la semilla con la matriz de la sección 8 | __________________ |
| Horario 07:00–20:00 difícil de comprobar | Medio | Programar el caso en los límites reales; no alterar el reloj de producción | __________________ |
| Ejecución simultánea sobre el mismo cliente | Alto | Asignar un conjunto de datos por ejecutor | __________________ |
| Evidencia con datos sensibles | Alto | Usar datos ficticios y revisar cada captura antes de adjuntarla | __________________ |
| Descarga bloqueada por navegador | Medio | Autorizar descargas únicamente para la URL UAT | __________________ |
| Cambio de versión durante el ciclo | Alto | Congelar commit o iniciar un ciclo nuevo | __________________ |
| Reintento que duplica una operación | Alto | Esperar respuesta y verificar historial antes de volver a confirmar | __________________ |

---

## 11. Matriz de trazabilidad

Los códigos de requisito son referencias internas de este plan y no sustituyen al Documento funcional.

| Requisito | Capacidad | Casos UAT |
|---|---|---|
| RF-AUT-01 | Inicio de sesión y redirección por rol | UAT-AUT-01 |
| RF-AUT-02 | Cambio de PIN y bloqueo por intentos | UAT-AUT-02, UAT-AUT-03 |
| RF-AUT-03 | Horario del cobrador | UAT-AUT-04 |
| RF-SEG-01 | Permisos y aislamiento de carteras | UAT-SEG-01, UAT-SUP-01 |
| RF-UX-01 | Experiencia adaptable y cierre de sesión | UAT-UX-01 |
| RF-DAS-01 | Panel administrativo y ruta de cobranza | UAT-DAS-01, UAT-COB-01 |
| RF-COL-01 | Gestión de cobradores | UAT-COL-01 |
| RF-CLI-01 | Gestión de clientes | UAT-CLI-01, UAT-CLI-02 |
| RF-PRE-01 | Préstamos y cronogramas | UAT-PRE-01 |
| RF-PAG-01 | Pagos parcial, adelantado e inválido | UAT-PAG-01, UAT-PAG-02, UAT-PAG-03 |
| RF-REN-01 | Renovación y restricción automática | UAT-REN-01 |
| RF-COR-01 | Correcciones trazables y notificaciones | UAT-COR-01, UAT-COR-02 |
| RF-REP-01 | Control diario histórico y exportaciones | UAT-REP-01 |
| RF-CAJ-01 | Viáticos, gastos y cierre de caja | UAT-CAJ-01, UAT-CAJ-02, UAT-CAJ-03 |

---

## 12. Casos UAT generales y de seguridad

### UAT-AUT-01 — Inicio de sesión y destino por rol

**Prioridad:** Crítica.  
**Roles:** Administrador, supervisor y cobrador.  
**Precondiciones:** DAT-ADM, DAT-SUP y DAT-COL-A activos; horario abierto para el cobrador.  
**Datos:** credenciales entregadas por canal seguro.

1. Iniciar sesión con DAT-ADM y registrar la pantalla de destino.
2. Cerrar sesión y repetir con DAT-SUP.
3. Cerrar sesión y repetir con DAT-COL-A.
4. Intentar ingresar con DNI o PIN incompleto.

**Resultado esperado:** administrador y supervisor llegan al Dashboard administrativo; cobrador llega a su ruta. Los formatos inválidos no se envían y muestran orientación comprensible.

**Resultado obtenido:** ________________________________________________________________  
**Estado:** ☐ No ejecutado ☐ Aprobado ☐ Aprobado con observación ☐ Fallido ☐ Bloqueado  
**Incidencia relacionada:** __________________

> **EVIDENCIA UAT-AUT-01 — Destino correcto por rol.** Reemplazar por capturas del destino de cada rol, sin credenciales visibles, y eliminar este marcador antes de entregar. Ruta sugerida: `docs/entrega/assets/uat/UAT-AUT-01/`.

### UAT-AUT-02 — Cambio obligatorio y voluntario de PIN

**Prioridad:** Crítica.  
**Roles:** Todos.  
**Precondiciones:** DAT-COL-TEMP y un usuario con PIN definitivo.  
**Datos:** PIN temporal y nuevo PIN entregados en forma segura; no anotarlos aquí.

1. Iniciar sesión con DAT-COL-TEMP.
2. Confirmar que no puede abrir su cartera antes de cambiar el PIN.
3. Probar un PIN secuencial, repetido o contenido en el DNI.
4. Registrar un PIN válido y confirmarlo.
5. Verificar que la sesión finaliza y que el ingreso funciona solo con el PIN nuevo.
6. Desde otro usuario, abrir **Cambiar PIN** y repetir el flujo voluntario.

**Resultado esperado:** los PIN débiles se rechazan; el cambio válido obliga a iniciar sesión nuevamente y el PIN anterior deja de funcionar.

**Resultado obtenido:** ________________________________________________________________  
**Estado:** ☐ No ejecutado ☐ Aprobado ☐ Aprobado con observación ☐ Fallido ☐ Bloqueado  
**Incidencia relacionada:** __________________

> **EVIDENCIA UAT-AUT-02 — Cambio de PIN.** Reemplazar por la advertencia de PIN temporal y la confirmación final, sin mostrar valores, y eliminar este marcador antes de entregar. Ruta sugerida: `docs/entrega/assets/uat/UAT-AUT-02/`.

### UAT-AUT-03 — Bloqueo por intentos fallidos y recuperación

**Prioridad:** Crítica.  
**Rol:** Administrador y cuenta aislada de prueba.  
**Precondiciones:** Usuario exclusivo para este caso; autorización para bloquearlo y restablecerlo.  
**Datos:** credencial errónea controlada.

1. Realizar cinco intentos consecutivos con PIN incorrecto.
2. Intentar ingresar con el PIN correcto.
3. Confirmar que el usuario no accede.
4. Ingresar como administrador y restablecer el PIN con motivo.
5. Ingresar con el PIN temporal nuevo y completar el cambio obligatorio.

**Resultado esperado:** la cuenta se bloquea después del quinto fallo; el administrador puede restablecerla de forma trazable y el usuario cambia el PIN temporal.

**Resultado obtenido:** ________________________________________________________________  
**Estado:** ☐ No ejecutado ☐ Aprobado ☐ Aprobado con observación ☐ Fallido ☐ Bloqueado  
**Incidencia relacionada:** __________________

> **EVIDENCIA UAT-AUT-03 — Bloqueo y recuperación.** Reemplazar por los mensajes de bloqueo y restablecimiento, sin PIN visible, y eliminar este marcador antes de entregar. Ruta sugerida: `docs/entrega/assets/uat/UAT-AUT-03/`.

### UAT-AUT-04 — Ventana de acceso del cobrador

**Prioridad:** Crítica.  
**Rol:** Cobrador.  
**Precondiciones:** DAT-COL-A; ejecución programada con hora real de Lima.  
**Datos:** momentos objetivo: antes de 07:00, desde 07:00, antes de 20:00 y desde 20:00.

1. Intentar acceso antes de las 07:00.
2. Repetir desde las 07:00.
3. Mantener o reabrir una sesión antes de las 20:00.
4. Volver a CobranzaPro después de las 20:00.
5. Confirmar que DAT-ADM y DAT-SUP siguen accediendo fuera de esa ventana.

**Resultado esperado:** el cobrador opera únicamente desde las 07:00 inclusive hasta antes de las 20:00; al vencer la ventana pierde el acceso. Administrador y supervisor no quedan restringidos.

**Resultado obtenido:** ________________________________________________________________  
**Estado:** ☐ No ejecutado ☐ Aprobado ☐ Aprobado con observación ☐ Fallido ☐ Bloqueado  
**Incidencia relacionada:** __________________

> **EVIDENCIA UAT-AUT-04 — Horario del cobrador.** Reemplazar por mensajes con hora visible del dispositivo, sin credenciales, y eliminar este marcador antes de entregar. Ruta sugerida: `docs/entrega/assets/uat/UAT-AUT-04/`.

### UAT-SEG-01 — Permisos visibles y aislamiento de carteras

**Prioridad:** Crítica.  
**Roles:** Cobrador A, cobrador B, supervisor.  
**Precondiciones:** DAT-COL-A y DAT-COL-B con clientes distintos; identificadores de clientes preparados.  
**Datos:** cliente A y cliente B ficticios.

1. Ingresar como DAT-COL-A y buscar al cliente B.
2. Intentar abrir directamente la URL del cliente B.
3. Confirmar que solo aparecen clientes de la cartera A.
4. Repetir de forma inversa con DAT-COL-B.
5. Ingresar como supervisor y confirmar que puede consultar ambas carteras.
6. Verificar que el supervisor no dispone de acciones para crear, editar, activar o restablecer accesos de cobradores.

**Resultado esperado:** ningún cobrador ve u opera otra cartera, incluso con una URL directa; el supervisor ve todas las carteras pero no administra accesos.

**Resultado obtenido:** ________________________________________________________________  
**Estado:** ☐ No ejecutado ☐ Aprobado ☐ Aprobado con observación ☐ Fallido ☐ Bloqueado  
**Incidencia relacionada:** __________________

> **EVIDENCIA UAT-SEG-01 — Aislamiento por rol.** Reemplazar por búsquedas sin resultados, rechazo de acceso y vista global del supervisor, y eliminar este marcador antes de entregar. Ruta sugerida: `docs/entrega/assets/uat/UAT-SEG-01/`.

### UAT-UX-01 — Navegación responsive, tema y cierre de sesión

**Prioridad:** Alta.  
**Roles:** Todos.  
**Precondiciones:** Dispositivos de la sección 4.2.  
**Datos:** sesión ficticia por rol.

1. En escritorio, expandir y contraer el menú; abrir la última opción sin reducir el zoom.
2. En móvil, abrir el menú, navegar a otra pantalla y verificar su cierre automático.
3. Revisar que no exista desplazamiento horizontal inesperado.
4. Alternar tema claro y oscuro.
5. Cerrar sesión desde el pie del menú y usar Atrás.

**Resultado esperado:** navegación utilizable, controles visibles, contenido sin desborde y rutas privadas inaccesibles después de salir.

**Resultado obtenido:** ________________________________________________________________  
**Estado:** ☐ No ejecutado ☐ Aprobado ☐ Aprobado con observación ☐ Fallido ☐ Bloqueado  
**Incidencia relacionada:** __________________

> **EVIDENCIA UAT-UX-01 — Navegación adaptable.** Reemplazar por capturas en 1440 × 900, 360 × 800 y 393 × 852, y eliminar este marcador antes de entregar. Ruta sugerida: `docs/entrega/assets/uat/UAT-UX-01/`.

---

## 13. Casos UAT de administración y supervisión

### UAT-DAS-01 — Dashboard administrativo y acceso a cartera

**Prioridad:** Alta.  
**Roles:** Administrador y supervisor.  
**Precondiciones:** Carteras con clientes al día y atrasados.  
**Datos:** fecha UAT __________.

1. Abrir Dashboard.
2. Comparar total a cobrar, cobrado, saldo, clientes y cobradores con los datos preparados.
3. Revisar recuperación y distribución de riesgo.
4. Buscar un cobrador y seleccionar **Ver cartera**.

**Resultado esperado:** los indicadores son coherentes y **Ver cartera** abre Clientes con el cobrador seleccionado.

**Resultado obtenido:** ________________________________________________________________  
**Estado:** ☐ No ejecutado ☐ Aprobado ☐ Aprobado con observación ☐ Fallido ☐ Bloqueado  
**Incidencia relacionada:** __________________

> **EVIDENCIA UAT-DAS-01 — Dashboard y cartera filtrada.** Reemplazar por capturas de indicadores y filtro aplicado, y eliminar este marcador antes de entregar. Ruta sugerida: `docs/entrega/assets/uat/UAT-DAS-01/`.

### UAT-COL-01 — Alta y mantenimiento de cobrador

**Prioridad:** Alta.  
**Rol:** Administrador.  
**Precondiciones:** DNI ficticio no registrado.  
**Datos:** nombre, DNI, teléfono y PIN temporal entregados por separado.

1. Crear un cobrador.
2. Ingresar con su PIN temporal y comprobar el cambio obligatorio.
3. Editar nombre o teléfono con motivo.
4. Abrir nuevamente la edición sin cambiar datos y verificar que no permita guardar.
5. Restablecer PIN con motivo.
6. Intentar desactivar al cobrador con clientes activos.
7. Con una cuenta sin clientes activos, desactivar y confirmar que no puede ingresar; luego activar.

**Resultado esperado:** las acciones válidas se aplican y quedan confirmadas; no se guardan formularios sin cambios ni se desactiva una cuenta con cartera activa.

**Resultado obtenido:** ________________________________________________________________  
**Estado:** ☐ No ejecutado ☐ Aprobado ☐ Aprobado con observación ☐ Fallido ☐ Bloqueado  
**Incidencia relacionada:** __________________

> **EVIDENCIA UAT-COL-01 — Ciclo de vida del cobrador.** Reemplazar por resultados de alta, edición, restablecimiento y estado, sin PIN, y eliminar este marcador antes de entregar. Ruta sugerida: `docs/entrega/assets/uat/UAT-COL-01/`.

### UAT-CLI-01 — Cliente creado y editado por administración

**Prioridad:** Alta.  
**Roles:** Administrador o supervisor.  
**Precondiciones:** Cobrador activo.  
**Datos:** cliente ficticio nuevo.

1. Crear el cliente con documento, nombre, teléfono, dirección, observación y cobrador.
2. Buscarlo por nombre y documento.
3. Filtrar por cobrador.
4. Editar un dato permitido y guardar.
5. Volver al valor original y comprobar que el botón queda deshabilitado si no existe un cambio real.

**Resultado esperado:** el cliente se registra una sola vez, aparece en su cartera y solo se envían modificaciones reales.

**Resultado obtenido:** ________________________________________________________________  
**Estado:** ☐ No ejecutado ☐ Aprobado ☐ Aprobado con observación ☐ Fallido ☐ Bloqueado  
**Incidencia relacionada:** __________________

> **EVIDENCIA UAT-CLI-01 — Cliente administrativo.** Reemplazar por formulario y registro localizado, y eliminar este marcador antes de entregar. Ruta sugerida: `docs/entrega/assets/uat/UAT-CLI-01/`.

### UAT-PRE-01 — Préstamo y generación de cronograma

**Prioridad:** Crítica.  
**Roles:** Administrador o supervisor.  
**Precondiciones:** Clientes activos sin préstamo vigente.  
**Datos:** capital, tasa, cuotas y fechas definidos para frecuencias diaria, semanal y mensual.

1. Crear un préstamo diario y comparar total, cuota base y primera fecha con el resumen.
2. Confirmar que el cronograma diario omite domingos.
3. Crear escenarios semanal y mensual con otros clientes.
4. Confirmar que el semanal conserva el día y que el mensual aplica el ajuste de domingo previsto.
5. Verificar que la suma de cuotas coincide exactamente con el total.
6. Intentar crear un segundo préstamo activo para el mismo cliente.

**Resultado esperado:** cada cronograma cumple la frecuencia, el redondeo se absorbe en la última cuota y no existen dos préstamos activos simultáneos.

**Resultado obtenido:** ________________________________________________________________  
**Estado:** ☐ No ejecutado ☐ Aprobado ☐ Aprobado con observación ☐ Fallido ☐ Bloqueado  
**Incidencia relacionada:** __________________

> **EVIDENCIA UAT-PRE-01 — Cronogramas.** Reemplazar por resúmenes y fechas representativas de cada frecuencia, y eliminar este marcador antes de entregar. Ruta sugerida: `docs/entrega/assets/uat/UAT-PRE-01/`.

### UAT-SUP-01 — Facultades del supervisor

**Prioridad:** Crítica.  
**Rol:** Supervisor.  
**Precondiciones:** DAT-SUP y operaciones en varias carteras.  
**Datos:** préstamo y cierre pendientes de revisión.

1. Consultar clientes y préstamos de distintos cobradores.
2. Registrar un pago autorizado.
3. Revisar una solicitud de corrección y un cierre.
4. Abrir Cobradores y confirmar que las acciones de gestión de acceso no están disponibles.
5. Confirmar que no puede reasignar carteras mediante una operación no autorizada.

**Resultado esperado:** puede supervisar y corregir operaciones autorizadas, pero no administra usuarios ni reasigna carteras.

**Resultado obtenido:** ________________________________________________________________  
**Estado:** ☐ No ejecutado ☐ Aprobado ☐ Aprobado con observación ☐ Fallido ☐ Bloqueado  
**Incidencia relacionada:** __________________

> **EVIDENCIA UAT-SUP-01 — Permisos del supervisor.** Reemplazar por vistas de operación y ausencia de gestión de accesos, y eliminar este marcador antes de entregar. Ruta sugerida: `docs/entrega/assets/uat/UAT-SUP-01/`.

---

## 14. Casos UAT del cobrador y pagos

### UAT-COB-01 — Dashboard y cartera del cobrador

**Prioridad:** Alta.  
**Rol:** Cobrador.  
**Precondiciones:** DAT-COL-A con clientes al día y atrasados.  
**Datos:** cartera ficticia A.

1. Abrir **Cobranza de hoy** en móvil.
2. Revisar avance, esperado, cobrado, pendientes y atrasados.
3. Buscar un cliente y usar cada filtro de cobranza.
4. Cambiar el orden y recorrer la paginación.
5. Abrir un cliente desde su tarjeta.

**Resultado esperado:** la vista prioriza la cartera propia, los totales y contadores cambian coherentemente con los filtros y el detalle corresponde al cliente elegido.

**Resultado obtenido:** ________________________________________________________________  
**Estado:** ☐ No ejecutado ☐ Aprobado ☐ Aprobado con observación ☐ Fallido ☐ Bloqueado  
**Incidencia relacionada:** __________________

> **EVIDENCIA UAT-COB-01 — Ruta móvil.** Reemplazar por vista de avance, filtros, paginación y tarjeta abierta, y eliminar este marcador antes de entregar. Ruta sugerida: `docs/entrega/assets/uat/UAT-COB-01/`.

### UAT-CLI-02 — Cliente y primer préstamo creados por cobrador

**Prioridad:** Crítica.  
**Rol:** Cobrador.  
**Precondiciones:** DAT-COL-A; cliente ficticio no registrado.  
**Datos:** datos del cliente y condiciones del primer préstamo.

1. Abrir **Mis clientes** y seleccionar **Nuevo cliente**.
2. Completar los datos del cliente y del préstamo.
3. Revisar el resumen y confirmar.
4. Buscar al cliente y abrir su detalle.
5. Ingresar como DAT-COL-B y comprobar que el cliente no aparece.

**Resultado esperado:** cliente y primer préstamo se crean de forma conjunta en la cartera A y permanecen invisibles para la cartera B.

**Resultado obtenido:** ________________________________________________________________  
**Estado:** ☐ No ejecutado ☐ Aprobado ☐ Aprobado con observación ☐ Fallido ☐ Bloqueado  
**Incidencia relacionada:** __________________

> **EVIDENCIA UAT-CLI-02 — Alta por cobrador.** Reemplazar por resumen previo y detalle posterior, y eliminar este marcador antes de entregar. Ruta sugerida: `docs/entrega/assets/uat/UAT-CLI-02/`.

### UAT-PAG-01 — Pago parcial

**Prioridad:** Crítica.  
**Roles:** Cobrador y verificación administrativa.  
**Precondiciones:** DAT-CLI-PARCIAL con cuota pendiente.  
**Datos:** pago menor que la cuota: S/ ______.

1. Registrar el pago con medio y observación.
2. Anotar el saldo mostrado antes y después.
3. Revisar cronograma e historial.
4. Verificar el resultado desde la vista administrativa.

**Resultado esperado:** el importe se aplica primero a la cuota pendiente más antigua, conserva el faltante y reduce exactamente el saldo sin duplicar el pago.

**Resultado obtenido:** ________________________________________________________________  
**Estado:** ☐ No ejecutado ☐ Aprobado ☐ Aprobado con observación ☐ Fallido ☐ Bloqueado  
**Incidencia relacionada:** __________________

> **EVIDENCIA UAT-PAG-01 — Pago parcial.** Reemplazar por saldos anterior/posterior e historial, y eliminar este marcador antes de entregar. Ruta sugerida: `docs/entrega/assets/uat/UAT-PAG-01/`.

### UAT-PAG-02 — Pago adelantado

**Prioridad:** Crítica.  
**Roles:** Cobrador y verificación administrativa.  
**Precondiciones:** DAT-CLI-ADELANTO.  
**Datos:** importe que cubra la cuota actual y al menos dos futuras: S/ ______.

1. Registrar el adelanto.
2. Revisar el importe aplicado y el nuevo saldo.
3. Verificar el estado de las cuotas cubiertas.
4. Confirmar desde administración que el historial coincide.

**Resultado esperado:** el pago cubre cuotas en orden desde la más antigua, incluye futuras hasta agotar el importe y mantiene la suma exacta.

**Resultado obtenido:** ________________________________________________________________  
**Estado:** ☐ No ejecutado ☐ Aprobado ☐ Aprobado con observación ☐ Fallido ☐ Bloqueado  
**Incidencia relacionada:** __________________

> **EVIDENCIA UAT-PAG-02 — Pago adelantado.** Reemplazar por cuotas cubiertas, saldo e historial, y eliminar este marcador antes de entregar. Ruta sugerida: `docs/entrega/assets/uat/UAT-PAG-02/`.

### UAT-PAG-03 — Rechazo de pago inválido

**Prioridad:** Crítica.  
**Rol:** Cobrador.  
**Precondiciones:** Préstamo activo.  
**Datos:** cero, valor negativo y monto superior al saldo.

1. Intentar confirmar cada importe inválido.
2. Verificar mensajes y estado del botón.
3. Confirmar que historial, saldo y cierre no cambiaron.
4. Registrar después un importe válido para comprobar recuperación del formulario.

**Resultado esperado:** los montos inválidos no se registran ni generan movimientos; el pago válido posterior funciona una sola vez.

**Resultado obtenido:** ________________________________________________________________  
**Estado:** ☐ No ejecutado ☐ Aprobado ☐ Aprobado con observación ☐ Fallido ☐ Bloqueado  
**Incidencia relacionada:** __________________

> **EVIDENCIA UAT-PAG-03 — Validación de pago.** Reemplazar por mensajes de validación y saldo sin cambios, y eliminar este marcador antes de entregar. Ruta sugerida: `docs/entrega/assets/uat/UAT-PAG-03/`.

### UAT-REN-01 — Renovación permitida y restricción por atraso

**Prioridad:** Crítica.  
**Rol:** Cobrador, con verificación administrativa.  
**Precondiciones:** DAT-CLI-RENUEVA y DAT-CLI-RESTRINGIDO.  
**Datos:** nuevas condiciones aprobadas.

1. Abrir DAT-CLI-RENUEVA y seleccionar **Renovar préstamo**.
2. Revisar saldo incorporado, nuevo capital, total, cuota y efectivo a entregar.
3. Confirmar y revisar la relación con el préstamo anterior.
4. Abrir DAT-CLI-RESTRINGIDO e intentar renovar o crear un préstamo.
5. Registrar los pagos necesarios para ponerlo al día y volver a revisar su elegibilidad.

**Resultado esperado:** la renovación válida crea el nuevo cronograma y cierra/enlaza el anterior; el cliente con más de cinco días calendario desde la cuota impaga más antigua queda bloqueado y recupera elegibilidad al ponerse al día.

**Resultado obtenido:** ________________________________________________________________  
**Estado:** ☐ No ejecutado ☐ Aprobado ☐ Aprobado con observación ☐ Fallido ☐ Bloqueado  
**Incidencia relacionada:** __________________

> **EVIDENCIA UAT-REN-01 — Renovación y restricción.** Reemplazar por resumen de renovación y mensaje de bloqueo, y eliminar este marcador antes de entregar. Ruta sugerida: `docs/entrega/assets/uat/UAT-REN-01/`.

---

## 15. Casos UAT de correcciones y reportes

### UAT-COR-01 — Solicitud de corrección del cobrador

**Prioridad:** Crítica.  
**Rol:** Cobrador.  
**Precondiciones:** Préstamo activo con pago registrado.  
**Datos:** motivos ficticios para edición, anulación de préstamo y anulación de pago.

1. Crear una solicitud de edición del préstamo.
2. Crear, en escenarios separados, solicitudes de anulación de préstamo y pago.
3. Confirmar que el registro financiero no cambia al enviar.
4. Intentar repetir una solicitud pendiente para la misma acción.
5. Revisar su estado en el Dashboard y la campana.

**Resultado esperado:** cada solicitud queda pendiente y trazable, sin ejecutar la corrección; no se duplica una solicitud pendiente equivalente.

**Resultado obtenido:** ________________________________________________________________  
**Estado:** ☐ No ejecutado ☐ Aprobado ☐ Aprobado con observación ☐ Fallido ☐ Bloqueado  
**Incidencia relacionada:** __________________

> **EVIDENCIA UAT-COR-01 — Solicitud pendiente.** Reemplazar por formulario, confirmación y estado sin cambio financiero, y eliminar este marcador antes de entregar. Ruta sugerida: `docs/entrega/assets/uat/UAT-COR-01/`.

### UAT-COR-02 — Resolución y notificación

**Prioridad:** Crítica.  
**Roles:** Administrador/supervisor y cobrador.  
**Precondiciones:** Solicitudes de UAT-COR-01.  
**Datos:** motivo de aprobación/rechazo ficticio.

1. Ingresar como administrador o supervisor y revisar la campana.
2. Abrir **Solicitudes**, contrastar el préstamo y resolver una solicitud aprobándola.
3. Rechazar otra con motivo.
4. Volver a la pestaña del cobrador o iniciar sesión nuevamente.
5. Confirmar la actualización del contador, el estado y la nota.
6. Marcar la respuesta como leída.

**Resultado esperado:** la acción aprobada modifica el registro de forma trazable; la rechazada no lo modifica; el cobrador recibe ambos resultados y el contador de no leídas se actualiza.

**Resultado obtenido:** ________________________________________________________________  
**Estado:** ☐ No ejecutado ☐ Aprobado ☐ Aprobado con observación ☐ Fallido ☐ Bloqueado  
**Incidencia relacionada:** __________________

> **EVIDENCIA UAT-COR-02 — Resolución y notificación.** Reemplazar por estado administrativo y respuesta visible al cobrador, y eliminar este marcador antes de entregar. Ruta sugerida: `docs/entrega/assets/uat/UAT-COR-02/`.

### UAT-REP-01 — Control diario histórico y exportaciones

**Prioridad:** Alta.  
**Roles:** Administrador y supervisor.  
**Precondiciones:** Pagos antes y después de una fecha de corte ficticia.  
**Datos:** fecha de corte __________; cobrador __________; búsqueda __________.

1. Abrir **Control diario** y seleccionar la fecha y el cobrador.
2. Verificar programado, cobrado, diferencia, atendidos y atrasados.
3. Confirmar que un pago posterior al corte no se incluye.
4. Aplicar estado y búsqueda; revisar la paginación móvil y tabla de escritorio.
5. Exportar CSV, Excel y PDF.
6. Abrir cada archivo y comparar filtros, cantidad de filas, importes y fecha.

**Resultado esperado:** la vista y los tres archivos representan la misma información a la fecha de corte; los días de atraso se calculan desde la cuota impaga más antigua.

**Resultado obtenido:** ________________________________________________________________  
**Estado:** ☐ No ejecutado ☐ Aprobado ☐ Aprobado con observación ☐ Fallido ☐ Bloqueado  
**Incidencia relacionada:** __________________

> **EVIDENCIA UAT-REP-01 — Reporte y archivos.** Reemplazar por pantalla y vistas abiertas de CSV, XLSX y PDF sin datos reales, y eliminar este marcador antes de entregar. Ruta sugerida: `docs/entrega/assets/uat/UAT-REP-01/`.

---

## 16. Casos UAT de caja

### UAT-CAJ-01 — Solicitudes de viático y gasto

**Prioridad:** Alta.  
**Roles:** Cobrador y administrador/supervisor.  
**Precondiciones:** Jornada sin cierre enviado.  
**Datos:** viático S/ ______ y gasto S/ ______ con justificaciones ficticias.

1. Como cobrador, solicitar un viático.
2. Intentar crear otro mientras el primero está pendiente.
3. Solicitar un gasto con categoría y descripción.
4. Como administrador/supervisor, aprobar una solicitud y rechazar otra con motivo.
5. Volver al cobrador y revisar estados y motivo.
6. Confirmar que solo los importes aprobados afectan el esperado según su naturaleza.

**Resultado esperado:** no hay solicitudes pendientes duplicadas; aprobación/rechazo es visible y el cálculo de caja se actualiza correctamente.

**Resultado obtenido:** ________________________________________________________________  
**Estado:** ☐ No ejecutado ☐ Aprobado ☐ Aprobado con observación ☐ Fallido ☐ Bloqueado  
**Incidencia relacionada:** __________________

> **EVIDENCIA UAT-CAJ-01 — Viático y gasto.** Reemplazar por estados antes/después de revisión y cálculo actualizado, y eliminar este marcador antes de entregar. Ruta sugerida: `docs/entrega/assets/uat/UAT-CAJ-01/`.

### UAT-CAJ-02 — Envío y validación del cierre

**Prioridad:** Crítica.  
**Roles:** Cobrador y administrador/supervisor.  
**Precondiciones:** DAT-CIERRE con movimientos conciliables.  
**Datos:** entregado igual al esperado y luego escenario con diferencia.

1. Revisar apertura, efectivo, cobros digitales, desembolsos y gastos.
2. Enviar un cierre cuyo monto coincida con el esperado.
3. En otro día/usuario, ingresar un monto distinto sin observación.
4. Confirmar que exige observación; completarla y enviar.
5. Antes de validarlo, corregir el monto entregado y comprobar que se actualiza el mismo cierre sin duplicarlo.
6. Como administrador/supervisor, comparar esperado, entregado y diferencia.
7. Validar con observación.

**Resultado esperado:** existe un único cierre por cobrador y día; puede corregirse antes de la validación sin crear duplicados, toda diferencia exige explicación y la validación registra responsable y fecha.

**Resultado obtenido:** ________________________________________________________________  
**Estado:** ☐ No ejecutado ☐ Aprobado ☐ Aprobado con observación ☐ Fallido ☐ Bloqueado  
**Incidencia relacionada:** __________________

> **EVIDENCIA UAT-CAJ-02 — Cierre con diferencia.** Reemplazar por desglose, validación de observación y estado validado, y eliminar este marcador antes de entregar. Ruta sugerida: `docs/entrega/assets/uat/UAT-CAJ-02/`.

### UAT-CAJ-03 — Bloqueo de modificaciones después de validar

**Prioridad:** Crítica.  
**Roles:** Administrador/supervisor y cobrador.  
**Precondiciones:** Cierre validado en UAT-CAJ-02.  
**Datos:** intento de pago, gasto, viático u otro movimiento para el día validado.

1. Intentar registrar un movimiento que afecte el día validado.
2. Intentar reenviar o modificar el cierre.
3. Recargar las pantallas de cobrador y administración.
4. Comparar saldos y movimientos con la evidencia previa.

**Resultado esperado:** el sistema rechaza toda modificación financiera del día validado; no cambia el cierre, el esperado ni el historial.

**Resultado obtenido:** ________________________________________________________________  
**Estado:** ☐ No ejecutado ☐ Aprobado ☐ Aprobado con observación ☐ Fallido ☐ Bloqueado  
**Incidencia relacionada:** __________________

> **EVIDENCIA UAT-CAJ-03 — Día validado inmutable.** Reemplazar por el mensaje de rechazo y comparación sin cambios, y eliminar este marcador antes de entregar. Ruta sugerida: `docs/entrega/assets/uat/UAT-CAJ-03/`.

---

## 17. Registro de incidencias

Cada caso fallido debe referenciar una incidencia. No se corrige directamente en el ambiente durante la sesión sin conservar el registro.

| ID | Caso UAT | Resumen | Severidad | Pasos para reproducir | Responsable | Estado | Versión corregida |
|---|---|---|---|---|---|---|---|
| INC-UAT-001 | __________ | __________________ | S__ | __________________ | __________ | __________ | __________ |
| INC-UAT-002 | __________ | __________________ | S__ | __________________ | __________ | __________ | __________ |
| INC-UAT-003 | __________ | __________________ | S__ | __________________ | __________ | __________ | __________ |

### 17.1 Información mínima por incidencia

- caso y paso exacto;
- resultado esperado y resultado observado;
- fecha, hora, rol, navegador y dispositivo;
- commit/versión;
- datos ficticios utilizados;
- evidencia sin PIN ni información real;
- frecuencia de reproducción;
- impacto para el negocio.

---

## 18. Retest y regresión dirigida

1. Desarrollo informa la versión corregida y el alcance del cambio.
2. El responsable UAT confirma que el ambiente contiene ese commit.
3. Se restaura o prepara el mismo escenario ficticio.
4. Se repite el caso fallido completo, no solo el último paso.
5. Se ejecutan los casos relacionados de la matriz de trazabilidad.
6. Se registra **Retest aprobado** o **Retest fallido**, sin sobrescribir la evidencia anterior.

| Incidencia | Caso original | Commit retest | Fecha | Ejecutado por | Resultado | Evidencia |
|---|---|---|---|---|---|---|
| __________ | __________ | __________ | ____ / ____ / ______ | __________ | __________ | __________ |

---

## 19. Convención de evidencias

### 19.1 Estructura y nombres

Guardar cada evidencia bajo:

`docs/entrega/assets/uat/<ID-CASO>/<ID-CASO>_paso-<NN>_<descripcion>.<extensión>`

Ejemplos de formato, no archivos existentes:

- `docs/entrega/assets/uat/UAT-PAG-01/UAT-PAG-01_paso-02_saldo-posterior.png`
- `docs/entrega/assets/uat/UAT-REP-01/UAT-REP-01_paso-06_exportacion.xlsx`
- `docs/entrega/assets/uat/UAT-COR-02/UAT-COR-02_paso-05_respuesta-cobrador.png`

### 19.2 Reglas

- No incluir PIN, tokens, claves, URLs internas sensibles ni datos reales.
- Capturar la pantalla completa cuando el contexto sea necesario.
- Conservar barra de título, fecha u otra referencia que permita reconocer el ambiente UAT.
- No editar una captura para ocultar un defecto; si debe anonimizarse, conservar también el original restringido.
- Vincular cada archivo al paso exacto.
- Reemplazar todos los marcadores `EVIDENCIA` antes de generar la versión final para firma.

---

## 20. Resumen de ejecución

| Métrica | Resultado |
|---|---:|
| Casos planificados | 23 |
| Casos ejecutados | ______ |
| Aprobados | ______ |
| Fallidos | ______ |
| Bloqueados | ______ |
| No aplica | ______ |
| Retest aprobados | ______ |
| Porcentaje de aprobación | ______ % |
| Incidencias S1 abiertas | ______ |
| Incidencias S2 abiertas | ______ |

### 20.1 Resultado por área

| Área | Aprobado | Observaciones |
|---|:---:|---|
| Autenticación y seguridad | ☐ Sí ☐ No | ______________________________ |
| Experiencia responsive | ☐ Sí ☐ No | ______________________________ |
| Cobradores y clientes | ☐ Sí ☐ No | ______________________________ |
| Préstamos y pagos | ☐ Sí ☐ No | ______________________________ |
| Correcciones y notificaciones | ☐ Sí ☐ No | ______________________________ |
| Control diario y exportaciones | ☐ Sí ☐ No | ______________________________ |
| Caja, viáticos y gastos | ☐ Sí ☐ No | ______________________________ |

### 20.2 Observaciones finales

________________________________________________________________________________

________________________________________________________________________________

---

## 21. Declaración de aceptación

Marcar una opción:

- [ ] **Aceptado:** los criterios de salida se cumplen y la versión puede avanzar a entrega.
- [ ] **Aceptado con observaciones:** puede avanzar con excepciones registradas y aprobadas a continuación.
- [ ] **No aceptado:** requiere correcciones y un nuevo ciclo UAT.

**Excepciones u observaciones aceptadas:**

________________________________________________________________________________

________________________________________________________________________________

Al firmar, los participantes confirman que los casos se ejecutaron sobre la versión y ambiente indicados, con datos ficticios, y que el resultado refleja la decisión del negocio a la fecha. La firma no amplía el alcance funcional ni convierte elementos fuera de alcance en funciones entregadas.

| Representante | Nombre | Cargo | Firma | Fecha |
|---|---|---|---|---|
| Cliente — responsable funcional | __________________ | __________________ | __________________ | ____ / ____ / ______ |
| Cliente — usuario clave | __________________ | __________________ | __________________ | ____ / ____ / ______ |
| Proveedor — responsable del proyecto | __________________ | __________________ | __________________ | ____ / ____ / ______ |

---

## 22. Checklist previo a copiar o entregar en Word

- [ ] Completar portada, ambiente, commit, cronograma y responsables.
- [ ] Confirmar que la cantidad de casos del resumen coincide con los ejecutados.
- [ ] Completar resultado obtenido, estado e incidencia en cada caso.
- [ ] Reemplazar todos los marcadores `EVIDENCIA` por capturas o referencias válidas.
- [ ] Eliminar todas las notas editoriales.
- [ ] Verificar que no exista ningún PIN, secreto o dato personal real.
- [ ] Insertar tabla de contenido automática en Word.
- [ ] Aplicar estilos de Título 1, Título 2 y Título 3 sin cambiar los ID de casos.
- [ ] Configurar tablas para repetir encabezados entre páginas.
- [ ] Mantener cada caso y su resultado juntos cuando sea posible.
- [ ] Agregar numeración de página, versión y clasificación del documento en el pie.
- [ ] Revisar ortografía, saltos de página y legibilidad de capturas.
- [ ] Exportar una copia PDF para revisión final.
- [ ] Obtener las firmas o aprobaciones electrónicas definidas.

---

**Fin del Plan y evidencias UAT**
