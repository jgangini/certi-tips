Para seleccionar un servicio, escribe una frase con la entrada y el resultado: «audio a texto», «foto a objetos localizados» o «factura a campos». Ese paso suele resolver gran parte de la decisión.

**Objetivos:** elegir Language, Speech, Vision y Document Understanding; reconocer sus salidas; interpretar modelos personalizados y puntuaciones; y seguir una demostración sin confundir una interfaz antigua con las capacidades actuales.

## Conceptos clave

| Servicio | Entrada típica | Salida o tarea |
| --- | --- | --- |
| **Language** | Texto | Idioma, entidades, temas, sentimiento, frases clave o traducción |
| **Speech** | Audio o video con voz | Transcripción y marcas temporales |
| **Vision** | Imágenes o video | Clasificación, detección y localización visual |
| **Document Understanding** | Documentos e imágenes de documentos | Texto, campos, tablas y tipo de documento |

![Cuatro servicios y sus entradas: texto, voz, imagen y documento.]({{base}}assets/diagrams/aif-services-concepts.svg "El servicio se elige por la transformación que necesitas.")

Son capacidades gestionadas accesibles mediante APIs y otras interfaces de OCI. Una salida viene con estructura y, según la operación, confianza o coordenadas. Debes revisar campos, calidad y permisos antes de incorporarla a un proceso.

## Language y Speech

**Language** detecta idioma, extrae entidades (**NER**), identifica frases clave, clasifica temas y analiza sentimiento. En «La reparación fue buena, pero la entrega tardó demasiado», el sentimiento por aspecto separa reparación y entrega. No se reduce necesariamente a una única valoración.

Los modelos personalizados permiten adaptar clasificación y NER a categorías propias con ejemplos etiquetados. Detección de **PII** o **PHI** ayuda a identificar información personal o de salud; el flujo debe decidir cómo enmascarar, retirar o proteger lo detectado. Health NLP extrae entidades y relaciones clínicas: no transforma automáticamente esos datos en un diagnóstico validado.

![Flujo de transcribir audio y analizar el texto resultante como tareas encadenadas.]({{base}}assets/diagrams/aif-services-language-speech.svg "Speech produce texto; Language puede analizar ese texto después.")

**Speech** usa ASR. Un job procesa archivos de forma asíncrona y escribe resultados en Object Storage; Live Transcribe atiende audio en tiempo real. JSON permite procesar texto y metadatos; **SRT** sirve para subtítulos. La **normalización** representa números o fechas de forma legible, mientras que la **diarización** diferencia turnos de hablantes, no demuestra su identidad civil.

Un filtro de lenguaje ofensivo puede retirar, enmascarar o etiquetar; **tag** conserva la palabra con una marca. Revisa puntuaciones de confianza y audio cuando haya dudas. Idiomas y funciones dependen del modelo: Oracle ASR y Whisper tienen coberturas distintas, por lo que una lista antigua no basta para descartar un idioma. Consulta la [documentación vigente de Speech](https://docs.oracle.com/en-us/iaas/Content/speech/using/speech.htm).

## Vision y Document Understanding

En Vision, **clasificación de imágenes** asigna etiquetas a la escena. **Detección de objetos** añade cajas delimitadoras para localizar instancias. **OCR** reconoce texto visible. **Detección de rostros** localiza caras; no equivale a identificar personas. Si el objeto de tu dominio no forma parte de las categorías preentrenadas, evalúa un modelo personalizado y datos etiquetados.

En Document Understanding, **extracción de texto** devuelve palabras y líneas con ubicación; **extracción de tablas** conserva filas y columnas; **extracción clave-valor** relaciona campos como proveedor, fecha y total; **clasificación documental** identifica tipos como factura o recibo.

![Diferencia entre objetos de una fotografía y campos o tablas de una factura.]({{base}}assets/diagrams/aif-services-vision-document.svg "Localizar objetos no equivale a interpretar la estructura de una factura.")

Algunas demostraciones y skill checks antiguos muestran Document AI dentro de Vision. Para extraer estructura documental, esta guía utiliza el servicio actual **Document Understanding**, de acuerdo con su [documentación](https://docs.oracle.com/en-us/iaas/Content/document-understanding/using/home.htm). No aprendas esa asociación histórica como regla permanente.

## Ejemplo paso a paso

El expediente de una reparación contiene una llamada, una foto del equipo y una factura.

1. Speech transcribe la llamada; revisa las palabras de baja confianza que cambian el significado del problema.
2. Language clasifica el texto y distingue sentimiento sobre atención y reparación.
3. Vision localiza componentes en la foto si el modelo los reconoce; documenta cuándo no los identifica.
4. Document Understanding clasifica la factura y extrae campos y líneas de tabla.
5. La aplicación comprueba que cantidades, precios e impuestos explican el total antes de registrar el gasto.

![Ejemplo de combinar servicios para una llamada, fotografía y factura de reparación.]({{base}}assets/diagrams/aif-services-example.svg "Cada archivo tiene una ruta de extracción y una comprobación posterior.")

En consola, inspecciona el resultado estructurado además de las etiquetas sobre la imagen. Un sello o texto mal leído puede terminar en una columna equivocada: que la solicitud termine correctamente no demuestra que cada campo sea correcto.

## Errores frecuentes

- Elegir Language directamente para un archivo de audio sin transcribirlo.
- Confundir cajas de detección con clasificación general de imagen.
- Confundir OCR con extracción de relaciones entre filas, columnas y claves.
- Afirmar que un modelo preentrenado reconoce todos los objetos de tu industria.
- Usar una puntuación alta como aprobación automática de una factura.

![Errores de selección corregidos mediante entrada, estructura de salida y revisión.]({{base}}assets/diagrams/aif-services-errors.svg "Un resultado extraído aún necesita comprobaciones del proceso de negocio.")

## Ejercicio de selección

Necesitas subtítulos para una grabación, ubicar tres equipos en una foto y recuperar cantidad y precio de cada fila de una factura. ¿Qué usarías?

<details>
<summary>Ver solución y explicación</summary>

Speech con salida SRT para subtítulos; Vision con detección de objetos para ubicación; Document Understanding con extracción de tablas para filas y columnas. Si además necesitas proveedor y total como campos, añade extracción clave-valor. OCR solo devuelve texto y su localización; no es una garantía de estructura tabular correcta.

![Solución con SRT, cajas de objetos y tabla de factura.]({{base}}assets/diagrams/aif-services-exercise.svg "Compara el formato de salida antes de elegir el servicio.")

</details>

## Fuentes y repaso

![Repaso de modalidad, servicio y formato de salida requerido.]({{base}}assets/diagrams/aif-services-recap.svg "Entrada, tarea y salida forman la justificación de cada elección.")

Consulta [Language](https://docs.oracle.com/en-us/iaas/Content/language/using/overview.htm), [Vision](https://docs.oracle.com/en-us/iaas/Content/vision/using/overview.htm) y las fuentes de Speech y Document Understanding anteriores. Repite las demostraciones en [MyLearn](https://mylearn.oracle.com/ou/learning-path/become-an-oci-ai-foundations-associate-2026/163544) describiendo qué representa cada campo de la respuesta.
