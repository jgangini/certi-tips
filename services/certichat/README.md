# CertiChat

Asistente de las guías publicadas en [CertiTips](https://jgangini.github.io/certi-tips/). Deep Chat 2.5.1 se carga al abrir el panel; la API FastAPI vive en `https://certichat.cloudtechnext.net`. Cognee 1.6.1 mantiene el índice privado. Solo la API posee la clave de OpenRouter.

El navegador restaura la conversación al navegar o recargar desde una copia local de los últimos 100 mensajes, válida durante 24 horas desde la última escritura. Solo admite texto y fuentes del sitio; no guarda credenciales ni permite HTML o archivos del almacenamiento. Conserva el identificador de una consulta pendiente para recuperar su resultado sin duplicar el cobro. Restaurar mensajes no envía consultas. Este historial visible es independiente de los cuatro turnos que el servidor admite como contexto. Borrar requiere el popup de confirmación compartido con CertiQuiz y elimina la copia local solo después de que la API confirme el borrado; conserva las cuotas.

Enter y el botón de envío aceptan texto aunque no haya conexión o acceso: en ese caso aparece una respuesta explicativa en el historial, sin enviar una consulta a la API ni consumir cuota. Shift+Enter inserta un salto de línea. Los errores no ocupan un aviso sobre la conversación; el botón de reconexión aparece cuando hace falta. Reconectar o completar Turnstile no reenvía preguntas automáticamente.

El modo progresivo usa `connect.stream.simulation` nativo de Deep Chat, después de recibir y validar la respuesta completa y sus fuentes en la API. Es presentación progresiva, no streaming de tokens desde OpenRouter: mostrar tokens antes de validar el JSON permitiría saltarse el filtro de evidencia. Detener conserva el texto mostrado; no cancela una generación ya terminada ni devuelve cuota. La presentación respeta la preferencia de movimiento reducido. Durante ella se bloquean nuevos envíos y el borrado, y el historial se guarda al finalizar o detener.

## Contenido y respuestas

`npm run build` produce `dist/assets/certichat/manifest.json` y `dist/assets/certichat/corpus.json`, publicados bajo `/certi-tips/assets/certichat/`: portada, guías, apartados y preguntas explicadas del catálogo. No publica el código, `.private`, documentación de operaciones ni transcripciones. Las fuentes de cada respuesta son enlaces canónicos del sitio. El corpus se valida por hash antes de indexarlo. El contexto prioriza la página que el participante está viendo y se completa con resultados de Cognee; ambos pasan por los mismos filtros de vigencia y procedencia.

El modelo es `qwen/qwen3-235b-a22b-2507`, mediante OpenRouter; los embeddings usan `openai/text-embedding-3-small`. La API exige una respuesta estructurada con IDs de fuentes recuperadas. Rechaza respuestas sin evidencia, enlaces inventados o HTML. El navegador presenta texto escapado y construye los enlaces de fuentes por separado. El modelo puede equivocarse: estas barreras acotan el uso, pero no constituyen una prueba semántica de todas sus afirmaciones.

El indexador descarga únicamente los dos archivos públicos en la URL fija de CertiTips. Construye un candidato en un directorio permanente por hash; lo valida antes de activar y conserva la versión anterior para recuperación. El worker abre un solo índice mediante SQLite, LanceDB y Ladybug. No se copia ni renombra una base abierta. Las consultas excluyen documentos modificados o eliminados desde la siguiente comprobación del manifiesto, cada cinco minutos, aunque la nueva indexación siga en curso. Si no se puede verificar el manifiesto durante 30 minutos, dejan de responder hasta recuperar esa comprobación.

La extracción procesa hasta dieciséis documentos en paralelo mediante el semáforo nativo de Cognee, dentro del contenedor limitado a 1,5 CPU y 6 GiB. Prioriza proveedores por velocidad dentro del mismo precio máximo. Sus conexiones HTTP están separadas de las usadas para consultas y verificación. Cada llamada tiene un plazo total de 300 segundos para indexación y 35 para chat; los fallos de coste incierto conservan su reserva. La primera carga puede tardar; mientras termina, la API de salud responde pero el panel no habilita consultas hasta que exista un índice activo.

`contentVersion` identifica el corpus publicado contra el que se validaron las fuentes. Al cambiar ese hash, las nuevas consultas dejan de usar el historial anterior aunque siga activo el índice previo. La salud privada del worker informa por separado la versión del índice abierto. Repetir el mismo `requestId` conserva la respuesta original por idempotencia.

## Acceso y presupuesto

Turnstile valida el hostname `jgangini.github.io` y la acción `certichat_session`. La sesión anónima dura 30 días y requiere nueva verificación cada ocho horas. Las cookies son `Secure`, `HttpOnly`, `SameSite=None` y `Partitioned`. Las mutaciones comprueban origen exacto, JSON y cabecera `X-CertiChat`; Caddy expone únicamente `/api/*`. GitHub Pages comparte origen entre los repositorios de un usuario: CORS no separa sus rutas.

| Recurso | Límite |
| --- | --- |
| Sesión | 2 consultas/minuto y `CERTICHAT_QUESTIONS` por periodo de `CERTICHAT_REFRESH` horas (por defecto 20 cada 6 horas); una en curso |
| Red de origen | 60 consultas/minuto y 600/hora; IPv6 agrupada por /64 |
| API | Cuatro consultas admitidas simultáneamente |
| Buscador | Una búsqueda activa, sin cola ilimitada |
| Mensaje / respuesta | 1.500 caracteres / 800 tokens de salida |
| Historial | Cuatro turnos utilizables durante 24 horas; limpieza física cada minuto; mismo hash del contenido |
| Consultas | US$0,50/día y US$7/mes |
| Indexación | US$2/mes |
| Total local / clave OpenRouter | US$9/mes / US$10/mes |

Las ventanas diarias y mensuales de gasto usan UTC. PostgreSQL conserva cuotas, solicitudes idempotentes y reservas de coste; borrar la conversación no restablece las cuotas. La red se guarda como HMAC, sin registrar la IP en las tablas. Cada llamada, incluidos embeddings y reintentos de Cognee, reserva presupuesto antes de salir. Una llamada cuyo coste sea incierto conserva la reserva. OpenRouter debe ofrecer un proveedor con precio máximo US$0,20/M entrada y US$0,80/M salida, sin tarifa por solicitud y sin recopilación de datos; de lo contrario la llamada falla cerrada.

El periodo de consultas empieza con la primera consulta admitida y conserva una hora de renovación fija. Al vencer, la próxima consulta inicia un periodo nuevo. `CERTICHAT_REFRESH` acepta enteros de 1 a 24 horas y `CERTICHAT_QUESTIONS`, de 1 a 100 consultas; los valores predeterminados son 6 y 20. El límite de 2 consultas por minuto sigue activo. Estas variables no cambian la vigencia de Turnstile ni la sincronización del conocimiento.

Los embeddings conservan límites de 6.000 bytes UTF-8 por texto y 32.768 por lote. Si Cognee genera una entrada mayor, el gateway devuelve el error de longitud compatible con OpenAI que activa la división nativa de Cognee; las partes válidas se procesan con el mismo control de gasto. El rechazo previo no consume presupuesto.

El piloto permite 50 participantes compartiendo una IP, con los límites anteriores; no promete 50 generaciones simultáneas. Sin cuentas, borrar cookies puede crear otra sesión, por lo que la cuota de red y el presupuesto global son las barreras compartidas. Esto tampoco sustituye protección de red frente a tráfico volumétrico. Preguntas, contexto e historial pertinente se envían a OpenRouter para responder; no se deben introducir secretos.

## Configuración y despliegue

1. Guardar localmente `OPENROUTER_API_KEY`, `CERTICHAT_TURNSTILE_SITE_KEY` y `CERTICHAT_TURNSTILE_SECRET` en el archivo ignorado `.private/certichat.env`. Usar `CERTICHAT_MODE=LOCAL` para desarrollo o `CERTICHAT_MODE=VPS` para generar manualmente el sitio público. Añadir `CERTICHAT_REFRESH=6` y `CERTICHAT_QUESTIONS=20` para definir la cuota. No incluirlo en un commit ni compartirlo en el chat. Configurar en OpenRouter el límite de esa clave en US$10 con reinicio mensual; la aplicación no modifica ese ajuste. En el despliegue inicial se comprobó el límite en el panel del proveedor.
2. Crear el widget Managed de Turnstile para `jgangini.github.io`. Configurar en GitHub la variable pública `CERTICHAT_TURNSTILE_SITE_KEY`. El workflow de Pages la entrega al build; nunca necesita la clave privada.
3. Crear el registro A `certichat.cloudtechnext.net` hacia la VPS. Instalar solamente las claves OpenRouter y Turnstile privada en `/opt/jarvis/apps/certichat/services/certichat/.env`, con permisos 600 y directorios privados.
4. Ejecutar `./scripts/certichat-deploy.ps1` desde la raíz. Transfiere exclusivamente `services/certichat`, sin archivos de entorno. Lee de `.private/certichat.env` únicamente los dos parámetros numéricos de cuota, los valida y los instala en el entorno privado de la VPS; si faltan, aplica 6 horas y 20 consultas. Genera credenciales independientes en la VPS, aplica el esquema con un rol administrador y usa un rol DML limitado en ejecución. Fuerza `CERTICHAT_MODE=VPS`, orígenes públicos HTTPS y cookies seguras antes de iniciar Docker, incluso si había valores locales en el entorno. Configura Caddy y los temporizadores de sincronización. El workflow de Pages también fuerza `CERTICHAT_MODE=VPS`; el modo local no se publica.
5. Publicar el build de Pages y comprobar la primera indexación. Una API saludable puede estar todavía esperando su primer índice; no equivale a un chat listo.

El despliegue mantiene una copia privada de la base y del release previo. Si falla una actualización restaura las imágenes y fuentes anteriores; las migraciones deben ser aditivas. No revierte automáticamente datos. Los contenedores usan usuario sin privilegios, sistemas de archivos de solo lectura, límites de CPU/memoria y redes privadas para PostgreSQL y el buscador. Ninguno comparte datos ni credenciales con CertiQuiz.

## Desarrollo local

Con `CERTICHAT_MODE=LOCAL` en `.private/certichat.env`, ejecutar `./scripts/certichat-local.ps1 -Build`, `npm run build` y `npm run preview`. Abrir `http://127.0.0.1:4173/certi-tips/`: el build dirige el chat a `http://127.0.0.1:18741`. La sesión local omite Turnstile y usa una cookie local; conserva comprobación del origen exacto, límites, presupuesto y filtros de contenido. La API solo se publica en el loopback del equipo, sin modificar el acceso de la VPS.

El script lee únicamente el modo, la clave OpenRouter y los dos parámetros de cuota del archivo privado. Genera credenciales independientes y persistentes en `services/certichat/.env`, también ignorado por Git; rechaza sobrescribir un archivo de servicio que no sea `LOCAL`. Los datos usan volúmenes del proyecto Docker `certichat-local`. Las consultas reales consumen OpenRouter; `-Test` sigue usando proveedores simulados y credenciales desechables.

Una API local nueva necesita un índice de conocimiento. Para reutilizar el índice ya calculado sin volver a pagar su extracción, exportar una copia consistente después de detener limpiamente el worker de origen, conservando las rutas `active.json` y `snapshots/<hash>/...`. Guardarla como archivo tar privado e importarla una sola vez con `./scripts/certichat-local.ps1 -Build -SnapshotArchive .private/certichat-snapshot.tar`. La importación rechaza enlaces, rutas externas y la sustitución de un índice local activo. El arranque actualiza únicamente el manifiesto público mediante `indexer refresh` e inicia `local-refresh`, que repite esa comprobación cada cinco minutos; nunca inicia una indexación de pago automáticamente. Si no existe índice, la salud de la API responde pero las consultas esperan contenido. Si el manifiesto no se puede actualizar durante 30 minutos, la recuperación deja de responder hasta que vuelva a verificarse. El servicio de refresco pertenece al perfil Docker `local` y rechaza iniciar en modo `VPS`.

## Comprobaciones

Desde la raíz: `npm run build`, `npm test`, `npm run check`, `./scripts/arch-postflight.ps1`. Para la API, `./scripts/certichat-local.ps1 -Test` construye las imágenes y ejecuta la suite con PostgreSQL aislado en tmpfs y credenciales ficticias. Si se ejecuta pytest fuera de Docker, instalar `requirements-test.txt` con hashes, configurar `PYTHONPATH=services/certichat` y `CERTICHAT_TEST_DATABASE_URL`, y usar `python -m pytest services/certichat/tests -q -p no:cacheprovider`. Esa base debe ser **desechable** y su nombre contener `test`; las pruebas vacían sus tablas. Los proveedores externos se simulan: no hay gasto en esos tests.

`services/certichat/tests/cognee_selfcheck.py` comprueba el flujo de la versión instalada de Cognee con un gateway local simulado. `scripts/certichat-browser-smoke.cjs` comprueba contrato HTTP, reintentos, cuotas, fuentes, teclado y geometría móvil mediante DOM, sin capturas. La aceptación pública debe comprobar por separado Turnstile, cookies entre sitios, HTTPS, consulta con fuentes y rechazo de temas ajenos.

En modo `VPS`, la vista previa en localhost conserva el panel para revisar su diseño y ofrece un enlace al chat publicado (`#certichat`) para consultas reales. La API pública mantiene CORS, Turnstile y la cookie de acceso restringidos a `jgangini.github.io`. El modo `LOCAL` conecta exclusivamente con la API local; no desactiva ninguna protección del servidor público.

Deep Chat incluye una dependencia transitiva de CLI con aviso moderado de `sprintf-js`; no está en el bundle publicado ni se ejecuta esa CLI. No se aplican overrides incompatibles para ocultar el aviso; revisar cuando el proveedor publique una corrección.

## Aceptación pública · 2026-10-11

El primer índice activo contiene 528 documentos. La extracción completa tardó aproximadamente 37 minutos y costó US$0,729224; el total de indexación, incluidos pilotos y reintentos, fue US$0,953352. Es una medición de este corpus, no una promesa de tiempo o coste para futuras versiones. Una sincronización con el mismo hash conservó el worker y no produjo cargos.

Desde GitHub Pages se verificaron acceso con Turnstile y cookie persistente, respuesta con las tres certificaciones Foundation y fuente en la portada, explicación de región frente a dominio de disponibilidad con enlace y sección válidos, y rechazo de una petición ajena al sitio que intentaba cambiar el rol. Borrar la conversación y recargar conservaron la cuota. Los temporizadores quedaron habilitados y CertiQuiz siguió saludable. Estas comprobaciones no constituyen una prueba de carga de participantes simultáneos.
