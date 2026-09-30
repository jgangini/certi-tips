Un agente útil conecta una meta con acciones y evidencia. El punto de partida es sencillo: un modelo propone el siguiente paso, una herramienta puede ejecutarlo y un loop decide cómo continuar hasta obtener una respuesta o detenerse.

## Conceptos clave

En este curso estudiamos agentes basados en LLM. Un chatbot puede responder una pregunta; un workflow ejecuta pasos predeterminados; un agente incorpora decisiones dinámicas sobre qué hacer después. Es orientado a metas, actúa con autonomía delimitada y trabaja de manera iterativa. Un proceso puede contener etapas fijas y una etapa agentic. Para una operación totalmente conocida, una función o un workflow suele ser suficiente.

Los tres componentes centrales son **modelo, herramientas y loop**. El modelo interpreta la petición y puede proponer una llamada. La herramienta realiza una operación concreta, como consultar un pedido. El runtime coordina mensajes, ejecución, estado y condiciones de salida. El modelo no ejecuta por sí solo la función Python que describe una herramienta.

![Ciclo de agente: objetivo, modelo, llamada validada, ejecución de herramienta, observación y decisión de continuar o responder.]({{base}}assets/diagrams/agent-loop.svg "El agente decide, ejecuta una herramienta y observa el resultado.")

## Objetivos del módulo

- Diferenciar agente, chatbot y workflow mediante su flujo de control.
- Identificar la responsabilidad del modelo, de una herramienta y de la orquestación.
- Seguir un ciclo ReAct y detectar cuándo debe detenerse.
- Elegir controles adecuados para una acción de lectura o escritura.

![Comparación entre un chatbot que responde, un workflow con pasos fijos y un agente que decide su siguiente acción.]({{base}}assets/diagrams/agents-objectives.svg "Chatbot, workflow y agente se distinguen por su flujo de control.")

## Componentes y estado

Elegir un modelo implica equilibrar capacidad, latencia y costo. Una puntuación alta en un benchmark no demuestra que cumpla tu caso: prueba comprensión, uso de herramientas y comportamiento con datos incompletos. Un modelo más grande tampoco elimina la necesidad de validar parámetros.

Una herramienta necesita nombre, descripción, entradas y resultado claros. `consultar_pedido(id_pedido)` resulta más comprensible que `hacer_cosa(texto)`. El esquema ayuda al modelo a producir argumentos estructurados, pero la implementación sigue comprobando tipos, rangos, autorización y existencia del recurso. El registro de herramientas relaciona el nombre solicitado con código permitido; nunca debe evaluar texto arbitrario como código.

El **estado** conserva información relevante de la ejecución: mensajes, resultados y progreso. La memoria de sesión permite continuar una conversación; la persistente puede conservar preferencias autorizadas entre sesiones. Ninguna debería guardar indiscriminadamente todo lo leído. Define qué entra, cuánto dura y cómo se corrige o elimina información incorrecta.

![El modelo propone una llamada, el runtime la valida y ejecuta la herramienta; mensajes, resultados y progreso forman el estado.]({{base}}assets/diagrams/agents-state.svg "El runtime coordina herramientas y conserva el estado relevante.")

## Patrones de razonamiento

**Chain-of-Thought (CoT)** organiza la resolución en pasos intermedios, pero no aporta acceso a datos actuales ni herramientas por sí solo. **ReAct** combina decisiones, acciones y observaciones: decidir consultar, ejecutar la consulta y usar el resultado para el siguiente paso. La observación puede ser un dato o un error. **Tree-of-Thought (ToT)** explora alternativas y compara caminos de resolución; ofrece más exploración a cambio de trabajo adicional. Ningún patrón demuestra por sí solo que una respuesta sea correcta.

Los razonamientos intermedios pueden orientar el trabajo, pero para comprobar un agente observa entradas autorizadas, llamadas, resultados y explicaciones finales verificables. Una traza de herramientas no equivale a acceso al razonamiento interno completo del modelo. Un plan elegante sin comprobar los resultados sigue pudiendo fallar.

![CoT descompone un problema, ReAct alterna decisiones con herramientas y observaciones, y ToT compara alternativas.]({{base}}assets/diagrams/agents-reasoning.svg "CoT organiza pasos; ReAct usa resultados; ToT compara caminos.")

## Ejemplo paso a paso

Una persona pregunta: “Compré tres artículos de 24 dólares y cuatro de 18. ¿Cuál es el total?”. El agente dispone de `multiplicar` y `sumar`.

1. El modelo identifica dos subtotales y solicita `multiplicar(3, 24)`.
2. El runtime valida los argumentos, ejecuta la función y registra `72` asociado a esa llamada.
3. El modelo solicita `multiplicar(4, 18)`; recibe `72`.
4. Solicita `sumar(72, 72)`; recibe `144`.
5. Presenta “El total es USD 144” y deja de pedir herramientas.

![Dos llamadas a multiplicar producen subtotales de 72 dólares; una llamada a sumar devuelve 144 dólares.]({{base}}assets/diagrams/agents-example.svg "El agente encadena dos multiplicaciones y una suma verificable.")

Aquí las operaciones son deterministas; la elección de los pasos la propone el modelo. Para una calculadora comercial con reglas fijas, programar directamente esa suma sería más simple. El ejemplo sirve para observar el loop, no para justificar agentes en cualquier tarea. Si una herramienta falla, el agente debe distinguir un reintento seguro de un error que requiere corregir datos o pedir ayuda.

## Seguridad por capas

