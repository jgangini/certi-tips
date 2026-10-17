# Instrucciones locales de Codex para CertiTips

Mantén CertiTips como un sitio de aprendizaje claro, accesible y coherente. Este archivo complementa la política global con decisiones propias del repositorio. Aplica la petición vigente del usuario y las instrucciones de mayor prioridad; una nota histórica no puede restablecer un diseño que el usuario ya retiró.

## Idioma y alcance

- Redacta instrucciones, explicaciones y contenido original en español. Conserva nombres oficiales de productos, títulos aprobados, identificadores, rutas, comandos y claves de datos en su forma exacta. Traducir esta guía no autoriza renombrar interfaces o contratos del código.
- Mantén aquí las reglas duraderas y en las guías enlazadas los detalles de cada tarea. Los documentos normativos de apoyo residen en esta misma carpeta `.codex/`; las rutas de código indicadas se interpretan desde la raíz del repositorio.
- Lee únicamente las guías pertinentes antes de editar. Los enlaces no incorporan su contenido automáticamente a las instrucciones de la sesión.
- La carga automática de Codex recorre los archivos `AGENTS.md` desde la raíz del proyecto hasta el directorio de trabajo. Trabajar desde la raíz no garantiza que se cargue este archivo situado en `.codex/`. Si no está incorporado por las instrucciones de la sesión, adjúntalo o solicita explícitamente su lectura al iniciar la tarea. No cambies el perfil global ni `CODEX_HOME` para resolverlo.

## Elegir la guía según la tarea

Los idiomas publicados son español, inglés, portugués de Brasil e italiano. La única fuente editable está en `data/es/`; las traducciones JSON/SVG se generan sin duplicar Markdown. Leer [Internacionalización](internacionalizacion.md) al cambiar fuentes, interfaz, servicios o despliegue multilingüe.

| Tarea | Leer antes de editar |
| --- | --- |
| Crear o revisar lecciones, enlaces, catálogo, preguntas o cobertura | [Contenido Markdown](contenido-markdown.md) |
| Incorporar o revisar un video | [Fichas de CertiTube](certitube.md) |
| Cambiar componentes, estilos, navegación, chat o visor | [Diseño de interfaz](diseno-interfaz.md) |
| Crear, editar o revisar gráficos didácticos | [Diseño de diagramas](diagram-design.md) y la guía de contenido correspondiente |
| Elegir comandos de comprobación o validar cambios | [Validación y herramientas](validation.md) |
| Diagnosticar voz, navegación de audio o fallos de API | [Observabilidad de CertiChat](observabilidad-certichat.md) |
| Revisar una regla tras un defecto repetido | La guía afectada y las entradas pertinentes del [registro histórico](improvement-log.md) |

## Mapa mínimo del proyecto

| Ubicación | Responsabilidad |
| --- | --- |
| `data/es/catalog.json` | Inventario de cursos, módulos, recursos, rutas y bancos. |
| `data/es/<código>/` | Única fuente de cada curso: módulos Markdown, SVG, preguntas y cobertura. |
| `data/es/certitube/<videoId>/` | Ficha única del video y sus imágenes opcionales; independiente de los bancos de cursos. |
| `assets/` | Estilos y módulos compartidos del navegador; `assets/icons/` contiene iconos reutilizables. |
| `scripts/` | Constructor, componentes de página y herramientas ejecutables existentes. |
| `tests/` y `services/*/tests/` | Regresiones del sitio y de las APIs, respectivamente. |
| `services/` | APIs opcionales de CertiQuiz y CertiChat; código de servidor separado del navegador y del constructor. |
| `dist/` | Publicación generada y reemplazada al compilar; nunca fuente de edición. |
| `output/`, `graphify-out/`, `.private/` | Resultados temporales, mapa del código y trazabilidad privada; no contenido público. |

## Contratos que deben conservarse

