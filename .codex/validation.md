# Validación y herramientas

Ejecutar desde la raíz del repositorio. `scripts/` conserva herramientas reutilizables; `tests/` contiene regresiones. Los informes, datos de prueba desechables y experimentos pertenecen a `output/`, ignorado por Git. No tomar capturas: usar DOM, accesibilidad, estados, registros y aserciones.

## Elegir la comprobación

| Cambio | Comprobación requerida |
| --- | --- |
| Solo instrucciones internas o documentación no publicada, sin código ni configuración | Revisar diferencias, enlaces locales y coherencia. No requiere compilar, actualizar Graphify ni ejecutar Sentrux. |
| Markdown publicado de cursos o videos, incluso encabezados | Compilar, ejecutar pruebas y comprobar el sitio; revisar fidelidad y enlaces. |
| Código, SVG, configuración, dependencias o herramientas | Comprobación previa de arquitectura antes de editar, comprobaciones pertinentes y comprobación posterior tras la última edición. |
| Catálogo, bancos o contrato de CertiQuiz | Añadir `npm.cmd run check:certiquiz`, que usa el contrato real de la API. |
| Interfaz compartida o interacción | Añadir la prueba de navegador afectada, con ambos temas y tamaños pertinentes. |

Si una tarea documental pasa a modificar código o configuración, iniciar la fase de arquitectura antes de ese primer cambio. No usar la exención documental para eludir comprobaciones de contenido publicado o de herramientas.

## Flujo habitual

Para contenido/interfaz multilingüe seguir [Internacionalización](internacionalizacion.md): preparar manifiesto, generar, comprobar y compilar antes de las pruebas. Validar también el paquete publicado de CertiQuiz, los cuatro idiomas y la ausencia de raster en diagramas. El único PNG publicado permitido es el logo para compartir.

Requiere Node.js 24 y npm; arquitectura y operaciones usan PowerShell 7.3 o posterior. El flujo de arquitectura necesita Git, Graphify y Sentrux disponibles en `PATH`; npm no los instala. En Windows, usar `npm.cmd` y `npx.cmd` si interfieren los lanzadores de PowerShell. Antes de `npm test`, activar el entorno i18n o anteponer su carpeta Scripts a PATH: algunas pruebas invocan `python` directamente; `I18N_PYTHON` por sí solo no evita el acceso directo de Microsoft Store.

```powershell
./scripts/arch-preflight.ps1
npm.cmd run i18n:prepare
npm.cmd run i18n:generate
npm.cmd run i18n:check
npm.cmd run build
npm.cmd test
npm.cmd run check
./scripts/arch-postflight.ps1
```

La comprobación previa guarda la referencia de arquitectura antes del primer cambio. La posterior actualiza Graphify mediante análisis sintáctico y ejecuta las reglas y el control de regresión de Sentrux. No repetir la comprobación previa para sustituir una referencia que ya detectó una regresión.

Los dos scripts incluyen los archivos fuente nuevos mediante un índice Git y un directorio de objetos aislados en `output/`; preservan la preparación real de Git y limpian los temporales incluso ante fallo. No sustituirlos por un análisis limitado a los archivos ya registrados.

### Alcance de los analizadores

- `.sentrux/rules.toml` define el contrato de arquitectura. Ejecutar las once reglas configuradas mediante la CLI; el resultado MCP conocido cubre solo tres comprobaciones y no las reemplaza. Tras actualizar la herramienta o sus reglas, ejecutar `scripts/check-architecture-rules.ps1`.
- La versión instalada de Sentrux 0.5.7 interpreta el orden de capas como pruebas 0 → entrada 10 → adaptadores 20 → dominio/seguridad 30. Las pruebas ejecutables de reglas verifican esa interpretación; comprobarla de nuevo al actualizar.
- El analizador Python de Sentrux no cubre completamente las importaciones relativas. El analizador SQL opcional de Graphify no está disponible en este entorno; las pruebas aisladas de PostgreSQL verifican persistencia. Informar estas limitaciones sin atribuir cobertura que no existe.
- No declarar finalizada una modificación que requiera arquitectura si faltan las comprobaciones, fallan reglas o hay degradación sin justificación intencional documentada. Si una herramienta no está disponible, indicarlo.

