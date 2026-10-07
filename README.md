# CertiTips

Guías visuales en español para preparar certificaciones con conceptos, ejemplos y práctica explicada.

**Sitio:** https://jgangini.github.io/certi-tips/

La portada organiza once certificaciones en **Foundation Sprint** (tres certificaciones de nivel 1) y tres especialidades: **AI & Agents**, **Data & AI** y **Architecture**. Las flechas muestran un grupo a la vez, con sus certificaciones en lista; el menú superior permite ir directo a cualquiera. Dentro de cada especialidad, los niveles 2 y 3 van de fundamentos profesionales a aplicaciones más avanzadas. La secuencia es una recomendación editorial de CertiTips, no un prerrequisito oficial. **Oracle AI Data Platform Professional (1Z0-1154-26)** está en Data & AI, nivel 3: su [ruta oficial](https://mylearn.oracle.com/ou/learning-path/become-an-oracle-ai-data-platform-professional/164914) abarca datos gobernados y diseño, pruebas y despliegue de agentes. Essentials no se presenta como certificación. Los nombres visibles omiten el año; los códigos de examen y enlaces oficiales conservan su edición. Las rutas sin guía propia llevan al contenido oficial de Oracle.

Guías disponibles:

- **Oracle Agentic AI Foundations Associate · 1Z0-1157-26**: orientación, seis módulos técnicos, 53 lecciones fuente y 36 preguntas originales; 12 por intento.
- **Oracle Cloud Infrastructure AI Foundations Associate · 1Z0-1122-26**: orientación, nueve módulos técnicos, 72 lecciones fuente y 54 preguntas originales; 18 por intento. Incluye fundamentos de IA, ML, DL, IA generativa, Enterprise AI, portafolio, servicios de OCI e IA para bases de datos.
- **Oracle Cloud Infrastructure Foundations Associate · 1Z0-1085-26**: orientación, siete módulos técnicos, 57 lecciones fuente, 49 diagramas y 42 preguntas originales; 14 por intento. Un caso de tienda conecta arquitectura, IAM, red, cómputo, almacenamiento, seguridad y gobierno.

Las tres guías incluyen gráficos por apartado, ejemplos, ejercicios con solución, glosario y ruta al examen. El progreso y los intentos se guardan por curso. Los módulos pedagógicos y el reparto de preguntas propias no reproducen la ponderación del examen oficial.

## Desarrollo local

Requiere Node.js 24 y npm. Las guías y la práctica individual funcionan como sitio estático. El módulo opcional **CertiQuiz** añade salas de práctica en grupo mediante una API independiente; su [desarrollo y despliegue](services/certiquiz/README.md) requieren Docker. La interfaz permanece dentro de CertiTips y no incluye credenciales del servidor.

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run check
npm run preview
```

Abrir `http://127.0.0.1:4173/certi-tips/`. El servidor solo escucha en loopback. Las páginas generadas se encuentran en `dist/`; no se editan ni se registran en Git.

El botón **Search** y `Ctrl+K` buscan certificaciones y apartados de la guía; el botón contiguo cambia entre los modos claro y oscuro. La preferencia queda en el navegador.

## Actualizar el contenido

- Editar los capítulos de `content/` para Agentic AI, `content/oci-ai-foundations-2026/` para AI Foundations y `content/oci-foundations-2026/` para OCI Foundations. El encabezado H1 procede del catálogo; usar H2/H3 dentro de cada capítulo.
- `{{base}}` se convierte en `/certi-tips/` durante la construcción. Usarlo en enlaces internos e imágenes.
- Los IDs de encabezado se generan en minúsculas, sin tildes y con guiones. Si cambia un encabezado, actualizar las referencias que apunten a él.
- `data/catalog.json` define rutas, módulos, recursos y ficha del examen. Cada curso selecciona `contentDir` (vacío para el original), `questionBank`, `coverage` y `lessonCounts` (conteos fuente en orden de módulos, incluida orientación). Los tres archivos `data/coverage*.json` relacionan 53, 72 y 57 lecciones con secciones reales. No se publican transcripciones ni rutas personales.
- `data/questions.json`, `data/questions-ai-foundations.json` y `data/questions-oci-foundations.json` contienen bancos independientes. Cada pregunta tiene cuatro opciones con ID estable, explicación propia, una respuesta correcta y referencia a una sección real. Mantener seis preguntas por módulo técnico; cada intento selecciona dos por módulo.
- Los SVG de `assets/diagrams/` son locales, accesibles y ampliables. Mantener `title`, `desc`, texto legible y ninguna dependencia externa. Las tres imágenes de soluciones de `assets/illustrations/` se generaron con imagegen; sus prompts y revisiones están en `docs/illustration-prompts.md`. Son vistas conceptuales, no topologías listas para desplegar.
- Cada H2 de los módulos técnicos debe tener un gráfico didáctico específico. El título opcional de la imagen Markdown es su descripción breve debajo del gráfico. Las soluciones visuales de ejercicios se colocan dentro de `<details>`. Ver [criterios y cobertura visual](docs/visual-coverage.md).
- `videos/certification-path-motion/` contiene el proyecto editable de HyperFrames basado en `hw-pipeline`. La portada reproduce `assets/motion/certification-path.mp4` y conserva un resumen textual accesible si el video no carga. Las cachés, vistas previas y copias de trabajo del editor no se publican.

Comprobar las fuentes oficiales al actualizar versiones, nombres o condiciones del examen. Registrar la fecha de revisión en el catálogo y el checklist. Las explicaciones de CertiTips son independientes del material oficial.

## Estudiar o explicar el taller

Cada curso comparte la misma guía para alumnos y facilitadores. Recorrer sus módulos, ampliar los diagramas y discutir las explicaciones de la práctica. No existe un modo separado ni una agenda con tiempos. El antiguo enlace `/talk/` redirige al inicio de la guía. Los diagramas se cierran con Escape; el pie fijo reserva su altura real para no tapar el contenido.

El menú izquierdo organiza módulos y apartados como ramas desplegables; las secciones se obtienen de los encabezados Markdown. La práctica muestra sus instrucciones solo al inicio. **Reiniciar test** borra las respuestas del intento, pide confirmación si está incompleto y conserva el progreso de lectura del curso.

## Otra certificación

La portada incluye once rutas y marca cuáles tienen guía propia. Para desarrollar otra, añadir su objeto en `courses`, sus capítulos bajo `contentDir`, su banco y su matriz de cobertura, y poner su ID en el campo `guide` de la ruta correspondiente dentro de `paths`. Los slugs pueden repetirse entre directorios de cursos. El constructor publica bajo el código de examen y conserva alias por ID. La búsqueda incluye los temas de todos los cursos; el validador comprueba cada banco, cobertura y enlaces. No duplicar un banco ajeno bajo un título nuevo. Ver [criterios y fuentes de AI Foundations](docs/ai-foundations-sources.md).

## Validación y publicación

Los scripts de arquitectura son `scripts/arch-preflight.ps1` y `scripts/arch-postflight.ps1`. Requieren Graphify y Sentrux instalados localmente. No se inventan reglas cuando falta `.sentrux/rules.toml`; el gate compara la estructura. En este proyecto nuevo, la comparación inicial es contra los wrappers de bootstrap, no contra una aplicación previa.

GitHub Actions instala desde el lockfile, construye, ejecuta pruebas y comprueba enlaces, cobertura y preguntas. Solo publica `dist/` después de superar las comprobaciones en `main`. Las pull requests validan sin desplegar.

La diferencia inicial de arquitectura está documentada en [docs/architecture.md](docs/architecture.md). No se reemplaza el baseline para ocultar un resultado DEGRADED. Las pruebas Node se ejecutan en un solo proceso para evitar el bloqueo EPERM de este sandbox Windows; los tests restauran sus cambios globales.

Para comprobar el navegador, abrir una sesión aislada de `playwright-cli` en el sitio y ejecutar `run-code --filename scripts/browser-smoke.cjs` para Agentic AI y portada. Ejecutar `run-code --filename scripts/ai-foundations-smoke.cjs` para las 13 páginas nuevas en tres anchos, sus 63 gráficos de sección, práctica completa de 18 preguntas, repaso y separación de almacenamiento entre cursos. Ejecutar también `run-code --filename scripts/diagram-check.cjs` para medir recortes y superposiciones de texto en todos los SVG enlazados por ambos cursos. Las mediciones esperan a que carguen las imágenes y aparezca el control de avance. Son comprobaciones DOM y funcionales; no toman capturas de pantalla.

En la práctica individual, el avance y las respuestas se almacenan en `localStorage` bajo claves `certitips:*`, sin analítica ni envío de respuestas. Si el almacenamiento está bloqueado, continúa en memoria durante la sesión. En CertiQuiz, el alias y las respuestas de la partida se envían a su API para sincronizar la sala y calcular los resultados; las sesiones usan cookies HttpOnly.

## Créditos y alcance

Autor: jgangini. Diseño y explicaciones originales inspirados en el formato de un workshop, sin incluir el renderizador ni la marca de Oracle LiveLabs. Oracle y otros nombres de producto pertenecen a sus titulares. Esta guía no es un examen oficial ni emite credenciales.

Código y contenido original: licencia MIT. Las fuentes oficiales enlazadas conservan sus propias condiciones.
