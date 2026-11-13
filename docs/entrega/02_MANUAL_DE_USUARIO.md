# CobranzaPro — Manual de usuario

**Guía operativa para administradores, supervisores y cobradores**

| Campo editable | Información |
|---|---|
| Organización cliente | ______________________________ |
| Versión del sistema | ______________________________ |
| Versión del manual | 0.1 |
| Fecha | 12 de noviembre de 2026 |
| Elaborado por | Equipo TI |
| Revisado por | ______________________________ |
| Aprobado por | ______________________________ |

> **NOTA DE EDICIÓN — eliminar antes de entregar:** los bloques identificados como **CAPTURA** indican qué imagen debe insertarse en Word. Reemplace cada bloque por una captura obtenida con datos ficticios y conserve su número como título de figura.

---

## 1. Control del documento

### 1.1 Historial de versiones

| Versión | Fecha | Descripción | Responsable |
|---|---|---|---|
| 0.1 | 12/11/2026 | Primera versión del manual basada en las pantallas y operaciones implementadas | Equipo TI |

### 1.2 Objetivo

Este manual explica cómo utilizar CobranzaPro para consultar carteras, registrar clientes, administrar préstamos y pagos, atender solicitudes de corrección y efectuar el cierre diario. Está organizado por rol para que cada usuario consulte únicamente las tareas que le corresponden.

### 1.3 Alcance del manual

Se documentan las funciones operativas disponibles en la aplicación actual:

- ingreso con DNI y PIN;
- cambio obligatorio o voluntario de PIN;
- navegación en computadora, tableta y teléfono;
- paneles de administrador y cobrador;
- gestión de cobradores, clientes, préstamos, pagos y renovaciones;
- solicitudes de corrección y notificaciones;
- control diario con exportación CSV, Excel y PDF;
- solicitudes de viático y gastos, envío y validación del cierre de caja;
- cierre de sesión y prácticas de seguridad.

No se enseñan como disponibles la importación masiva desde Excel, las fotografías del cliente o DNI, la consulta automática de identidad ni la pantalla de Auditoría. Esta última aparece en el menú, pero permanece **en construcción**.

---

## 2. Inicio rápido

1. Abra la dirección web de CobranzaPro entregada por la organización.
2. Ingrese su DNI de ocho dígitos y su PIN de seis dígitos.
3. Si el sistema solicita cambiar un PIN temporal, complete el cambio antes de continuar.
4. Abra el menú principal y seleccione la tarea correspondiente a su rol.
5. Al finalizar, cierre sesión desde el botón ubicado al pie del menú.

| Rol | Primera pantalla | Tareas principales |
|---|---|---|
| Administrador | Dashboard administrativo | Control global, usuarios cobradores, clientes, préstamos, correcciones, reportes y cierres |
| Supervisor | Dashboard administrativo | Supervisión de carteras, operaciones financieras, solicitudes, reportes y cierres; no administra accesos de cobradores |
| Cobrador | Ruta de cobranza | Cartera propia, clientes, préstamos, pagos, solicitudes y cierre personal |

> **CAPTURA 1 — Pantalla de inicio de sesión.** Capturar en escritorio con los campos DNI y PIN vacíos, el botón de ingreso y sin datos personales. Archivo previsto: `docs/entrega/assets/manual/general/01-inicio-sesion-desktop.png`.

---

## 3. Requisitos y conceptos básicos

### 3.1 Requisitos de uso

- Navegador actualizado con acceso a Internet.
- Credenciales asignadas por la organización.
- Para cobradores, acceso dentro del horario permitido: desde las **07:00 inclusive hasta antes de las 20:00**, hora de Lima.
- Permiso del navegador para descargar archivos cuando se utilicen exportaciones.
- Uso de un dispositivo protegido con bloqueo de pantalla.

Los administradores y supervisores no tienen restricción horaria. La aplicación es web: no necesita instalarse como aplicación móvil nativa.

### 3.2 Roles y permisos

| Operación | Administrador | Supervisor | Cobrador |
|---|:---:|:---:|:---:|
| Consultar todas las carteras | Sí | Sí | No, solo la propia |
| Crear, editar, activar o restablecer PIN de cobradores | Sí | No | No |
| Registrar clientes | Sí | Sí | Sí, en su cartera |
| Crear préstamos | Sí | Sí | Sí, en su cartera |
| Editar una operación financiera directamente | Sí | Sí | No; envía una solicitud |
| Registrar pagos | Sí | Sí | Sí, en su cartera |
| Revisar solicitudes de corrección | Sí | Sí | No |
| Consultar y exportar control diario global | Sí | Sí | No |
| Validar cierres de caja | Sí | Sí | No |
| Enviar su propio cierre | No aplica | No aplica | Sí |

### 3.3 Convenciones visuales