| Herramienta | Uso |
| --- | --- |
| `scripts/build.mjs` | `npm run build`: reemplaza `dist/` con páginas, imágenes y corpus obtenidos del catálogo. |
| `scripts/check-site.mjs` | `npm run check`: valida el sitio construido, enlaces, anclas, cobertura, preguntas y SVG. |
| `services/certiquiz/check-catalog.py` | `npm run check:certiquiz`: valida catálogo y bancos fuente con el contrato real de la API, incluidos límites de tamaño. Requiere Python 3.12, sin paquetes ni red; obligatorio antes de publicar bancos/catálogo. Alternativa en contenedor: `docker run --rm --network none -v "${PWD}:/source:ro" -w /source certiquiz-api:local python services/certiquiz/check-catalog.py`. |
| `scripts/serve.mjs` | `npm run preview`: sirve `dist/` en la interfaz local; requiere compilación previa. |
| `scripts/layout.mjs`, `certichat-corpus.mjs`, `certichat-explorer.mjs` | Módulos importados por el constructor y las pruebas; no son comandos independientes. |
| `scripts/check-architecture-rules.ps1` | Ejecutar tras modificar reglas, scripts de arquitectura o actualizar Sentrux; comprueba límites y la limpieza/restauración de esos scripts tanto con éxito como con fallo. |

## Pruebas Node

`scripts/check-certichat-logs.ps1` comprueba el lector JSON, filtro de traza, seguimiento acotado, opciones SSH y rechazo de argumentos inválidos con un sustituto local; no usa la red.

`npm test` descubre `tests/*.test.mjs`. Para un archivo: `node --test --test-isolation=none tests/site.test.mjs`. El ejecutor sin aislamiento evita el error `spawn EPERM` del entorno Windows; las pruebas deben restaurar los valores globales que modifiquen.

| Archivos en `tests/` | Cobertura |
| --- | --- |
| `site.test.mjs` | Validador del sitio: rutas, referencias, bancos y rechazo de contenido inseguro. |
| `quiz.test.mjs` | Selección, puntuación, repaso y restauración del almacenamiento. |
| `layout.test.mjs` | Componentes compartidos, navegación y contratos de las páginas. |
| `governance.test.mjs` | Contenido, cobertura y reglas específicas de CDMP-DMF. |
| `diagram-design.test.mjs`, `error-diagrams.test.mjs` | Geometría, conectores, iconos y composición de los SVG. |
| `certitube.test.mjs` | Fichas, fecha de incorporación, borradores, tiempos, barra de capítulos, evidencia fechada y reproductor con API simulada. |
| `search.test.mjs` | Relevancia, acentos, prefijos, errores de escritura, acrónimos y secciones/anclas del corpus Markdown real. |
| `certichat.test.mjs` | Corpus, sanitización, enlaces y restauración de conversaciones. |
| `certichat-trace.test.mjs`, `certichat-explorer.test.mjs`, `certichat-network.test.mjs` | Evidencia, procedencia, grafo, cámara y límites del almacenamiento. |

GitHub Pages ejecuta el validador de bancos de CertiQuiz, la compilación, las pruebas Node y la comprobación del sitio. Docker también valida los bancos al construir CertiQuiz. Su resultado no incluye navegador, PostgreSQL, pruebas de carga ni modelos reales. No deshabilitar validadores para hacer pasar una publicación.

## Navegador

Con la vista previa iniciada y Playwright CLI disponible, abrir una sesión aislada. Los siguientes archivos CJS son funciones para `run-code`; invocarlos con `node` no ejecuta la prueba.

```powershell
npx.cmd --yes --package @playwright/cli playwright-cli -s=qa open http://127.0.0.1:4173/certitips/
npx.cmd --yes --package @playwright/cli playwright-cli -s=qa run-code --filename scripts/browser-smoke.cjs
npx.cmd --yes --package @playwright/cli playwright-cli -s=qa close
```

Elegir el archivo según el cambio y usar una sesión nueva por comprobación:

