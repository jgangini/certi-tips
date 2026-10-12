# CertiTips

Guías visuales en español para preparar certificaciones con conceptos, ejemplos y práctica explicada.

**Sitio:** https://jgangini.github.io/certitips/

La portada organiza las rutas Oracle en **Foundation**, **AI & Agents**, **Data & AI** y **Architecture**. **Governance** reúne el curso aplicado de DAMA. La secuencia es una recomendación editorial, no un prerrequisito oficial. Las rutas sin guía propia se marcan como próximas y enlazan el contenido oficial de Oracle.

Guías disponibles:

- **Oracle Agentic AI Foundations Associate · 1Z0-1157-26**: orientación, seis módulos técnicos, 53 lecciones fuente y 36 preguntas originales; 12 por intento.
- **Oracle Cloud Infrastructure AI Foundations Associate · 1Z0-1122-26**: orientación, nueve módulos técnicos, 72 lecciones fuente y 54 preguntas originales; 18 por intento. Incluye fundamentos de IA, ML, DL, IA generativa, Enterprise AI, portafolio, servicios de OCI e IA para bases de datos.
- **Oracle Cloud Infrastructure Foundations Associate · 1Z0-1085-26**: orientación, siete módulos técnicos, 57 lecciones fuente, 49 diagramas y 42 preguntas originales; 14 por intento. Un caso de tienda conecta arquitectura, IAM, red, cómputo, almacenamiento, seguridad y gobierno.
- **Data Management Fundamentals · CDMP-DMF**: once áreas de DAMA aplicadas con Oracle Cloud, 66 preguntas originales y 22 por intento. Es un curso de gestión de datos, no una certificación Oracle.

Las guías Oracle incluyen gráficos por apartado, ejemplos, ejercicios con solución, glosario y ruta al examen. El progreso y los intentos se guardan por curso. Los módulos pedagógicos y el reparto de preguntas propias no reproducen la ponderación del examen oficial.

## Desarrollo local

Requiere Node.js 24 y npm. Las guías y la práctica individual funcionan como sitio estático. El módulo opcional **CertiQuiz** añade salas de práctica en grupo mediante una API independiente; su [desarrollo y despliegue](services/certiquiz/README.md) requieren Docker. La interfaz permanece dentro de CertiTips y no incluye credenciales del servidor.

**CertiChat** añade consultas con fuentes sobre el contenido publicado. Su [configuración, límites y despliegue](services/certichat/README.md) usan una API independiente, Turnstile, Cognee y OpenRouter. La única variable del build es la clave pública `CERTICHAT_TURNSTILE_SITE_KEY`; los secretos permanecen en la VPS.

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run check
npm run preview
```

Abrir `http://127.0.0.1:4173/certitips/`. El servidor solo escucha en loopback. Las páginas generadas se encuentran en `dist/`; no se editan ni se registran en Git.

El botón **Search** y `Ctrl+K` buscan certificaciones y apartados de la guía; el botón contiguo cambia entre los modos claro y oscuro. La preferencia queda en el navegador.

## Actualizar el contenido

- Editar los capítulos en `content/<código>/<NN_nombre>/<NN_nombre>.md`: `1Z0-1085-26`, `1Z0-1122-26`, `1Z0-1157-26` o `CDMP-DMF`. Por ejemplo, `content/CDMP-DMF/00_empieza_aqui/00_empieza_aqui.md`. El encabezado H1 procede del catálogo; usar H2/H3 dentro de cada capítulo.
- `{{base}}` se convierte en `/certitips/` durante la construcción. Usarlo en enlaces internos; las imágenes de cada capítulo usan `img/nombre.svg` o `img/nombre.png` junto a su Markdown.
- Los IDs de encabezado se generan en minúsculas, sin tildes y con guiones. Si cambia un encabezado, actualizar las referencias que apunten a él.
- En Data Management Fundamentals, los títulos de página, apartados y etiquetas de navegación llevan mayúscula inicial en las palabras significativas: «Gobierno de Datos», «Conceptos Clave» y «Fuentes y Repaso». Artículos, preposiciones y conjunciones quedan en minúscula salvo al inicio. Conservar siglas y nombres oficiales de productos.
- `data/catalog.json` define `route` y `contentDir` por código; cada página tiene un `file` numerado independiente de su `slug` público. Los `course.id` y `slug` se conservan para progreso, preguntas y procedencia. Cada curso selecciona `questionBank`, `coverage` y `lessonCounts`. Sus archivos `data/<código>/coverage.json` relacionan 250 unidades con secciones reales; los identificadores de lecciones no son copias de Markdown publicadas.
- `data/<código>/questions.json` contiene el banco independiente de cada curso. Cada pregunta tiene cuatro opciones con ID estable, explicación propia, una respuesta correcta y referencia a una sección real. Mantener seis preguntas por módulo técnico; cada intento selecciona dos por módulo.
- Los SVG del `img/` de cada módulo son locales, accesibles y ampliables. Mantener `title`, `desc`, texto legible y ninguna dependencia externa. Las ilustraciones vigentes acompañan al Markdown o al SVG que las usa. Son vistas conceptuales, no topologías listas para desplegar. `assets/` contiene recursos compartidos; `assets/icons/` reúne iconos, medallas, favicon y sus licencias.
- Cada H2 de los módulos técnicos debe tener un gráfico didáctico específico. El título opcional de la imagen Markdown es su descripción breve debajo del gráfico. Las soluciones visuales de ejercicios se colocan dentro de `<details>`. Las reglas de diseño y composición están en [.codex/AGENTS.md](.codex/AGENTS.md).
- `videos/certification-path-motion/` contiene el proyecto editable de HyperFrames basado en `hw-pipeline`. La portada reproduce `assets/motion/certification-path.mp4` y conserva un resumen textual accesible si el video no carga. Las cachés, vistas previas y copias de trabajo del editor no se publican.

