Usa los términos en inglés para reconocerlos en documentación y material oficial. Las definiciones son operativas: buscan ayudarte a elegir y explicar, no a memorizar palabras.

## Agentes y razonamiento

| Término | Qué significa | No lo confundas con |
| --- | --- | --- |
| Agent | Sistema que decide acciones hacia un objetivo, usando un modelo, herramientas y un ciclo. | Cualquier chatbot o pipeline fijo. |
| LLM | Modelo de lenguaje que produce salidas a partir de un contexto. | Un ejecutor de funciones con acceso automático a tu sistema. |
| Inference | Ejecución del modelo para producir una salida. | Entrenamiento del modelo. |
| Tool | Capacidad invocable con un contrato de entrada/salida. | Una instrucción escrita que por sí sola concede permisos. |
| Tool calling | Salida estructurada que solicita usar una herramienta. | La ejecución efectiva de esa herramienta. |
| Agent loop | Ciclo que coordina decisiones, herramientas, observaciones y parada. | Una única llamada al modelo. |
| ReAct | Patrón que alterna razonamiento y acciones, incorporando observaciones. | Una obligación de mostrar razonamiento interno al usuario. |
| Chain-of-Thought | Descomposición de un problema en pasos de razonamiento. | Una herramienta para consultar datos externos. |
| State | Información que el sistema mantiene durante el flujo. | Cambiar los pesos del modelo. |
| Context window | Cantidad de contexto que una llamada al modelo puede procesar. | Memoria permanente ilimitada. |

## Orquestación e integración

| Término | Qué significa | Distinción útil |
| --- | --- | --- |
| LangChain | Framework con interfaces y componentes para aplicaciones con modelos. | La aplicación conserva responsabilidad sobre permisos y validación. |
| LCEL | Forma de componer componentes en cadenas de LangChain. | El operador de composición no vuelve autónoma una cadena. |
| MCP host | Aplicación que contiene y coordina clientes MCP. | No tiene que ser el modelo. |
| MCP client | Componente que mantiene una conexión con un servidor MCP. | Host y cliente cumplen responsabilidades distintas. |
| MCP server | Expone capacidades a los clientes según el protocolo. | No reemplaza por sí mismo el ciclo del agente. |
| Resource | Contenido o datos expuestos por un servidor MCP. | Una herramienta ejecutable. |
| Prompt | Plantilla de interacción ofrecida por un servidor MCP. | El acceso a todas las instrucciones del sistema. |
| Responses API | API de OpenAI que integra respuestas, herramientas y opciones para contexto/estado. | No ejecuta automáticamente toda función Python local. |
| Agents SDK | Biblioteca de orquestación de agentes, herramientas, handoffs y otras capacidades. | Un servicio de alojamiento de tu aplicación. |
| Handoff | Transferencia del control conversacional a un agente especializado. | Usar otro agente como herramienta y volver al agente principal. |

## Seguridad y operación

| Término | Qué significa | Pregunta que conviene hacer |
| --- | --- | --- |
| Guardrail | Control que valida o restringe parte del flujo. | ¿En qué punto y sobre qué contenido se ejecuta? |
| Prompt injection | Instrucciones maliciosas incluidas en entradas o contenido no confiable. | ¿Estoy tratando datos externos como instrucciones autorizadas? |
| Least privilege | Conceder solo los permisos necesarios. | ¿Esta herramienta puede hacer más de lo que requiere la tarea? |
| Human-in-the-loop | Intervención humana en decisiones concretas. | ¿Qué operación sensible necesita confirmación? |
| Tracing | Registro de eventos operativos del flujo. | ¿Puedo reconstruir llamadas, errores y tiempos? |
| Runtime | Entorno que ejecuta y coordina el comportamiento del agente. | ¿Quién mantiene sesiones, ejecuta herramientas y aplica límites? |
| Evaluation | Comprobación sistemática con casos y criterios definidos. | ¿Estoy midiendo exactitud, seguridad y coste, además de fluidez? |

## Datos y recuperación

| Término | Qué significa | Distinción útil |
| --- | --- | --- |
| Embedding | Representación numérica de contenido. | No es el documento original ni una garantía de veracidad. |
| Chunk | Fragmento de un documento usado en recuperación. | Un corte arbitrario puede perder contexto necesario. |
| Vector search | Búsqueda por similitud entre representaciones vectoriales. | Similitud no significa exactitud factual. |
| RAG | Recuperar contexto y usarlo para fundamentar una generación. | No equivale a entrenar o ajustar el modelo. |
| Select AI | Capacidades para usar lenguaje natural con servicios/modelos de IA y datos de Oracle. | La generación de SQL no concede permisos nuevos. |
| Select AI Agent | Marco para definir agentes, tareas y herramientas cerca de los datos. | No implica que los pesos del LLM se ejecuten dentro de la base. |
| Private Agent Factory | Entorno para construir agentes y flujos con interfaz visual. | La configuración visual no elimina la necesidad de gobernanza. |

## Una prueba de comprensión

Explica la diferencia entre **tool calling**, **MCP** y **runtime** con un pedido de una tienda. Una respuesta sólida identifica la solicitud estructurada, el protocolo de integración y el entorno que ejecuta y coordina el trabajo. Si usas los tres términos como sinónimos, vuelve al [módulo de MCP]({{base}}agentic-ai-foundations-2026/mcp/).