- Usa Node.js 24, el constructor Markdown y los componentes compartidos existentes. No añadas un marco de interfaz ni dependencias para resolver lo que ya cubre el proyecto. Sigue la política global para inspeccionar, editar y comprobar el cambio mínimo.
- Resuelve `contentDir` dentro de `data/es/`. Publica solo módulos registrados, sus SVG y sus traducciones generadas; no publiques todo `data/` ni edites resultados EN/PT/IT.
- Conserva `course.id`, identificadores de preguntas y fuentes, rutas públicas y fragmentos. Las rutas usan `/certitips/{es|en|pt|it}/`, el código del curso y `overview/` como entrada. Por encargo explícito, conserva las URLs españolas sin prefijo como alias de `/es/`; el corpus mantiene esa identidad histórica. No añadas otros alias ni redirecciones sin encargo.
- CertiQuiz descubre cada banco mediante `courses[].questionBank`. El banco se escribe una sola vez en `data/es/<código>/questions.json`; el paquete publicado añade traducciones por ID y hashes. Conserva la última versión válida y las instantáneas de partidas existentes. Una validación fallida bloquea la publicación. Docker y despliegue consumen el catálogo y los bancos registrados de `dist/assets/certiquiz/`; no copiar bancos manualmente ni debilitar el contrato.
- El corpus de CertiChat deriva de introducciones, secciones y preguntas explicadas. Mover archivos no demuestra que haga falta reconstruir el índice. Reutilízalo solo si coinciden todos los identificadores, títulos, cursos y hashes de texto; resuelve las citas con el manifiesto vigente validado.
- El documento `home` conserva la identidad del catálogo al cambiar de URL. Selecciona su contexto por ID estable tanto en recuperación como en evaluación; conserva los filtros de hash y procedencia.
- `data/certichat-graph.json` es una proyección pública, no una segunda colección de lecciones. Conserva almacenes nativos, credenciales y trazabilidad privada fuera de la publicación; no modifiques un almacén abierto para cambiar URLs. Compilar no publica ni actualiza el índice activo ni autoriza consultas pagadas.
- Preserva las licencias, el manifiesto y la geometría de los iconos suministrados, incluidos los avisos `ISC AND MIT` de Lucide. No alteres los bytes de los originales en `data/CDMP-DMF/diagram-sources/` ni les atribuyas una licencia inventada. Mantén las transcripciones completas fuera del repositorio.
- Preserva los cambios de trabajo ajenos y el estado real de preparación de Git. Distingue siempre cambios locales, confirmaciones, envío a GitHub y despliegue; no afirmes haber realizado una etapa que no ejecutaste.

## Criterio de finalización

1. El cambio cumple la petición y las reglas de la guía correspondiente, sin restaurar comportamientos retirados.
2. En contenido, revisa fidelidad, actualidad, enlaces y explicación didáctica; una validación sintáctica no demuestra esas propiedades.
3. Ejecuta las comprobaciones que correspondan según [validation.md](validation.md). Las instrucciones internas puramente documentales no requieren recompilar la aplicación; el Markdown publicado sí requiere compilación, pruebas y comprobación del sitio.
4. Revisa el cambio final y comunica el resultado, las comprobaciones realmente ejecutadas y cualquier limitación. No tomes capturas como evidencia: usa DOM, accesibilidad, geometría, registros y aserciones reproducibles.

## Mantenimiento de estas instrucciones

Mantén una única formulación vigente por regla. Sustituye la regla superada en su guía; no acumules excepciones contradictorias en este archivo. Promueve una preferencia explícita de alcance general o una fricción repetida con evidencia, y registra su alcance en [improvement-log.md](improvement-log.md). Los acuerdos de un video, una figura o un experimento no se convierten por sí solos en reglas globales.

Revisión de la organización de estas instrucciones: 14 de octubre de 2026. Se aplica la recomendación oficial de mantener instrucciones breves, específicas, con contexto y criterios de aceptación, y trasladar los detalles a archivos pertinentes por tarea: [buenas prácticas de Codex](https://learn.chatgpt.com/guides/best-practices). El comportamiento de carga y precedencia procede de [instrucciones con AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md). Las decisiones de diseño y autoría de las guías enlazadas son acuerdos de CertiTips, no requisitos de OpenAI.
