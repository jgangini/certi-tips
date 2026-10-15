# Autoría de contenido Markdown

Aplicar al crear o revisar cursos, módulos, recursos, preguntas y cobertura de CertiTips. Para videos, usar [certitube.md](certitube.md). Los gráficos siguen [diagram-design.md](diagram-design.md) y la presentación compartida sigue [diseno-interfaz.md](diseno-interfaz.md).

## Fuentes y estructura

```text
data/es/
  catalog.json
  <código>/
    00_empieza_aqui/
      00_empieza_aqui.md
      img/
    01_nombre_del_modulo/
      01_nombre_del_modulo.md
      img/
    questions.json
    coverage.json
```

- `contentDir` y `route` usan el código del curso. `page.file` identifica el archivo fuente; `page.slug` determina su ruta pública y no depende del nombre físico del archivo.
- Numerar los directorios según el orden de `modules` seguido por `resources`; la introducción es `00_empieza_aqui`. Conservar los identificadores y las rutas existentes al reorganizar fuentes.
- Mantener las especificaciones particulares de autoría dentro de `architecture/` del curso cuando existan. Son datos del curso, no sustituyen estas reglas comunes.
- Las imágenes del módulo residen en su `img/`; los iconos globales pertenecen a `assets/icons/`. No duplicar lecciones ni bancos en otras carpetas.
- Para añadir un curso, registrar módulos, recursos, banco, cobertura y `lessonCounts` en el catálogo. Asociar su ID mediante `paths[].items[].guide` y usar el nivel de la clasificación existente. La entrada de Data Management Fundamentals corresponde a nivel 1; su naturaleza aplicada no sustituye el nivel por otra etiqueta.

## Redacción y evidencia

Las versiones EN/PT-BR/IT se generan según [Internacionalización](internacionalizacion.md). Las traducciones del mismo banco conservan sus IDs; la regla de nuevos IDs al importar cuestionarios externos no se aplica a variantes de idioma.

- Dirigirse al estudiante en español claro. Explicar primero la idea, después el mecanismo y un caso concreto, y finalmente sus condiciones o límites. Usar párrafos breves y conectados; listas para pasos o elementos paralelos y tablas para comparaciones reales.
- Respetar la capitalización editorial del curso. En CDMP-DMF, los títulos y la navegación llevan mayúscula en las palabras principales, con artículos, preposiciones y conjunciones en minúscula salvo al inicio. No imponer este estilo a capítulos de video, que usan capitalización de oración.
- Usar negrita para conceptos o decisiones relevantes; código en línea para identificadores y valores técnicos. Evitar mayúsculas sostenidas en la prosa, títulos repetidos, texto decorativo y generalidades sin explicación.
- Verificar capacidades y condiciones cambiantes en documentación oficial pública, notas de versión y avisos de ciclo de vida. Para cambios de capacidades Oracle, contrastar también las conversaciones de producto en Slack cuando haya acceso autorizado. Si falta una fuente, indicar la limitación; no afirmar una revisión que no se hizo.
- Registrar fecha, alcance y estado de la evidencia: disponible, vista previa (`Preview`), extensión implementada o anuncio. Una vista previa puede usarse en su alcance documentado; un anuncio no prueba disponibilidad. Citar fuentes públicas en la lección y mantener la evidencia interna en `.private/`.
- Verificar edición e idioma antes de actualizar un examen. No extrapolar cifras de una variante japonesa u otro idioma al resto de versiones. Los datos históricos de revisión no equivalen a una confirmación actual.
- Usar casos ficticios y nombres oficiales de productos. En CDMP-DMF, escribirlos completos en prosa, diagramas y preguntas, sin abreviarlos a AIDP, OAC, EDM u OCI; conservar sin cambios los identificadores técnicos y las URLs.
- CDMP-DMF es un curso aplicado de DAMA, no una certificación Oracle. Consultar el material proporcionado de forma selectiva; la trazabilidad de libro, capítulo y página permanece en `.private/`. No publicar material interno, agendas de instructor, duraciones estimadas ni criterios internos de selección del curso.
- En gobierno de datos, conservar el enfoque aprobado en Oracle AI Data Platform y Oracle Autonomous AI Lakehouse. No recomendar OCI Data Catalog independiente para diseños nuevos. Distinguir catálogos, identidades y políticas, sin afirmar sincronización o autorización propagada sin evidencia.

## Contrato del Markdown publicado

