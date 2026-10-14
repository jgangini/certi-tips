# CertiTube: integración y aceptación

CertiTube reúne demostraciones del canal [AI CloudTech](https://www.youtube.com/@jgangini). Cada ficha en `data/certitube/<videoId>/<videoId>.md` alimenta página, búsqueda global y corpus existente de CertiChat. Es independiente del catálogo de cursos y bancos de CertiQuiz; reutiliza el constructor Markdown, temas, enlaces seguros y contrato de fuentes. No requiere nuevas dependencias.

## Primera lista

El video de prueba se retiró. El orden solicitado, del más reciente al más antiguo, es:

1. [AI Data Platform for God's Eye View](../data/certitube/Ha74VhpQwQo/Ha74VhpQwQo.md).
2. [Oracle AI Data Platform Workbench for VS Code — Community Edition](../data/certitube/MWASexQNDVU/MWASexQNDVU.md).
3. [AI Data Platform Workbench: Data Lineage](../data/certitube/Wf5fisusQOc/Wf5fisusQOc.md).
4. [Oracle Select AI: Analiza Tus Datos Con Lenguaje Natural](../data/certitube/2qdNyl76opY/2qdNyl76opY.md).
5. [AI Data Plaform Cloud Migration Starter Kits](../data/certitube/ZjfQUwUdpbI/ZjfQUwUdpbI.md).

Se conservan los títulos del autor, incluidos sus errores originales. Los metadatos y recursos proceden de las páginas públicas de YouTube. Los capítulos de 1 y 5 se comprobaron con los SBV proporcionados; 2, 3 y 4 no publican capítulos y ofrecen una opción de video completo. Las transcripciones permanecen fuera del repositorio.

## Interfaz

La entrada abre la última incorporación por `addedAt`; la ruta por ID y las anclas `#t-<seconds>` son estables. El carrusel con miniaturas oficiales y los cinco videos ordenados ocupa la columna derecha en escritorio y una fila desplazable debajo del reproductor en móvil. No hay menú lateral ni Biblioteca. Las miniaturas externas se permiten solo desde la URL fija de YouTube para fichas publicadas, no desde otros hosts ni como scripts.

La tarjeta reutiliza el formato del encabezado de Cognee y muestra el nombre del video. Incluye reproductor, Resumen, capítulos, una explicación seleccionada y Recursos relacionados, sin los bloques descartados Caso de uso y Arquitectura. Los títulos compactos rojos siguen el estilo de Nivel 1; los botones de capítulos muestran nombres en mayúsculas. Los recursos tienen texto del color principal del tema e iconos de enlace, sin viñetas ni sangría amplia.

Los accesos CertiQuiz y CertiTube permanecen en portada y antes de Search como iconos cuadrados. El buscador global conserva el listado inicial de cursos y añade los videos con icono azul. Busca en el corpus Markdown real, prioriza títulos, admite acentos, prefijos y un error en términos largos, y devuelve extractos y anclas reales. Los acrónimos cortos se comparan por palabras; IA y AI son equivalentes. La carga es diferida, mantiene el texto de consulta y ofrece metadatos/reintento si falla.

Clic, teclado, historial y citas temporales reutilizan el mismo reproductor. Las explicaciones cambian suavemente, respetando movimiento reducido. La API de YouTube sigue el tiempo nativo durante reproducción sin provocar saltos, desplazar la página ni añadir historial, y suspende la consulta cuando está inactivo. Una visita sin fragmento permanece detenida. La recuperación externa conserva el tiempo y se muestra solo ante fallos.

Cursos y fichas comparten el ajuste suave del contenido al abrir el chat. Los botones del encabezado, acciones de chat, controles de mapa y envío tienen icono/borde rojo al pasar el mouse; las etiquetas de conceptos muestran sus líneas rojas y conservan el contraste de selección.

## Evidencia y grafo

La [plantilla editorial](certitube.md) exige metadatos válidos, revisión, resumen, capítulos explicados y recursos. Los borradores no se publican. Cada segmento conserva título, tiempo y fechas dentro del límite de 3.000 caracteres; se excluyen JSON, controles y resumen duplicado. El contrato continúa siendo `id`, `title`, `url`, `courseId`, `text`, con `courseId: "site"` y URL interna canónica.

La procedencia validada colorea los nodos de video en azul, sus relaciones con una fuente común en azul y sus ondas de selección en azul. La evidencia de guías permanece roja. Un concepto compartido con evidencia de video se muestra azul; no se deduce procedencia por su nombre o palabras de la consulta. La leyenda CertiTips/CertiTube usa los colores respectivos y el formato del porcentaje de zoom. Versiones distintas del grafo y consulta siguen rechazándose.

Construir el sitio prepara el corpus local. Publicar e incorporar ese corpus al índice activo son operaciones posteriores del flujo existente; el preview no actualiza Cognee ni consume indexación.

## Aceptación

Ejecutar preflight, build, tests, checker y postflight con Graphify/Sentrux, conservando la línea base original. Las pruebas cubren validación editorial, orden de incorporación, borradores, corpus, tiempos, seguimiento y procedencia de colores. El smoke CertiTube verifica búsqueda, recursos, carrusel, reproducción simulada, historial, citas con conversación conservada, errores, animación y geometría móvil/escritorio. El smoke del explorador comprueba hover, leyenda, selección de evidencia, ondas, movimiento reducido y controles. Las verificaciones usan DOM/API/logs; no capturas ni consultas pagadas.
