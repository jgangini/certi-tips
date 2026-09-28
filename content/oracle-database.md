Los agentes necesitan información fiable y operaciones controladas. Oracle AI Database aporta capacidades cercanas a los datos: búsqueda vectorial, construcción de agentes, orquestación con Select AI Agent e integración mediante MCP. Cada una resuelve una parte distinta del problema.

## Conceptos clave

**AI Vector Search** encuentra elementos semánticamente próximos. **Private Agent Factory** ofrece construcción visual de agentes y workflows. **Select AI Agent** permite configurar agentes, tareas, herramientas y equipos mediante capacidades de la base de datos. El **MCP Server de Autonomous AI Database** expone herramientas para clientes compatibles. Una no sustituye automáticamente a las otras.

![Mapa de capacidades de Oracle AI Database: búsqueda vectorial, Private Agent Factory, Select AI Agent y exposición de herramientas mediante MCP.]({{base}}assets/diagrams/database-capabilities.svg)

## Objetivos del módulo

- Explicar embeddings, búsqueda por similitud y su diferencia frente a RAG.
- Recorrer preparación, almacenamiento, indexación y consulta de vectores.
- Elegir entre búsqueda, construcción visual, equipos de agentes y exposición MCP.
- Mantener permisos de datos aunque la consulta llegue en lenguaje natural.

## Vectores y similitud

Un **embedding** representa datos mediante una lista de números generada por un modelo. Su utilidad depende de que relaciones relevantes se reflejen en ese espacio. Dos frases pueden tratar sobre lo mismo sin compartir palabras exactas, y una búsqueda semántica puede recuperar esa relación.

El modelo de embeddings de documentos y consultas debe producir representaciones compatibles: cambiar dimensiones o modelo sin regenerar y validar los datos rompe la comparación. La métrica de distancia también importa. **Cosine** se centra en la orientación; Euclidean mide separación geométrica. Elige la métrica recomendada para el modelo y verifica su comportamiento con ejemplos de tu dominio.

La columna **VECTOR** permite almacenar embeddings junto a identificadores, texto, precios o permisos. La búsqueda vectorial puede combinarse con filtros relacionales. “Semánticamente parecido” no significa “verdadero” ni “autorizado”; aplica restricciones de acceso antes de proporcionar documentos al modelo.

## Workflow de búsqueda vectorial

![Flujo de documentos a fragmentos, embeddings, almacenamiento e índice, consulta semántica y respuesta RAG con fuentes.]({{base}}assets/diagrams/vector-search.svg)

1. Prepara contenido y divídelo en fragmentos comprensibles, preservando origen y metadatos.
2. Genera embeddings mediante un modelo compatible, dentro de la base con ONNX cuando corresponda o mediante un servicio externo.
3. Guarda los vectores junto con los datos de negocio y sus identificadores.
4. Evalúa si conviene crear un índice vectorial: **HNSW** usa una estructura de grafo e **IVF** agrupa vectores en particiones. Un índice acelera ciertos escenarios, con compromisos de recursos y recuperación.
5. Genera el embedding de la consulta, busca similitud y aplica filtros SQL. Si construyes RAG, entrega los fragmentos pertinentes al LLM para formular una respuesta con fuentes.