- El catálogo proporciona título principal e introducción de la página. No repetir un H1 en el archivo. Usar H2 para apartados y H3 para subdivisiones, sin saltos arbitrarios de jerarquía.
- Dejar líneas en blanco entre párrafos, encabezados, listas, tablas y bloques de código. Indicar el lenguaje en las cercas de código. No usar espacios, saltos repetidos o HTML de presentación para simular una maquetación.
- Enlazar páginas internas mediante `{{base}}<código>/<slug>/` y añadir solo fragmentos que existan. Los encabezados generan anclas; al renombrarlos, actualizar enlaces, referencias de preguntas y cobertura. Verificar el resultado del constructor en vez de suponer el identificador generado.
- Usar `![Título accesible](img/nombre.svg "Descripción que explica la figura.")`. El texto alternativo identifica el gráfico y la descripción explica su significado y utilidad. Mantenerlos coherentes con `title` y `desc` del SVG; no repetir el título como única explicación.
- Cada H2 técnico debe tener un gráfico didáctico específico que explique su mecanismo. Elegir su representación por el contenido; no añadir una fila genérica de tarjetas para cumplir formalmente la regla.
- Conservar ejemplos, ejercicios, fuentes, glosario y práctica en la estructura existente del curso. Las soluciones usan el patrón nativo de `<details>` cerrado; no añadir `open` por defecto.
- El HTML de lecciones queda limitado a los patrones ya admitidos, como soluciones y anclas explícitas existentes. No añadir scripts, estilos, controles interactivos propios ni contenido activo. Las fichas de video no admiten HTML.

### Esqueleto de un apartado

Ejemplo de estructura, no material listo para publicar: sustituir texto, rutas e imagen por fuentes reales y comprobadas.

````markdown
## Concepto del módulo

Explica qué resuelve, cómo funciona y qué condición debe cumplirse.

![Relación entre los elementos](img/diagrama.svg "Explica la relación y qué permite comprender.")

### Ejemplo aplicado

Describe una situación concreta y recorre la decisión con sus consecuencias.

### Ejercicio

Plantea una decisión que pueda resolverse con lo explicado.

<details>
<summary>Solución razonada</summary>

Explica la respuesta, la evidencia y por qué corresponde a este caso.

</details>
````

La plantilla no obliga a repetir todos los subtítulos en cada apartado. Priorizar una explicación completa y natural sobre un esquema mecánico.

## Banco de preguntas y práctica

- Guardar un solo banco en `data/es/<código>/questions.json` y registrarlo como `<código>/questions` en `questionBank`. Reutilizar el esquema existente y su validador real de CertiQuiz.
- Cada pregunta tiene cuatro opciones con identificadores estables, una sola correcta, su explicación y una referencia a una sección real. `explanation` es una cadena en cada opción; puede estar vacía en distractores cuando la fuente no los explica.
- Los bancos originales usan seis preguntas por módulo técnico. Si el material fuente contiene otra distribución, preservar todas sus preguntas y declarar `questionCounts` con cada módulo técnico y su cantidad exacta, al menos dos por dominio. No inventar preguntas para alcanzar seis.
- Cada intento selecciona dos preguntas por módulo; no confundir este muestreo ni los objetivos de estudio con ponderaciones oficiales del examen o notas de aprobación. Conservar el intento finalizado durante el repaso.
- Al importar un `quiz.md`, traducir íntegramente pregunta, alternativas en su orden y `Rationale`. Tomar la clave de `Correct Answer`, nunca de `Selected Answer`. No reemplazar la justificación por un resumen propio ni inventar explicaciones de distractores.
- Dar a las preguntas traducidas nuevos identificadores estables vinculados a su numeración de origen. Guardar ruta, hash y correspondencia en `.private/quiz-audits/`; revisar fidelidad semántica además del JSON.
- La página individual de práctica requiere un `quiz.md` fuente, aunque el banco pueda estar disponible en CertiQuiz sin esa página. Sus metadatos son exactamente `Práctica` y `Pon a prueba lo que entiendes`; su interfaz se define en [diseno-interfaz.md](diseno-interfaz.md).

## Aceptación editorial

Antes de dar por terminado el contenido:

1. Revisar que las explicaciones y ejemplos respondan a los objetivos sin inventar capacidades o fuentes.
2. Confirmar que no hay marcadores provisionales, rutas inexistentes, párrafos truncados ni duplicación de títulos.
3. Alinear catálogo, lecciones, imágenes, preguntas y cobertura. Las citas deben llegar al apartado concreto.
4. Ejecutar la compilación, pruebas y comprobación del sitio; añadir el validador de CertiQuiz cuando cambien catálogo, bancos o su contrato. Elegir las verificaciones de navegador pertinentes en [validation.md](validation.md).
5. Distinguir compilación local de publicación y actualización del índice: un cambio de contenido no autoriza por sí solo un despliegue o una reconstrucción pagada.
