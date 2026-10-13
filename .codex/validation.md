# Validación y herramientas

Ejecutar desde la raíz del repositorio. `scripts/` conserva herramientas reutilizables; `tests/` contiene regresiones. Los informes, fixtures desechables y experimentos pertenecen a `output/`, ignorado por Git. No tomar capturas: usar DOM, estados, logs y aserciones.

## Flujo habitual

Requiere Node.js 24 y npm; arquitectura y operaciones usan PowerShell 7.3 o posterior. El flujo de arquitectura necesita Git, Graphify y Sentrux disponibles en `PATH`; npm no los instala. En Windows, usar `npm.cmd` y `npx.cmd` si sus wrappers PowerShell interfieren.

```powershell
./scripts/arch-preflight.ps1
npm.cmd run build
npm.cmd test
npm.cmd run check
./scripts/arch-postflight.ps1
```

El preflight guarda la referencia de arquitectura antes del primer cambio. El postflight actualiza Graphify por AST y ejecuta las reglas y el gate de Sentrux. No repetir el preflight para sustituir una referencia que ya detectó una regresión. Las limitaciones conocidas de los analizadores están en [AGENTS.md](AGENTS.md#validation-and-architecture).

| Herramienta | Uso |
| --- | --- |
| `scripts/build.mjs` | `npm run build`: reemplaza `dist/` con páginas, imágenes y corpus obtenidos del catálogo. |
| `scripts/check-site.mjs` | `npm run check`: valida el sitio construido, enlaces, anclas, cobertura, preguntas y SVG. |
| `services/certiquiz/check-catalog.py` | `npm run check:certiquiz`: valida catálogo y bancos fuente con el contrato real de la API, incluidos límites de tamaño. Requiere Python 3.12, sin paquetes ni red; obligatorio antes de publicar bancos/catálogo. Alternativa en contenedor: `docker run --rm --network none -v "${PWD}:/source:ro" -w /source certiquiz-api:local python services/certiquiz/check-catalog.py`. |
| `scripts/serve.mjs` | `npm run preview`: sirve `dist/` en loopback; requiere build previo. |
| `scripts/layout.mjs`, `certichat-corpus.mjs`, `certichat-explorer.mjs` | Módulos importados por el constructor y las pruebas; no son comandos independientes. |
| `scripts/check-architecture-rules.ps1` | Ejecutar tras modificar reglas, wrappers o actualizar Sentrux; comprueba límites de arquitectura y la limpieza/restauración de los wrappers tanto con éxito como con fallo. |

## Pruebas Node

`npm test` descubre `tests/*.test.mjs`. Para un archivo: `node --test --test-isolation=none tests/site.test.mjs`.

| Archivos en `tests/` | Cobertura |
| --- | --- |
| `site.test.mjs` | Validador del sitio: rutas, referencias, bancos y rechazo de contenido inseguro. |
| `quiz.test.mjs` | Selección, puntuación, repaso y restauración del almacenamiento. |
| `layout.test.mjs` | Componentes compartidos, navegación y contratos de las páginas. |
| `governance.test.mjs` | Contenido, cobertura y reglas específicas de CDMP-DMF. |
| `diagram-design.test.mjs`, `error-diagrams.test.mjs` | Geometría, conectores, iconos y composición de los SVG. |
| `certichat.test.mjs` | Corpus, sanitización, enlaces y restauración de conversaciones. |
| `certichat-trace.test.mjs`, `certichat-explorer.test.mjs`, `certichat-network.test.mjs` | Evidencia, procedencia, grafo, cámara y límites del almacenamiento. |

GitHub Pages ejecuta el validador de bancos de CertiQuiz, build, pruebas Node y check. Docker también valida los bancos al construir CertiQuiz. Su resultado no incluye navegador, PostgreSQL, pruebas de carga ni modelos reales.

## Navegador

Con el preview iniciado y Playwright CLI disponible, abrir una sesión aislada. Los siguientes archivos CJS son funciones para `run-code`; invocarlos con `node` no ejecuta la prueba.

```powershell
npx.cmd --yes --package @playwright/cli playwright-cli -s=qa open http://127.0.0.1:4173/certitips/
npx.cmd --yes --package @playwright/cli playwright-cli -s=qa run-code --filename scripts/browser-smoke.cjs
npx.cmd --yes --package @playwright/cli playwright-cli -s=qa close
```

Elegir el archivo según el cambio y usar una sesión nueva por comprobación:

| Archivo en `scripts/` | Cuándo ejecutarlo |
| --- | --- |
| `browser-smoke.cjs` | Portada, Agentic AI, progreso, práctica y repaso. |
| `ai-foundations-smoke.cjs` | Curso AI Foundations y separación de datos entre cursos. |
| `governance-smoke.cjs` | CDMP-DMF, tablas móviles y práctica. |
| `diagram-check.cjs` | SVG de cualquier curso: medidas de texto, celdas, recortes, iconos y conectores. |
| `anchor-navigation-smoke.cjs` | Cambios en anclas, imágenes con carga tardía e historial de navegación. |
| `certichat-browser-smoke.cjs` | Sesión, cuotas, reintentos, fuentes y persistencia; API simulada, sin llamadas pagadas. |
| `certichat-explorer-smoke.cjs` | Grafo, tarjetas, enfoque, ondas y evidencia por respuesta; API simulada. |
| `certichat-mobile-smoke.cjs` | Footer, panel móvil y navegación; viewport simulado, no teclado físico de iOS. |
| `certiquiz-browser-smoke.cjs` | Salas, cookies y flujo de grupo; requiere API local real y crea salas de prueba. |

La comprobación `node scripts/certiquiz-animation-check.cjs` es independiente de la CLI. Requiere el paquete `playwright` resoluble por Node, directamente o mediante `NODE_PATH` de la instalación de herramientas. Usa Chromium y un DOM aislado, sin API: verifica absorción, llegadas, salidas y movimiento reducido.

## APIs y operaciones

Requieren Docker. Consultar primero la configuración de [CertiQuiz](../services/certiquiz/README.md) o [CertiChat](../services/certichat/README.md); las claves nunca pertenecen a esta documentación.

| Comando | Efecto |
| --- | --- |
| `./scripts/certichat-local.ps1 -Build` | Construye e inicia la API local, su base y worker; reutiliza su índice. |
| `./scripts/certichat-local.ps1 -Test` | Ejecuta pruebas con PostgreSQL aislado y proveedores simulados. |
| `./scripts/certiquiz-local.ps1 -Build -Test` | Construye, migra e inicia la API local; después ejecuta pytest en una base desechable. También modifica el entorno local en ejecución. |
| `./scripts/certichat-local-selfcheck.ps1` | Verifica recuperación ante fallos de importación/reinicio con Docker simulado. |
| `node scripts/certiquiz-smoke.mjs --players=2` | Crea y termina una sala real de prueba contra la API local. `--players=500` es una prueba de carga, no un check rutinario. |
| `./scripts/certichat-export-graph.ps1` | Exporta la proyección desde el worker local activo a `data/certichat-graph.json`; después requiere build. No llama al modelo. |
| `./scripts/certiquiz-deploy.ps1`, `./scripts/certichat-deploy.ps1` | Publican en la VPS con respaldo y recuperación; requieren un encargo de despliegue. No son pruebas locales. |

Los `test_*.py` de cada servicio se descubren en su imagen de pruebas. `evaluate_answers.py --live` es una evaluación con coste y revisión semántica obligatoria; su ejecución optativa está en el [README de CertiChat](../services/certichat/README.md#comprobaciones). No se ejecuta como parte de pytest ni de Pages.

### Cognee nativo sin proveedor externo

Con la imagen `certichat-knowledge:local` ya construida, pasar el helper por stdin. Usa un gateway simulado y almacenamiento temporal, sin montar el índice activo ni cargar credenciales.

```powershell
Get-Content services/certichat/tests/cognee_selfcheck.py -Raw -Encoding utf8 |
  docker run --rm --pull never -i --network none --add-host api:127.0.0.1 -e PYTHONPATH=/app certichat-knowledge:local python -
if ($LASTEXITCODE -ne 0) { throw 'Cognee native self-check failed.' }
```

### Recuperación del despliegue CertiQuiz

Con `python:3.12-slim` disponible localmente, comprobar el script Linux con sustitutos de Docker y curl. Solo se montan los dos archivos que necesita; no se accede a la VPS ni al socket Docker.

```powershell
$repo = (Get-Location).Path
docker run --rm --pull never --network none --mount "type=bind,source=$repo/services/certiquiz/check-rollout.py,target=/check-rollout.py,readonly" --mount "type=bind,source=$repo/scripts/certiquiz-deploy.ps1,target=/certiquiz-deploy.ps1,readonly" python:3.12-slim python /check-rollout.py /certiquiz-deploy.ps1
if ($LASTEXITCODE -ne 0) { throw 'CertiQuiz rollout self-check failed.' }
```

## Archivos generados

`dist/` contiene solo el último build con las rutas actuales por código y módulo, sin redirecciones ni alias históricos. `output/` es desechable: conservar la evidencia de la validación final y retirar allí copias de build, reportes anteriores, fixtures y experimentos al cerrar el trabajo. Comprobar los destinos resueltos y que ningún proceso los utiliza antes de borrar. Las fuentes, originales del usuario, credenciales y respaldos operativos tienen sus ubicaciones propias y no se limpian como resultados temporales.
