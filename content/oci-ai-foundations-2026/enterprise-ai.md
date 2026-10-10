Una demostración que responde correctamente todavía necesita ejecución, acceso a datos, seguimiento y límites para servir a usuarios reales. OCI Enterprise AI reúne capacidades para construir ese recorrido.

**Objetivos:** identificar modelo, herramientas, loop y memoria; distinguir chat, embed y rerank; seguir Responses API y function calling; y separar controles de acceso de controles de contenido.

## Conceptos clave

Un agente basado en LLM combina **modelo, herramientas, loop y memoria**. El modelo propone el siguiente paso; una herramienta obtiene datos o ejecuta una operación; el runtime coordina decisiones y resultados; la memoria conserva contexto relevante. Un chatbot puede responder sin actuar y un workflow puede seguir una secuencia fija. Un agente decide parte de sus pasos dinámicamente.

![Ciclo de objetivo, decisión, herramienta y resultado del agente.]({{base}}assets/diagrams/aif-enterprise-concepts.svg "El loop decide cuándo continuar, responder o detenerse.")

La plataforma se entiende en tres grupos: **modelos** para inferir; **agentes** para coordinar acciones; y **gobernanza** para controlar acceso, comportamiento y operación. Usar un runtime gestionado reduce trabajo operativo, pero no elimina tu responsabilidad sobre permisos, herramientas o calidad de las respuestas.

## Modelos, recuperación y personalización

**Chat** genera respuestas; **embed** produce vectores; **rerank** vuelve a ordenar candidatos por relevancia. En una búsqueda, puedes recuperar un conjunto amplio con embeddings, refinarlo con reranking y pasar los fragmentos seleccionados al modelo de chat. Un modelo rerank no busca por sí solo en todos tus documentos ni redacta la respuesta final.

![Funciones diferentes de chat, embeddings y reranking con controles de gobernanza.]({{base}}assets/diagrams/aif-enterprise-models.svg "Generar, representar y reordenar son tareas distintas.")

Para preparar la recuperación: extrae texto, divídelo en fragmentos útiles, genera embeddings y conserva texto, vector y metadatos. En consulta, combina filtros autorizados con similitud; la búsqueda híbrida puede sumar coincidencia léxica para códigos exactos. Mide tanto recuperación como respuesta.

Adapta primero instrucciones y ejemplos. RAG aporta conocimiento externo al contexto; fine-tuning ajusta comportamiento. El material presenta métodos eficientes como T-Few y LoRA, además de ajustes más amplios: la compatibilidad depende del modelo y la versión. Verifica el formato de entrenamiento y reserva ejemplos de evaluación. No memorices un listado histórico de modelos como catálogo permanente.

## Herramientas, memoria y controles