Comprobar las fuentes oficiales al actualizar versiones, nombres o condiciones del examen. Registrar la fecha de revisión en el catálogo y el checklist. Las explicaciones de CertiTips son independientes del material oficial.

## Estudiar o explicar el taller

Cada curso comparte la misma guía para alumnos y facilitadores. Recorrer sus módulos, ampliar los diagramas y discutir las explicaciones de la práctica. No existe un modo separado ni una agenda con tiempos. El antiguo enlace `/talk/` redirige al inicio de la guía. Los diagramas se cierran con Escape; el pie fijo reserva su altura real para no tapar el contenido.

El menú izquierdo organiza módulos y apartados como ramas desplegables; las secciones se obtienen de los encabezados Markdown. La práctica muestra sus instrucciones solo al inicio. **Reiniciar test** borra las respuestas del intento, pide confirmación si está incompleto y conserva el progreso de lectura del curso.

## Otra certificación

Para desarrollar otra guía, añadir su objeto en `courses`, sus capítulos numerados bajo `contentDir` y `file`, su banco y su matriz de cobertura, y poner su ID en el campo `guide` de la ruta correspondiente dentro de `paths`. Los slugs pueden repetirse entre directorios de cursos. El constructor publica bajo `route` y conserva alias por ID, incluido `/data-governance/` hacia `/CDMP-DMF/`, manteniendo el fragmento de los enlaces de módulo. La búsqueda incluye los temas de todos los cursos; el validador comprueba cada banco, cobertura y enlaces. No duplicar un banco ajeno bajo un título nuevo.

```text
content/<código>/NN_nombre/    Markdown del módulo e imágenes en img/
data/<código>/                Preguntas, cobertura y especificaciones de autoría
data/catalog.json            Inventario de cursos y rutas
assets/                      Componentes y recursos compartidos
services/                    APIs independientes de CertiQuiz y CertiChat
dist/                        Sitio generado; no se edita ni se versiona
```

Los 50 Markdown actuales producen 528 documentos de recuperación: 50 introducciones, 279 apartados, 198 preguntas explicadas y la portada. Mover o juntar archivos no elimina esas unidades: conservarlas permite citar la sección exacta. Los informes de experimentos y revisión se guardan en `output/`, ignorado por Git; las reglas vigentes y decisiones de arquitectura se conservan en `.codex/`.

## Validación y publicación

Los scripts de arquitectura son `scripts/arch-preflight.ps1` y `scripts/arch-postflight.ps1`. Requieren Graphify y Sentrux instalados localmente. `.sentrux/rules.toml` define los límites del proyecto; el gate compara la estructura contra el estado previo de la aplicación.

GitHub Actions instala desde el lockfile, construye, ejecuta pruebas y comprueba enlaces, cobertura y preguntas. Solo publica `dist/` después de superar las comprobaciones en `main`. Las pull requests validan sin desplegar.

Los resultados y compensaciones intencionales del gate se conservan en [.codex/improvement-log.md](.codex/improvement-log.md). No se reemplaza el baseline para ocultar un resultado DEGRADED. Las pruebas Node se ejecutan en un solo proceso para evitar el bloqueo EPERM de este sandbox Windows; los tests restauran sus cambios globales.

Para comprobar el navegador, abrir una sesión aislada de `playwright-cli` en el sitio y ejecutar `run-code --filename scripts/browser-smoke.cjs` para Agentic AI y portada. Ejecutar `run-code --filename scripts/ai-foundations-smoke.cjs` para las 13 páginas nuevas en tres anchos, sus 63 gráficos de sección, práctica completa de 18 preguntas, repaso y separación de almacenamiento entre cursos. Ejecutar también `run-code --filename scripts/diagram-check.cjs` para medir recortes y superposiciones de texto en todos los SVG enlazados por ambos cursos. Las mediciones esperan a que carguen las imágenes y aparezca el control de avance. Son comprobaciones DOM y funcionales; no toman capturas de pantalla.

En la práctica individual, el avance y las respuestas se almacenan en `localStorage` bajo claves `certitips:*`, sin analítica ni envío de respuestas. Si el almacenamiento está bloqueado, continúa en memoria durante la sesión. En CertiQuiz, el alias y las respuestas de la partida se envían a su API para sincronizar la sala y calcular los resultados; las sesiones usan cookies HttpOnly.

## Créditos y alcance

Autor: jgangini. Diseño y explicaciones originales inspirados en el formato de un workshop, sin incluir el renderizador ni la marca de Oracle LiveLabs. Oracle y otros nombres de producto pertenecen a sus titulares. Esta guía no es un examen oficial ni emite credenciales.

Código y contenido original: licencia MIT. Las fuentes oficiales enlazadas conservan sus propias condiciones.
