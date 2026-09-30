# CertiTips

Guías visuales en español para preparar certificaciones con conceptos, ejemplos y práctica explicada.

**Sitio:** https://jgangini.github.io/certi-tips/

La portada organiza las rutas del plan FY27 en **Foundation Sprint** (nivel 1) y tres especialidades: **AI & Agents**, **Data & AI** y **Architecture**. Las flechas muestran un grupo a la vez, con sus certificaciones en lista; el menú superior permite ir directo a cualquiera. Dentro de cada especialidad, los niveles 2 y 3 van de fundamentos profesionales a aplicaciones más avanzadas. La secuencia es una recomendación editorial de CertiTips, no un prerrequisito oficial. Se incluyeron las once rutas únicas de la primera diapositiva del plan compartido; OCI Foundations y OCI AI Foundations se enlazan a las ediciones 2026 publicadas en Oracle MyLearn. Las rutas sin guía propia llevan al contenido oficial de Oracle.

Primera guía disponible: **Oracle Agentic AI Foundations Associate 2026 · 1Z0-1157-26**. Incluye seis módulos técnicos con gráficos en cada apartado, orientación y 36 preguntas originales. Cada intento breve selecciona 12 preguntas equilibradas entre las seis áreas.

## Desarrollo local

Requiere Node.js 24 y npm. No hay backend ni claves de API.

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

- Editar los capítulos de `content/`. El encabezado H1 procede del catálogo; usar H2/H3 dentro de cada capítulo.
- `{{base}}` se convierte en `/certi-tips/` durante la construcción. Usarlo en enlaces internos e imágenes.
- Los IDs de encabezado se generan en minúsculas, sin tildes y con guiones. Si cambia un encabezado, actualizar las referencias que apunten a él.
- `data/catalog.json` define los cuatro grupos de certificaciones, sus enlaces oficiales, el orden sugerido y qué ruta tiene una guía propia. También define los módulos, recursos y la ficha del examen disponible. Para añadir otra guía, crea una entrada en `courses` y enlázala con `guide` en la certificación correspondiente. `data/coverage.json` relaciona las 53 lecciones fuente con la primera guía. No se publican transcripciones ni rutas personales.
- `data/questions.json` contiene las preguntas. Cada una tiene cuatro opciones con ID estable, explicación propia, una respuesta correcta y referencia a una sección real. Mantener seis preguntas por área.
- Los SVG de `assets/diagrams/` son locales, accesibles y ampliables. Mantener `title`, `desc`, texto legible y ninguna dependencia externa. Las tres imágenes de soluciones de `assets/illustrations/` se generaron con imagegen; sus prompts y revisiones están en `docs/illustration-prompts.md`. Son vistas conceptuales, no topologías listas para desplegar.
- Cada H2 de los seis módulos técnicos debe tener un gráfico didáctico específico. El título opcional de la imagen Markdown es su descripción breve debajo del gráfico. Las soluciones visuales de ejercicios se colocan dentro de `<details>`. Ver [criterios y cobertura visual](docs/visual-coverage.md).
- `videos/certification-path-motion/` contiene el proyecto editable de HyperFrames basado en `hw-pipeline`. La portada reproduce `assets/motion/certification-path.mp4` y conserva un resumen textual accesible si el video no carga. Las cachés, vistas previas y copias de trabajo del editor no se publican.

Comprobar las fuentes oficiales al actualizar versiones, nombres o condiciones del examen. Registrar la fecha de revisión en el catálogo y el checklist. Las explicaciones de CertiTips son independientes del material oficial.

## Estudiar o explicar el taller

Hay una única guía para alumnos y facilitadores. Recorrer sus módulos, ampliar los diagramas y discutir las explicaciones de la práctica. No existe un modo separado ni una agenda con tiempos. El antiguo enlace `/talk/` redirige al inicio de la guía. Los diagramas se cierran con Escape; el pie fijo reserva su altura real para no tapar el contenido.

El menú izquierdo organiza módulos y apartados como ramas desplegables; las secciones se obtienen de los encabezados Markdown. La práctica muestra sus instrucciones solo al inicio. **Reiniciar test** borra las respuestas del intento, pide confirmación si está incompleto y conserva el progreso de lectura del curso.

## Otra certificación

La portada ya incluye once rutas y marca cuáles tienen guía propia. Para desarrollar otra, añadir su objeto en `courses`, crear sus capítulos Markdown con slugs únicos y poner su ID en el campo `guide` de la ruta correspondiente dentro de `paths`. El constructor generará las páginas bajo ese ID. La práctica actual y su validación están delimitadas a Agentic AI: añadir un banco y una configuración por curso antes de habilitar cuestionarios para otra certificación. No duplicar un banco ajeno bajo un título nuevo.

## Validación y publicación

Los scripts de arquitectura son `scripts/arch-preflight.ps1` y `scripts/arch-postflight.ps1`. Requieren Graphify y Sentrux instalados localmente. No se inventan reglas cuando falta `.sentrux/rules.toml`; el gate compara la estructura. En este proyecto nuevo, la comparación inicial es contra los wrappers de bootstrap, no contra una aplicación previa.

GitHub Actions instala desde el lockfile, construye, ejecuta pruebas y comprueba enlaces, cobertura y preguntas. Solo publica `dist/` después de superar las comprobaciones en `main`. Las pull requests validan sin desplegar.

La diferencia inicial de arquitectura está documentada en [docs/architecture.md](docs/architecture.md). No se reemplaza el baseline para ocultar un resultado DEGRADED. Las pruebas Node se ejecutan en un solo proceso para evitar el bloqueo EPERM de este sandbox Windows; los tests restauran sus cambios globales.

Para comprobar el navegador, abrir una sesión aislada de `playwright-cli` en el sitio y ejecutar `run-code --filename scripts/browser-smoke.cjs`. Comprueba 13 páginas y la redirección histórica en tres anchos, tablas, pie fijo, diagramas, teclado, un intento completo y almacenamiento bloqueado. Ejecutar también `run-code --filename scripts/diagram-check.cjs` para medir recortes y superposiciones de texto en todos los SVG enlazados desde los módulos. No toman capturas de pantalla.

El avance y las respuestas se almacenan en `localStorage` bajo claves `certitips:*`. No hay analítica ni envío de respuestas. Si el almacenamiento está bloqueado, la práctica continúa en memoria durante la sesión.

## Créditos y alcance

Autor: jgangini. Diseño y explicaciones originales inspirados en el formato de un workshop, sin incluir el renderizador ni la marca de Oracle LiveLabs. Oracle y otros nombres de producto pertenecen a sus titulares. Esta guía no es un examen oficial ni emite credenciales.

Código y contenido original: licencia MIT. Las fuentes oficiales enlazadas conservan sus propias condiciones.
