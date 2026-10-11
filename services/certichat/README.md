# CertiChat

Asistente de las guías publicadas en [CertiTips](https://jgangini.github.io/certi-tips/). Deep Chat 2.5.1 se carga al abrir el panel; la API FastAPI vive en `https://certichat.cloudtechnext.net`. Cognee 1.6.1 mantiene el índice privado. Solo la API posee la clave de OpenRouter.

## Contenido y respuestas

`npm run build` produce `dist/assets/certichat/manifest.json` y `dist/assets/certichat/corpus.json`, publicados bajo `/certi-tips/assets/certichat/`: portada, guías, apartados y preguntas explicadas del catálogo. No publica el código, `.private`, documentación de operaciones ni transcripciones. Las fuentes de cada respuesta son enlaces canónicos del sitio. El corpus se valida por hash antes de indexarlo.

El modelo es `qwen/qwen3-235b-a22b-2507`, mediante OpenRouter; los embeddings usan `openai/text-embedding-3-small`. La API exige una respuesta estructurada con IDs de fuentes recuperadas. Rechaza respuestas sin evidencia, enlaces inventados o HTML. El navegador presenta texto escapado y construye los enlaces de fuentes por separado. El modelo puede equivocarse: estas barreras acotan el uso, pero no constituyen una prueba semántica de todas sus afirmaciones.

El indexador descarga únicamente los dos archivos públicos en la URL fija de CertiTips. Construye un candidato en un directorio permanente por hash; lo valida antes de activar y conserva la versión anterior para recuperación. El worker abre un solo índice mediante SQLite, LanceDB y Ladybug. No se copia ni renombra una base abierta. Las consultas excluyen documentos modificados o eliminados desde la siguiente comprobación del manifiesto, cada cinco minutos, aunque la nueva indexación siga en curso. Si no se puede verificar el manifiesto durante 30 minutos, dejan de responder hasta recuperar esa comprobación.

La extracción procesa hasta cuatro documentos en paralelo mediante el semáforo nativo de Cognee, dentro del contenedor limitado a 1,5 CPU y 4 GiB. La primera carga puede tardar; mientras termina, la API de salud responde pero todavía no hay un índice activo para consultas.

`contentVersion` identifica el corpus publicado contra el que se validaron las fuentes. Al cambiar ese hash, las nuevas consultas dejan de usar el historial anterior aunque siga activo el índice previo. La salud privada del worker informa por separado la versión del índice abierto. Repetir el mismo `requestId` conserva la respuesta original por idempotencia.

## Acceso y presupuesto

Turnstile valida el hostname `jgangini.github.io` y la acción `certichat_session`. La sesión anónima dura 30 días y requiere nueva verificación cada ocho horas. Las cookies son `Secure`, `HttpOnly`, `SameSite=None` y `Partitioned`. Las mutaciones comprueban origen exacto, JSON y cabecera `X-CertiChat`; Caddy expone únicamente `/api/*`. GitHub Pages comparte origen entre los repositorios de un usuario: CORS no separa sus rutas.

| Recurso | Límite |
| --- | --- |
| Sesión | 2 consultas/minuto, 10/hora, 20/día; una en curso |
| Red de origen | 60 consultas/minuto y 600/hora; IPv6 agrupada por /64 |
| API | Cuatro consultas admitidas simultáneamente |
| Buscador | Una búsqueda activa, sin cola ilimitada |
| Mensaje / respuesta | 1.500 caracteres / 800 tokens de salida |
| Historial | Cuatro turnos utilizables durante 24 horas; limpieza física cada minuto; mismo hash del contenido |
| Consultas | US$0,50/día y US$7/mes |
| Indexación | US$2/mes |
| Total local / clave OpenRouter | US$9/mes / US$10/mes |

Las ventanas diarias y mensuales de gasto usan UTC. PostgreSQL conserva cuotas, solicitudes idempotentes y reservas de coste; borrar la conversación no restablece las cuotas. La red se guarda como HMAC, sin registrar la IP en las tablas. Cada llamada, incluidos embeddings y reintentos de Cognee, reserva presupuesto antes de salir. Una llamada cuyo coste sea incierto conserva la reserva. OpenRouter debe ofrecer un proveedor con precio máximo US$0,20/M entrada y US$0,80/M salida, sin tarifa por solicitud y sin recopilación de datos; de lo contrario la llamada falla cerrada.

El piloto permite 50 participantes compartiendo una IP, con los límites anteriores; no promete 50 generaciones simultáneas. Sin cuentas, borrar cookies puede crear otra sesión, por lo que la cuota de red y el presupuesto global son las barreras compartidas. Esto tampoco sustituye protección de red frente a tráfico volumétrico. Preguntas, contexto e historial pertinente se envían a OpenRouter para responder; no se deben introducir secretos.

## Configuración y despliegue

1. Guardar localmente `OPENROUTER_API_KEY`, `CERTICHAT_TURNSTILE_SITE_KEY` y `CERTICHAT_TURNSTILE_SECRET` en el archivo ignorado `.private/certichat.env`. No incluirlo en un commit ni compartirlo en el chat. Configurar en OpenRouter el límite de esa clave en US$10 con reinicio mensual; la aplicación no modifica ese ajuste. En el despliegue inicial se comprobó el límite en el panel del proveedor.
2. Crear el widget Managed de Turnstile para `jgangini.github.io`. Configurar en GitHub la variable pública `CERTICHAT_TURNSTILE_SITE_KEY`. El workflow de Pages la entrega al build; nunca necesita la clave privada.
3. Crear el registro A `certichat.cloudtechnext.net` hacia la VPS. Instalar solamente las claves OpenRouter y Turnstile privada en `/opt/jarvis/apps/certichat/services/certichat/.env`, con permisos 600 y directorios privados.
4. Ejecutar `./scripts/certichat-deploy.ps1` desde la raíz. Transfiere exclusivamente `services/certichat`, sin archivos de entorno. Genera credenciales independientes en la VPS, aplica el esquema con un rol administrador y usa un rol DML limitado en ejecución. Configura Caddy y los temporizadores de sincronización.
5. Publicar el build de Pages y comprobar la primera indexación. Una API saludable puede estar todavía esperando su primer índice; no equivale a un chat listo.

El despliegue mantiene una copia privada de la base y del release previo. Si falla una actualización restaura las imágenes y fuentes anteriores; las migraciones deben ser aditivas. No revierte automáticamente datos. Los contenedores usan usuario sin privilegios, sistemas de archivos de solo lectura, límites de CPU/memoria y redes privadas para PostgreSQL y el buscador. Ninguno comparte datos ni credenciales con CertiQuiz.

## Comprobaciones

Desde la raíz: `npm run build`, `npm test`, `npm run check`, `./scripts/arch-postflight.ps1`. Para la API, `./scripts/certichat-local.ps1 -Test` construye las imágenes y ejecuta la suite con PostgreSQL aislado en tmpfs y credenciales ficticias. Si se ejecuta pytest fuera de Docker, instalar `requirements-test.txt` con hashes, configurar `PYTHONPATH=services/certichat` y `CERTICHAT_TEST_DATABASE_URL`, y usar `python -m pytest services/certichat/tests -q -p no:cacheprovider`. Esa base debe ser **desechable** y su nombre contener `test`; las pruebas vacían sus tablas. Los proveedores externos se simulan: no hay gasto en esos tests.

`services/certichat/tests/cognee_selfcheck.py` comprueba el flujo de la versión instalada de Cognee con un gateway local simulado. `scripts/certichat-browser-smoke.cjs` comprueba contrato HTTP, reintentos, cuotas, fuentes, teclado y geometría móvil mediante DOM, sin capturas. La aceptación pública debe comprobar por separado Turnstile, cookies entre sitios, HTTPS, consulta con fuentes y rechazo de temas ajenos.

Deep Chat incluye una dependencia transitiva de CLI con aviso moderado de `sprintf-js`; no está en el bundle publicado ni se ejecuta esa CLI. No se aplican overrides incompatibles para ocultar el aviso; revisar cuando el proveedor publique una corrección.
