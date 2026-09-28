# CertiTips

Guías visuales en español para preparar certificaciones con conceptos, ejemplos y práctica explicada.

**Sitio:** https://jgangini.github.io/certi-tips/

Primera ruta: **Oracle Agentic AI Foundations Associate 2026 · 1Z0-1157-26**. Incluye seis módulos técnicos, orientación, diez diagramas SVG, plan de siete sesiones y 36 preguntas originales. Cada intento breve selecciona 12 preguntas equilibradas entre las seis áreas.

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

## Actualizar el contenido

- Editar los capítulos de `content/`. El encabezado H1 procede del catálogo; usar H2/H3 dentro de cada capítulo.
- `{{base}}` se convierte en `/certi-tips/` durante la construcción. Usarlo en enlaces internos e imágenes.
- Los IDs de encabezado se generan en minúsculas, sin tildes y con guiones. Si cambia un encabezado, actualizar las referencias que apunten a él.
- `data/catalog.json` define módulos, recursos, orden y ficha del examen. `data/coverage.json` relaciona las 53 lecciones fuente con la guía original. No se publican transcripciones ni rutas personales.
- `data/questions.json` contiene las preguntas. Cada una tiene cuatro opciones con ID estable, explicación propia, una respuesta correcta y referencia a una sección real. Mantener seis preguntas por área.
- Los SVG de `assets/diagrams/` son locales, accesibles y ampliables. Mantener `title`, `desc`, texto legible y ninguna dependencia externa. Las tres imágenes de soluciones de `assets/illustrations/` se generaron con imagegen; sus prompts y revisiones están en `docs/illustration-prompts.md`. Son vistas conceptuales, no topologías listas para desplegar.

Comprobar las fuentes oficiales al actualizar versiones, nombres o condiciones del examen. Registrar la fecha de revisión en el catálogo y el checklist. Las explicaciones de CertiTips son independientes del material oficial.

## Estudiar o explicar el taller

Hay una única guía para alumnos y facilitadores. Recorrer sus módulos, ampliar los diagramas y discutir las explicaciones de la práctica. No existe un modo separado ni una agenda con tiempos. El antiguo enlace `/talk/` redirige al inicio de la guía. Los diagramas se cierran con Escape; el pie fijo reserva su altura real para no tapar el contenido.

El menú izquierdo organiza módulos y apartados como ramas desplegables; las secciones se obtienen de los encabezados Markdown. La práctica muestra sus instrucciones solo al inicio. **Reiniciar test** borra las respuestas del intento, pide confirmación si está incompleto y conserva el progreso de lectura del curso.

## Otra certificación

Añadir su entrada al catálogo y sus capítulos Markdown con slugs únicos; el constructor generará sus páginas bajo su ID. Adaptar la portada y navegación al nuevo catálogo. La práctica actual y su validación están delimitadas a Agentic AI: añadir un banco y una configuración por curso antes de habilitar cuestionarios para otra certificación. No duplicar un banco ajeno bajo un título nuevo.

## Validación y publicación

Los scripts de arquitectura son `scripts/arch-preflight.ps1` y `scripts/arch-postflight.ps1`. Requieren Graphify y Sentrux instalados localmente. No se inventan reglas cuando falta `.sentrux/rules.toml`; el gate compara la estructura. En este proyecto nuevo, la comparación inicial es contra los wrappers de bootstrap, no contra una aplicación previa.

GitHub Actions instala desde el lockfile, construye, ejecuta pruebas y comprueba enlaces, cobertura y preguntas. Solo publica `dist/` después de superar las comprobaciones en `main`. Las pull requests validan sin desplegar.

La diferencia inicial de arquitectura está documentada en [docs/architecture.md](docs/architecture.md). No se reemplaza el baseline para ocultar un resultado DEGRADED. Las pruebas Node se ejecutan en un solo proceso para evitar el bloqueo EPERM de este sandbox Windows; los tests restauran sus cambios globales.

Para comprobar el navegador, abrir una sesión aislada de `playwright-cli` en el sitio y ejecutar `run-code --filename scripts/browser-smoke.cjs`. Comprueba 13 páginas y la redirección histórica en tres anchos, tablas, pie fijo, diagramas, teclado, un intento completo y almacenamiento bloqueado. Ejecutar también `run-code --filename scripts/diagram-check.cjs` para medir recortes y superposiciones de texto en los diez SVG. No toman capturas de pantalla.

El avance y las respuestas se almacenan en `localStorage` bajo claves `certitips:*`. No hay analítica ni envío de respuestas. Si el almacenamiento está bloqueado, la práctica continúa en memoria durante la sesión.

## Créditos y alcance

Autor: jgangini. Diseño y explicaciones originales inspirados en el formato de un workshop, sin incluir el renderizador ni la marca de Oracle LiveLabs. Oracle y otros nombres de producto pertenecen a sus titulares. Esta guía no es un examen oficial ni emite credenciales.

Código y contenido original: licencia MIT. Las fuentes oficiales enlazadas conservan sus propias condiciones.