- Los botones principales confirman o inician una operación.
- Los botones rojos representan una acción sensible, como anular, rechazar o desactivar.
- Las etiquetas verdes suelen indicar estados activos, aprobados, pagados o al día.
- Las etiquetas amarillas o rojas requieren atención: pendiente, diferencia, atraso o rechazo.
- Un botón deshabilitado indica que faltan datos, existe una regla de negocio que impide continuar o no se realizaron cambios reales.
- Los mensajes de éxito confirman que la operación terminó; los mensajes de error deben leerse antes de reintentar.

### 3.4 Navegación en escritorio y móvil

En escritorio, el menú lateral puede mostrarse completo o contraerse para dejar solo los iconos. En móvil y tableta, el botón de tres líneas abre el menú superpuesto. Al elegir una opción, el menú móvil se cierra automáticamente.

La barra superior contiene el cambio de tema claro/oscuro y la campana de notificaciones. El pie del menú muestra el usuario, el rol y el botón **Cerrar sesión**.

> **CAPTURA 2 — Navegación adaptable.** Capturar el menú abierto en móvil con un usuario cobrador ficticio. Archivo previsto: `docs/entrega/assets/manual/general/02-menu-mobile-cobrador.png`.

---

## 4. Procedimientos generales

### GEN-01 — Iniciar sesión

**Rol:** Todos.  
**Objetivo:** Acceder al área autorizada para el usuario.  
**Prerrequisitos:** DNI y PIN vigentes; cobradores dentro del horario permitido.

1. Abra CobranzaPro.
2. Escriba el DNI de ocho dígitos, sin espacios ni guiones.
3. Escriba el PIN de seis dígitos.
4. Utilice el icono del campo PIN solo si necesita verificar lo digitado y nadie puede observar la pantalla.
5. Seleccione **Ingresar**.

**Resultado esperado:** el administrador o supervisor ingresa al Dashboard; el cobrador ingresa a su ruta de cobranza. Si usa un PIN temporal, el sistema lo dirige primero a **Cambiar PIN**.

**Problemas frecuentes:**

| Mensaje o situación | Acción recomendada |
|---|---|
| DNI o PIN con formato incorrecto | Verifique que contengan ocho y seis dígitos, respectivamente |
| Credenciales inválidas | No repita intentos al azar; confirme el DNI y solicite ayuda al administrador |
| Acceso del cobrador cerrado | Ingrese entre 07:00 y antes de las 20:00, hora de Lima |
| Acceso rechazado después de varios intentos | Espere la pausa temporal de seguridad, confirme sus credenciales y evite reintentos consecutivos. Si persiste, comuníquese con un administrador |

### GEN-02 — Cambiar el PIN

**Rol:** Todos.  
**Objetivo:** Reemplazar un PIN temporal o actualizar el PIN personal.  
**Prerrequisitos:** Sesión iniciada y conocimiento del PIN actual.

1. Si el cambio es obligatorio, espere la pantalla **Cambiar PIN**. Para un cambio voluntario, abra el menú y seleccione **Cambiar PIN**.
2. Ingrese el PIN actual.
3. Ingrese un PIN nuevo de seis dígitos.
4. Confirme el PIN nuevo.
5. Seleccione **Cambiar PIN**.
6. Inicie sesión nuevamente con el nuevo PIN.

El PIN no debe ser una secuencia fácil, una repetición de un mismo dígito ni parte del DNI.

**Resultado esperado:** aparece la confirmación del cambio y la sesión se cierra para exigir el nuevo PIN.

> **CAPTURA 3 — Cambio obligatorio de PIN.** Capturar la advertencia de PIN temporal y los tres campos vacíos. Archivo previsto: `docs/entrega/assets/manual/general/03-cambio-pin-obligatorio.png`.

### GEN-03 — Cambiar tema, abrir el menú y cerrar sesión

**Rol:** Todos.  
**Objetivo:** Personalizar la visualización y finalizar el acceso de forma segura.  
**Prerrequisitos:** Sesión iniciada.

1. Seleccione el icono de luna o sol en la barra superior para alternar el tema.
2. En móvil, seleccione el botón de tres líneas para abrir el menú y la **X** para cerrarlo.
3. Para salir, abra el menú y seleccione el icono **Cerrar sesión** junto al nombre del usuario.
4. Compruebe que la pantalla de ingreso vuelva a mostrarse.

**Resultado esperado:** el tema cambia sin afectar la información y, al cerrar sesión, ya no se puede acceder a las pantallas privadas usando el botón Atrás.

---

## 5. Procedimientos del administrador

### ADM-01 — Consultar el Dashboard y una cartera

**Rol:** Administrador.  
**Objetivo:** Obtener una vista global y abrir la cartera de un cobrador.  
**Prerrequisitos:** Sesión de administrador.

1. Seleccione **Dashboard**.
2. Revise los indicadores: total a cobrar, total cobrado, saldo pendiente, morosidad mayor a diez días, clientes activos y cobradores.
3. Consulte los gráficos de recuperación y distribución de riesgo.
4. En **Rendimiento de cobradores**, busque por nombre o DNI si es necesario.
5. Seleccione **Ver cartera** en el cobrador requerido.

