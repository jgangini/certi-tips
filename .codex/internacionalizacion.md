# Internacionalización y publicación

## Fuente y contratos

Editar únicamente `data/es/`: catálogo, lecciones Markdown, preguntas, cobertura, fichas de video, diccionario UI y SVG. `contentDir`, `questionBank` y `coverage` son relativos a esa raíz. Conservar los originales inmutables en `data/CDMP-DMF/diagram-sources/` y el grafo compartido en `data/certichat-graph.json`.

Los idiomas publicados son `es`, `en`, `pt` (portugués de Brasil, `pt-BR`) e `it`, todos con prefijo `/certitips/{idioma}/`. Las URLs españolas anteriores siguen como alias; su canonical apunta a `/es/`. No traducir IDs, slugs, anclas, nombres oficiales, código ni claves de progreso/sesión. Una URL con idioma explícito manda sobre preferencias almacenadas; una entrada antigua sin prefijo puede recuperar la última elección. Cambiar de idioma conserva la página, el fragmento y los parámetros de sala. El corpus y las peticiones de contexto a CertiChat conservan las URLs históricas sin prefijo como identidad interna.

`data/en/`, `data/pt/`, `data/it/`, `.cache/i18n/`, `output/` y `dist/` son resultados regenerables ignorados por Git. No escribir Markdown traducido ni editar traducciones generadas. Las correcciones se registran en `data/i18n.json`, por texto español exacto e idioma. Una modificación del original invalida su corrección anterior.

Todos los gráficos son SVG nativos con texto editable; no rasterizar texto ni incrustar imágenes PNG/JPEG/WebP mediante archivos, URL o base64. La publicación y las comprobaciones incrustan únicamente las fuentes WOFF2 abiertas existentes para que la geometría no dependa del sistema operativo; los originales permanecen intactos. Única excepción raster publicada: `assets/icons/share-logo-square.png`, para compartir enlaces. El favicon usa SVG. Los videos y las miniaturas oficiales de YouTube siguen siendo medios externos/originales; esta funcionalidad no dobla ni genera subtítulos.

## Preparar y comprobar

Requisitos: Node 24, Python 3.12 y las versiones fijadas en `requirements-i18n.txt`. El motor ejecuta los modelos Argos mediante CTranslate2 y sus tokenizadores, sin servidor ni API pagada. Usa parámetros propios fijados (`beam_size=4`, `length_penalty=1`, CPU int8), no una ejecución idéntica de la API de Argos Translate. Fijar y verificar SHA-256 de los paquetes antes de utilizarlos. Nunca actualizar modelos automáticamente.

```powershell
./scripts/arch-preflight.ps1
python -m venv output/i18n-venv
./output/i18n-venv/Scripts/python.exe -m pip install -r requirements-i18n.txt
npm.cmd run i18n:prepare
npm.cmd run i18n:generate
npm.cmd run i18n:check
npm.cmd run build
npm.cmd test
npm.cmd run check
./output/i18n-venv/Scripts/python.exe services/certiquiz/check-catalog.py
./output/i18n-venv/Scripts/python.exe services/certiquiz/check-catalog.py dist/assets/certiquiz --published
./scripts/arch-postflight.ps1
```

Crear el entorno solo si falta. En Linux usar `output/i18n-venv/bin/python`; `I18N_PYTHON` permite señalar otro intérprete. El ejecutor reconoce el entorno anterior en ambos sistemas. No instalar dependencias en un intérprete global por comodidad. `i18n:prepare` usa `output/i18n-source`, no sustituye la publicación actual. Ejecutar `node scripts/i18n.mjs pilot` y revisar su semántica antes de aceptar un modelo/glosario nuevo. Las pruebas ordinarias usan dobles locales; no requieren proveedores ni modelos descargados.

La generación reutiliza caché por contenido/contexto/configuración/modelos. Los SVG se derivan de la misma fuente española. Comprobar sus cuatro variantes con `node scripts/check-diagrams.mjs es,en,pt,it`, que mide DOM y geometría mediante Playwright. Reutilizar la instalación disponible mediante `PLAYWRIGHT_MODULE`; CI instala una versión fijada de esta herramienta fuera de las dependencias de la aplicación. Corregir las etiquetas mediante glosario o distribución fuente; no reducirlas por debajo de los mínimos de diagramas ni desactivar validadores. Nunca usar capturas como evidencia.

## Servicios y despliegue

En desarrollo, recompilar no reinicia los procesos activos. Tras cambiar `scripts/serve.mjs`, reiniciar el preview y comprobar que las cuatro rutas `/{idioma}/certiquiz/` entreguen `data-api-origin="http://127.0.0.1:18740"`. Tras modificar la API o sus bancos empaquetados, ejecutar `./scripts/certiquiz-local.ps1 -Build`; un health correcto no demuestra que el contenedor tenga el contrato de idioma vigente. Verificar carga real de catálogo, sesión y formularios contra la API local.

El workflow Pages existente prepara, traduce, verifica y compila antes de publicar. Una caché ausente se regenera; una traducción incompleta, corrupta o desactualizada bloquea la publicación. Los modelos solo se descargan de destinos fijados y se verifican antes de extraerlos. No activar APIs, runners de pago ni servicios externos de traducción.

La caché de frases conserva los lotes de inferencia completados incluso si falla la ejecución; siempre se vuelven a aplicar correcciones y validaciones antes de publicar. Los informes de traducciones rechazadas se conservan siete días como artefactos de Actions. Un fallo durante la inferencia puede preceder al informe: consultar también el registro del paso y proteger los términos técnicos que ya deben permanecer en su idioma original.

CertiQuiz consume `assets/certiquiz/catalog.json` y bancos con hash y traducciones por ID. El Docker/paquete de despliegue incorpora ese mismo artefacto, no copias manuales del árbol español. Validar el paquete con `--published`. El refresco cambia el catálogo completo; un fallo conserva el anterior. Cada participante solicita su `locale`; la sala congela los cuatro textos al crearse y nunca revela soluciones antes de tiempo. Las salas anteriores sin traducción terminan en español.

CertiChat recibe `locale` en cada consulta y lo incluye en la identidad de reintento. Conservar el idioma de solicitudes pendientes. El corpus, las citas y el índice Cognee mantienen identidad española; las proyecciones léxicas traducidas son auxiliares y están vinculadas por hashes. Una actualización de traducción no reconstruye Cognee. Los candidatos se validan contra fuentes españolas vigentes antes de usarse como evidencia. No añadir una llamada al proveedor para traducir. Las respuestas existentes y el historial no se retraducen.

Para un despliegue expresamente solicitado: primero APIs compatibles, después Pages completo. Conservar respaldo anterior y última versión válida del catálogo. Revertir el artefacto completo; no mezclar manifiestos, diccionarios o bancos de versiones diferentes. Compilar o pasar pruebas no demuestra despliegue ni autoriza evaluaciones pagadas.

## Guía para Codex

Mantener contratos breves en `AGENTS.md` y procedimientos aquí, sin duplicar la política global. `.codex/AGENTS.md` no se carga por estar en una subcarpeta: adjuntarlo o leerlo explícitamente al trabajar desde la raíz. Seguir la [precedencia oficial de AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md); no cambiar el perfil global para resolver la carga.
