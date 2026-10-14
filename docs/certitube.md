# Incorporar un video a CertiTube

Crear `data/certitube/<videoId>/<videoId>.md`. El ID de YouTube de once caracteres debe coincidir con la carpeta, archivo y metadatos. La ficha es la única fuente de la página, búsqueda y corpus de CertiChat. Mantener las transcripciones completas fuera del repositorio; `img/` es opcional para ilustraciones propias.

La entrada `/certitips/certitube/` abre el último video incorporado por `addedAt`. Cada video conserva su ruta por ID y sus anclas temporales. El carrusel ordenado aparece a la derecha en escritorio y debajo del reproductor en móvil; no hay menú lateral ni botón para abrirlo. Los accesos CertiQuiz/CertiTube se conservan en portada y como iconos cuadrados inmediatamente antes de Search. El buscador global muestra cursos y videos, diferenciando estos últimos con el icono azul.

Copiar esta plantilla, reemplazar los valores y conservar `draft` hasta revisar título, descripción, recursos y momentos contra las fuentes del autor:

````markdown
```json
{
  "title": "Título original del video",
  "videoId": "Ha74VhpQwQo",
  "channelUrl": "https://www.youtube.com/@jgangini",
  "publishedAt": "2026-10-05",
  "addedAt": null,
  "reviewedAt": null,
  "durationSeconds": 298,
  "status": "draft",
  "topics": ["Oracle AI Data Platform"]
}
```

## Resumen

Explicación breve de lo que enseña el video y del alcance de su demostración.

## Capítulos

### 00:00 — Inicio

Descripción de este momento, respaldada por el material del autor.

### 00:14 — Presentación de la demo y mapa por capas

Explicación revisada de este segmento.

## Recursos relacionados

- [Video completo en AI CloudTech](https://www.youtube.com/watch?v=Ha74VhpQwQo).
- [Repositorio del proyecto](https://github.com/bilawalsidhu/gods-eye-view).
````

Usar fechas reales `YYYY-MM-DD` en `publishedAt` y `reviewedAt`. Al incorporar una ficha, registrar la fecha y hora efectiva con zona horaria en `addedAt`; conservarla al revisarla. Este campo determina el orden, independientemente de la publicación en YouTube. En la primera importación de cinco videos se registraron del más antiguo al más reciente para respetar el orden solicitado.

Los capítulos usan H3 bajo `## Capítulos`, con tiempos `mm:ss` o `hh:mm:ss` comprobados, ascendentes, únicos y menores que la duración. Se aceptan los capítulos publicados por el autor o revisados contra subtítulos con tiempos. Si no existen tiempos verificables, usar únicamente `00:00 — Video completo` con la descripción disponible; no inventar divisiones. Un título distinto conserva la ancla del segundo. No escribir controles de reproducción manualmente.

La tarjeta tiene un encabezado compacto con el nombre original del video y el formato compartido de Cognee. Dentro de ella aparecen, en orden: reproductor, Resumen, fila horizontal de capítulos, explicación seleccionada y Recursos relacionados. Los títulos de los bloques son pequeños y rojos; los nombres en la fila de capítulos se muestran en mayúsculas. Los recursos usan el icono de enlace proporcionado, sin sangría de viñetas y con texto del color principal del tema, blanco en modo oscuro. No incluir los bloques eliminados Caso de uso o Arquitectura ni repetir el título y resumen fuera de la tarjeta.

La barra usa las flechas SVG y botones de Cognee. Clic, teclado, historial y citas reutilizan el mismo reproductor. La explicación cambia con una transición de altura y texto de 240 ms; un cambio rápido cancela la animación previa. Movimiento reducido elimina las animaciones. Al entrar sin tiempo se muestra la primera explicación y el video permanece detenido. Durante reproducción, la API de YouTube se consulta cada 500 ms para seguir el capítulo actual, incluido un salto nativo hacia atrás, sin buscar otra vez, mover la página ni añadir historial. El seguimiento se detiene al pausar, terminar, ocultar la página o fallar el reproductor.

Los controles nativos de YouTube permiten reproducir y pausar. Si se bloquea el inicio, se indica que pulses reproducir en el video; el enlace externo solo aparece ante fallo de integración y conserva el segundo seleccionado. En escritorio el contenido se acomoda suavemente al abrir CertiChat; el panel móvil deja accesible el video mediante desplazamiento.

El primer párrafo de Resumen alimenta los metadatos y debe tener menos de 1.500 caracteres. Los títulos/temas admiten hasta 180 caracteres y doce temas; la fuente completa, 100.000 caracteres. Cada sección de evidencia debe caber en 3.000 caracteres, incluyendo el título, tiempo, fechas y temas añadidos por el build. No incluir HTML activo, marcadores provisionales ni procedimientos históricos presentados como recomendaciones actuales. Los enlaces internos usan `{{base}}`. El build comprueba estructura, no exactitud factual.

Las fichas publicadas entran en el corpus existente con `courseId: "site"` y enlaces canónicos. Los borradores quedan fuera de páginas, búsqueda, imágenes y evidencia. En el grafo, una fuente temporal de CertiTube identifica nodos azules; una relación azul requiere una fuente de video común a ambos extremos. El resto de evidencia mantiene rojo. La leyenda conserva el formato del indicador de zoom. El build local no actualiza ni indexa el Cognee activo.

Ejecutar preflight antes de los cambios y después `npm run build`, `npm test`, `npm run check` y postflight. Con preview iniciado, la regresión DOM se ejecuta con `npx --yes --package @playwright/cli playwright-cli -s=certitubeqa run-code --filename scripts/certitube-browser-smoke.cjs`; simula API y YouTube, sin consultas pagadas ni capturas. Para ejemplos revisados consultar la [primera ficha](../data/certitube/Ha74VhpQwQo/Ha74VhpQwQo.md) y la [ficha de migración](../data/certitube/ZjfQUwUdpbI/ZjfQUwUdpbI.md). Ver el [plan de integración](certitube-plan.md).
