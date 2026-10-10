<span id="conceptos-clave"></span>El **gobierno de datos** establece quién puede decidir sobre los datos, con qué criterios y cómo rendirá cuentas. La **gestión de datos** ejecuta esas decisiones: modelar, integrar, proteger, mantener y mejorar. Una organización necesita ambas. Un comité que nunca cambia una práctica aporta poco; una plataforma eficiente sin criterios compartidos puede multiplicar errores.

El dato tiene valor dentro de un propósito. El mismo historial de facturas puede servir para conciliación, atención o predicción de abandono, pero cada uso necesita una justificación, una definición de calidad y accesos adecuados. Por eso no basta con declarar que «los datos pertenecen a todos». Conviene reconocer un dominio, sus responsables y los consumidores autorizados.

![Tres niveles: gobierno, gestión y valor]({{base}}assets/diagrams/gov-governance-concepts.svg "La base representa el gobierno: el propietario del dominio decide los usos permitidos y responde por ellos. La gestión convierte esas decisiones en tareas de modelado, integración, protección y operación, coordinadas por el steward y el custodio. En la cima, el negocio utiliza los datos para tomar decisiones y desarrollar aplicaciones de IA. Las tarjetas resumen quién decide, quién ejecuta y para qué.")

## Decisiones, Roles y Evidencias

El **data owner** responde por decisiones del dominio: significado, usos aceptados y prioridades. El **data steward** coordina definiciones, problemas de calidad y acuerdos cotidianos. El **custodio técnico** implementa controles y operación. Un consumidor cumple condiciones de uso y comunica problemas. Son responsabilidades; una empresa pequeña puede reunir varias en una persona, documentando posibles conflictos.

En la matriz RACI, las filas son tareas y las columnas son roles. Las letras indican la responsabilidad de cada rol en cada tarea: **A** responde por la decisión, **R** ejecuta, **C** es consultado e **I** recibe información. Un rol puede tener letras distintas según la fila. En este ejemplo, el steward ejecuta al definir el uso (R) y es consultado al aplicar permisos (C); el custodio ejecuta esta última tarea (R). El propietario responde por la decisión (A) en las cuatro filas.

Para aprobar la definición de «cliente activo», Comercial y Finanzas pueden aportar criterios; el responsable designado decide para el propósito acordado. El administrador del catálogo publica la definición aprobada, pero su permiso técnico no lo convierte en dueño del significado.

Una política útil contiene alcance, regla, responsable, excepciones y evidencia. «Solo personal autorizado» es insuficiente sin un criterio de autorización. «Analistas del dominio pueden consultar facturas agregadas para planificación, con revisión trimestral de accesos» se puede traducir en controles. La frecuencia es un ejemplo de Horizonte, no una exigencia universal.

![Matriz de Cuatro Tareas y Cuatro Responsabilidades]({{base}}assets/diagrams/gov-governance-principles.svg "En Horizonte se quiere dar a los analistas acceso a facturas agregadas. Lee la fila «Aplicar permisos» de izquierda a derecha: el propietario (A) aprueba el alcance y responde por la decisión; el steward (C) es consultado para comprobar que los datos y su uso cumplen lo acordado; el custodio (R) configura los permisos; el consumidor (I) recibe la información para usar el acceso autorizado. En «Definir el uso», R está bajo Steward porque esa tarea la ejecuta él. Las letras cambian según la tarea, no según el nombre del cargo. Esta matriz sirve para acordar quién hace cada acción y a quién acudir si falta una aprobación, hay dudas sobre el uso o falla el acceso.")

## Gobierno de Datos en Oracle Cloud

<span id="gobierno-con-oracle-ai-data-platform-y-oracle-autonomous-ai-lakehouse"></span>**Oracle AI Data Platform** reúne catálogo, ingeniería de datos y activos de IA. El Master Catalog de Oracle AI Data Platform organiza activos; RBAC controla acciones y Audit Logs aporta evidencia. **Oracle Autonomous AI Lakehouse** ofrece la base de datos analítica donde pueden residir productos de datos curados. La plataforma permite materializar decisiones organizativas; no crea automáticamente el mandato de un comité ni una política aceptada por el negocio.