| Archivo en `scripts/` | Cuándo ejecutarlo |
| --- | --- |
| `course-layout-smoke.cjs` | Catálogo, niveles y barra de grupos solo en catálogo; lectura, lateral, fondo móvil y plegado automático con chat. `?compact-check` limita a escenarios compactos; `?fit-check`, al plegado por falta de ancho. |
| `header-viewer-browser-smoke.cjs` | Alineación del encabezado y visor: imagen adaptable, miniaturas, fondo sobre imagen/descripción y colores de controles. `?viewer-check` ejecuta solo el visor. |
| `shared-layout-smoke.cjs` | Geometría compartida entre tipos de página y estados de menú/chat. |
| `browser-smoke.cjs` | Portada, Agentic AI, progreso, práctica y repaso. |
| `ai-foundations-smoke.cjs` | Curso AI Foundations y separación de datos entre cursos. |
| `governance-smoke.cjs` | CDMP-DMF, tablas móviles y práctica. |
| `diagram-check.cjs` | SVG de cualquier curso: medidas de texto, celdas, recortes, iconos y conectores. |
| `anchor-navigation-smoke.cjs` | Cambios en anclas, imágenes con carga tardía e historial de navegación. |
| `certichat-browser-smoke.cjs` | Sesión, cuotas, reintentos, fuentes, Markdown seguro y restauración; API simulada, sin llamadas pagadas. |
| `certichat-explorer-smoke.cjs` | Grafo, tarjetas, enfoque, ondas y evidencia por respuesta; API simulada. |
| `certitube-browser-smoke.cjs` | Último video por incorporación, accesos de portada/encabezado, búsqueda real y reintentos, barra inferior de capítulos, cita temporal, historial, errores de YouTube y ajuste compartido del chat; API simulada, sin capturas. |
| `iphone-voice-browser-smoke.cjs` | Voz móvil: gesto original de Safari, cola silenciosa pendiente, inicio nativo confirmado y ausente/tardío; tres turnos consecutivos con captura y narración separadas, pista mute/contexto interrumpido, captura tardía al cerrar, reanudación explícita tras navegar, barra inferior fuera del borde, esquinas sin parches, controles móviles, presentación y cierre global sin chat de texto. Chromium y WebKit de escritorio usan audio simulado; no acreditan reproducción física en iPhone. |
| `certichat-mobile-smoke.cjs` | Pie de página, panel móvil y navegación; área visible simulada, no teclado físico de iOS. |
| `language-transition-smoke.cjs` | Cambio de idioma en portada, cursos, CertiTube, CertiChat y CertiQuiz; respuestas retenidas, bloqueo modal, desvanecimiento, historial y movimiento reducido, sin APIs reales ni capturas. |
| `certiquiz-mobile-layout-smoke.cjs` | Formularios y salas con API simulada; ancho completo móvil y encabezados y bordes compartidos entre participante y anfitrión. |
| `certitube-mobile-layout-smoke.cjs` | Adaptación del reproductor y recomendaciones, desplazamiento, títulos, borde completo y separación del chat; YouTube simulado. |
| `certiquiz-browser-smoke.cjs` | Salas, cookies y flujo de grupo; requiere API local real y crea salas de prueba. |
| `status-browser-smoke.cjs` | Páginas inexistentes, respuesta 404 raíz de Pages y errores de CertiQuiz en cuatro idiomas, dos temas y móvil/escritorio. Ejecutar con las APIs bloqueadas para simular el fallo de servicio; usa DOM y geometría. |

La comprobación `node scripts/certiquiz-animation-check.cjs` es independiente de la CLI. Requiere el paquete `playwright` resoluble por Node, directamente o mediante `NODE_PATH` de la instalación de herramientas. Usa Chromium y un DOM aislado, sin API: verifica absorción, llegadas, salidas y movimiento reducido.

Después de cambiar el ancho, esperar el predicado final con `waitForFunction` o la finalización de la animación antes de medir rectángulos; no sustituirlo por pausas arbitrarias. Medir el contenido real, no solo sus cajas nominales.

En pruebas del chat, sembrar el historial antes de recargar el módulo y reiniciar las preferencias de panel del perfil aislado. Comparar `textContent` normalizando espacios y saltos de línea: los elementos `br` no los conservan como texto. No usar la sesión personal del usuario ni enviar consultas pagadas.

Para una ruta temporal ya activa, recargar antes de comprobar su geometría inicial: navegar al mismo fragmento puede conservar el documento y el desplazamiento. Medir los cambios de altura de capítulos con el ancho actual y verificar también desvanecimiento y cancelación; no asumir que dos títulos tendrán alturas distintas.

