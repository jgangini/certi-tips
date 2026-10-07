Un modelo generativo puede redactar algo útil y, al mismo tiempo, introducir un dato falso. Aprende a separar cómo genera, qué contexto recibe y cómo compruebas su respuesta.

**Objetivos:** explicar tokens, parámetros y atención; comparar arquitecturas transformer; diseñar prompts verificables; y elegir entre prompting, RAG y fine-tuning.

## Conceptos clave

Un **Large Language Model (LLM)** modela patrones del lenguaje. En generación autorregresiva, toma contexto, obtiene puntuaciones para los tokens posibles, selecciona uno y lo añade al contexto para continuar. Termina al alcanzar una condición de salida, como un token de fin o un límite de longitud.

Un **token** puede ser una palabra, parte de una palabra o un signo. La tokenización depende del modelo y del idioma; contar palabras no equivale a contar tokens. El vocabulario no desaparece y se reconstruye en cada frase: el contexto modifica las probabilidades de sus elementos.

![Ciclo de contexto, distribución de tokens y selección del siguiente token.]({{base}}assets/diagrams/aif-gen-concepts.svg "El modelo genera una secuencia mediante predicciones condicionadas por el contexto.")

Los **parámetros** son valores aprendidos, como pesos. Los tokens son unidades de entrada o salida, no parámetros. La **ventana de contexto** limita lo que una invocación puede considerar. El tamaño del modelo, la precisión numérica y la longitud del contexto influyen en recursos; más parámetros no garantizan mejor resultado en tu tarea.

## Transformers y embeddings

La **self-attention** permite relacionar posiciones de una secuencia y ponderar información relevante. La representación de posición aporta el orden. En «Ana dejó el equipo en la mesa porque estaba dañado», el contexto ayuda a relacionar «dañado» con el equipo. Esa capacidad no constituye una garantía de comprensión correcta.

| Variante | Papel habitual | Ejemplo |
| --- | --- | --- |
| Encoder | Producir representaciones del texto | Clasificación o embeddings |
| Decoder | Generar tokens condicionados por contexto | Redacción o conversación |
| Encoder-decoder | Transformar una secuencia en otra | Traducción |

![Comparación de encoder, decoder y encoder-decoder según su salida.]({{base}}assets/diagrams/aif-gen-transformers.svg "Codificar representaciones y generar secuencias son funciones distintas.")

Los transformers permiten paralelizar parte del procesamiento durante entrenamiento; eso no significa que una generación autorregresiva conozca sus tokens futuros. La atención causal impide usarlos. Un **embedding** representa contenido como un vector para comparar relaciones aprendidas; no es un resumen en español ni una copia cifrada del documento. Documentos y consultas deben usar un espacio de embeddings compatible.

## Prompting, RAG y fine-tuning

Un prompt claro especifica tarea, contexto, restricciones y formato esperado. **Zero-shot** no da ejemplos; **few-shot** incorpora algunos. El aprendizaje en contexto condiciona la respuesta sin cambiar pesos. Pedir una explicación breve y comprobable facilita revisar un resultado; no da acceso garantizado al razonamiento interno ni demuestra veracidad.

**Instruction tuning** entrena con instrucciones y respuestas para mejorar seguimiento de tareas. **RLHF** usa feedback humano para alinear comportamientos; no equivale a editar un prompt en cada llamada.

![Tres rutas de personalización: instrucciones, recuperación de contexto y ajuste del modelo.]({{base}}assets/diagrams/aif-gen-customize.svg "Prompting guía; RAG aporta evidencia; fine-tuning cambia parámetros entrenables.")

**RAG** recupera fragmentos pertinentes, los incorpora al contexto y genera una respuesta apoyada en ellos. Resulta útil para políticas privadas o información que cambia. **Fine-tuning** adapta un modelo preentrenado con ejemplos, por ejemplo para una tarea o estilo especializado. Puede ajustar todos los pesos o una parte de los parámetros entrenables. No es un sustituto automático de consultar datos actuales.

Empieza con una evaluación y un prompt sencillo. Mejora la recuperación si falta evidencia y considera fine-tuning si persiste un problema de comportamiento que los ejemplos y las instrucciones no resuelven. Se pueden combinar; no hay obligación de usar todos.

## Ejemplo paso a paso

Una política dice: «La revisión preventiva se incluye durante 90 días desde la entrega». El usuario pregunta por un equipo entregado hace 35 días.

1. Recupera la versión vigente y comprueba que el usuario puede acceder a ella.
2. Aporta el fragmento y los datos del equipo al modelo, separados de las instrucciones.
3. Pide una respuesta breve, con referencia a la política y sin inventar condiciones.
4. Comprueba la aritmética: `90 − 35 = 55` días dentro del periodo, si no hay otras condiciones.
5. Si falta fecha o hay versiones contradictorias, pide aclaración o reconoce la insuficiencia de evidencia.

![Secuencia de evidencia vigente, contexto delimitado y respuesta revisada.]({{base}}assets/diagrams/aif-gen-example.svg "La respuesta depende de la política recuperada y de datos comprobados.")

Una temperatura menor suele reducir variación; no vuelve verdadero un dato falso. Una cita también debe apuntar a una fuente que realmente respalde la afirmación.

## Errores frecuentes

- Confundir un embedding con la respuesta textual del modelo de chat.
- Decir que few-shot reentrena los pesos o que fine-tuning actualiza automáticamente las políticas.
- Suponer que todos los transformers tienen obligatoriamente encoder y decoder.
- Tratar RAG como garantía de cero alucinaciones: puede fallar la recuperación o la generación.
- Asegurar que más contexto siempre ayuda, aunque introduzca ruido o instrucciones maliciosas.

![Diferencias entre contexto, parámetros y evidencia en una respuesta generativa.]({{base}}assets/diagrams/aif-gen-errors.svg "Contexto no es entrenamiento; una respuesta fluida no es evidencia.")

## Ejercicio de decisión

Una aplicación debe responder con el inventario que cambia cada hora y utilizar un formato breve. ¿Qué probarías antes de entrenar un modelo nuevo?

<details>
<summary>Ver solución y explicación</summary>

Consulta el inventario autorizado mediante una herramienta y aporta ese resultado al contexto; usa instrucciones y ejemplos para el formato. Si la información está en documentos, evalúa RAG. Fine-tuning puede ayudar a un comportamiento persistente, pero no hace que el modelo conozca por sí solo las existencias de esta hora. Comprueba tanto exactitud del dato como formato.

![Solución que combina consulta actualizada, instrucciones de formato y evaluación.]({{base}}assets/diagrams/aif-gen-exercise.svg "La frescura del dato se resuelve consultándolo; el formato se prueba con instrucciones.")

</details>

## Fuentes y repaso

![Repaso de tokens, atención y personalización por contexto o entrenamiento.]({{base}}assets/diagrams/aif-gen-recap.svg "Explica qué se genera, qué se recupera y qué cambia al entrenar.")

Revisa Generative AI and LLM Foundations en [MyLearn](https://mylearn.oracle.com/ou/learning-path/become-an-oci-ai-foundations-associate-2026/163544). Para el origen de la arquitectura, consulta [Attention Is All You Need](https://arxiv.org/abs/1706.03762). Relaciona estas ideas con [OCI Generative AI](https://docs.oracle.com/en-us/iaas/Content/generative-ai/overview.htm).