El acceso al workspace y el acceso a datos son ámbitos distintos. Un equipo puede colaborar en archivos sin recibir lectura de todas las tablas. El rol AUDITOR facilita revisar actividad sin asumir toda la operación. Estas separaciones permiten representar responsabilidades del programa, aunque la equivalencia exacta entre cargo y rol técnico debe diseñarse. Consulta el [modelo de seguridad y auditoría de Oracle AI Data Platform](https://blogs.oracle.com/ai-data-platform/security-and-auditability-in-ai-data-platform-workbench).

![Acceso a Contratos: Aprobación, Permisos y Publicación]({{base}}assets/diagrams/gov-governance-oracle.svg "En Horizonte se autoriza consultar contratos vigentes para atender clientes. El propietario aprueba la finalidad, los datos necesarios y cuándo se revisará ese uso; el equipo configura en Oracle AI Data Platform el contexto del activo, las acciones permitidas por rol y los registros de auditoría disponibles. La flecha inferior indica la publicación del producto en Oracle Autonomous AI Lakehouse: hay que configurar la conexión y verificar los permisos allí. El gráfico ayuda a convertir una decisión del negocio en controles concretos y a comprobar el acceso antes de poner el producto a disposición de sus consumidores.")

## Ejemplo Explicado

Horizonte descubre que dos informes difieren: uno cuenta contratos vigentes y otro personas con una factura reciente. Ambos pueden ser correctos para preguntas diferentes. El steward documenta las definiciones; los dueños acuerdan nombres distintos y señalan sus usos. El indicador «clientes con contrato vigente» deja de confundirse con «clientes facturados en el periodo».

Después se publica el producto correspondiente, se asigna un responsable y se restringe su consumo al propósito autorizado. El equipo verifica que el tablero utiliza la definición aprobada. Si cambia una regla, registra la decisión, evalúa consumidores afectados y comunica la nueva versión. La evidencia incluye la aprobación de negocio y los cambios técnicos; un log de acceso no reemplaza el acta de decisión.

![Dos Definiciones de Cliente Activo]({{base}}assets/diagrams/gov-governance-example.svg "Cada letra representa un cliente ficticio de Horizonte. Comercial cuenta a quienes tienen contrato vigente: A y B. Finanzas cuenta a quienes fueron facturados en el periodo: B y C. B cumple ambas reglas y aparece en la intersección; A solo cumple la primera y C solo la segunda. Los dos indicadores cuentan dos clientes, pero incluyen personas distintas. Por eso hay que acordar la regla, el nombre y el responsable de cada indicador antes de comparar sus resultados.")

## Errores Frecuentes

- **Comprar una herramienta y dar por creado el gobierno.** Aún faltan autoridad, procesos, prioridades y medición del resultado.
- **Hacer al administrador responsable de todo.** Poder cambiar una tabla no otorga autoridad sobre todas las decisiones de negocio.
- **Medir solo cantidad de activos catalogados.** Añade indicadores útiles: incidentes recurrentes, tiempo de resolución o productos con definición y responsable aceptados.

## Ejercicio de Decisión

Un área pide acceso completo al historial de clientes para un nuevo asistente. El administrador puede concederlo hoy, pero el propósito y los datos mínimos no están definidos. ¿Quién debe decidir y qué evidencia debe acompañar la autorización?

<details>
<summary>Solución</summary>

El owner evalúa el uso con los responsables pertinentes; el steward ayuda a precisar datos, definiciones y restricciones. El custodio implementa el alcance aprobado. La solicitud debe registrar propósito, consumidores, datos mínimos, vigencia y revisión. Si la información es insuficiente, se aclara antes de conceder acceso. La urgencia técnica no sustituye la decisión sobre el uso.

![Completar Antes de Autorizar]({{base}}assets/diagrams/gov-governance-exercise.svg "En Horizonte, un asistente solicita acceso completo al historial de clientes, pero aún no se han definido el propósito ni los datos mínimos. La ruta «No» devuelve la solicitud para precisar propósito, alcance y vigencia. Cuando el alcance está completo, el propietario evalúa y aprueba el uso; el custodio aplica los permisos autorizados y se acuerda una revisión. La autorización debe registrar esas condiciones para comprobar que el acceso corresponde al uso aprobado.")

</details>

<span id="fuentes-y-repaso"></span>