**Resultado esperado:** se abre Clientes con el filtro del cobrador aplicado.

> **CAPTURA 4 — Dashboard administrativo.** Capturar en 1440 × 900 con indicadores, gráficos y rendimiento de cobradores usando datos ficticios. Archivo previsto: `docs/entrega/assets/manual/administrador/04-dashboard.png`.

### ADM-02 — Crear y administrar un cobrador

**Rol:** Administrador.  
**Objetivo:** Crear el acceso de un cobrador y mantener su información.  
**Prerrequisitos:** Datos del empleado y PIN temporal definido según la política interna.

1. Abra **Cobradores** y seleccione **Nuevo cobrador**.
2. Complete nombre, DNI, teléfono y PIN temporal.
3. Revise la información y confirme el registro.
4. Entregue el PIN temporal por un canal seguro. El cobrador deberá cambiarlo al ingresar.
5. Para actualizar nombre o teléfono, seleccione **Editar**, realice el cambio y registre el motivo solicitado.
6. Para emitir un nuevo PIN temporal, seleccione **Restablecer PIN**, indique el motivo y entregue el resultado de forma privada.
7. Para cambiar el estado de acceso, seleccione **Activar** o **Desactivar** e indique el motivo.

El DNI no puede modificarse porque identifica el acceso. Un cobrador con clientes activos no puede desactivarse hasta que su cartera sea tratada por el procedimiento administrativo correspondiente. Si se abre la edición y no hay cambios reales, el botón de guardado permanece deshabilitado.

**Resultado esperado:** el listado refleja el nuevo estado o los datos actualizados, sin crear duplicados.

> **CAPTURA 5 — Gestión de cobradores.** Capturar el listado y las acciones Editar, Restablecer PIN y Desactivar con datos ficticios. Archivo previsto: `docs/entrega/assets/manual/administrador/05-cobradores-acciones.png`.

### ADM-03 — Registrar o editar un cliente

**Rol:** Administrador.  
**Objetivo:** Mantener los datos de un cliente y asignarlo a una cartera.  
**Prerrequisitos:** Cobrador activo disponible.

1. Abra **Clientes** y seleccione **Nuevo cliente**.
2. Complete documento, nombre, teléfono, dirección y observaciones.
3. Seleccione el cobrador asignado.
4. Confirme el registro.
5. Para localizarlo, use la búsqueda por nombre o DNI y el filtro de cobrador.
6. Para modificarlo, seleccione **Editar**, cambie únicamente los datos necesarios y guarde.

**Resultado esperado:** el cliente aparece en la cartera seleccionada. El sistema no envía una actualización cuando el formulario queda igual que al abrirse.

> **CAPTURA 6 — Registro de cliente.** Capturar el formulario vacío y el selector de cobrador. Archivo previsto: `docs/entrega/assets/manual/administrador/06-registro-cliente.png`.

### ADM-04 — Crear y consultar un préstamo

**Rol:** Administrador.  
**Objetivo:** Crear un préstamo para un cliente sin crédito vigente.  
**Prerrequisitos:** Cliente activo registrado y sin préstamo activo.

1. Abra **Préstamos** y seleccione **Nuevo préstamo**.
2. Seleccione el cliente.
3. Ingrese capital, tasa de interés, frecuencia, cantidad de cuotas y fecha del préstamo.
4. Revise el resumen calculado: total, cuota base y primer pago.
5. Seleccione **Crear préstamo**.
6. Use los filtros por estado, cobrador o frecuencia para localizarlo.
7. Seleccione **Ver detalle** para revisar cliente, resumen, cronograma y pagos.

**Resultado esperado:** se crea un único préstamo activo y su cronograma. Si el cliente ya tiene uno vigente, no aparece como disponible para crear otro.

> **CAPTURA 7 — Nuevo préstamo.** Capturar el formulario con valores ficticios y el resumen calculado, antes de confirmar. Archivo previsto: `docs/entrega/assets/manual/administrador/07-nuevo-prestamo.png`.

### ADM-05 — Registrar un pago, editar o renovar un préstamo

**Rol:** Administrador.  
**Objetivo:** Ejecutar operaciones autorizadas sobre un préstamo.  
**Prerrequisitos:** Préstamo localizado en su pantalla de detalle.

1. Para cobrar, seleccione **Registrar pago**, indique monto, medio de pago y observación, y confirme.
2. Verifique el monto aplicado y el nuevo saldo mostrado por el sistema.
3. Para corregir datos del préstamo, seleccione **Editar préstamo**, cambie los campos permitidos, elija una justificación y guarde. Algunas ediciones pueden estar impedidas cuando existe historial de pagos.
4. Para anular un pago, ubíquelo en el historial, seleccione **Anular pago**, elija el motivo y confirme. La fila original se conserva con su estado.
5. Para renovar, seleccione **Renovar préstamo**, complete las nuevas condiciones y revise el resumen antes de confirmar. El sistema incorpora el saldo pendiente cuando corresponde.

