

[**SISTEMA DE GESTIÓN DE COBROS	2**](#sistema-de-gestión-de-cobros)

[**1\. ¿Qué va a hacer el sistema?	2**](#1.-¿qué-va-a-hacer-el-sistema?)

[**2\. ¿Quién puede hacer qué?	2**](#2.-¿quién-puede-hacer-qué?)

[**3\. ¿Cómo se calcula un préstamo?	3**](#3.-¿cómo-se-calcula-un-préstamo?)

[**4\. ¿Cuándo se cobra?	3**](#4.-¿cuándo-se-cobra?)

[**5\. ¿Qué pasa cuando el cliente paga?	3**](#5.-¿qué-pasa-cuando-el-cliente-paga?)

[**6\. Clientes atrasados y “lista negra”	4**](#6.-clientes-atrasados-y-“lista-negra”)

[**7\. Préstamos y renovaciones	4**](#7.-préstamos-y-renovaciones)

[**8\. Correcciones y cuidado del dinero	4**](#8.-correcciones-y-cuidado-del-dinero)

[**9\. Cierre de caja diario	4**](#9.-cierre-de-caja-diario)

[**10\. Reportes y descargas	5**](#10.-reportes-y-descargas)

[**11\. ¿Cómo pasamos la información que ya tienen?	5**](#11.-¿cómo-pasamos-la-información-que-ya-tienen?)

[**12\. ¿Cuánto tiempo tomará?	5**](#12.-¿cuánto-tiempo-tomará?)

[**13\. Seguridad y respaldo	5**](#13.-seguridad-y-respaldo)

**Sistema de gestión de cobros**

Se requiere una solución tecnológica capaz de optimizar el registro de cobros para una empresa, capaz de registrar cobros, registrar trabajadores, registrar clientes, registrar préstamos, y todas las funciones básicas para poder trabajar de manera ordenada y eficiente.

**1\. ¿Qué va a hacer el sistema?**

El sistema le permitirá llevar en un solo lugar sus préstamos, sus clientes y los cobros del día a día. Sirve para unas 400 clientes (O los que dispongan), y empieza con 5 personas usando el sistema, con posibilidad de agregar más cuando lo necesite.

En concreto, podrán:

* Registrar clientes y préstamos, con su cronograma de pagos listo automáticamente.  
* Anotar cada cobro que hace el cobrador, ya sea pago completo, pago parcial o pago adelantado.  
* Saber en todo momento quién está al día y quién está atrasado.  
* Ver cuánto cobró cada cobrador por día, por semana o por mes.  
* Hacer el cierre de caja diario de cada cobrador.  
* Descargar la información en Excel, PDF o TXT.

El sistema funciona **desde el celular o la computadora, tanto en Android como en iPhone**, y **siempre con internet**: no hay que instalar nada complicado, solo entrar con su usuario y su clave.

**2\. ¿Quién puede hacer qué?**

Habrá tres tipos de usuario:

* **Administrador:** el dueño del sistema. Puede hacer todo, incluyendo crear a las demás personas que usarán el sistema.  
* **Supervisor:** revisa y corrige el trabajo de los cobradores, y ve toda la cartera.  
* **Cobrador:** sale a cobrar y registra sus cobros. Solo ve a sus propios clientes.

| Qué se puede hacer | Cobrador | Supervisor | Administrador |
| ----- | :---: | :---: | :---: |
| Crear usuarios nuevos | ✗ | ✗ | ✓ |
| Registrar clientes y préstamos | ✓ | ✓ | ✓ |
| Corregir un préstamo ya creado | ✗ | ✓ | ✓ |
| Registrar un cobro | ✓ | ✓ | ✓ |
| Anular o corregir un cobro | ✗ | ✓ | ✓ |
| Cambiar a un cliente de cobrador | ✗ | ✗ | ✓ |
| Cargar clientes y préstamos desde un archivo CSV | ✗ | ✓ | ✓ |
| Ver sus propios clientes | ✓ | ✓ | ✓ |
| Ver los clientes y reportes de todos | ✗ | ✓ | ✓ |
| Validar el cierre de caja de los cobradores | ✗ | ✓ | ✓ |
| Descargar información | Solo historial de pagos y cronograma | Todos los reportes | Todos los reportes |

**¿Cómo se entra al sistema?** Con un usuario y una clave numérica de 6 dígitos. Si alguien se equivoca varias veces seguidas, el sistema lo bloquea por seguridad, y el administrador puede darle una clave nueva.

**3\. ¿Cómo se calcula un préstamo?**

* El **total a pagar** es el monto prestado más el interés. Ejemplo: se presta S/500 con 20% de interés, entonces el cliente paga S/600 en total.  
* El interés se calcula **una sola vez** sobre el monto prestado. No crece con el tiempo.  
* El porcentaje de interés **se puede cambiar en cada préstamo**: 10%, 20%, 30% o el que usted decida. Si no se indica nada, el sistema propone 20%.  
* La **cuota** sale de dividir el total entre el número de cuotas. Ejemplo: S/600 entre 24 días son S/25 por día.  
* Las cuotas se redondean a céntimos. Si la cuota sale casi redonda (por ejemplo S/29.99), el sistema la sube a S/30 para que sea más fácil de cobrar. Cualquier pequeña diferencia se ajusta en la última cuota, para que el total siempre cuadre.

**4\. ¿Cuándo se cobra?**

Al crear el préstamo, el sistema arma solo el calendario completo de cobros. Estas son las reglas:

| Tipo de cobro | Cómo funciona |
| ----- | ----- |
| **Diario** | De lunes a sábado. Los domingos no se cobra. Los feriados sí se cobran. |
| **Semanal** | Siempre el mismo día de la semana. |
| **Mensual** | Se cobra el mismo día de cada mes. Si ese día cae domingo, se cobra el lunes. Pero si el lunes ya cae en el mes siguiente, entonces se cobra el sábado anterior. |

**Ejemplo mensual:** si la cuota cae el domingo 15, se cobra el lunes 16\. Si cae el domingo 31, no se puede pasar al lunes 1 (ya es otro mes), así que se cobra el sábado 30\.

Los domingos nunca se cobra ni se trabaja, y las demás fechas se cobran normal aunque sean feriado o haya algún imprevisto.

**5\. ¿Qué pasa cuando el cliente paga?**

El sistema lleva la cuenta de lo que el cliente **debía haber pagado hasta hoy** y de lo que **realmente ha pagado**. Así, cualquier forma de pagar queda bien registrada:

* **Pago completo:** el cliente queda al día.  
* **Pago parcial:** lo que faltó se suma a la siguiente fecha de cobro.  
* **Pago adelantado:** el cliente puede pagar varias cuotas de una vez, y esas cuotas quedan cubiertas.  
* **Ejemplo:** el cliente debía S/20 ayer y hoy paga S/40. Queda al día, porque ya cubrió lo de ayer y lo de hoy.

**6\. Clientes atrasados y “lista negra”**

* Cuando un cliente acumula **más de 5 días de atraso**, el sistema lo pasa **solo** a la lista negra. No hay que hacer nada a mano.  
* Cuando el cliente se pone al día, **sale solo** de la lista negra.  
* Por ahora **no se cobra ningún interés ni multa adicional** por el atraso. Solo cambia su estado a lista negra.  
* Un cliente que está en lista negra **no puede renovar su préstamo**.

**7\. Préstamos y renovaciones**

* Cada cliente puede tener **un solo préstamo activo** a la vez.  
* Si quiere más dinero, se hace una **renovación**: el préstamo anterior se cierra y se crea uno nuevo, relacionado al anterior.  
* Si al renovar el cliente todavía debe algo, **ese saldo se descuenta del nuevo préstamo**.  
* Los préstamos nuevos los pueden crear el administrador, el supervisor y el cobrador. Pero solo el administrador y el supervisor pueden **modificarlos** después.

**8\. Correcciones y cuidado del dinero**

* Un cobro ya registrado **nunca se borra**. Si hubo un error, el administrador o el supervisor puede **anularlo o corregirlo**.  
* El sistema guarda **quién hizo el cambio, cuándo, qué decía antes, qué dice ahora y por qué**. Así siempre se sabe qué pasó y se evitan discusiones.  
* Cada cliente pertenece a un cobrador y **no se puede cambiar**, salvo que ese cobrador ya no trabaje con ustedes. En ese caso, el administrador pasa toda su cartera a otro cobrador en pocos pasos.

**9\. Cierre de caja diario**

Al terminar el día, cada cobrador hace su cierre de caja:

1. El sistema muestra cuánto **debería** haber cobrado y cuánto **registró** realmente.  
2. El cobrador **entrega el dinero**, ya sea en efectivo o por Yape.  
3. El **supervisor o el administrador valida** que lo entregado coincida con lo registrado.  
4. Si hay diferencia, queda anotada con su observación.

También se registra **el dinero que sale hacia los clientes**: por ejemplo, un préstamo nuevo, o dinero que se tenga que devolver a un cliente. De esa forma la caja refleja lo que entra y lo que sale, no solo lo cobrado.

Todas las fechas y horas del sistema usan la **hora de Perú (Lima)**, y el día se cierra con esa misma hora.

**10\. Reportes y descargas**

Se podrá ver cuánto cobró cada cobrador por día, semana o mes, la lista de clientes atrasados, la cartera completa y los cierres de caja.

Todos los usuarios pueden descargar información, pero **según lo que cada uno puede ver**:

* **Administrador y supervisor:** pueden descargar todos los reportes.  
* **Cobrador:** solo puede descargar el historial de pagos y el cronograma de sus clientes.

Los formatos disponibles son **Excel, PDF y TXT**.

**11\. ¿Cómo pasamos la información que ya tienen?**

Hay dos formas de cargar sus clientes y préstamos actuales:

* **Cargar desde un archivo CSV:** el administrador o el supervisor sube un archivo con la información y el sistema la carga de una sola vez. Es lo más rápido para sus aproximadamente 400 clientes.  
* **Escribir los datos a mano:** el sistema tendrá un formulario rápido, pensado para escribir mucha información sin perder tiempo.

Para los préstamos que ya están en marcha, se indicará cuánto se prestó, cuánto se ha pagado y desde qué fecha empezó, para que los saldos y atrasos salgan correctos desde el primer día.

**12\. ¿Cuánto tiempo tomará?**

| Etapa | Qué se hace | Tiempo aproximado |
| ----- | ----- | ----- |
| 1\. Preparación | Confirmar los detalles de este documento y diseñar las pantallas | Pendiente |
| 2\. Lo básico | Usuarios, clientes, préstamos y calendario de cobros | Pendiente |
| 3\. Cobranza | Registro de pagos, atrasos y lista negra automática | Pendiente |
| 4\. Caja y reportes | Cierre de caja, reportes y descargas | Pendiente |
| 5\. Puesta en marcha | Carga de datos, capacitación y prueba con 1 o 2 cobradores | Pendiente |

**13\. Seguridad y respaldo**

* Cada persona entra con su propio usuario y clave, y solo ve lo que le corresponde.  
* El sistema se cierra solo si el celular queda un rato sin usarse.  
* Si se pierde un celular, el administrador puede bloquear ese acceso de inmediato.  
* La información se guarda con **copias de seguridad automáticas todos los días**, porque es información de dinero y no puede perderse.
