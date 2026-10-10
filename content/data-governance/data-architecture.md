<span id="conceptos-clave"></span>La **arquitectura de datos** describe cómo se organizan, relacionan, almacenan y circulan los datos para atender necesidades de la organización. Una lista de servicios no explica quién origina un dato, cuál es la fuente autorizada, qué transformación cambia su significado ni qué consumidores dependen de él.

La arquitectura debe conectar el estado actual, el objetivo y una transición viable. No hace falta migrar todo para resolver un problema concreto. Si Horizonte necesita conciliar facturas diariamente, empieza por el flujo que permite esa conciliación, sus responsables y controles. Añadir datos sin consumidor ni propósito definido puede aumentar costo y exposición sin producir valor.

Conviene distinguir arquitectura conceptual —dominios y relaciones—, lógica —productos, contratos e interfaces— y física —servicios, formatos y despliegues—. Las tres vistas responden preguntas diferentes y deben conservar el mismo significado del negocio.

![Tres Vistas del Mismo Dato]({{base}}assets/diagrams/gov-data-architecture-concepts.svg "Las tres columnas describen al mismo cliente C7 con distinto nivel de detalle. La vista conceptual relaciona al cliente con sus contratos C2 y C3. La lógica define «cliente activo» como quien tiene al menos un contrato vigente en la fecha de corte, e identifica responsable y versión. La física representa el resultado con identificador, estado y fecha 30/09. Las tres vistas deben conservar el mismo significado de negocio.")

## Límites, Flujos y Decisiones

Para cada flujo pregunta: ¿quién produce?, ¿quién consume?, ¿qué propósito existe?, ¿cuál es la latencia máxima de actualización permitida?, ¿qué identidad consulta?, ¿qué ocurre al cambiar el esquema? Agrega requisitos de residencia, volumen, recuperación y costo cuando el caso los requiera. Un límite de dominio expresa responsabilidad; un límite de red expresa conectividad. No son equivalentes.

**Federar** permite consultar una fuente mediante una conexión, evitando una carga previa en el destino para ese acceso. Conserva dependencia de disponibilidad, rendimiento y permisos de la fuente. **Materializar** crea un resultado persistente útil para rendimiento, historial o desacoplamiento, pero obliga a gestionar actualización y ciclo de vida. **Compartir** concede acceso a un conjunto publicado bajo condiciones: no elimina la responsabilidad del receptor.

Elegir una alternativa no resuelve todas las consultas futuras. El cierre mensual puede necesitar una versión reproducible, mientras una consulta operativa necesita el estado actual. Diseñar ambos caminos es razonable si cada copia y conexión tiene un propósito claro.

![Elegir el Patrón de Acceso]({{base}}assets/diagrams/gov-data-architecture-principles.svg "Compara cada patrón por ubicación de los datos, conservación de historia y dependencias. Consultar en origen depende de la fuente, la red y sus permisos. Materializar conserva un resultado, pero exige actualizarlo y registrar versiones y reglas. Compartir añade condiciones para el receptor y puede combinarse con ambos caminos. Elige según el uso: consultar el presente y reproducir un cierre requieren evidencias distintas.")

<div id="arquitectura-con-oracle-ai-data-platform-y-oracle-autonomous-ai-lakehouse"></div>

## Arquitectura con Oracle Cloud