**Resultado esperado:** saldos, cronograma y estado se actualizan de manera trazable; ninguna corrección borra el historial financiero.

> **CAPTURA 8 — Detalle de préstamo.** Capturar el resumen, cronograma y acciones Registrar pago, Renovar y Editar. Archivo previsto: `docs/entrega/assets/manual/administrador/08-detalle-prestamo.png`.

### ADM-06 — Resolver solicitudes de corrección

**Rol:** Administrador.  
**Objetivo:** Aprobar o rechazar una solicitud enviada por un cobrador.  
**Prerrequisitos:** Solicitud pendiente.

1. Abra la campana o seleccione **Solicitudes** en el menú.
2. Filtre por estado o tipo, o busque por cliente, DNI o cobrador.
3. Lea el motivo y seleccione **Ver préstamo** para contrastar el registro.
4. Para una edición, seleccione **Revisar edición**, complete los valores aprobados y una justificación.
5. Para una anulación, seleccione **Anular préstamo** o **Anular pago**, según el tipo, y registre el motivo.
6. Si no corresponde, seleccione **Rechazar** y deje una explicación clara.
7. Confirme la resolución una sola vez y espere el mensaje final.

**Resultado esperado:** la solicitud queda aprobada o rechazada, se conserva la trazabilidad y el cobrador recibe el estado mediante la campana y su Dashboard.

> **CAPTURA 9 — Solicitudes de corrección.** Capturar una solicitud pendiente ficticia con motivo, datos financieros y botones de resolución. Archivo previsto: `docs/entrega/assets/manual/administrador/09-solicitudes-correccion.png`.

### ADM-07 — Consultar y exportar el Control diario

**Rol:** Administrador.  
**Objetivo:** Revisar lo programado, cobrado y atrasado a una fecha de corte.  
**Prerrequisitos:** Datos operativos existentes para la fecha elegida.

1. Abra **Control diario**.
2. Seleccione la fecha de corte y, si corresponde, un cobrador.
3. Aplique el filtro de estado o busque por cliente, DNI o cobrador.
4. Revise Programado, Cobrado, Diferencia, Atendidos y Con atraso.
5. Consulte el detalle. El atraso se expresa en días calendario desde la cuota impaga más antigua.
6. Para descargar la vista filtrada, seleccione **CSV**, **Excel** o **PDF**.
7. Espere a que finalice la generación antes de iniciar otra descarga.

**Resultado esperado:** el reporte refleja la situación a la fecha de corte y el navegador descarga el formato elegido.

> **CAPTURA 10 — Control diario.** Capturar filtros, resumen, detalle y botones de exportación en escritorio. Archivo previsto: `docs/entrega/assets/manual/administrador/10-control-diario.png`.

### ADM-08 — Revisar y validar el cierre de caja

**Rol:** Administrador.  
**Objetivo:** Conciliar las operaciones del cobrador y validar su entrega.  
**Prerrequisitos:** Fecha seleccionada y cobrador con información del día.

1. Abra **Cierre de caja** y seleccione la fecha.
2. Seleccione un cobrador.
3. Si corresponde, registre la apertura del día.
4. Revise cobranza, desembolsos, viáticos y gastos.
5. Apruebe o rechace solicitudes pendientes de viático o gasto. Para rechazar, registre el motivo.
6. Cuando el cobrador haya enviado su cierre, compare esperado, entregado y diferencia.
7. Seleccione **Validar cierre**, agregue la observación necesaria y confirme.

**Resultado esperado:** el cierre queda validado con fecha, responsable y observación. No valide si existen diferencias sin explicación o solicitudes pendientes relevantes.

> **CAPTURA 11 — Validación de cierre.** Capturar un cierre enviado, con esperado, entregado, diferencia y botón Validar cierre. Archivo previsto: `docs/entrega/assets/manual/administrador/11-validacion-cierre.png`.

---

## 6. Procedimientos del supervisor

El supervisor comparte las pantallas operativas de administración, pero **no crea, edita, activa ni restablece accesos de cobradores**. La pantalla Cobradores es de consulta para este rol.

### SUP-01 — Supervisar carteras y operaciones

**Rol:** Supervisor.  
**Objetivo:** Revisar el desempeño global y atender operaciones financieras autorizadas.  
**Prerrequisitos:** Sesión de supervisor.

1. Revise el **Dashboard** y abra una cartera desde **Ver cartera**.
2. Consulte Clientes y Préstamos con sus filtros.
3. Registre clientes, préstamos o pagos solo cuando la operación haya sido autorizada por el negocio.
4. Para una edición, anulación o renovación, siga el procedimiento **ADM-05** y registre siempre la justificación.
5. No modifique la asignación de cartera ni gestione credenciales. Solicite esa acción a un administrador.

