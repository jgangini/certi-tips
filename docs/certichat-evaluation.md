# CertiChat: evaluación conversacional

Fecha: 11 de octubre de 2026. Corpus: `9215733f1321c74f3207b367c6cadf11711b708cd29e6a86f85c206b6af1fd9d`.

## Fallos reproducidos y correcciones

- La recuperación recibía únicamente la última pregunta. «En dónde puedo investigar más sobre este tema o relación» perdía DAMA y OCI. Ahora recibe las últimas preguntas de la sesión, acotadas y filtradas por versión; el historial ayuda a interpretar la consulta y no se convierte en evidencia.
- El reranking por palabras podía priorizar términos genéricos y la generación solo veía los primeros 1.500 caracteres. Se retiró esa heurística y se entregan hasta ocho fragmentos vigentes completos dentro de límites de tamaño y presupuesto.
- Qwen omitió partes de consultas compuestas y confundió atribuciones pese a recibir fuentes válidas. La comparación favoreció Gemini 2.5 Flash Lite para responder. Qwen continúa en la extracción; no se reindexó el corpus.
- En una consulta mixta, ambos modelos llegaron a devolver una respuesta parcial útil y citas válidas junto con `supported=false`. Ese booleano redundante descartaba toda la respuesta. El contrato final usa solamente `answer` y `citations`: sin citas se rechaza, y las citas presentes deben pertenecer exactamente a los fragmentos enviados. No se añaden respuestas predefinidas ni reglas específicas para DAMA u OCI.
- Los enlaces de las tarjetas proceden de afirmaciones recuperadas o de la relación nativa `DocumentChunk → contains → Entity`. El cruce exige un nodo recuperado y un fragmento vigente seleccionado; no se deduce por el nombre del concepto.

## Método

El evaluador optativo `services/certichat/tests/evaluate_answers.py` ejecuta 16 escenarios y 20 turnos sintéticos: preguntas simples, compuestas, variantes, referencias de seguimiento, cambio de tema, soporte parcial y dos temas ajenos. Usa recuperación y generación reales, con el control de gasto persistente y sin reintentos automáticos. No lee conversaciones de participantes.

Los controles automáticos verifican respuesta o rechazo esperado y coincidencia de IDs, títulos y URLs con el corpus publicado. Se revisa además el texto: cobertura de cada concepto, atribución, distinción de roles y continuidad conversacional. Un `passed=true` técnico no demuestra por sí mismo fidelidad semántica. Las pruebas unitarias y de integración cubren contratos, historial, frescura, límites, errores y enlaces con proveedores simulados; no sustituyen esta evaluación real.

## Iteraciones conservadas

| Configuración | Controles automáticos | Hallazgos |
| --- | --- | --- |
| Qwen con más evidencia | 16/20 | Rechazos de consultas compuestas y parciales; un error de proveedor. |
| Qwen con instrucciones revisadas | 19/20 | La revisión manual detectó omisión de DAMA, atribución indebida a Oracle y confusión entre steward y custodio; el caso parcial fue rechazado. |
| Gemini, segunda ejecución local | 19/20 | Un error de transporte; mejor cobertura y roles. Se detectaron IDs visibles y una expansión de sigla sin respaldo explícito. |
| Gemini en VPS, contrato con booleano | 19/20 | Sin errores de transporte; el caso parcial se descartó por la contradicción entre `supported=false` y sus citas válidas. |
| Gemini en VPS, contrato final | 20/20 | Respuestas simples, compuestas, seguimiento, cambio de tema y soporte parcial correctos; rechazo de los dos temas ajenos. Sin errores de transporte. |

Los fallos permanecen en los informes de la evaluación; repetir una variante no reemplaza un intento fallido. Los JSON locales están en `output/certichat-answer-*.json`, fuera de Git. El comando reproducible está en el README del servicio.

## Resultado final en VPS

Los veinte turnos tardaron entre 2,64 y 4,92 segundos, con 64,27 segundos acumulados. OpenRouter informó US$0,0045615 por la generación de respuestas; no incluye el coste de embeddings de recuperación. El informe final es `output/certichat-answer-vps-final.json`; el intento anterior se conserva como `output/certichat-answer-vps-boolean.json`.

La conversación reportada se reprodujo literalmente. Tras «que sabes de dama y oci», la pregunta «en donde puedo investigar mas sobre este tema o relacion» recomendó Data Management Fundamentals y devolvió [Tu Punto de Partida](https://jgangini.github.io/certitips/data-governance/overview/). La interfaz añade ese enlace al detectar la petición de referencias. La pregunta parcial explica DAMA y declara que no dispone del pronóstico; los dos temas completamente ajenos se rechazan.

La revisión semántica confirma cobertura de los conceptos, roles y continuidad, sin IDs internos visibles ni la expansión no respaldada de DAMA observada antes. Conserva dos observaciones menores: una respuesta usa «un modelo de lenguaje, como un chatbot», impreciso porque el chatbot es una aplicación del modelo; otra cita dos fragmentos distintos de la misma URL. El resto de la explicación modelo/herramientas/runtime es coherente. El 20/20 acredita los controles funcionales y de procedencia, no perfección semántica.

La sesión pública nueva informa `available=true`, `authenticated=false` y `verificationRequired=true`: el servicio está listo y conserva Turnstile. Backend y vista previa local se actualizaron al contrato final sin cambiar el índice.

Validación determinista: 147 pruebas de backend/PostgreSQL y 105 de Node; build y comprobación del sitio aprobados. Interfaz: 22 grupos de escenarios en Chromium y otros 22 en WebKit, más 27 comprobaciones generales del chat. Graphify actualizado. Sentrux aprueba las once reglas y mantiene cero ciclos; el gate informa complejidad 18→19, una compensación documentada en [arquitectura](architecture.md), no un gate aprobado.

## Transporte y límites de la comprobación

Una comprobación de doce conexiones TLS nuevas a OpenRouter desde el contenedor local registró siete fallos `CERTIFICATE_VERIFY_FAILED: self-signed certificate in certificate chain`. Ocho conexiones nuevas desde el VPS devolvieron HTTP 200, y la primera matriz completa del VPS no tuvo errores de transporte. No se deshabilitó la verificación TLS. Este hallazgo local no demuestra que las capturas de error de un iPhone tuvieran la misma causa.

La evaluación usa la misma recuperación y proveedor desplegados, pero invoca el servicio desde el contenedor; no recorre Turnstile ni Safari físico. Los controles HTTP de sesión se cubren por integración y la interfaz mediante DOM en Chromium y WebKit. No se tomaron capturas. Es una muestra funcional, no una prueba de carga ni garantía de exactitud universal.

## Grafo

Las etiquetas centran el concepto con la transición existente; la tarjeta muestra su nombre y fuentes de la consulta actual. Se aclararon nodos y líneas grises y se quitó el margen bajo la cabecera. Se verificaron 32 enlaces y anclas reales del primer informe VPS, todos válidos.

Es posible representar los mismos nodos y relaciones en 3D con un renderer como [3d-force-graph](https://github.com/vasturiano/3d-force-graph). Se conserva 2D para esta corrección; no se realizó un benchmark de 3D ni se añadió una dependencia.
