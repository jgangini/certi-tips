La tienda necesita impedir configuraciones peligrosas, descubrir problemas y proteger información. Ningún servicio aislado resuelve todas esas tareas.

**Al terminar podrás:** asignar responsabilidades; diferenciar Cloud Guard, Security Zones, WAF y Vault; y explicar la relación entre cifrado, claves, secretos y autorización.

## Conceptos clave

En el **modelo de responsabilidad compartida**, Oracle protege la infraestructura cloud y opera los componentes que corresponden al servicio. El cliente configura sus recursos, controla identidades y protege sus datos y aplicaciones. En una VM de IaaS también administra el sistema operativo invitado y su parcheo. Un servicio gestionado puede trasladar tareas a Oracle, pero no decide por ti quién debe leer tus pedidos. Véase [seguridad de OCI](https://docs.oracle.com/en-us/iaas/Content/Security/Concepts/security_overview.htm).

![La base física y la plataforma operada por Oracle se separan de los datos, accesos y aplicaciones que gestiona el cliente.]({{base}}assets/diagrams/ocif-security-concepts.svg "La distribución exacta depende del servicio utilizado.")

La **defensa en profundidad** combina controles: IAM autoriza operaciones sobre recursos; reglas de red acotan tráfico; el sistema operativo y la aplicación aplican controles propios; cifrado protege información; registros y detección permiten investigar. Permitir HTTPS en un NSG no valida por sí mismo el contenido de una solicitud web.

## Prevenir, detectar y responder

**Cloud Guard** observa configuraciones y actividad para identificar riesgos. Un **target** delimita qué observar; las recetas de **detectors** determinan comprobaciones; los **responders** permiten acciones de corrección según configuración y permisos. Detectar un problema no significa que se haya corregido automáticamente.

**Security Zones** aplica políticas de una receta a un compartimento y su ámbito. Una operación que viola una política aplicable se deniega. Por ejemplo, una receta puede impedir buckets públicos o exigir claves administradas por el cliente. **Security Advisor**, en las demostraciones, guía la creación de recursos siguiendo controles de seguridad; no reemplaza la política ni convierte cualquier recurso en seguro por sí solo.

![Security Zones bloquea una creación incompatible; Cloud Guard observa un recurso existente y deriva un hallazgo a una respuesta.]({{base}}assets/diagrams/ocif-security-controls.svg "Prevención en la operación y detección continua cumplen papeles complementarios.")

**Web Application Firewall (WAF)** inspecciona solicitudes web y puede filtrar patrones maliciosos, como intentos de inyección SQL o cross-site scripting, según las reglas configuradas. No sustituye la validación de entradas de la aplicación. **Audit** registra acciones de API para investigación; **Logging** reúne registros de servicios o aplicaciones; **Monitoring** trabaja con métricas y alarmas. Para saber quién cambió un recurso, busca evidencia de auditoría; para saber si subió la CPU, mira métricas.

## Cifrado, claves y secretos

**Cifrar** transforma texto legible en texto cifrado usando un algoritmo y una clave. **Descifrar** recupera el contenido cuando se cumplen las condiciones criptográficas y de acceso. El cifrado **simétrico** usa una clave compartida; el **asimétrico**, un par de claves con funciones relacionadas. Un hash no es simplemente cifrado que puedas deshacer con una clave.

![Un documento legible se cifra y se convierte en datos protegidos; la clave tiene un flujo separado del documento.]({{base}}assets/diagrams/ocif-security-encryption.svg "Gestiona el acceso a la clave además del acceso a los datos.")

El cifrado **en reposo** protege datos almacenados; **en tránsito** protege su transporte, por ejemplo mediante TLS. No confundas ninguno con autorización: un usuario legítimamente autorizado puede recibir los datos descifrados. Un bucket cifrado pero expuesto públicamente puede seguir revelando información a través del servicio.

**OCI Vault** administra claves y secretos. Una **clave criptográfica** se usa en operaciones de cifrado; un **secreto** puede contener una contraseña, token u otro material sensible. Separarlos del código evita incrustarlos en archivos de configuración distribuidos. Los modos de protección de claves, como software o HSM, y sus opciones deben elegirse según requisitos del servicio.

Un servicio puede usar claves administradas por Oracle o una clave administrada por el cliente compatible. Esta última da control adicional del ciclo de vida, con responsabilidades sobre permisos, disponibilidad y eliminación. Rotar una clave y rotar una contraseña son procesos diferentes. Consulta [Key Management y Vault](https://docs.oracle.com/en-us/iaas/Content/KeyManagement/Concepts/keyoverview.htm).

## Ejemplo paso a paso

1. La tienda identifica pedidos como datos privados y configura el acceso mínimo a su bucket.
2. Aplica una Security Zone cuya receta exige una clave del cliente. Primero verifica la receta y crea los recursos criptográficos necesarios con un administrador autorizado.
3. Al intentar crear el bucket con una clave administrada por Oracle, la operación se deniega por esa regla concreta. El mensaje describe el requisito incumplido.
4. Selecciona una clave compatible a la que el servicio tenga acceso y crea el bucket conforme a la receta. En la demostración, Security Advisor ayuda a recorrer ese flujo.
5. Configura Cloud Guard con el ámbito y las respuestas apropiadas; revisa hallazgos y confirma su corrección. Protege la entrada web con WAF según el riesgo de la aplicación.

![Una creación sin la clave exigida se detiene; al aportar la clave compatible, la misma solicitud cumple la receta.]({{base}}assets/diagrams/ocif-security-example.svg "Corrige la causa de la denegación sin debilitar el objetivo de seguridad.")

En la demostración de Vault identifica vault, clave y versión, y qué servicio la usará. No elimines la clave como simple limpieza de un laboratorio si aún hay datos que dependen de ella.

## Errores frecuentes

- **“Cloud Guard impide toda mala configuración”.** Su papel principal es detectar y facilitar corrección; Security Zones puede denegar operaciones incompatibles.
- **“Cifrado equivale a privado”.** El acceso de lectura autorizado por el servicio sigue siendo determinante.
- **“Una regla de firewall protege de cualquier SQL injection”.** Permitir un puerto es diferente de inspeccionar contenido HTTP; la aplicación también debe validar entradas y consultar datos de forma segura.

![Un bucket cifrado con acceso público entrega contenido al solicitante: el candado del disco no sustituye el control de lectura.]({{base}}assets/diagrams/ocif-security-errors.svg "La confidencialidad depende de cifrado y autorización.")

## Ejercicio de decisión

La tienda pide tres medidas: denegar buckets públicos antes de crearlos, revisar continuamente configuraciones de riesgo y filtrar ataques HTTP a su web. Asigna un servicio a cada medida y explica qué controles del cliente siguen siendo necesarios.

<details>
<summary>Ver solución y explicación</summary>

Security Zones con una receta que prohíba exposición pública; Cloud Guard para detección y respuestas configuradas; WAF para inspección de solicitudes web. El cliente debe definir políticas IAM, configurar las reglas y el ámbito, revisar los hallazgos y mantener su aplicación segura. Los nombres de los servicios no reemplazan su configuración.

![Tres acciones diferentes se enlazan con Security Zones, Cloud Guard y WAF.]({{base}}assets/diagrams/ocif-security-exercise.svg "Asigna el control a la acción que debe realizar.")

</details>

## Fuentes y repaso

![Capas de protección alrededor del dato: identidad, red, aplicación, cifrado y observación.]({{base}}assets/diagrams/ocif-security-recap.svg "Explica qué ataque o error aborda cada capa.")

Consulta [Cloud Guard](https://docs.oracle.com/en-us/iaas/cloud-guard/using/overview.htm), [Security Zones](https://docs.oracle.com/en-us/iaas/security-zone/using/overview.htm), [WAF](https://docs.oracle.com/en-us/iaas/Content/WAF/Concepts/overview.htm) y [Vault](https://docs.oracle.com/en-us/iaas/Content/KeyManagement/Concepts/keyoverview.htm). Compara detector y responder, secreto y clave, cifrado y autorización.