**Resultado esperado:** la operación queda registrada con el usuario supervisor y la cartera conserva su asignación autorizada.

> **CAPTURA 12 — Vista del supervisor.** Capturar Dashboard en escritorio mostrando el rol Supervisor, sin datos reales. Archivo previsto: `docs/entrega/assets/manual/supervisor/12-dashboard-supervisor.png`.

### SUP-02 — Resolver solicitudes, exportar y validar cierres

**Rol:** Supervisor.  
**Objetivo:** Ejecutar el control operativo diario.  
**Prerrequisitos:** Solicitudes o cierres pendientes.

1. Revise la campana y la pantalla **Solicitudes**; aplique el procedimiento **ADM-06**.
2. Consulte **Control diario** y exporte únicamente la información necesaria, siguiendo **ADM-07**.
3. Revise viáticos, gastos y cierres en **Cierre de caja**, siguiendo **ADM-08**.
4. Registre motivos concretos; no use textos genéricos que impidan una revisión posterior.

**Resultado esperado:** solicitudes y cierres quedan resueltos de forma trazable y los reportes se descargan con los filtros seleccionados.

---

## 7. Procedimientos del cobrador

### COB-01 — Organizar la ruta de cobranza

**Rol:** Cobrador.  
**Objetivo:** Priorizar las visitas y abrir la ficha de un cliente.  
**Prerrequisitos:** Acceso dentro del horario y cartera asignada.

1. Ingrese a **Cobranza de hoy**.
2. Revise el avance, el total esperado, lo cobrado y la cantidad de clientes atrasados.
3. Busque por nombre, DNI o teléfono.
4. Use los filtros de cobranza y el orden disponible para priorizar atrasos.
5. Seleccione la tarjeta del cliente o la acción de pago para abrir su detalle.
6. Use la paginación para recorrer la lista completa.

**Resultado esperado:** se muestra únicamente la cartera asignada al cobrador y se abre el cliente seleccionado.

> **CAPTURA 13 — Ruta de cobranza móvil.** Capturar en 360 × 800 el avance, filtros y tarjetas con datos ficticios. Archivo previsto: `docs/entrega/assets/manual/cobrador/13-ruta-cobranza-mobile.png`.

### COB-02 — Registrar un cliente con su primer préstamo

**Rol:** Cobrador.  
**Objetivo:** Incorporar un cliente nuevo a la cartera propia.  
**Prerrequisitos:** Información completa del cliente y condiciones aprobadas del préstamo.

1. Abra **Mis clientes** y seleccione **Nuevo cliente**.
2. Complete documento, nombre, teléfono, dirección y observaciones solicitadas.
3. Complete capital, tasa, frecuencia, cantidad de cuotas y fecha del préstamo.
4. Revise el resumen calculado y la fecha del primer cobro.
5. Seleccione **Registrar cliente**.

**Resultado esperado:** el cliente y su primer préstamo quedan disponibles en la cartera del cobrador en una sola operación.

> **CAPTURA 14 — Nuevo cliente del cobrador.** Capturar en móvil el formulario y el resumen del primer préstamo, sin confirmar. Archivo previsto: `docs/entrega/assets/manual/cobrador/14-nuevo-cliente-prestamo-mobile.png`.

### COB-03 — Consultar cliente, cronograma y pagos

**Rol:** Cobrador.  
**Objetivo:** Revisar la situación del cliente antes de cobrar.  
**Prerrequisitos:** Cliente existente en la cartera propia.

1. Abra **Mis clientes**.
2. Busque por nombre, DNI o teléfono y aplique filtros de estado o riesgo.
3. Abra el cliente.
4. Revise saldo, fechas, frecuencia, cronograma de cuotas e historial de pagos.
5. Cambie el filtro de cuotas si necesita ver solo pendientes, pagadas o vencidas.

**Resultado esperado:** se presenta la información financiera vigente del cliente sin exponer otras carteras.

### COB-04 — Registrar un pago

**Rol:** Cobrador.  
**Objetivo:** Registrar el importe recibido y actualizar el saldo.  
**Prerrequisitos:** Préstamo activo con saldo pendiente.

1. Abra el cliente y seleccione **Registrar pago**.
2. Seleccione un monto rápido o escriba el monto recibido.
3. Elija el medio de pago.
4. Agregue una observación útil, especialmente para abonos parciales o situaciones de campo.
5. Revise el saldo posterior mostrado en pantalla.
6. Seleccione **Confirmar pago** una sola vez.
7. Verifique el importe aplicado y el nuevo saldo; seleccione **Listo**.

**Resultado esperado:** el pago se aplica a las cuotas más antiguas pendientes y el saldo se actualiza. Un pago no se elimina: si hubo un error, use una solicitud de corrección.

