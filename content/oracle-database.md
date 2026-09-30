Los agentes necesitan información fiable y operaciones controladas. Oracle AI Database aporta capacidades cercanas a los datos: búsqueda vectorial, construcción de agentes, orquestación con Select AI Agent e integración mediante MCP. Cada una resuelve una parte distinta del problema.

## Conceptos clave

**AI Vector Search** encuentra elementos semánticamente próximos. **Private Agent Factory** ofrece construcción visual de agentes y workflows. **Select AI Agent** permite configurar agentes, tareas, herramientas y equipos mediante capacidades de la base de datos. El **MCP Server de Autonomous AI Database** expone herramientas para clientes compatibles. Una no sustituye automáticamente a las otras.

![Mapa de capacidades de Oracle AI Database: búsqueda vectorial, Private Agent Factory, Select AI Agent y exposición de herramientas mediante MCP.]({{base}}assets/diagrams/database-capabilities.svg "Cuatro capacidades, cuatro responsabilidades distintas.")

## Objetivos del módulo

- Explicar embeddings, búsqueda por similitud y su diferencia frente a RAG.
- Recorrer preparación, almacenamiento, indexación y consulta de vectores.
- Elegir entre búsqueda, construcción visual, equipos de agentes y exposición MCP.
- Mantener permisos de datos aunque la consulta llegue en lenguaje natural.

![Recorrido de aprendizaje desde representar significado con embeddings hasta recuperar evidencia, elegir una capacidad y comprobar permisos.]({{base}}assets/diagrams/database-objectives.svg "Del significado a una operación autorizada.")

## Vectores y similitud

Un **embedding** representa datos mediante una lista de números generada por un modelo. Su utilidad depende de que relaciones relevantes se reflejen en ese espacio. Dos frases pueden tratar sobre lo mismo sin compartir palabras exactas, y una búsqueda semántica puede recuperar esa relación.

