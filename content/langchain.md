LangChain ofrece piezas reutilizables para conectar modelos y herramientas. Su valor se entiende al seguir los mensajes que viajan entre tu aplicación, el modelo y las funciones que ejecutan acciones.

## Conceptos clave

**LangChain** es un framework de aplicaciones con LLM. Unifica parte de la interacción con proveedores y permite componer prompts, modelos, herramientas y procesamiento de resultados. **LangGraph** aporta control del flujo y estado para agentes; **LangSmith** sirve para observación y evaluación. Aprender el nivel básico no exige dominar simultáneamente todo el ecosistema.

Una **chain** conecta pasos definidos por el desarrollador. Un agente deja al modelo proponer herramientas y orden de ejecución dentro de límites. Compartir una interfaz entre modelos facilita cambios, pero no garantiza capacidades idénticas: verifica tool calling, parámetros, límites y comportamiento del proveedor elegido.

![Flujo de LangChain entre aplicación, mensajes, modelo, registro de herramientas y retorno de resultados con identificadores.]({{base}}assets/diagrams/langchain-flow.svg)

## Objetivos del módulo

- Reconocer modelo, prompt template, chain, parser y memoria.
- Diferenciar `model.invoke`, `chain.invoke` y `agent.invoke` por el trabajo que desencadenan.
- Reconstruir el intercambio de una llamada a herramienta y su resultado.
- Detectar fallos de contexto, esquemas y ejecución sin culpar automáticamente al modelo.

## Bloques reutilizables

Un **prompt template** combina instrucciones constantes con variables. “Explica {concepto} con un ejemplo” separa la estructura del tema. Un chat prompt conserva roles: instrucciones de sistema, mensajes de usuario y respuestas anteriores. Un ejemplo few-shot ilustra el formato esperado; sigue siendo distinto de una regla de autorización.

Una composición como `prompt | model | parser` describe una secuencia mediante LCEL, LangChain Expression Language. El prompt prepara la entrada, el modelo produce una respuesta y un parser extrae o valida la forma de salida. Un parser de texto no comprueba que las afirmaciones sean verdaderas: formato y veracidad son problemas separados.

Las herramientas suelen expresarse como funciones con tipos y descripciones; el decorador `@tool` permite exponer metadatos al framework. `create_agent` reúne el modelo y las herramientas, y `agent.invoke` inicia la ejecución. Esa sencillez de uso oculta trabajo útil, no elimina responsabilidades de seguridad. La [documentación actual de agentes](https://docs.langchain.com/oss/python/langchain/agents) explica esta construcción y su configuración.

## Qué ocurre bajo el capó

El runtime prepara mensajes y esquemas de herramientas. El modelo puede devolver texto, llamadas a herramientas u otros bloques compatibles; no deduzcas que está terminado solamente porque apareció texto. Cuando hay una llamada pendiente, la aplicación identifica el nombre registrado, analiza argumentos y ejecuta la herramienta permitida.

Cada resultado se vincula con el identificador de la llamada correspondiente. Luego entra al contexto de la siguiente solicitud. Así el modelo puede utilizar el valor obtenido, pedir otra operación o producir una respuesta final. El loop también debe tener límites y gestionar errores: terminar no depende exclusivamente de que el modelo decida hacerlo.

Conservar estado no significa que el LLM modifique sus pesos o aprenda permanentemente el nombre del usuario. La aplicación o un servicio guarda contexto y lo aporta a futuras inferencias. Tampoco es obligatorio reenviar por red todo el historial literal en cada integración: puede haber mecanismos de continuación, recorte y resumen. Lo necesario es conservar el contexto pertinente y la relación entre llamadas y resultados.

## Ejemplo paso a paso

Considera “multiplica 18 por 5 y divide el resultado entre 3”. Las herramientas disponibles son `multiplicar` y `dividir`.

| Paso | Responsable | Evidencia observable |
| --- | --- | --- |
| 1 | Aplicación | Agrega la pregunta a los mensajes y llama a `agent.invoke`. |
| 2 | Modelo | Solicita `multiplicar(18, 5)` con identificador `call-a`. |
| 3 | Runtime | Ejecuta la función; registra `90` para `call-a`. |
| 4 | Modelo | Solicita `dividir(90, 3)` como `call-b`. |
| 5 | Runtime | Valida divisor distinto de cero; devuelve `30`. |
| 6 | Modelo y runtime | Producen y entregan la respuesta final: `30`. |

La función de multiplicación no llama al LLM. Es código normal dentro de una aplicación que sí utiliza un modelo. Para comprobar la demostración, revisa tanto el resultado como los argumentos: obtener 30 por casualidad no prueba que las herramientas correctas se hayan usado.

Prueba después “divide entre cero”. El resultado esperado es un error controlado o una solicitud de corrección, no una excepción sin manejar ni un número inventado. Por último, elimina deliberadamente el resultado de `call-a` del contexto y explica por qué se pierde la evidencia que necesitaba la segunda operación.

## Errores frecuentes

- Interpretar `invoke` como una única llamada de red: un agente puede realizar varias.
- Guardar únicamente respuestas del asistente y perder las observaciones de herramientas.
- Exponer una función genérica que ejecuta cualquier código recibido.
- Suponer que cambiar el nombre del proveedor mantiene el resultado y costo de la aplicación.
- Confundir trazas de llamadas con el razonamiento interno completo del modelo.

## Ejercicio de depuración

La multiplicación devuelve 90 correctamente, pero el agente vuelve a solicitarla varias veces. ¿Qué dos aspectos revisarías antes de aumentar el límite de pasos?

<details>
<summary>Ver solución y explicación</summary>

Primero, confirma que el resultado aparece en el contexto con el identificador de la llamada correcta. Segundo, revisa instrucciones, descripción de herramientas y condiciones de finalización para comprobar que el agente reconoce el resultado. Aumentar el límite podría hacer más cara una ejecución defectuosa sin corregir la causa. Añade también un límite para que el fallo siga siendo controlable.

</details>

## Fuentes y repaso

Consulta [Agents](https://docs.langchain.com/oss/python/langchain/agents), [Tools](https://docs.langchain.com/oss/python/langchain/tools) y [Messages](https://docs.langchain.com/oss/python/langchain/messages) en la documentación oficial de LangChain. El aprendizaje clave es poder señalar, en cada flecha del diagrama, qué mensaje circula, quién lo interpreta y dónde se ejecuta el código.