Al publicar cambios de navegador, versionar conjuntamente CSS/JS y sus importaciones estáticas o dinámicas. Solo tras un despliegue autorizado, comprobar también la recarga del sitio publicado con caché existente; una prueba local no demuestra actualización de caché en producción.

## APIs y operaciones

Requieren Docker y la configuración local del servicio. Inspeccionar los parámetros del script elegido y los contratos de `services/certiquiz/` o `services/certichat/` antes de ejecutarlo; no copiar secretos a instrucciones, registros o respuestas. Esta tabla diferencia pruebas de operaciones con efectos reales.

| Comando | Efecto |
| --- | --- |
| `./scripts/certichat-local.ps1 -Build` | Construye e inicia la API local, su base y proceso de conocimiento; reutiliza su índice. |
| `./scripts/certichat-local.ps1 -Test` | Ejecuta pruebas con PostgreSQL aislado y proveedores simulados. |
| `./scripts/certiquiz-local.ps1 -Build -Test` | Construye, migra e inicia la API local; después ejecuta pytest en una base desechable. También modifica el entorno local en ejecución. |
| `./scripts/certichat-local-selfcheck.ps1` | Verifica recuperación ante fallos de importación/reinicio con Docker simulado. |
| `node scripts/certiquiz-smoke.mjs --players=2` | Crea y termina una sala real de prueba contra la API local. `--players=500` es una prueba de carga, no una comprobación rutinaria. |
| `./scripts/certichat-export-graph.ps1` | Exporta la proyección desde el proceso local de conocimiento activo a `data/certichat-graph.json`; después requiere compilar. No llama al modelo. |
| `./scripts/certiquiz-deploy.ps1`, `./scripts/certichat-deploy.ps1` | Publican en la VPS con respaldo y recuperación; requieren un encargo de despliegue. No son pruebas locales. |

Los `test_*.py` de cada servicio se descubren en su imagen de pruebas. `evaluate_answers.py --live` es una evaluación con coste y revisión semántica obligatoria; necesita autorización específica y no se ejecuta como parte de pytest ni de Pages. Verificar configuración y argumentos reales antes de usarla; no reutilizar presupuestos de experimentos anteriores como autorización vigente.

### Cognee nativo sin proveedor externo

Con la imagen `certichat-knowledge:local` ya construida, pasar el comprobador por la entrada estándar. Usa una pasarela simulada y almacenamiento temporal, sin montar el índice activo ni cargar credenciales.

```powershell
Get-Content services/certichat/tests/cognee_selfcheck.py -Raw -Encoding utf8 |
  docker run --rm --pull never -i --network none --add-host api:127.0.0.1 -e PYTHONPATH=/app certichat-knowledge:local python -
if ($LASTEXITCODE -ne 0) { throw 'Falló la comprobación nativa de Cognee.' }
```

### Recuperación del despliegue CertiQuiz

Con `python:3.12-slim` disponible localmente, comprobar el script Linux con sustitutos de Docker y curl. Solo se montan los dos archivos que necesita; no se accede a la VPS ni al socket Docker.

```powershell
$repo = (Get-Location).Path
docker run --rm --pull never --network none --mount "type=bind,source=$repo/services/certiquiz/check-rollout.py,target=/check-rollout.py,readonly" --mount "type=bind,source=$repo/scripts/certiquiz-deploy.ps1,target=/certiquiz-deploy.ps1,readonly" python:3.12-slim python /check-rollout.py /certiquiz-deploy.ps1
if ($LASTEXITCODE -ne 0) { throw 'Falló la comprobación del despliegue de CertiQuiz.' }
```

## Archivos generados

`dist/` contiene solo la última compilación con las rutas actuales por código y módulo, sin redirecciones ni alias históricos. `output/` es desechable: conservar la evidencia de la validación final y retirar allí copias de compilación, informes anteriores, datos de prueba y experimentos al cerrar el trabajo. Comprobar los destinos resueltos y que ningún proceso los utiliza antes de borrar. Las fuentes, originales del usuario, credenciales y respaldos operativos tienen sus ubicaciones propias y no se limpian como resultados temporales.

La aceptación de CertiTube también verifica miniaturas oficiales solo para fichas publicadas, icono azul en búsqueda y procedencia azul/roja del grafo. La prueba del explorador cubre el paso del puntero por controles, envío y etiquetas, y el formato de la leyenda; las pruebas de Canvas comprueban los colores reales de trazos, puntos y ondas.