Para texto, el recorrido es **texto → tokenizador → modelo → vector**. Los tokens pueden ser palabras o partes de palabras: contar palabras no equivale a contar tokens. Si se supera el límite de entrada del modelo, puede truncarse contenido; por eso dividimos documentos largos antes de generar embeddings. Ajusta tamaño y **solapamiento** entre fragmentos para conservar contexto y comprueba la recuperación con preguntas representativas, sin aplicar un número universal. Oracle explica estas [transformaciones](https://docs.oracle.com/en/database/oracle/oracle-database/26/vecse/understand-stages-data-transformations.html) y los [parámetros de fragmentación](https://docs.oracle.com/en/database/oracle/oracle-database/26/vecse/utl_to_chunks-dbms_vector_chain.html).

El modelo de embeddings de documentos y consultas debe producir representaciones compatibles: cambiar dimensiones o modelo sin regenerar y validar los datos rompe la comparación. La métrica de distancia también importa. **Cosine** se centra en la orientación; Euclidean mide separación geométrica. Elige la métrica recomendada para el modelo y verifica su comportamiento con ejemplos de tu dominio.

La columna **VECTOR** permite almacenar embeddings junto a identificadores, texto, precios o permisos. La búsqueda vectorial puede combinarse con filtros relacionales. “Semánticamente parecido” no significa “verdadero” ni “autorizado”; aplica restricciones de acceso antes de proporcionar documentos al modelo.

![Mapa conceptual en dos dimensiones: mochila y bolso para laptop quedan cerca de la consulta, mientras una bicicleta queda lejos; cosine compara orientación y Euclidean separación geométrica.]({{base}}assets/diagrams/database-similarity.svg "La similitud compara representaciones compatibles.")

## Workflow de búsqueda vectorial

![Flujo de documentos a fragmentos, embeddings, almacenamiento e índice opcional, consulta semántica y respuesta RAG con fuentes.]({{base}}assets/diagrams/vector-search.svg "Preparar, recuperar y, si hace falta, generar con RAG.")

1. Prepara contenido y divídelo en fragmentos comprensibles, preservando origen y metadatos.
2. Genera embeddings mediante un modelo compatible, dentro de la base con ONNX cuando corresponda o mediante un servicio externo.
3. Guarda los vectores junto con los datos de negocio y sus identificadores.
4. Evalúa si conviene crear un índice vectorial: **HNSW** usa una estructura de grafo e **IVF** agrupa vectores en particiones. Un índice acelera ciertos escenarios, con compromisos de recursos y recuperación.
5. Genera el embedding de la consulta, busca similitud y aplica filtros SQL. Si construyes RAG, entrega los fragmentos pertinentes al LLM para formular una respuesta con fuentes.

Este recorrido se apoya en el [workflow oficial de AI Vector Search](https://docs.oracle.com/en/database/oracle/oracle-database/26/vecse/oracle-ai-vector-search-workflow.html). Indexar es opcional según escala y objetivo; una búsqueda exacta puede ser útil como referencia. RAG añade generación sobre contenido recuperado: no es otro nombre para guardar vectores.

En una implementación, `DBMS_VECTOR_CHAIN` permite encadenar `UTL_TO_TEXT` para extraer texto, `UTL_TO_CHUNKS` para dividirlo y `UTL_TO_EMBEDDINGS` para producir vectores: la salida de cada etapa alimenta la siguiente. Debes configurar el modelo y comprobar los requisitos de Oracle Text y del proveedor elegido; la [guía de utilidades](https://docs.oracle.com/en/database/oracle/oracle-database/26/vecse/dbms_vector_chain-vecse.html) detalla estas condiciones.

## Ejemplo paso a paso

Una tienda tiene descripciones de mochilas y el usuario pide “una mochila ligera para llevar laptop, por menos de 200 soles”.

Primero, conserva descripción, precio, categoría y embedding de cada producto. Convierte la petición en un vector compatible con los existentes. Recupera candidatos semánticamente próximos y filtra precio y disponibilidad con datos estructurados. Ordena y verifica que la descripción realmente mencione espacio para laptop. Por último, presenta opciones y sus atributos respaldados por la tabla.

Este SQL didáctico supone una tabla `productos`, su columna `embedding` de tipo `VECTOR` y el vector de consulta enlazado como `:query_embedding`. Usa `COSINE` solo si corresponde al modelo; `FETCH EXACT` hace explícita la búsqueda exacta de los tres vecinos más próximos que cumplen los filtros. Consulta la [sintaxis oficial de búsqueda exacta](https://docs.oracle.com/en/database/oracle/oracle-database/26/vecse/perform-exact-similarity-search.html).

```sql
SELECT nombre, precio, descripcion
FROM productos
WHERE precio < 200 AND stock > 0
ORDER BY VECTOR_DISTANCE(embedding, :query_embedding, COSINE)
FETCH EXACT FIRST 3 ROWS ONLY;
```

Prueba también una consulta sin coincidencias y un producto que está semánticamente cerca pero supera el precio. La respuesta correcta puede ser “no encontré una opción que cumpla ambas condiciones”. La similitud no autoriza a ignorar restricciones ni inventar stock.

![Ejemplo ilustrativo de una búsqueda de mochilas: un producto cercano y disponible por 180 soles pasa; otro por 240 soles se descarta por precio y otro sin stock se descarta por disponibilidad.]({{base}}assets/diagrams/database-product-search.svg "La coincidencia semántica también debe cumplir los filtros.")

## Una solución completa: responder con evidencia

![De la pregunta a una respuesta con evidencia: la aplicación valida el acceso, recupera documentos mediante búsqueda vectorial o datos mediante SQL, y entrega el contexto al modelo antes de responder.]({{base}}assets/illustrations/grounded-answer-v2.png "La recuperación usa documentos o SQL según la pregunta y los permisos.")

Las dos ramas resuelven necesidades diferentes. La **búsqueda semántica** recupera fragmentos relevantes para fundamentar una respuesta; una **consulta SQL** obtiene resultados estructurados, por ejemplo el estado y el importe de un pedido. Ambas requieren controlar qué datos puede consultar la identidad que ejecuta la operación. Cambiar datos o ejecutar una acción de negocio exige además una herramienta autorizada y sus validaciones.

**Cómo leer la imagen:** para “¿qué política aplica?” elige recuperación documental; para “¿cuánto pagó este cliente?” identifica la consulta estructurada. Los conectores representan relaciones de consulta y respuesta, no una secuencia rígida. El modelo no recibe acceso directo irrestricto a la base, ni esta vista implica que el LLM se ejecute dentro de Oracle AI Database.

## Private Agent Factory

Agent Factory ofrece agentes preparados y un constructor visual para conectar fuentes, modelos y herramientas. En las notas del curso se trabajan especialmente **Knowledge Agent**, orientado a contenido documental, y **Data Analysis Agent**, orientado a datos estructurados. La documentación de la versión 26.7 también incluye **Deep Data Research Agent**; evita memorizar un número de agentes como si nunca cambiara. Consulta su [introducción oficial](https://docs.oracle.com/en/database/oracle/agent-factory/26.7/paias/introduction.html).

Para un asistente de políticas, configura una fuente aprobada, comprueba ingestión, formula preguntas con respuesta conocida y revisa citas. Para análisis, verifica tablas permitidas y significado de columnas. El constructor visual facilita el ensamblaje, pero todavía requiere control de acceso, pruebas y despliegue. “Private” no demuestra que todos los modelos estén alojados en tu red: revisa los endpoints y recorridos de datos configurados.

Reproduce primero el circuito mínimo: **Chat Input → Agent con un LLM configurado → Chat Output**. Conecta salidas y entradas compatibles; sin una fuente o herramienta adicional, ese flujo no consulta tus datos de negocio. Los [componentes oficiales](https://docs.oracle.com/en/database/oracle/agent-factory/26.7/paias/agent-builder-components.html) explican esas conexiones. Guarda y prueba en **Playground**; después publica el flujo y configura la autenticación del endpoint para invocarlo desde otra aplicación, siguiendo la [guía de Agent Builder](https://docs.oracle.com/en/database/oracle/agent-factory/26.7/paias/agent-builder.html).

![Private Agent Factory separa dos casos del curso: documentos hacia Knowledge Agent y respuestas con citas; tablas hacia Data Analysis Agent y resultados estructurados. Agent Builder permite ensamblar, probar y publicar flujos propios.]({{base}}assets/diagrams/database-agent-factory.svg "Elige fuentes y capacidades antes de ensamblar el agente.")

## Select AI Agent

Select AI Agent articula **tools**, **tasks**, **agents** y **teams**. Una herramienta ofrece una operación; una tarea define trabajo; un agente la realiza con sus capacidades; un equipo coordina aportes. Puede haber un orden secuencial o un supervisor que seleccione tareas. Las vistas de historial ayudan a observar ejecuciones, según los [conceptos oficiales](https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/select-ai-agents-concepts.html).

El paquete `DBMS_CLOUD_AI_AGENT` administra estas capacidades y los perfiles de IA configuran el acceso al modelo. Que el agente esté integrado con la base no significa que los pesos del LLM estén alojados dentro del motor. No confundas ese caso con ejecutar un modelo de embeddings ONNX admitido dentro de la base.

![Select AI Agent organiza un equipo, agentes, tareas y herramientas; el perfil de IA conecta con el modelo configurado y el historial permite revisar ejecuciones.]({{base}}assets/diagrams/database-select-agent.svg "Equipos, agentes, tareas y herramientas tienen funciones distintas.")

## MCP en Autonomous AI Database

El servidor gestionado permite descubrir e invocar herramientas Select AI Agent desde aplicaciones MCP compatibles. La identidad y controles de base de datos siguen siendo relevantes: credenciales, roles, políticas de filas, red y auditoría delimitan acceso. Un perfil con contexto de esquema ayuda a generar consultas, pero no garantiza SQL correcto ni sustituye permisos. La [arquitectura oficial del servidor](https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/about-mcp-server.html) describe estas capas.

Distingue tres implementaciones de tools: una herramienta **SQL** usa un perfil NL2SQL para traducir preguntas; una herramienta **RAG** recupera conocimiento mediante búsqueda vectorial; una herramienta personalizada llama a una **función PL/SQL**, por ejemplo para consultar inventario. Se registran mediante `DBMS_CLOUD_AI_AGENT.CREATE_TOOL`, según sus [tipos y requisitos](https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/dbms-cloud-ai-agent-package.html). Generar SQL no autoriza su ejecución: la aplicación y la herramienta deben limitar las acciones habilitadas, y la base aplica los privilegios de la identidad ejecutora. Comprueba qué herramientas registradas quedan [expuestas por MCP](https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/use-mcp-server.html).

![Dos clientes MCP se conectan por HTTPS al servidor gestionado de Autonomous AI Database, que expone herramientas Select AI Agent; identidad, roles y políticas delimitan las operaciones sobre los datos.]({{base}}assets/diagrams/database-mcp.svg "MCP conecta aplicaciones con herramientas de datos autorizadas.")

## Errores frecuentes

- Considerar un embedding una copia legible del documento.
- Suponer que un índice aproximado siempre recupera exactamente los mismos vecinos que una búsqueda exacta.
- Confundir generación de SQL con autorización para ejecutarlo.
- Afirmar que usar un modelo local elimina toda latencia.

![Cuatro confusiones y sus correcciones: embedding no es texto legible; índice aproximado no equivale a resultado exacto; SQL generado no concede permisos; ejecución local todavía consume tiempo.]({{base}}assets/diagrams/database-misconceptions.svg "Distingue representación, recuperación, autorización y ejecución.")

## Ejercicio de selección

Quieres que dos aplicaciones externas consulten una función autorizada de inventario sin alojar otro servidor MCP. ¿Qué capacidad encaja, y qué no debes dar por hecho?

<details>
<summary>Ver solución y explicación</summary>

El MCP Server gestionado de Autonomous AI Database puede exponer herramientas del framework Select AI Agent, según versión y configuración compatibles. Aun así debes definir la herramienta, permisos, identidad y conectividad de los clientes. El protocolo no garantiza que cada usuario pueda consultar cualquier inventario ni convierte una función de lectura en una autorización de escritura.

![Solución: dos aplicaciones usan el servidor MCP gestionado para invocar una herramienta de lectura de inventario con permisos; una petición de escritura queda fuera de esa autorización.]({{base}}assets/diagrams/database-exercise.svg "Compartir una herramienta de lectura no concede permiso de escritura.")

</details>

## Fuentes y repaso

Vuelve a [AI Vector Search](https://docs.oracle.com/en/database/oracle/oracle-database/26/vecse/oracle-ai-vector-search-workflow.html), [Agent Factory](https://docs.oracle.com/en/database/oracle/agent-factory/26.7/paias/introduction.html), [Select AI Agent](https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/select-ai-agents-concepts.html) y [Autonomous MCP Server](https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/about-mcp-server.html). Para cerrar el módulo, asigna una capacidad a cada necesidad: buscar, ensamblar, orquestar o exponer herramientas.

![Árbol de repaso: buscar por significado lleva a AI Vector Search; ensamblar visualmente a Private Agent Factory; coordinar tareas a Select AI Agent; conectar clientes a Autonomous MCP Server.]({{base}}assets/diagrams/database-recap.svg "Parte de la necesidad y elige la capacidad adecuada.")