> **CAPTURA 15 — Registro de pago móvil.** Capturar el diálogo con monto, medio de pago, observación y saldo posterior. Archivo previsto: `docs/entrega/assets/manual/cobrador/15-registro-pago-mobile.png`.

### COB-05 — Solicitar una corrección

**Rol:** Cobrador.  
**Objetivo:** Solicitar la edición o anulación de una operación sin modificarla directamente.  
**Prerrequisitos:** Cliente y préstamo propios; operación identificada.

1. Abra el detalle del cliente.
2. Para el préstamo, seleccione **Solicitar edición** o **Solicitar anulación**.
3. Para un pago, localícelo en el historial y seleccione la opción de solicitar anulación.
4. Elija el motivo. Si selecciona **Otro**, describa qué ocurrió y qué debe revisar el responsable.
5. Envíe la solicitud.
6. Consulte la campana o **Estado de solicitudes** en el Dashboard.
7. Abra la respuesta para leer si fue aprobada o rechazada y la nota de resolución.

**Resultado esperado:** la solicitud queda pendiente sin alterar el registro. Después de la revisión, el Dashboard muestra su resultado y permite marcar la respuesta como leída.

> **CAPTURA 16 — Solicitud de corrección.** Capturar el formulario móvil con motivo seleccionado y sin información real. Archivo previsto: `docs/entrega/assets/manual/cobrador/16-solicitud-correccion-mobile.png`.

### COB-06 — Crear un nuevo préstamo o renovar

**Rol:** Cobrador.  
**Objetivo:** Continuar el financiamiento de un cliente elegible.  
**Prerrequisitos:** Cliente de la cartera; operación permitida por su estado financiero.

1. Abra el cliente.
2. Si no tiene préstamo activo, seleccione **Crear nuevo préstamo**.
3. Si cumple las condiciones de renovación, seleccione **Renovar préstamo**.
4. Complete capital, tasa, frecuencia, cuotas y fecha.
5. Revise el total, cuota, fecha de inicio y, en una renovación, el saldo incorporado y el efectivo a entregar.
6. Confirme una sola vez.

**Resultado esperado:** el nuevo préstamo y su cronograma quedan registrados. Un cliente con más de cinco días de atraso no puede renovar ni recibir un nuevo préstamo hasta ponerse al día.

### COB-07 — Solicitar viático o gasto y enviar el cierre

**Rol:** Cobrador.  
**Objetivo:** Informar movimientos del día y declarar el efectivo entregado.  
**Prerrequisitos:** Jornada abierta y cierre todavía no enviado.

1. Abra **Cierre de caja** y revise el efectivo esperado y el detalle del día.
2. Para un viático, seleccione **Solicitar viático**, indique monto y justificación, y envíe. Solo puede existir una solicitud pendiente a la vez.
3. Para un gasto operativo, seleccione **Solicitar gasto**, elija la categoría, indique monto y descripción, y envíe.
4. Consulte si las solicitudes están pendientes, aprobadas o rechazadas. Lea el motivo si fueron rechazadas.
5. Al terminar la ruta, seleccione **Enviar mi cierre**.
6. Declare el importe entregado y registre una observación cuando exista diferencia.
7. Confirme y espere la validación del administrador o supervisor.

**Resultado esperado:** el cierre queda enviado con el importe entregado y la diferencia calculada. Después de enviarlo, no se deben registrar nuevas solicitudes para ese día.

> **CAPTURA 17 — Cierre del cobrador.** Capturar en móvil el efectivo esperado, detalle, solicitudes y botón Enviar mi cierre. Archivo previsto: `docs/entrega/assets/manual/cobrador/17-cierre-caja-mobile.png`.

---

## 8. Notificaciones y actualización de información

La campana informa nuevas solicitudes para administradores y supervisores, y respuestas para cobradores. Al volver a CobranzaPro desde otra pestaña o aplicación, el sistema reconcilia la información visible. Si una operación no aparece de inmediato:

1. espere unos segundos;
2. vuelva a abrir la campana;
3. use el botón de actualización de la pantalla, cuando esté disponible;
4. evite repetir una operación financiera que ya pudo haberse registrado.

> **CAPTURA 18 — Campana de notificaciones.** Capturar el panel abierto con solicitudes ficticias y sus estados. Archivo previsto: `docs/entrega/assets/manual/general/18-notificaciones.png`.

---

## 9. Mensajes, errores y recuperación

