# Autoría de fichas de CertiTube

La fuente única reside en `data/es/certitube/<videoId>/`. Validar e interpretar la ficha española antes de traducir su presentación. Conservar videoId, tiempos y fragmentos `t-<segundos>`. Audio, video y subtítulos del proveedor no se traducen mediante este proceso. Ver [Internacionalización](internacionalizacion.md).

Una ficha Markdown es la única fuente de la página, la búsqueda y la evidencia del video. Su presentación se define en [diseno-interfaz.md](diseno-interfaz.md); las comprobaciones, en [validation.md](validation.md).

## Identidad y publicación

- Crear `data/es/certitube/<videoId>/<videoId>.md`. El ID de YouTube tiene once caracteres y coincide en carpeta, archivo y metadatos. `img/` es opcional para ilustraciones SVG propias.
- Mantener la ficha como `draft` hasta revisar título, descripción, recursos, duración y tiempos con las fuentes del autor. Los borradores se excluyen de páginas, búsqueda, imágenes y corpus.
- Usar el título revisado aprobado por el usuario, natural y sin prefijos redundantes ni una raya editorial impuesta. Puede conservar un título en inglés aprobado: no se exige copiar errores del título de YouTube ni traducir nombres oficiales.
- `publishedAt` y `reviewedAt` son fechas reales `YYYY-MM-DD`. `addedAt` registra la incorporación efectiva con fecha, hora y zona horaria; conservarlo al revisar la ficha. El orden y la entrada de CertiTube dependen de `addedAt`, no de la fecha de publicación del video.
- Conservar ID, ruta y anclas temporales. Mantener las transcripciones completas fuera del repositorio y no publicar datos de trazabilidad interna.

## Plantilla

Ejemplo basado en una ficha existente. Para un video distinto, reemplazar todos los datos por valores verificados; no reutilizar su ID, fechas, duración o contenido como valores predeterminados.

````markdown
```json
{
  "title": "AI Data Platform Workbench for VS Code Community",
  "videoId": "MWASexQNDVU",
  "channelUrl": "https://www.youtube.com/@jgangini",
  "publishedAt": "2026-08-15",
  "addedAt": null,
  "reviewedAt": null,
  "durationSeconds": 108,
  "status": "draft",
  "topics": ["Oracle AI Data Platform", "VS Code"]
}
```

## Resumen

¿Quieres trabajar con Oracle AI Data Platform desde VS Code?

En esta demo visual, sin narración, se presenta una extensión comunitaria para trabajar con notebooks remotos.

## Capítulos

### 00:00 — Video completo

La demostración presenta la extensión comunitaria y su integración con el editor.

## Recursos relacionados

- [Video completo en AI CloudTech](https://www.youtube.com/watch?v=MWASexQNDVU)
- [Repositorio y documentación de la extensión](https://github.com/jgangini/oci-ai-data-platform-workbench)
````

El primer bloque debe ser JSON cercado con `json`; no usar cabecera YAML ni H1. Antes de cambiar a `published`, completar `addedAt` y `reviewedAt` con fechas reales y revisar la ficha completa.

## Resumen y capítulos

- Mantener exactamente los H2 `Resumen`, `Capítulos` y `Recursos relacionados`. Usar H3 solo para los capítulos temporales bajo `Capítulos`.
- En el resumen, separar la pregunta inicial de la explicación con una línea en blanco. Escribir párrafos breves y completos, con hechos verificados; no perder los párrafos posteriores al primero.
- Usar tiempos `mm:ss` o `hh:mm:ss`, ascendentes, únicos y menores que la duración. Comprobarlos con capítulos publicados o subtítulos con tiempos del autor; no inferirlos a partir de la longitud del texto.
- Escribir los nombres de capítulos con capitalización de oración. Sus fragmentos son `#t-<segundos>` y no cambian por renombrar el capítulo.
- Cuando no existan segmentos verificables, conservar únicamente `00:00 — Video completo` con la explicación disponible. El sitio oculta la barra y la explicación duplicada, pero conserva `#t-0` para las citas. No inventar divisiones.
- Usar enlaces Markdown con títulos completos y claros, sin puntos finales sueltos. No acortar texto ni URLs para simular puntos suspensivos: la presentación aplica la elipsis y conserva el título completo.
- Los enlaces internos usan `{{base}}`. No insertar HTML, SVG, estilos, controles de reproducción, ni los bloques retirados `Caso de uso` y `Arquitectura` en la ficha.
- Distinguir lo que demuestra el video de una recomendación vigente. No presentar un procedimiento histórico como capacidad actual sin verificarlo.

## Límites y evidencia

| Campo o contenido | Límite |
| --- | --- |
| Título y cada tema | Hasta 180 caracteres; no vacíos. |
| Temas | Entre 1 y 12. |
| Archivo completo | Hasta 100.000 caracteres. |
| Resumen completo | Hasta 1.500 caracteres, incluidos todos sus párrafos. |
| Cada sección de evidencia | Hasta 3.000 caracteres, incluyendo título, tiempo, fechas y temas añadidos por el constructor. |

No cambiar estos límites para hacer pasar una ficha. Condensar preservando el significado y verificar el resultado construido. La validación estructural no comprueba la exactitud factual ni los tiempos.

Las fichas publicadas usan `courseId: "site"` y URLs canónicas en el corpus existente. La miniatura externa usa únicamente la ruta fija admitida de `i.ytimg.com` para videos publicados. No ampliar por comodidad la lista de destinos seguros.

Compilar prepara el corpus local; no actualiza el almacén Cognee activo. Los colores del grafo y los enlaces dependen de la procedencia validada, no de palabras del título. Conservar el contrato de fuentes al cambiar la ficha.

## Comprobación antes de publicar

Revisar fuentes del autor, fidelidad del resumen, recursos, duración, segmentos y fechas; ejecutar el flujo de contenido publicado de [validation.md](validation.md). Si se modifica reproducción o presentación, añadir la prueba de navegador de CertiTube y las comprobaciones compartidas afectadas. Probar citas temporales e historial sin consultas pagadas ni capturas.