La **OCI Responses API** usa una interfaz compatible con OpenAI para invocar modelos y coordinar herramientas en OCI. Eso no significa que el SDK ejecute la solicitud en la infraestructura de OpenAI: importan endpoint y autenticación. Un **project** organiza recursos como respuestas, conversaciones, archivos y almacenes vectoriales. Consulta los requisitos de la [guía oficial de inicio](https://docs.oracle.com/en-us/iaas/Content/generative-ai/get-started-agents.htm).

![Secuencia de una llamada a función: modelo solicita, aplicación ejecuta y devuelve el resultado.]({{base}}assets/diagrams/aif-enterprise-tools.svg "Una función propia necesita ejecución y validación en la aplicación.")

En **function calling**, el modelo devuelve nombre y argumentos; tu aplicación valida identidad, permisos y parámetros, ejecuta la función y devuelve el resultado asociado a la llamada. Las herramientas gestionadas, como File Search o Code Interpreter, tienen otro responsable de ejecución. **MCP** estandariza conexión con servidores de herramientas; distingue host, cliente y servidor, y herramientas, recursos y prompts. Para servidores remotos se utiliza Streamable HTTP; stdio corresponde al escenario local. El servidor remoto sigue aplicando sus propios controles.

El contexto de varios turnos puede gestionarse en cliente o servicio. `previous_response_id` enlaza respuestas; la compacción resume historial; la memoria duradera debe asociarse al sujeto y proyecto correctos. No modifica los pesos del LLM. Los [proyectos](https://docs.oracle.com/en-us/iaas/Content/generative-ai/projects.htm) tienen configuración de retención: no debes afirmar que nada se almacena cuando eliges conservar conversaciones.

**Autenticación** identifica al solicitante; **autorización** limita operaciones. IAM, red, cifrado y políticas de datos se complementan. Un endpoint privado no sustituye IAM. Los **guardrails** detectan riesgos como contenido indebido, prompt injection o PII; detección e información no equivalen a bloqueo. Comprueba qué aplica cada modo en la [documentación de guardrails](https://docs.oracle.com/en-us/iaas/Content/generative-ai/guardrails.htm).

## Ejemplo paso a paso

Un empleado solicita: «Consulta la política y abre un ticket por mi equipo».

1. Autentica al empleado y recupera solo la política que puede leer.
2. El modelo explica la política y propone una herramienta para crear el ticket.
3. La aplicación valida equipo, identidad, campos y autorización de creación.
4. Ejecuta una sola operación; si reintenta, evita duplicar tickets con un identificador de operación.
5. Devuelve el número real y conserva únicamente el contexto necesario para un seguimiento.

![Secuencia del empleado, consulta autorizada, creación del ticket y comprobación del resultado.]({{base}}assets/diagrams/aif-enterprise-example.svg "La respuesta final debe reflejar el resultado real de la herramienta.")

Si un documento recuperado exige «ignorar permisos», no adquiere autoridad por formar parte de RAG. Limita pasos, tiempo y gasto; detén o escala cuando no puedas confirmar el resultado.

## Errores frecuentes

- Afirmar que declarar una función en JSON ya ejecuta su código.
- Confundir un proyecto de recursos con los pesos del modelo.
- Conservar memoria de dos usuarios bajo el mismo identificador.
- Tratar «informar» como si significara bloquear una petición.
- Prometer que RAG, red privada o guardrails eliminan todos los riesgos.

![Capas de controles sobre entrada, modelo, herramientas y salida.]({{base}}assets/diagrams/aif-enterprise-errors.svg "Los controles de contenido complementan permisos y validación de operaciones.")

## Ejercicio de seguridad

El agente puede consultar tickets. Una página recuperada le pide cerrar todos los tickets de la organización. ¿Le basta su acceso de lectura y la instrucción de la página?

<details>
<summary>Solución</summary>

No. Leer no autoriza modificar, y el contenido de una página no concede permisos. La aplicación debe rechazar la operación fuera de alcance, comprobar la identidad y aplicar la política del negocio. El modelo puede explicar el límite y ofrecer una consulta permitida. También debe evitar guardar esa instrucción como memoria confiable.

![Separación entre contenido recuperado, autorización y operación permitida.]({{base}}assets/diagrams/aif-enterprise-exercise.svg "Una fuente aporta datos; la política de acceso decide qué se puede ejecutar.")

</details>

## Fuentes y repaso

![Repaso del modelo, la aplicación ejecutora y los controles sobre datos y herramientas.]({{base}}assets/diagrams/aif-enterprise-recap.svg "Sigue quién decide, quién ejecuta y quién autoriza.")

Consulta [Building AI Agents](https://docs.oracle.com/en-us/iaas/Content/generative-ai/building-agents.htm) y el bloque OCI Enterprise AI de [MyLearn](https://mylearn.oracle.com/ou/learning-path/become-an-oci-ai-foundations-associate-2026/163544). Para profundizar después, continúa con nuestra [guía de Agentic AI]({{base}}1Z0-1157-26/overview/).
