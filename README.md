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

El [catálogo CertiTips](https://jgangini.github.io/certitips/cursos/) conserva Foundation y el carrusel de especialidades, incluidas las rutas cuya guía está marcada como **próximamente**.

## Ejecutar localmente

Requiere Node.js 24 y npm.

```sh
npm ci --ignore-scripts
npm run build
npm run preview
```

Abrir [localhost:4173/certitips](http://127.0.0.1:4173/certitips/). Para configurar las APIs opcionales, consultar [CertiQuiz](services/certiquiz/README.md) y [CertiChat](services/certichat/README.md).

## Contribuir

- [Editar un curso o añadir otra certificación](docs/courses.md).
- [Incorporar un video a CertiTube](docs/certitube.md).
- [Ejecutar pruebas y herramientas de mantenimiento](.codex/validation.md).
- [Instrucciones para agentes y reglas de diseño](.codex/AGENTS.md).

## Licencia

Creado por [Joel Gangini](https://www.linkedin.com/in/jgangini/). Código y contenido original bajo [licencia MIT](LICENSE). Los nombres de producto y las fuentes enlazadas pertenecen a sus titulares.
