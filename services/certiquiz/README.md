# CertiQuiz

Práctica de grupo con los bancos de CertiTips. La interfaz permanece en `https://jgangini.github.io/certi-tips/certiquiz/`, con la navegación y el tema del sitio. El botón abre esa ruta en la misma pestaña. El VPS publica únicamente las APIs bajo `https://certiquiz.cloudtechnext.net/api/`; no aloja otra página de CertiQuiz.

El subdominio es una dirección de servicio, no una segunda interfaz. Una ruta en otro dominio existente también funcionaría, pero el host dedicado separa la configuración y las cookies de otras aplicaciones. No requiere comprar otro dominio, ni concede acceso administrativo al VPS. GitHub Pages sirve archivos estáticos y no ejecuta la API.

## Uso

La entrada permite elegir **Anfitrión** o **Participante** y muestra únicamente el formulario seleccionado. Cualquier persona puede ser anfitrión: elige certificación, cantidad de preguntas y tiempo, y el servidor genera el PIN y una sesión privada de control. Comparte el PIN o enlace, espera a los participantes y comienza. Cada participante responde desde su navegador. Al vencer el plazo o recibir todas las respuestas, se muestra la explicación. El anfitrión pulsa **Siguiente** para mostrar la clasificación a todos y vuelve a pulsarlo para iniciar la próxima pregunta o ver los resultados finales. El tiempo de la próxima pregunta empieza con ese segundo clic. Cada respuesta correcta suma 500 puntos base más una bonificación de hasta 500 según la proporción de tiempo restante; la bonificación se redondea hacia abajo a un entero. Responder a mitad del tiempo suma 750 puntos. Una respuesta incorrecta o sin responder suma cero. El reloj del servidor determina la rapidez y los reintentos conservan la puntuación original; los empates en puntos comparten puesto. Las respuestas antiguas sin datos de tiempo reciben solo la base al revelarse; los totales ya publicados se conservan. Los mensajes aparecen dentro del formulario o de la tarjeta de la partida.

Límites: 500 participantes por sala, 30 preguntas, 10–120 segundos por pregunta (10 por defecto) y 10 salas activas. El máximo de salas es un límite defensivo, no una garantía de capacidad con 5.000 participantes. El navegador programa la siguiente consulta un segundo después de recibir la anterior y la pospone mientras envía una respuesta. El contador se calcula localmente con la hora del servidor. El servidor valida el plazo real y serializa respuestas mediante un bloqueo de la fila de cada sala.

La API ejecuta dos procesos con un máximo conjunto de 2 CPU y 512 MiB. Cada proceso reutiliza hasta 20 conexiones mediante el pool oficial de Psycopg (40 en total), con espera de tres segundos y cola limitada. PostgreSQL tiene su propio máximo de 2 CPU, 512 MiB y 60 conexiones. Uvicorn admite hasta 1.024 conexiones/solicitudes concurrentes por proceso, incluyendo conexiones persistentes.