| Situación | Significado | Qué hacer |
|---|---|---|
| Botón Guardar deshabilitado | Faltan campos válidos o no existe un cambio real | Revise los campos; no fuerce un guardado innecesario |
| No hay resultados | Los filtros no coinciden con registros | Limpie o ajuste búsqueda, estado, cobrador o fecha |
| Sesión vencida o acceso no autorizado | La sesión perdió vigencia o el rol no permite la operación | Inicie sesión nuevamente; si persiste, contacte a soporte |
| Error de conexión | No se pudo comunicar con el servicio | Verifique Internet y reintente; no duplique pagos o cierres |
| Cliente con préstamo vigente | La regla permite un solo préstamo activo | Abra el préstamo actual o use renovación cuando corresponda |
| Cliente restringido por atraso | Supera cinco días acumulados de atraso | Registre los pagos pendientes; el estado se regulariza automáticamente |
| Cierre con diferencia | Lo entregado no coincide con lo esperado | Revise movimientos y escriba una observación antes de enviar o validar |
| Operación de día validado no permitida | El día financiero ya fue cerrado | No intente modificarlo; escale el caso con evidencia a soporte |

Ante una pantalla congelada, no presione varias veces el botón de confirmación. Espere, verifique la conexión y compruebe el resultado antes de reintentar.

---

## 10. Seguridad y buenas prácticas

- No comparta el PIN ni lo envíe por grupos de mensajería.
- Cambie inmediatamente cualquier PIN temporal.
- No utilice el DNI, secuencias ni dígitos repetidos como PIN.
- Cierre sesión al prestar, vender o dejar desatendido el dispositivo.
- No guarde capturas con datos de clientes en galerías personales o servicios no autorizados.
- Verifique cliente, monto y medio de pago antes de confirmar.
- Use motivos y observaciones concretos; forman parte de la trazabilidad.
- No solicite a soporte que borre pagos. Las correcciones deben usar el flujo de anulación o solicitud.
- Informe de inmediato un acceso desconocido, pérdida del equipo o sospecha de exposición de credenciales.
- Descargue reportes solo cuando sean necesarios y almacénelos en ubicaciones aprobadas por la organización.

---

## 11. Preguntas frecuentes y soporte

**¿Por qué el cobrador no puede ingresar en la noche?**  
Su acceso operativo se limita de 07:00 hasta antes de las 20:00, hora de Lima. Administradores y supervisores mantienen acceso continuo.

**¿Por qué no aparece un cliente?**  
Revise los filtros. Para un cobrador, el cliente debe pertenecer a su cartera. Si la asignación es incorrecta, contacte al administrador.

**¿Se puede borrar un pago equivocado?**  
No. El pago se anula mediante un flujo trazable. El cobrador envía una solicitud; el administrador o supervisor la revisa.

**¿Por qué no puedo renovar?**  
El cliente puede tener una restricción por atraso, una operación pendiente o condiciones que impiden la renovación. Revise el mensaje mostrado en su ficha.

**¿Qué información debo enviar a soporte?**  
Indique fecha y hora, rol, módulo, acción realizada, mensaje exacto y una captura sin PIN ni información personal innecesaria. No envíe credenciales.

| Canal de soporte | Información editable |
|---|---|
| Responsable funcional | ______________________________ |
| Soporte técnico | ______________________________ |
| Teléfono o canal interno | ______________________________ |
| Horario de atención | ______________________________ |
| Procedimiento para incidentes críticos | ______________________________ |

---

## 12. Funciones no disponibles en esta versión

- **Auditoría:** la opción de menú existe, pero la pantalla está en construcción. No debe utilizarse como evidencia ni enseñarse como módulo operativo.
- **Importación masiva desde Excel o CSV:** no está disponible como proceso de carga en la interfaz.
- **Fotografías de identificación o del cliente:** no forman parte del flujo operativo actual.
- **Consulta automática de identidad:** no existe integración activa con fuentes externas.
- **Exportación TXT:** el Control diario ofrece CSV, Excel y PDF; TXT no está disponible.

---

## 13. Glosario

| Término | Definición |
|---|---|
| Cartera | Clientes asignados a un cobrador |
| Capital | Importe original entregado al cliente |
| Cuota | Parte programada del total a pagar |
| Saldo | Importe pendiente de pago |
| Frecuencia | Periodicidad diaria, semanal o mensual del cronograma |
| Mora o atraso | Incumplimiento acumulado respecto del cronograma |
| Renovación | Nuevo préstamo relacionado con el anterior e incorporando saldo cuando corresponde |
| Corrección | Cambio trazable que conserva el registro original y su motivo |
| Cierre de caja | Comparación diaria entre efectivo esperado y entregado |
| Viático | Efectivo autorizado para apoyar la operación del cobrador |
| Gasto operativo | Salida declarada por el cobrador y sujeta a aprobación |
| Fecha de corte | Día hasta el cual se calcula un reporte |

---

## 14. Checklist de capacitación

### Todos los usuarios

- [ ] Inicia sesión y reconoce una solicitud de cambio de PIN.
- [ ] Abre y cierra el menú en su dispositivo habitual.
- [ ] Cambia el tema sin perder la pantalla actual.
- [ ] Identifica la campana de notificaciones.
- [ ] Cierra sesión correctamente.

### Administrador