Este recorrido se apoya en el [workflow oficial de AI Vector Search](https://docs.oracle.com/en/database/oracle/oracle-database/26/vecse/oracle-ai-vector-search-workflow.html). Indexar es opcional según escala y objetivo; una búsqueda exacta puede ser útil como referencia. RAG añade generación sobre contenido recuperado: no es otro nombre para guardar vectores.

## Ejemplo paso a paso

Una tienda tiene descripciones de mochilas y el usuario pide “una mochila ligera para llevar laptop, por menos de 200 soles”.

Primero, conserva descripción, precio, categoría y embedding de cada producto. Convierte la petición en un vector compatible con los existentes. Recupera candidatos semánticamente próximos y filtra precio y disponibilidad con datos estructurados. Ordena y verifica que la descripción realmente mencione espacio para laptop. Por último, presenta opciones y sus atributos respaldados por la tabla.

Prueba también una consulta sin coincidencias y un producto que está semánticamente cerca pero supera el precio. La respuesta correcta puede ser “no encontré una opción que cumpla ambas condiciones”. La similitud no autoriza a ignorar restricciones ni inventar stock.

## Private Agent Factory

Agent Factory ofrece agentes preparados y un constructor visual para conectar fuentes, modelos y herramientas. En las notas del curso se trabajan especialmente **Knowledge Agent**, orientado a contenido documental, y **Data Analysis Agent**, orientado a datos estructurados. La documentación de la versión 26.7 también incluye **Deep Data Research Agent**; evita memorizar un número de agentes como si nunca cambiara. Consulta su [introducción oficial](https://docs.oracle.com/en/database/oracle/agent-factory/26.7/paias/introduction.html).

Para un asistente de políticas, configura una fuente aprobada, comprueba ingestión, formula preguntas con respuesta conocida y revisa citas. Para análisis, verifica tablas permitidas y significado de columnas. El constructor visual facilita el ensamblaje, pero todavía requiere control de acceso, pruebas y despliegue. “Private” no demuestra que todos los modelos estén alojados en tu red: revisa los endpoints y recorridos de datos configurados.

## Select AI Agent

Select AI Agent articula **tools**, **tasks**, **agents** y **teams**. Una herramienta ofrece una operación; una tarea define trabajo; un agente la realiza con sus capacidades; un equipo coordina aportes. Puede haber un orden secuencial o un supervisor que seleccione tareas. Las vistas de historial ayudan a observar ejecuciones, según los [conceptos oficiales](https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/select-ai-agents-concepts.html).

El paquete `DBMS_CLOUD_AI_AGENT` administra estas capacidades y los perfiles de IA configuran el acceso al modelo. Que el agente esté integrado con la base no significa que los pesos del LLM estén alojados dentro del motor. No confundas ese caso con ejecutar un modelo de embeddings ONNX admitido dentro de la base.

## MCP en Autonomous AI Database

El servidor gestionado permite descubrir e invocar herramientas Select AI Agent desde aplicaciones MCP compatibles. La identidad y controles de base de datos siguen siendo relevantes: credenciales, roles, políticas de filas, red y auditoría delimitan acceso. Un perfil con contexto de esquema ayuda a generar consultas, pero no garantiza SQL correcto ni sustituye permisos. La [arquitectura oficial del servidor](https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/about-mcp-server.html) describe estas capas.

## Errores frecuentes

- Considerar un embedding una copia legible del documento.
- Suponer que un índice aproximado siempre recupera exactamente los mismos vecinos que una búsqueda exacta.
- Confundir generación de SQL con autorización para ejecutarlo.
- Afirmar que usar un modelo local elimina toda latencia.

## Ejercicio de selección

Quieres que dos aplicaciones externas consulten una función autorizada de inventario sin alojar otro servidor MCP. ¿Qué capacidad encaja, y qué no debes dar por hecho?

<details>
<summary>Ver solución y explicación</summary>

El MCP Server gestionado de Autonomous AI Database puede exponer herramientas del framework Select AI Agent, según versión y configuración compatibles. Aun así debes definir la herramienta, permisos, identidad y conectividad de los clientes. El protocolo no garantiza que cada usuario pueda consultar cualquier inventario ni convierte una función de lectura en una autorización de escritura.

</details>

## Fuentes y repaso

Vuelve a [AI Vector Search](https://docs.oracle.com/en/database/oracle/oracle-database/26/vecse/oracle-ai-vector-search-workflow.html), [Agent Factory](https://docs.oracle.com/en/database/oracle/agent-factory/26.7/paias/introduction.html), [Select AI Agent](https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/select-ai-agents-concepts.html) y [Autonomous MCP Server](https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/about-mcp-server.html). Para cerrar el módulo, asigna una capacidad a cada necesidad: buscar, ensamblar, orquestar o exponer herramientas.
