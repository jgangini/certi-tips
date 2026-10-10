Operadora Horizonte puede localizar una columna llamada `estado`, pero necesita saber qué significa, quién responde por ella, cuándo cambió y qué reportes o agentes dependen de su contenido. El catálogo es útil cuando ayuda a resolver esas preguntas con evidencia.

## Conceptos Clave

Los **metadatos empresariales** describen significado, finalidad, propietario y reglas. Los **técnicos** describen esquemas, columnas, tipos y relaciones. Los **operativos** registran ejecución, fechas, resultados y actualización. Los tres se complementan: conocer el tipo de una columna no explica cómo usarla en una decisión.

Un **glosario** acuerda términos del negocio. Un **catálogo** permite organizar y descubrir activos. El **linaje** relaciona fuentes, transformaciones y resultados; el **impacto** ayuda a identificar qué podría verse afectado por un cambio. Una descripción sugerida por IA es un borrador hasta que un responsable valida su significado.

![Una Columna Necesita Tres Tipos de Contexto]({{base}}assets/diagrams/gov-metadata-concepts.svg "La columna estado_contrato necesita tres clases de contexto. El empresarial define «contrato vigente», propietario y uso. El técnico identifica tipo, columna y regla R-07. El operativo registra ejecución E-308, actualización y resultado del control. Relaciona los tres para interpretar el valor y comprobar cómo se produjo, sin confundir descripción con evidencia de ejecución.")

## Linaje, Impacto y Responsabilidad

El steward relaciona “contrato vigente” con las columnas y reglas que lo implementan. El ingeniero registra transformaciones y ejecuciones. El propietario aprueba la definición. Cuando una fuente cambia, el linaje ayuda a seguir su recorrido y el análisis de impacto identifica consumidores que deben revisar sus supuestos.

El alcance importa: un grafo que muestra una tabla y un notebook no demuestra que conozca todas las exportaciones, hojas de cálculo o consultas externas. La evidencia debe declarar sistemas cubiertos, granularidad y periodo capturado. Las dependencias conocidas fuera de la herramienta se documentan como parte del proceso.

![Procedencia e Impacto Recorren el Mismo Grafo]({{base}}assets/diagrams/gov-metadata-principles.svg "El grafo enlaza contratos de origen, regla R-07, métrica de clientes activos y contexto de atención. Recorre hacia atrás para estudiar procedencia y hacia delante para analizar impacto. La hoja exportada está fuera del alcance capturado. El propietario aprueba significado, el steward enlaza término y regla y el ingeniero conserva evidencia técnica; declara cobertura antes de atribuir relaciones al grafo.")

Horizonte registra propietario de la definición, responsable técnico del activo y steward que revisa el contexto. Esos roles pueden recaer en pocas personas, pero deben ser explícitos. El catálogo no debe convertirse en una lista de activos sin decisión ni mantenimiento.

## Catálogos y Linaje en Oracle

El **Master Catalog de Oracle AI Data Platform** organiza catálogos, esquemas y activos con permisos. El catálogo de Oracle Autonomous AI Database, accesible mediante **Data Studio de Oracle Autonomous AI Database y `DBMS_CATALOG`**, permite explorar y montar fuentes soportadas. **Oracle AI Data Catalog** proporciona un servicio de catálogo REST de Iceberg. Son capacidades relacionadas con interfaces y alcances distintos; no se debe dibujar sincronización total automática entre ellas.

![Tres Catálogos, Tres Alcances Que Comprobar]({{base}}assets/diagrams/gov-metadata-oracle.svg "Las filas comparan tres ámbitos: Master Catalog de Oracle AI Data Platform para catálogos, esquemas y activos; el catálogo federado de Oracle Autonomous AI Database para fuentes soportadas; y Oracle AI Data Catalog con interfaz REST de Iceberg. Comprueba objetos, interfaces, compatibilidad y permisos de cada integración. No deduzcas sincronización o acceso compartido por el hecho de que los tres sean catálogos.")

El **linaje de Oracle AI Data Platform en Preview** captura relaciones de ejecuciones soportadas, derivaciones de columnas y dependencias de Knowledge Bases. Muestra el último linaje capturado por proceso; no ofrece actualmente un historial completo. Data Studio de Oracle Autonomous AI Database también documenta linaje e impacto para flujos y cargas soportados.

Los catálogos y anotaciones actuales apoyan descripción y descubrimiento. Las iniciativas anunciadas de glosario u ontología empresarial no se presentan aquí como una capacidad nativa completa ya verificada. Horizonte puede gobernar su glosario como artefacto organizacional y relacionarlo con activos. En Oracle Data Transforms, las anotaciones se pueden importar, editar y propagar; las sugerencias IA necesitan revisión y control de cambios.