Oracle AI Data Platform aporta un entorno para catálogo, ingeniería, workflows y activos de IA. El **Master Catalog de Oracle AI Data Platform** registra y organiza metadatos. Los **catálogos externos** conectan fuentes compatibles; el acceso debe revisarse considerando las credenciales de la conexión y los permisos de la fuente. No presupongas que toda consulta se ejecuta allí con la identidad personal del consumidor. Consulta [catálogos externos](https://docs.oracle.com/en/cloud/paas/ai-data-platform/aidug/external-catalogs.html).

El motor Spark gestionado sirve para preparación y transformación. Oracle Autonomous AI Lakehouse permite organizar y consultar información curada para analítica y otros consumidores. Oracle Cloud Infrastructure Object Storage puede contener archivos y datos de etapas intermedias. Son responsabilidades complementarias: Oracle AI Data Platform no es otro nombre de Oracle Autonomous AI Lakehouse, y registrar un archivo no certifica su calidad.

Usa el [linaje de Oracle AI Data Platform](https://docs.oracle.com/en/cloud/paas/ai-data-platform/aidug/lineage.html) para recorrer las fuentes, transformaciones y consumidores registrados antes de cambiar un producto. Contrasta esas dependencias con el diseño de la arquitectura y avisa a los responsables afectados. La vista conserva la última captura de cada proceso; para reconstruir un cierre anterior, guarda también versiones de datos y código, identificadores y evidencia de ejecución. Así conectas el análisis de impacto con la continuidad del producto de datos.

Para usar Agent Flows y otras [funciones de IA](https://docs.oracle.com/en/cloud/paas/ai-data-platform/aidug/ai-feature-enablement.html), configura Oracle Autonomous AI Lakehouse 26ai o superior. La [memoria del agente](https://docs.oracle.com/en/cloud/paas/ai-data-platform/aidug/agent-memory.html) conserva el contexto de la sesión; la memoria persistente en Oracle AI Database 26ai del diagrama requiere una integración propia. El [procesamiento continuo](https://docs.oracle.com/en/cloud/paas/ai-data-platform/aidug/streaming.html) utiliza fuentes y destinos compatibles. Oracle Analytics Cloud accede mediante una [conexión configurada](https://docs.oracle.com/en/cloud/paas/ai-data-platform/aidug/connect-compute.html).

![Arquitectura de Datos e IA en Oracle Cloud]({{base}}assets/diagrams/gov-data-architecture-oracle.svg "La arquitectura parte de archivos en Oracle Cloud Infrastructure Object Storage y organiza Landing, Bronze, Silver y Gold en Oracle AI Data Platform Workbench. Master Catalog registra metadatos y el linaje permite revisar dependencias. Agent Flows usa modelos de Oracle Cloud Infrastructure Generative AI. La conexión marcada «Memory» propone memoria persistente en Oracle AI Database 26ai, que requiere una integración propia; la memoria de sesión es una función del agente. Las funciones de IA requieren Oracle Autonomous AI Lakehouse 26ai o superior. Streaming corresponde al procesamiento continuo de fuentes y destinos compatibles.")

## Ejemplo Explicado

Horizonte necesita dos resultados. Atención consulta contratos vigentes durante una llamada; Finanzas reproduce el cierre de septiembre. Para Atención se evalúa una consulta gobernada a la fuente, teniendo en cuenta carga y disponibilidad. Para Finanzas se conserva una versión del cierre con fecha de corte y reglas conocidas. «Todos los datos siempre en tiempo real» no satisface necesariamente el segundo caso.

En la vista técnica, Oracle AI Data Platform organiza conexiones y transformaciones; Oracle Autonomous AI Lakehouse publica el conjunto del cierre. El owner aprueba el significado del corte y el consumidor conoce su vigencia. Si cambia una relación entre cliente y contrato, se revisan las dependencias antes de modificar el producto. Acuerda la frescura requerida para Atención y el periodo de conservación para Finanzas; configura y prueba cada recorrido frente a esos criterios.

![Estado Actual y Cierre Histórico]({{base}}assets/diagrams/gov-data-architecture-example.svg "El contrato figura vigente en septiembre y suspendido en octubre. Atención puede consultar el estado actual, mientras Finanzas necesita reproducir el cierre del 30 de septiembre. El archivo del cierre conserva los datos, las reglas aplicadas y la fecha de corte. Así se puede reconstruir aquel resultado aunque el origen cambie; consultar solo el estado de octubre no explica el cierre anterior.")

## Errores Frecuentes

- **Confundir catálogo con almacenamiento universal.** Los metadatos pueden referenciar activos que siguen en sus fuentes.
- **Suponer que federar es gratis y sin carga.** La fuente, la red y el motor de consulta siguen trabajando.
- **Dibujar flechas sin contratos ni identidades.** Se oculta cómo se controla y mantiene cada intercambio.

## Ejercicio de Decisión

El director quiere reconstruir dentro de seis meses la cifra exacta del cierre. El equipo propone consultar siempre las tablas operativas actuales por federación. ¿Qué falta en esa propuesta?

<details>
<summary>Solución</summary>

Falta conservar el estado y las reglas que produjeron el cierre. Una consulta al estado actual puede devolver datos corregidos posteriormente. Se necesita una estrategia de versión o corte reproducible, metadatos de fecha y reglas, acceso apropiado y conservación acordada. La federación puede participar, pero no crea por sí sola ese historial.

![Reconstruir un Cierre]({{base}}assets/diagrams/gov-data-architecture-exercise.svg "El manifiesto identifica la versión de los datos, la regla aprobada y la fecha del cierre del 30 de septiembre, junto con las condiciones de acceso y conservación. La conexión punteada roja lleva a las entradas actuales, que seis meses después pueden haber cambiado y no garantizan el cierre histórico. La conexión continua lleva a las versiones conservadas. Usa las versiones conservadas que señala el manifiesto para reconstruir el resultado; si falta alguna, registra la limitación en lugar de presentar el estado actual como evidencia histórica.")

</details>