- [ ] Consulta indicadores y abre la cartera de un cobrador.
- [ ] Crea un cobrador y explica el manejo seguro del PIN temporal.
- [ ] Registra un cliente y un préstamo.
- [ ] Registra y anula un pago con motivo.
- [ ] Resuelve una solicitud de corrección.
- [ ] Exporta el Control diario con filtros.
- [ ] Revisa viáticos, gastos y valida un cierre.

### Supervisor

- [ ] Distingue sus permisos de los del administrador.
- [ ] Supervisa carteras sin gestionar accesos de usuarios.
- [ ] Resuelve solicitudes y valida cierres con una justificación suficiente.

### Cobrador

- [ ] Organiza la ruta mediante filtros y búsqueda.
- [ ] Registra un cliente con su primer préstamo.
- [ ] Registra un pago y verifica el nuevo saldo.
- [ ] Envía una solicitud de corrección y consulta la respuesta.
- [ ] Solicita viático o gasto y envía su cierre.

---

## 15. Matriz de capturas pendientes

> **NOTA DE EDICIÓN — eliminar antes de entregar:** esta matriz sirve para preparar las imágenes del documento Word. No forma parte del manual final destinado al usuario.

Todas las capturas deben usar datos ficticios, ocultar PIN y evitar nombres o documentos reales. Para administrador y supervisor se recomienda **1440 × 900**. Para cobrador, **360 × 800** como vista principal y **393 × 852** como comprobación adicional.

| N.° | Rol | Pantalla y estado | Vista | Ruta futura exacta |
|---:|---|---|---|---|
| 1 | General | Inicio de sesión vacío | Escritorio | `docs/entrega/assets/manual/general/01-inicio-sesion-desktop.png` |
| 2 | Cobrador | Menú móvil abierto | 360 × 800 | `docs/entrega/assets/manual/general/02-menu-mobile-cobrador.png` |
| 3 | General | Cambio obligatorio de PIN | Escritorio | `docs/entrega/assets/manual/general/03-cambio-pin-obligatorio.png` |
| 4 | Administrador | Dashboard con métricas y tabla | 1440 × 900 | `docs/entrega/assets/manual/administrador/04-dashboard.png` |
| 5 | Administrador | Cobradores con acciones disponibles | 1440 × 900 | `docs/entrega/assets/manual/administrador/05-cobradores-acciones.png` |
| 6 | Administrador | Formulario de cliente | 1440 × 900 | `docs/entrega/assets/manual/administrador/06-registro-cliente.png` |
| 7 | Administrador | Formulario y resumen de préstamo | 1440 × 900 | `docs/entrega/assets/manual/administrador/07-nuevo-prestamo.png` |
| 8 | Administrador | Detalle de préstamo | 1440 × 900 | `docs/entrega/assets/manual/administrador/08-detalle-prestamo.png` |
| 9 | Administrador | Solicitud de corrección pendiente | 1440 × 900 | `docs/entrega/assets/manual/administrador/09-solicitudes-correccion.png` |
| 10 | Administrador | Control diario con resultados | 1440 × 900 | `docs/entrega/assets/manual/administrador/10-control-diario.png` |
| 11 | Administrador | Cierre enviado antes de validar | 1440 × 900 | `docs/entrega/assets/manual/administrador/11-validacion-cierre.png` |
| 12 | Supervisor | Dashboard identificando el rol | 1440 × 900 | `docs/entrega/assets/manual/supervisor/12-dashboard-supervisor.png` |
| 13 | Cobrador | Ruta con tarjetas y filtros | 360 × 800 | `docs/entrega/assets/manual/cobrador/13-ruta-cobranza-mobile.png` |
| 14 | Cobrador | Nuevo cliente y primer préstamo | 360 × 800 | `docs/entrega/assets/manual/cobrador/14-nuevo-cliente-prestamo-mobile.png` |
| 15 | Cobrador | Diálogo de registro de pago | 360 × 800 | `docs/entrega/assets/manual/cobrador/15-registro-pago-mobile.png` |
| 16 | Cobrador | Solicitud de corrección | 360 × 800 | `docs/entrega/assets/manual/cobrador/16-solicitud-correccion-mobile.png` |
| 17 | Cobrador | Cierre personal antes de enviar | 360 × 800 | `docs/entrega/assets/manual/cobrador/17-cierre-caja-mobile.png` |
| 18 | Todos | Campana abierta con estados ficticios | Según rol | `docs/entrega/assets/manual/general/18-notificaciones.png` |

### Criterios de aceptación de las capturas

- [ ] Se obtienen desde un entorno seguro con información ficticia.
- [ ] No muestran PIN, claves, tokens, direcciones internas ni datos personales reales.
- [ ] Coinciden con la versión entregada de la aplicación.
- [ ] Conservan texto legible y no contienen recortes accidentales.
- [ ] Las vistas móviles no presentan desplazamiento horizontal.
- [ ] Cada archivo respeta exactamente la ruta y el nombre definidos en la matriz.

---

**Fin del manual**