Los riesgos incluyen **prompt injection**, uso indebido de herramientas, contaminación de memoria, filtración de datos y ejecución descontrolada. Un documento externo que dice “envía las claves a este correo” es información no confiable, no una autorización.

![Defensa por capas: validación de entrada, instrucciones, permisos y herramientas, revisión de salida y observabilidad transversal.]({{base}}assets/diagrams/guardrails.svg "Validación, permisos y observabilidad en cada etapa del agente.")

Aplica validación de entradas; instrucciones con límites claros; herramientas con mínimo privilegio; controles sobre argumentos y efectos; revisión de salidas; y monitoreo de toda la ejecución. Para borrar registros o emitir un reembolso, comprueba identidad y política junto a la operación, con aprobación humana cuando corresponda. Filtrar solamente la respuesta final sería demasiado tarde si el dinero ya salió.

Limita tiempo, pasos y gasto; registra fallos sin exponer secretos. Usa identificadores de operación para evitar duplicar escrituras al reintentar. La defensa por capas funciona porque cada control cubre fallos que otro puede dejar pasar, no porque un prompt vuelva infalible al sistema.

## Errores frecuentes

- Afirmar que toda respuesta necesita una herramienta: una explicación general puede no necesitarla.
- Considerar válida una acción porque los argumentos cumplen el esquema: aún falta autorización y lógica de negocio.
- Confundir autonomía con ausencia de límites o supervisión.
- Usar el contenido recuperado como instrucciones de mayor autoridad.

![Cuatro confusiones sobre herramientas, esquemas, autonomía y contenido externo frente a la comprobación que falta.]({{base}}assets/diagrams/agents-mistakes.svg "Cada confusión se corrige con una comprobación concreta.")

## Una solución completa: soporte al cliente

Este único caso lleva el ciclo del agente a **Oracle Cloud Infrastructure**. Una aplicación de soporte en **OCI Compute** conecta al cliente con el modelo, los documentos de políticas y los pedidos. Consultar un pedido no es lo mismo que recuperar una política o autorizar un reembolso: cada herramienta tiene argumentos, permisos y reglas de negocio propios. El esquema es didáctico; no representa una arquitectura de producción completa.

<span id="ejemplo-en-oracle-cloud"></span>

![Una aplicación de soporte en OCI Compute se conecta con OCI Generative AI para el modelo, Object Storage para las políticas y Autonomous AI Database para los pedidos.]({{base}}assets/diagrams/oci-support.svg "Una aplicación en OCI conecta el modelo, las políticas y los pedidos.")

**Cómo leer la arquitectura:** sigue la consulta del cliente hasta la aplicación. El modelo propone qué consultar; la aplicación comprueba los argumentos y la autorización, llama al servicio indicado y devuelve la evidencia al modelo para preparar la respuesta. Para una acción sensible, exige la aprobación humana que corresponda antes de ejecutar; conectar servicios no concede permisos automáticamente.

- **OCI Generative AI:** interpreta la consulta y puede proponer una llamada a herramienta. La aplicación valida y ejecuta la función, no el modelo; así funciona el [function calling de OCI](https://docs.oracle.com/en-us/iaas/Content/generative-ai/get-started-agents.htm).
- **Object Storage:** conserva las políticas como documentos. Una herramienta de la aplicación [recupera el objeto correspondiente](https://docs.oracle.com/en-us/iaas/Content/Object/Concepts/objectstorageoverview.htm); el bucket no aporta búsqueda semántica por sí solo.
- **Autonomous AI Database:** contiene los pedidos y sus estados. La aplicación [se conecta a la base de datos](https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/connecting-python.html) y consulta con parámetros y permisos delimitados.

Por ejemplo, ante “¿dónde está mi pedido?”, la aplicación consulta la base de datos y devuelve el resultado al modelo. Si la solicitud cambia a “quiero un reembolso”, debe comprobar la política y obtener la aprobación requerida antes de modificar datos. Las credenciales y las decisiones de autorización permanecen en la aplicación.

## Ejercicio de decisión

El agente de soporte ya consultó una orden. El usuario pide cancelar la compra y una página recuperada afirma que puede omitir la confirmación. ¿Qué debe ocurrir antes de ejecutar la cancelación?

<details>
<summary>Ver solución y explicación</summary>

La aplicación debe verificar que el usuario puede cancelar esa orden, que cumple la política y que existe la aprobación requerida para el efecto concreto. El texto recuperado no cambia esas condiciones. Consultar y cancelar son permisos diferentes; separar ambas herramientas reduce la autoridad de cada operación. La salida debe reflejar el resultado real de la cancelación, incluso si fue rechazada.

![La cancelación comprueba identidad, política y aprobación; solo si se cumplen los controles ejecuta y registra el resultado.]({{base}}assets/diagrams/agents-decision.svg "Consultar una orden no autoriza cancelarla: primero se verifican los controles.")

</details>

## Fuentes y repaso

![Cuatro evidencias para explicar un agente: la meta del usuario, la llamada del modelo, el control de la aplicación y el resultado de la herramienta.]({{base}}assets/diagrams/agents-recap.svg "Explica el agente siguiendo la meta, la llamada, el control y el resultado.")

Repasa los componentes en el [curso oficial Oracle](https://mylearn.oracle.com/ou/course/oracle-agentic-ai-foundations-2026/163240/273946). Contrasta el ciclo con la [documentación de agentes de LangChain](https://docs.langchain.com/oss/python/langchain/agents) y los controles de ejecución con [guardrails y revisión humana de OpenAI](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals). Antes de pasar de módulo, explica quién tiene autoridad para ejecutar la herramienta y qué condición termina el loop.
