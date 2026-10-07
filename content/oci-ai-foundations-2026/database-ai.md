Los vectores ayudan a recuperar información por significado; los agentes coordinan herramientas para una meta. Oracle AI Database permite acercar ambas capacidades a los datos de negocio.

**Objetivos:** seguir el workflow vectorial; distinguir búsqueda exacta y aproximada; seleccionar Private Agent Factory o Select AI Agent según el caso; y explicar qué aporta MCP sin atribuirle permisos automáticos.

## Conceptos clave

Un **embedding** es una representación numérica producida por un modelo. AI Vector Search permite guardarla junto con el texto y atributos del negocio en una columna `VECTOR`. Una consulta puede combinar similitud y condiciones como sede, categoría o disponibilidad. No exige que copies toda la información a un motor vectorial separado.

![Flujo de documento, embedding, almacenamiento y recuperación por similitud.]({{base}}assets/diagrams/aif-database-concepts.svg "La búsqueda compara representaciones y devuelve candidatos relevantes.")

**Select AI** ayuda a consultar con lenguaje natural. **Select AI Agent** coordina agentes, tareas y herramientas. **Private Agent Factory** ofrece un entorno visual para construir agentes. Un **servidor MCP** expone herramientas a clientes compatibles. Estas capacidades se complementan, pero no son nombres intercambiables.

## Workflow de AI Vector Search

1. Extrae texto o prepara la modalidad compatible con tu modelo.
2. Divide documentos largos en fragmentos coherentes; conserva origen y contexto suficiente.
3. Genera embeddings con un modelo compatible, local mediante ONNX o externo según la configuración.
4. Almacena vectores, texto y metadatos. Evalúa índices cuando la escala lo requiera.
5. Genera la representación de consulta, aplica filtros y ordena por distancia.
6. Si necesitas una respuesta RAG, pasa los fragmentos pertinentes al LLM y comprueba las citas.

![Pipeline de transformación y búsqueda vectorial junto con datos de negocio.]({{base}}assets/diagrams/aif-database-workflow.svg "Recuperación y generación son etapas separadas del recorrido.")

`VECTOR_EMBEDDING` genera representaciones con un modelo configurado; `VECTOR_DISTANCE` permite comparar vectores. `DBMS_VECTOR_CHAIN` incluye utilidades como `UTL_TO_TEXT`, `UTL_TO_CHUNKS` y `UTL_TO_EMBEDDINGS`. El tamaño de fragmento depende del modelo y de la tarea, no de un límite universal de 512 tokens.

**HNSW** significa Hierarchical Navigable Small World y usa una estructura de grafo; **IVF** organiza vectores en particiones. La búsqueda aproximada intercambia velocidad y recuperación de vecinos; una búsqueda exacta sirve como referencia. La precisión objetivo no promete un número fijo de aciertos en cada resultado. Usa la métrica recomendada para el modelo y el índice.

## Agent Factory, Select AI Agent y MCP

**Knowledge Agent** está orientado a preguntas sobre contenido documental; **Data Analysis Agent**, a datos estructurados y análisis. Private Agent Factory ofrece un constructor de flujos con modelos y herramientas, pruebas en Playground y publicación de un endpoint. Las fuentes, credenciales y permisos siguen requiriendo configuración. El conjunto de agentes preparados evoluciona con la versión.

![Mapa de búsqueda vectorial, Agent Factory, Select AI Agent y servidor MCP.]({{base}}assets/diagrams/aif-database-capabilities.svg "Elige si necesitas recuperar, construir visualmente, orquestar o conectar.")

**Select AI Agent** relaciona tools, tasks, agents y teams mediante interfaces como `DBMS_CLOUD_AI_AGENT`. Puede combinar recuperación, NL2SQL y funciones PL/SQL registradas. Una tarea expresa trabajo; una herramienta expone una operación; un equipo coordina agentes. Estar cerca de los datos reduce algunos movimientos, pero llamar a un LLM o API externa sigue siendo un flujo de datos que debes revisar.

El servidor MCP gestionado de Autonomous AI Database permite acceder a herramientas registradas desde un cliente compatible mediante HTTPS y Streamable HTTP. Autenticación, privilegios, políticas de filas, red y auditoría delimitan acceso. Revisa qué herramientas se exponen y con qué identidad; descubrir una herramienta no autoriza cualquier uso.

## Ejemplo paso a paso

Un empleado pide «Encuentra el manual para este fallo y dime las órdenes abiertas del equipo».

1. Recupera fragmentos del manual mediante búsqueda semántica, restringida a documentos autorizados.
2. Consulta órdenes por el identificador exacto del equipo. No uses similitud para decidir de qué equipo son.
3. Entrega fragmentos y filas pertinentes al agente, conservando procedencia.
4. El agente explica la recomendación y el estado de órdenes con referencias.
5. Si se solicita cerrar una orden, usa una herramienta distinta con validación de la operación y confirmación conforme a la política.

![Ejemplo de recuperación de manuales, consulta de órdenes y acción controlada.]({{base}}assets/diagrams/aif-database-example.svg "Similitud para el manual; identidad exacta para la orden; permisos para modificar.")

Una búsqueda semántica puede recuperar un manual equivocado de un modelo parecido. Comprueba metadatos y compatibilidad del equipo antes de convertir el resultado en una instrucción operativa.

## Errores frecuentes

- Confundir Vector Search con generación de texto o con un agente completo.
- Cambiar el modelo de embedding de las consultas sin actualizar los documentos.
- Asumir que un índice aproximado garantiza siempre los vecinos exactos.
- Tratar MCP como una concesión de acceso de administrador.
- Suponer que la proximidad a la base evita cualquier salida de datos hacia modelos externos.

![Comparación entre similitud, certeza y autorización de acceso.]({{base}}assets/diagrams/aif-database-errors.svg "Relevancia semántica, veracidad y autorización requieren comprobaciones distintas.")

## Ejercicio de arquitectura

Tu organización ya tiene una función PL/SQL autorizada para consultar inventario y quiere ofrecerla a una aplicación MCP. ¿Debe conceder acceso libre a todas sus tablas?

<details>
<summary>Ver solución y explicación</summary>

No. Puede registrar una herramienta acotada para esa función y exponerla según la configuración del servidor. El cliente debe autenticarse y la ejecución respetar privilegios, alcance y validación de parámetros. El contrato de la herramienta permite ofrecer una operación concreta sin convertir al agente en administrador de la base.

![Clientes MCP y herramientas delimitadas de Autonomous AI Database.]({{base}}assets/diagrams/aif-database-exercise.svg "MCP conecta clientes con operaciones autorizadas, no con privilegios ilimitados.")

</details>

## Fuentes y repaso

![Repaso de recuperación, orquestación y exposición de herramientas de datos.]({{base}}assets/diagrams/aif-database-recap.svg "Explica qué componente recupera, cuál coordina y cuál conecta.")

Consulta el [workflow de AI Vector Search](https://docs.oracle.com/en/database/oracle/oracle-database/26/vecse/oracle-ai-vector-search-workflow.html), [Private Agent Factory](https://docs.oracle.com/en/database/oracle/agent-factory/26.7/paias/introduction.html), [Select AI Agent](https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/select-ai-agents-concepts.html) y la [arquitectura MCP de Autonomous](https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/about-mcp-server.html). Revisa compatibilidad con tu despliegue antes de aplicar las demostraciones.
