Antes de elegir un modelo, describe la tarea: qué recibe, qué devuelve y cómo sabrás si funciona. Ese hábito evita usar IA donde basta una regla y ayuda a comparar soluciones distintas.

**Objetivos:** distinguir IA, ML y DL; reconocer tareas de lenguaje, audio y visión; separar clasificación de generación; y evaluar una salida sin tratar su confianza como certeza.

## Conceptos clave

**Artificial Intelligence (AI)** es el campo que construye sistemas capaces de realizar tareas asociadas con percepción, razonamiento, lenguaje o decisión. **Machine Learning (ML)** aprende patrones a partir de datos. **Deep Learning (DL)** es una familia de ML que usa redes neuronales con múltiples capas para aprender representaciones complejas. Por tanto, DL está dentro de ML y ML dentro de IA.

La **IA generativa** produce contenido: texto, imágenes, audio o código. Muchos sistemas generativos actuales usan deep learning. No significa que generen sin predecir: un LLM puede construir texto prediciendo tokens sucesivos. Una red profunda que clasifica fotografías sigue siendo DL aunque no genere imágenes.

![Relación entre inteligencia artificial, aprendizaje automático y aprendizaje profundo.]({{base}}assets/diagrams/aif-ai-concepts.svg "IA es el campo; ML aprende de datos; DL aprende representaciones con redes.")

Una solución especializada en transcribir llamadas no demuestra inteligencia general. **AGI** describe una capacidad general amplia; reconocer objetos, por sí solo, no la acredita. También conviene separar IA de **data science**, que incluye explorar datos, diseñar experimentos y comunicar resultados, con o sin modelos de ML.

## Tareas y tipos de datos

| Entrada | Tarea | Salida que debes reconocer |
| --- | --- | --- |
| Texto de un reclamo | Clasificar tema o sentimiento | Etiqueta o puntuación |
| Texto de una política | Generar un resumen | Texto nuevo basado en la fuente |
| Audio de una llamada | Reconocimiento de voz, ASR | Transcripción |
| Fotografía de equipos | Detección de objetos | Etiquetas y cajas delimitadoras |
| Factura escaneada | Extraer campos y tablas | Datos estructurados |
| Historial de reparaciones | Estimar duración | Valor numérico |

Los datos **estructurados** tienen un esquema, como una tabla de pedidos. Los **no estructurados**, como fotos o texto libre, también poseen estructura interna, pero no vienen organizados en columnas de negocio. JSON es un ejemplo habitual de datos semiestructurados.

![Ejemplos de datos de texto, audio e imagen y las salidas que permiten obtener.]({{base}}assets/diagrams/aif-ai-data.svg "La modalidad de entrada y el resultado esperado delimitan la tarea.")

El texto se convierte en tokens y representaciones numéricas. El audio se representa con muestras en el tiempo; frecuencia de muestreo y profundidad de bits describen aspectos diferentes. Una imagen contiene píxeles y canales: un píxel aislado rara vez identifica el objeto. El contexto y las relaciones entre elementos importan.

## Elegir entre reglas y aprendizaje

Una regla como «el código debe tener ocho caracteres» no requiere entrenamiento. ML resulta útil cuando reconocer el patrón con reglas manuales sería difícil y existen datos adecuados. En aprendizaje **supervisado** hay ejemplos con respuestas; en **no supervisado** se explora estructura sin esas etiquetas; en **refuerzo** se aprenden decisiones a partir de recompensas de la interacción.

![Decisión entre una regla conocida, aprender de ejemplos y generar contenido.]({{base}}assets/diagrams/aif-ai-choice.svg "Define primero si necesitas comprobar una regla, predecir o generar.")

El nombre de la aplicación no determina un único método. Un vehículo autónomo puede combinar percepción supervisada, planificación y otros componentes. Una anomalía tampoco prueba fraude: solo señala algo que merece revisión.

## Ejemplo paso a paso

Una empresa recibe «El equipo vuelve a apagarse» junto con una foto y un audio. Quiere clasificar el problema y redactar una respuesta inicial.

1. Separa las entradas: mensaje, imagen y grabación. No trates todos los archivos como texto.
2. Transcribe el audio para poder buscarlo y analizarlo. Conserva el original para comprobar errores.
3. Clasifica el texto en una categoría; si necesitas localizar una pieza en la foto, usa detección de objetos.
4. Consulta la política de garantía autorizada y genera una explicación apoyada en ella.
5. Revisa datos dudosos y decide si hace falta intervención humana antes de una acción.

![Secuencia de recepción multimodal, extracción y respuesta apoyada en una política.]({{base}}assets/diagrams/aif-ai-example.svg "Comprender la entrada, extraer información y redactar son tareas distintas.")

El sistema genera una respuesta, pero eso no significa que haya aprobado una garantía. La decisión y los permisos pertenecen al proceso de negocio.

## Errores frecuentes

- Confundir una etiqueta, como «motor», con una imagen nueva de un motor.
- Suponer que toda IA usa redes profundas o que toda red profunda es generativa.
- Leer una puntuación de confianza alta como garantía de corrección en cualquier situación.
- Pensar que enviar un mensaje a un chatbot modifica automáticamente los pesos del modelo.
- Afirmar que restaurar imágenes nunca es IA: existen modelos que realizan esa tarea; no es lo mismo que clasificar o detectar.

![Tres distinciones: etiqueta frente a contenido nuevo, confianza frente a verificación y contexto frente a entrenamiento.]({{base}}assets/diagrams/aif-ai-errors.svg "Reconoce qué produce el sistema y qué queda por comprobar.")

## Ejercicio de selección

Un taller quiere comprobar un formato de serie, detectar una pieza en una foto y escribir un aviso comprensible. ¿Usarías el mismo modelo para todo?

<details>
<summary>Ver solución y explicación</summary>

Usa validación determinista para el formato de serie, visión para localizar la pieza y generación de texto para redactar el aviso a partir de datos verificados. Mantén las tres salidas separadas: formato válido no demuestra que la pieza exista, y texto convincente no confirma una reparación.

![Solución del taller con validación, detección visual y redacción como operaciones separadas.]({{base}}assets/diagrams/aif-ai-exercise.svg "Cada tarea recibe la técnica que corresponde a su resultado.")

</details>

## Fuentes y repaso

![Repaso de tres preguntas: qué entra, qué debe salir y cómo se comprueba.]({{base}}assets/diagrams/aif-ai-recap.svg "Explica la entrada, la salida y la comprobación antes de nombrar el modelo.")

Revisa AI Foundations en la [ruta oficial](https://mylearn.oracle.com/ou/learning-path/become-an-oci-ai-foundations-associate-2026/163544). Contrasta las tareas de imágenes con [OCI Vision](https://docs.oracle.com/en-us/iaas/Content/vision/using/overview.htm). Antes de avanzar, da un ejemplo propio de clasificación, regresión y generación.