## Ejemplo Explicado

El equipo de Contratos quiere cambiar el significado de `estado=1`: antes significaba “vigente”; ahora incluiría “pendiente de activación”. El cambio conserva tipo y nombre, por lo que una comprobación exclusivamente técnica podría aceptarlo.

El steward consulta el significado aprobado y recorre dependencias: cálculo de clientes activos, reporte mensual y contexto utilizado por IA. El propietario decide separar los estados en lugar de ampliar silenciosamente el significado. Los equipos actualizan reglas y descripciones y registran la fecha efectiva.

![Cambiar el Significado Puede Romper la Métrica]({{base}}assets/diagrams/gov-metadata-example.svg "La propuesta mantiene estado = 1 y el mismo tipo de columna, pero amplía el significado de «vigentes» a «vigentes + pendientes». Ese cambio puede alterar clientes activos, reportes y respuestas de Atención sin modificar el esquema. El propietario debe resolver la definición, actualizar reglas y descripciones y registrar aprobación y fecha efectiva antes de aceptar el nuevo significado.")

La evidencia reúne definición anterior y nueva, consumidores revisados, aprobación y resultados de conciliación. Una mejora medible es reducir activos críticos sin propietario o términos aprobados sin enlace a su implementación, sin confundir cantidad de descripciones con calidad del gobierno.

## Errores Frecuentes

- **“Un catálogo crea automáticamente el glosario”.** Descubrir columnas no acuerda el significado empresarial.
- **“Todo linaje es histórico y completo”.** Deben declararse cobertura, granularidad y periodo capturado.
- **“La descripción IA ya está aprobada”.** La generación no reemplaza la validación del steward y propietario.

![Descubrir, Describir y Aprobar Son Estados Distintos]({{base}}assets/diagrams/gov-metadata-errors.svg "Los estados del activo son distintos. Encontrar una columna demuestra detección técnica. Una descripción sugerida por IA es un borrador pendiente de revisión. La definición empresarial necesita validación del propietario. El linaje observado solo demuestra el periodo y los sistemas capturados. No uses una de esas señales como prueba de aprobación o de historia completa.")

## Ejercicio de Decisión

Auditoría solicita reconstruir la transformación usada hace tres meses. El linaje Preview actual de Oracle AI Data Platform muestra la última ejecución y el notebook cambió varias veces. Decide si esa vista basta y qué evidencias adicionales necesita Horizonte.

<details>
<summary>Solución</summary>

La vista actual ayuda a comprender dependencias, pero no prueba la transformación histórica. Se requieren versión del notebook, identificador de ejecución, entradas y salidas relevantes, reglas vigentes y evidencia conservada para ese periodo. El responsable técnico reúne esos artefactos; el propietario confirma la definición entonces aplicable. Si falta evidencia, se registra la limitación sin reconstruirla como si hubiera sido capturada.

![El Último Grafo No Reconstruye el Pasado]({{base}}assets/diagrams/gov-metadata-exercise.svg "Para auditar una ejecución de hace tres meses reúne versiones de notebook y regla, identificador de ejecución, entradas, salidas y aprobación aplicable al periodo. El último linaje y el código actual explican relaciones presentes, pero no prueban aquella ejecución. Si falta evidencia histórica, registra la limitación y evita reconstruirla como si hubiera sido capturada.")

</details>

## Fuentes y Repaso

![La Trazabilidad Enlaza Significado y Ejecución]({{base}}assets/diagrams/gov-metadata-recap.svg "Sigue el término «contrato vigente» hasta contratos.estado, la regla R-07 versión 2, la ejecución E-308 y el indicador consumidor. Cada enlace conserva una versión relevante y un responsable: propietario, steward, ingeniería o dueño de la métrica. La trazabilidad permite relacionar significado aprobado, implementación y resultado, en lugar de conservar artefactos aislados.")

Fuentes revisadas al **9 de octubre de 2026**: [capacidades y catálogo de Oracle AI Data Platform](https://docs.oracle.com/en/cloud/paas/ai-data-platform/aidug/features-oracle-ai-data-platform.html), [Lineage (Preview)](https://docs.oracle.com/en/cloud/paas/ai-data-platform/aidug/lineage.html), [Catalog Navigator](https://docs.oracle.com/en/cloud/paas/autonomous-database/data-studio-guide/explore-data-catalog.html), [`DBMS_CATALOG`](https://docs.oracle.com/en/database/oracle/oracle-database/26/arpls/dbms_catalog.html), [Oracle AI Data Catalog](https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/oracle-ai-data-catalog.html) y [anotaciones](https://docs.oracle.com/en/database/data-integration/data-transforms/using/view-and-manage-annotations.html).
