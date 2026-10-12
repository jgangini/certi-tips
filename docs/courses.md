# Editar y añadir cursos

El catálogo de [CertiTips](../README.md) y las fuentes de cada curso viven en `data/`. El sitio se genera en `dist/`; no se edita a mano.

## Dónde editar

```text
data/
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

Las especificaciones de autoría utilizadas se guardan en `architecture/` dentro del curso. Los iconos compartidos pertenecen a `assets/icons/`; los gráficos específicos acompañan al Markdown que los usa.

| Archivo o campo | Responsabilidad |
| --- | --- |
| `data/catalog.json` → `courses` | Identidad del curso, módulos, recursos, banco de preguntas y cobertura. |
| `contentDir` y `route` | Código de la carpeta fuente bajo `data/` y ruta pública del curso. |
| `page.file` | Ruta del Markdown, por ejemplo `00_empieza_aqui/00_empieza_aqui.md`. |
| `page.slug` | Segmento de la URL del módulo; independiente del nombre del archivo. |
| `questions.json` | Preguntas originales con opciones, explicaciones y referencias. |
| `coverage.json` | Relación entre unidades de aprendizaje y apartados publicados. |

Los IDs de cursos, preguntas y fuentes son estables: permiten conservar progreso, intentos y referencias. Para renombrar una carpeta, cambiar su ruta fuente sin reutilizar esos IDs para otro contenido.

## Actualizar un módulo

1. Editar su Markdown. El catálogo proporciona el H1; usar H2 y H3 para los apartados.
2. Enlazar las páginas internas con `{{base}}<código>/<slug>/`. Las anclas se generan en minúsculas, sin tildes y con guiones; actualizar las referencias si cambia un encabezado.
3. Colocar cada gráfico en `img/` junto al Markdown y enlazarlo como `img/nombre.svg`. El título de la imagen Markdown proporciona su descripción breve. Consultar las [reglas de diagramas](../.codex/AGENTS.md#diagram-design) antes de editar el SVG.
4. Actualizar las preguntas y la cobertura afectadas. Cada pregunta necesita cuatro opciones con ID, una respuesta correcta, explicación por opción y una sección de referencia existente.
5. Comprobar las fuentes oficiales cuando cambien productos, versiones o condiciones del examen. Registrar la revisión en el catálogo y en el checklist del curso.

## Añadir otra certificación

1. Crear `data/<código>/` con sus módulos numerados, imágenes, preguntas y cobertura. Usar un curso existente como ejemplo del esquema, escribiendo material propio.
2. Añadir su objeto a `courses` en el catálogo: `contentDir`, `route`, `modules`, `resources`, `questionBank`, `coverage` y `lessonCounts`. Incluir datos de examen solo cuando correspondan.
3. Ordenar los módulos desde `00_empieza_aqui`. Cada módulo técnico utiliza seis preguntas originales y cada intento selecciona dos; los recursos complementarios no añaden otro dominio de preguntas.
4. Asociar el ID del curso al campo `guide` de su entrada en `paths`. Una ruta sin guía conserva el estado de próximamente.
5. Ejecutar las comprobaciones y revisar la navegación, la práctica y los diagramas en los tamaños afectados antes de publicar.

Los slugs pueden repetirse entre cursos. Cuando el ID histórico y la ruta pública difieren, el constructor conserva redirecciones con el fragmento de sección. Esas páginas pequeñas de compatibilidad no son versiones del curso.

## Validar y publicar

```sh
npm run build
npm test
npm run check
```

Para el flujo completo de arquitectura y las comprobaciones de navegador, seguir la [guía de validación](../.codex/validation.md). GitHub Actions valida los PR y los cambios en `main`; publica desde `main` cuando las comprobaciones pasan.

El build genera también el corpus de CertiChat con introducciones, apartados y preguntas explicadas. Mover archivos sin cambiar sus textos, IDs, títulos o URL no cambia el conocimiento. La sincronización de [CertiQuiz](../services/certiquiz/README.md#actualizar-preguntas-desde-github) y de [CertiChat](../services/certichat/README.md#contenido-y-respuestas) se documenta en cada servicio.