La imagen Linux incluye `uvloop` y `httptools`, las alternativas nativas que Uvicorn selecciona cuando están instaladas. AnyIO limita las operaciones síncronas a 12 hilos por proceso para reducir la contención observada con el valor predeterminado de 40. Referencias: [dependencias de Uvicorn](https://uvicorn.dev/installation/) y [hilos de Starlette](https://starlette.dev/threadpool/).

El sondeo envía la última `version` recibida. La API valida la sesión y la pertenencia a la sala antes de devolver HTTP 204 si nada cambió. Una única consulta SQL comprueba la versión y, cuando hace falta, obtiene la pregunta actual, los contadores y los datos del participante; el listado completo viaja en la sala de espera y la clasificación al revelar/finalizar. Si el plazo venció, incluso con la misma versión, la API vuelve a leer el estado completo y el reloj bajo bloqueo y devuelve el resultado actualizado. PostgreSQL sigue siendo la autoridad entre procesos y reinicios; el estado parcial de lectura nunca se guarda.

La sesión dura ocho horas. Una recarga conserva el acceso dentro del mismo navegador. Los nombres son públicos dentro de la sala; no se solicita correo. Las salas expiradas se purgan a partir de las 24 horas desde su creación, durante la siguiente actividad del servicio. Cerrar el acceso del anfitrión finaliza sus salas. La cookie de anfitrión permite controlar únicamente sus propias salas; conocer un PIN no concede ese permiso.

## Desarrollo local

Desde la raíz, con PowerShell 7 y Docker Desktop:

```powershell
./scripts/certiquiz-local.ps1 -Build -Test
$env:CERTIQUIZ_API_ORIGIN = 'http://127.0.0.1:18740'
npm run build
Remove-Item Env:CERTIQUIZ_API_ORIGIN
npm test
npm run check
node scripts/certiquiz-smoke.mjs --players=500
```

Con `npm run preview`, la aplicación abre en `http://127.0.0.1:4173/certi-tips/certiquiz/`; la API escucha en 18740. El helper conserva las credenciales de base de datos en `services/certiquiz/.env`, excluido de Git y limitado al usuario de Windows. No se necesita una clave para crear salas. Los tests usan otra base desechable, en una red separada; nunca restauran ni alteran CloudTechNext. El sondeo HTTP usa una sala real de prueba en el CertiQuiz local y la finaliza al terminar. Las cargas mayores de 100 participantes solo se permiten contra loopback.

La prueba de 500 usa el máximo de preguntas disponible (hasta 30), juega dos rondas de 10 segundos con respuestas en tandas de 64, comprueba el rechazo del participante 501 y finaliza la sala. El modo predeterminado `browser` reproduce la espera y la pausa durante el envío del navegador; mantiene una consulta independiente por participante y también mide la sala de espera y la revelación. Deja un participante sin responder para ejercitar el vencimiento. La prueba de integración separada verifica 500 respuestas aceptadas y puntuadas dentro de 10 segundos. El modo navegador exige p95 de consultas y respuestas de hasta un segundo, cada solicitud por debajo de 10 segundos, p95 entre inicios de consultas de hasta dos segundos y entrega de cada pregunta a todos en dos segundos. Estas pruebas no alteran las salas del usuario.

La carga local del 2026-10-07 aprobó esos umbrales: 13.815 solicitudes sin errores, 12.296 consultas con p95 de 461 ms y máximo de 608 ms, y 998 respuestas con p95 de 649 ms y máximo de 879 ms. Los 500 participantes recibieron las preguntas en un máximo de 1.042 y 1.036 ms; las tandas de respuestas terminaron en 5.592 y 5.539 ms. Se observaron 428 consultas por segundo y un intervalo entre inicios p95 de 1.494 ms; su máximo fue 2.539 ms, incluyendo pausas por envío. Evidencia local: `output/certiquiz-500-browser-mode-load.json`.

El modo `--poll-mode=fixed` conserva la prueba más exigente de una cadencia fija por participante y su umbral de 5 % de cadencias omitidas. Su ensayo de esta revisión falló: 25 respuestas llegaron tarde y el p95 de respuestas fue 1.148 ms. La aprobación corresponde a 500 participantes con el comportamiento del navegador, no a 500 consultas constantes por segundo ni a diez salas completas. La carga se ejecutó contra Docker local; no se ha realizado una prueba de 500 participantes contra la VPS.

El build normal configura la API HTTPS productiva. `CERTIQUIZ_API_ORIGIN` es configuración pública, nunca una credencial. La comprobación de navegador está en `scripts/certiquiz-browser-smoke.cjs` y utiliza un navegador CLI aislado, sin screenshots. La prueba HTTP no sustituye la comprobación de cookies en el navegador.

## Actualizar preguntas desde GitHub

En producción, `CERTIQUIZ_CATALOG_SOURCE=github` consulta exclusivamente `jgangini/certi-tips`, rama `main`: `data/catalog.json` y los bancos identificados por `questionBank`. Cada cinco minutos, la siguiente consulta al catálogo puede actualizar una caché compartida por el proceso. El servidor valida el conjunto completo antes de sustituirlo; una descarga fallida o inválida conserva el último conjunto válido. Al iniciar, dispone de los bancos empaquetados como respaldo. Las salas en curso conservan las preguntas con las que se crearon.

Para añadir preguntas basta con publicar los cambios válidos del banco en GitHub. Para añadir una certificación, también debe figurar en el catálogo con su banco. El navegador envía únicamente el identificador del curso y la configuración de la partida: no puede elegir una URL de descarga, respuestas correctas ni puntuaciones. Las descargas tienen límites de tiempo y tamaño y no siguen redirecciones. El modo local `bundled` permite probar los bancos del checkout sin publicarlos.

La rama pública consultada durante esta implementación contiene Agentic AI con 36 preguntas. Los otros dos cursos del checkout local estarán disponibles en el catálogo productivo cuando se publiquen en GitHub.

## Prevención de abuso

La creación aplica límites persistentes y atómicos en PostgreSQL: 2 intentos por minuto y 10 por hora por IP, 6 por hora por sesión de anfitrión y 60 por hora para todo el servicio. Admite una sala activa por anfitrión, tres por IP y diez en total. Borrar cookies no elude los límites de IP o capacidad. Una sala de espera sin participantes expira a los 15 minutos, aunque el anfitrión siga consultándola. Las partidas tienen un máximo de ocho horas.

La IP procede de la conexión validada por el proxy; Caddy sustituye la cabecera reenviada y Uvicorn confía sólo en el proxy configurado. IPv6 se agrupa por prefijo /64 para evitar que rotar direcciones de una misma red eluda los límites. La base guarda hashes de esos identificadores. Los rechazos por frecuencia devuelven HTTP 429 y `Retry-After`. Los participantes tienen un límite distinto para permitir un grupo detrás de la misma IP pública; una oficina o universidad puede compartir el cupo de tres salas.

Estos controles limitan el consumo de la aplicación. Una red distribuida de bots o un ataque que sature la conexión requiere defensa adicional en el proveedor o proxy. Si aparece abuso persistente, el siguiente paso es un desafío como Turnstile antes de crear sala, validado en el servidor; no está configurado en esta versión. Referencias: [prevención de denegación de servicio de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html) y [validación de Turnstile](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

## Despliegue

```powershell
./scripts/certiquiz-deploy.ps1
node scripts/certiquiz-smoke.mjs --origin=https://certiquiz.cloudtechnext.net --players=2
```

El script empaqueta exclusivamente CertiQuiz y los bancos del catálogo. Conserva el `.env` remoto, usa un árbol de fuentes limpio, respalda una instalación anterior y despliega el proyecto Compose `certiquiz` en `/opt/jarvis/apps/certiquiz`. El puerto 18740 queda vinculado a loopback; Caddy publica HTTPS mediante un bloque propio que los despliegues de CloudTechNext preservan. Antes de publicar el acceso debe existir un registro A `certiquiz` hacia la IP del VPS.

La primera instalación genera las credenciales de base de datos en el VPS. Nunca copiar `.env`, claves o archivos `.private` a GitHub. El pipeline de Pages no necesita claves SSH ni acceso al VPS. Los archivos privados de claves de anfitrión de instalaciones anteriores dejan de utilizarse.

PostgreSQL usa volumen y red interna propios. El rol administrador sólo entra en el contenedor de migración; la API recibe un rol sin superusuario, creación de roles/bases ni permisos DDL. La API ejecuta con UID 10001, filesystem de solo lectura, capacidades eliminadas y límites de CPU, memoria y procesos. No se montan credenciales OCI, SSH ni el socket de Docker.

En actualizaciones se guarda un dump privado antes de migrar. Un fallo de despliegue restaura la aplicación anterior; la base no se revierte automáticamente. Mantener las migraciones compatibles con la imagen anterior y comprobar una restauración en un entorno aislado antes de cambios destructivos. Los respaldos de la VPS requieren una copia externa y una política de retención del operador.

### Verificación de publicación · 2026-10-07

API publicada mediante el registro A `certiquiz.cloudtechnext.net → 187.77.63.10`, TTL 300. HTTPS tiene un certificado válido de Let's Encrypt; HTTP redirige a HTTPS. `/api/health` responde 200 y `/` y `/docs` devuelven 404. CORS permite el origen exacto de Pages con credenciales; un preflight ajeno se rechaza y un POST con origen ajeno devuelve 403. La API continúa vinculada a loopback y PostgreSQL permanece sin puerto público. CloudTechNext conserva su comprobación de salud correcta.

Una prueba real en Chromium 154 desde `https://jgangini.github.io` verificó creación pública sin clave, recarga, dos participantes, puntuación, permisos y cierre de sesión contra la API pública actualizada. Las cookies `__Host-` tienen Secure, HttpOnly, SameSite=None y una partición asociada a `https://jgangini.github.io`; visitar directamente la API no reutiliza esa sesión. Se usaron certificados normales, sin simular respuestas ni tomar screenshots. Esta prueba valida las sesiones en ese navegador; no demuestra compatibilidad con todos los navegadores. El catálogo productivo devuelve las 36 preguntas de Agentic AI publicadas en GitHub.

La ruta pública `/certi-tips/certiquiz/` todavía devolvía 404 al terminar esta publicación: el módulo está implementado y probado localmente, pero falta publicar su código en GitHub Pages. La autorización recibida en esta fase fue publicar únicamente la API.

La actualización de capacidad del 2026-10-07 también quedó desplegada con respaldo privado: `/api/catalog` confirma el límite de 500, ambos contenedores están saludables y PostgreSQL sigue sin puerto público. La API conserva su enlace a `127.0.0.1:18740`; CloudTechNext mantiene su salud correcta. Se repitió la aceptación HTTPS desde GitHub Pages con dos participantes, puntuación y cookies particionadas. Las pruebas de 500 corresponden al entorno local descrito arriba; la interfaz de Pages sigue pendiente de publicación.

## Alcance de seguridad

Las cookies de producción usan el prefijo `__Host-`, sin Domain y con Path=/, HttpOnly, Secure, SameSite=None y Partitioned: la sesión queda asociada a la API y al sitio principal desde el que se utiliza. El prefijo impide que otro subdominio cree una cookie del mismo nombre con Domain compartido. No se guardan tokens en JavaScript, localStorage ni enlaces. El modo local HTTP usa nombres sin prefijo y SameSite=Strict sin Secure/Partitioned. Las cookies particionadas requieren un navegador compatible; la interfaz verifica la sesión después del acceso y avisa si no puede conservarla. Las pruebas entre dos puertos locales no demuestran el comportamiento de cookies entre sitios HTTPS diferentes.

CORS admite el origen exacto de Pages con credenciales, sin comodines. Las operaciones también exigen JSON, Origin permitido y una cabecera propia, además de sesión y autorización por sala. CORS no impide que alguien invoque directamente la API desde otro programa. Tampoco distingue rutas: cualquier página bajo `https://jgangini.github.io` comparte el origen de CertiTips. Hay que mantener confiables los demás sitios publicados bajo esa cuenta. Las cookies no usan Domain compartido con otros subdominios.

Las respuestas correctas sólo llegan a la partida al revelar cada pregunta, y el navegador no puede enviar puntuaciones. Los bancos originales de práctica siguen siendo públicos: CertiQuiz es una actividad de aprendizaje y no un examen supervisado. La separación en contenedores reduce el impacto de un fallo, pero comparte el sistema operativo del VPS.

Referencias: [GitHub Pages estático](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [origen del navegador](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy), [cookies particionadas](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies/Partitioned_cookies) y [seguridad de APIs REST de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html).
