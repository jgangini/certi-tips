# CertiTips

Aprende conceptos, explora diagramas y practica para preparar tus certificaciones.

**[Abrir CertiTips](https://jgangini.github.io/certitips/)**

## Qué puedes hacer

- **CertiTips:** recorrer cursos con ejemplos, diagramas ampliables, ejercicios y práctica individual con explicaciones. Incluye búsqueda, progreso por curso y modo oscuro.
- **[CertiQuiz](https://jgangini.github.io/certitips/certiquiz/):** crear una sala, compartir su PIN y practicar en grupo con preguntas, explicaciones y clasificación.
- **[CertiChat](https://jgangini.github.io/certitips/certichat/):** consultar las guías, abrir las fuentes de cada respuesta y explorar los conceptos recuperados en el grafo de Cognee.
- **CertiTube:** explorar casos prácticos de AI CloudTech y reproducir los momentos citados por CertiChat en `/certitips/certitube/`.

## Cursos disponibles

| Curso | Código | Temas |
| --- | --- | --- |
| [OCI Foundations Associate](https://jgangini.github.io/certitips/1Z0-1085-26/overview/) | `1Z0-1085-26` | Arquitectura, identidad, redes, cómputo, almacenamiento y gobierno de nube. |
| [OCI AI Foundations Associate](https://jgangini.github.io/certitips/1Z0-1122-26/overview/) | `1Z0-1122-26` | Fundamentos de IA, aprendizaje automático, IA generativa y servicios de Oracle Cloud. |
| [Oracle Agentic AI Foundations Associate](https://jgangini.github.io/certitips/1Z0-1157-26/overview/) | `1Z0-1157-26` | Agentes, herramientas, MCP, LangChain y OCI Enterprise AI. |
| [Data Management Fundamentals](https://jgangini.github.io/certitips/CDMP-DMF/overview/) | `CDMP-DMF` | Las once áreas de DAMA y su aplicación con Oracle Cloud. |

El [catálogo CertiTips](https://jgangini.github.io/certitips/courses/) conserva Foundation y el carrusel de especialidades, incluidas las rutas cuya guía está marcada como **próximamente**.

## Ejecutar localmente

Requiere Node.js 24, npm y Python 3.12. Español es la única fuente editable en `data/es/`; los otros idiomas se generan con modelos Argos fijados, sin una API de traducción pagada. La primera ejecución descarga los modelos y tarda más que las posteriores.

```sh
npm ci --ignore-scripts
npm run i18n:prepare
npm run i18n:generate
npm run i18n:check
npm run build
npm run preview
```

Antes de generar, instalar `requirements-i18n.txt` en un entorno Python aislado siguiendo la [guía de internacionalización](.codex/internacionalizacion.md). Abrir [localhost:4173/certitips/es/](http://127.0.0.1:4173/certitips/es/); el selector conserva la página actual al pasar a `en`, `pt` o `it`. Los enlaces españoles anteriores siguen funcionando. Para configurar las APIs opcionales, consultar [CertiQuiz](services/certiquiz/README.md) y [CertiChat](services/certichat/README.md).

## Contribuir

- [Editar un curso o añadir otra certificación](.codex/contenido-markdown.md).
- [Incorporar un video a CertiTube](.codex/certitube.md).
- [Ejecutar pruebas y herramientas de mantenimiento](.codex/validation.md).
- [Instrucciones para agentes y reglas de diseño](.codex/AGENTS.md).

## Licencia

Creado por [Joel Gangini](https://www.linkedin.com/in/jgangini/). Código y contenido original bajo [licencia MIT](LICENSE). Los nombres de producto y las fuentes enlazadas pertenecen a sus titulares.
