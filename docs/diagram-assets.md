# Recursos gráficos y revisión didáctica

## Iconografía

Se incorporan trazados del [repositorio oficial Lucide](https://github.com/lucide-icons/lucide/tree/main/icons), sin nueva dependencia JavaScript. Licencia ISC y atribución MIT de Feather conservadas íntegramente en `assets/icons/LICENSE-lucide.txt`.

Familias utilizadas: cpu, bot, workflow, wrench, list-filter, app-window, server, file-text, messages-square, network, plug, search, cloud, database, repeat-2, panels-top-left, headset, package, clipboard-list, dollar-sign, file-input, shield-check, file-check, key-round, cloud-upload, file-search, list-ordered, folder-cog, brain-circuit, boxes, braces, table, blocks, lock-keyhole, gauge y activity. Los símbolos de comparación y aritmética siguen siendo SVG nativos del portal. No se atribuye a Lucide todo el dibujo.

`oci-support.svg` reutiliza la arquitectura y los iconos oficiales OCI ya presentes. El caso mantiene separados el modelo, la aplicación que ejecuta las herramientas y los servicios de datos. La explicación de proyecto frente a API se contrasta con [Projects](https://docs.oracle.com/en-us/iaas/Content/generative-ai/projects.htm) y [Building AI Agents](https://docs.oracle.com/en-us/iaas/Content/generative-ai/building-agents.htm).

## Ilustraciones generadas con IA

Los recursos siguientes son ilustraciones didácticas, no capturas de infraestructura real ni iconos oficiales Oracle. Se generaron con imagegen; no se copiaron imágenes de la PPT de referencia.

| Archivo | Propósito y dirección del prompt |
| --- | --- |
| `self-hosted-runtime.png` | Ilustración 3D isométrica mate, transparente, 3:2: un portátil moderno blanco/azul marino con código abstracto índigo y una torre de servidor conectada. Sin texto, logos ni flechas. Representa operación propia. |
| `managed-runtime.png` | Ilustración a juego, transparente, 3:2: tres módulos de servidor blanco/azul marino, luces verde azulado y nube blanca. Sin texto, logos ni flechas. Representa alojamiento gestionado. |
| `grounded-answer-v2.png` | Rediseño de la ilustración existente en cuatro columnas: pregunta, recuperación autorizada (búsqueda vectorial o SQL), modelo con contexto y respuesta con evidencia. Flechas solo hacia la derecha, sin tuberías decorativas ni flechas opuestas. Nota sobre validación del acceso por la aplicación. |

Las ilustraciones transparentes se mantienen como PNG fuente y se incrustan durante el build en `oci-runtime.svg`: los navegadores no cargan imágenes externas desde un SVG mostrado mediante `<img>`. El validador solo permite PNG inline y continúa rechazando SVG activos, eventos y referencias externas.

## Revisión

Se revisan geometría renderizada, márgenes interiores, conexiones y significado de cada flujo. La revisión en Browser usa DOM, accesibilidad, carga real, apertura, Escape y retorno de foco; no usa capturas. Las pruebas de regresión protegen trazos con punta independientes, números blancos, ejemplo en USD, caso OCI único y estado completado sin insignia adicional.

### Auditoría de iconos — 2026-09-29

La revisión anterior de límites y carga no detectó que dos agentes aún usaban símbolos de refrescar/check. Esta pasada revisa el significado por separado: robot = agente; chip = modelo; ventana = aplicación; nodos de flujo = orquestación; llave de herramientas = función; documento comprobado = formato de salida, no veracidad. Las flechas representan el ciclo, no sustituyen al agente.

Se revisaron las 60 imágenes usadas en los seis módulos: 58 SVG y dos ilustraciones PNG. Se corrigieron 15 SVG. El resto conserva símbolos concretos, iconos ya coherentes o notación de flujo que no necesita dibujos decorativos. La tabla registra decisiones sobre los archivos, no una aprobación visual basada en capturas.

| Imagen | Decisión |
| --- | --- |
| agent-loop.svg | Conservar CPU, aplicación validada y observación documental. |
| agents-objectives.svg | Cambiar los tres pictogramas a mensajes, workflow y bot. Eliminar círculo con check del agente. |
| agents-state.svg | Conservar CPU, workflow y herramienta. |
| agents-reasoning.svg | Conservar secuencia, ciclo y bifurcaciones: son patrones, no entidades. |
| agents-example.svg | Conservar operadores aritméticos. |
| agents-decision.svg | Conservar rombo y ramas de decisión. |
| agents-recap.svg | Conservar persona, CPU, workflow y herramienta. |
| agents-mistakes.svg | Conservar cruz/check como error/comprobación. |
| guardrails.svg | Unificar entrada documental, modelo, autorización y salida con Lucide. |
| oci-support.svg | Conservar iconos oficiales OCI. |
| langchain-flow.svg | Cambiar prompt a mensajes y parser a documento comprobado. |
| langchain-objectives.svg | Cambiar chain.invoke a workflow y agent.invoke a bot. |
| langchain-building-blocks.svg | Usar los mismos prompt y parser del flujo. |
| langchain-message-cycle.svg | Conservar CPU y workflow. |
| langchain-math-sequence.svg | Conservar actores, llamadas, IDs y resultados. |
| langchain-debug.svg | Conservar evidencia, inspección y límite. |
| langchain-recap.svg | Conservar CPU, workflow y herramienta. |
| langchain-errors.svg | Conservar comparación error/comprobación. |
| mcp-architecture.svg | Conservar modelo, aplicación, clientes y servidor diferenciados. |
| mcp-objectives.svg | Conservar red, herramienta, mensajes y conexión. |
| mcp-capabilities.svg | Conservar herramienta, recurso documental y prompt. |
| mcp-connection.svg | Conservar inicialización, descubrimiento, ejecución y respuesta. |
| mcp-shared-tool.svg | Conservar ventana y bot para los dos hosts. |
| mcp-oci-usage.svg | Conservar cliente, servidor y cloud como extremos. |
| mcp-transport-exercise.svg | Conservar extremos y transportes distintos. |
| mcp-recap.svg | Conservar host, cliente y servidor. |
| mcp-errors.svg | Conservar comparación error/comprobación. |
| openai-stack.svg | Unificar aplicación, SDK y API como ventana, workflow y conexión. |
| openai-objectives.svg | Unificar herramienta, delegación y control. Mantener repeat-2 solo para el loop. |
| openai-context.svg | Usar database para el almacenamiento de Conversations. |
| openai-tools.svg | Usar workflow para Runner, cloud para alojamiento y wrench para función. |
| handoffs.svg | Conservar headset para triage y bot para manager/especialista. |
| openai-support-steps.svg | Conservar numeración de pasos; no representa entidades. |
| openai-guardrails.svg | Conservar entrada, autorización y salida comprobada. |
| openai-exercise.svg | Conservar bot, pedido y políticas. |
| openai-recap.svg | Aplicar los mismos símbolos del stack. |
| openai-errors.svg | Conservar comparación error/comprobación. |
| oci-runtime.svg | Conservar ilustraciones IA de alojamiento y separación respecto de la API. |
| oci-objectives.svg | Conservar bot, workflow, llave y despliegue. |
| oci-models-governance.svg | Cambiar Embed de lupa a CPU: es un modelo, no la búsqueda. |
| oci-building-blocks.svg | Conservar aplicación, API, proyecto, herramientas, memoria y recursos diferenciados. |
| oci-first-call.svg | Conservar secuencia numerada. |
| oci-tool-sequence.svg | Conservar actores y mensajes explícitos. |
| enterprise-agent.png | Conservar ilustración conceptual de componentes; no es una secuencia de ejecución. |
| oci-deployment.svg | Conservar secuencia numerada. |
| oci-exercise.svg | Sustituir aplicación artesanal por app-window. |
| oci-recap.svg | Conservar acceso, ejecución, estado, herramientas, capacidad y observación. |
| oci-errors.svg | Conservar comparación error/comprobación. |
| database-capabilities.svg | Usar bot para Select AI Agent y workflow para Agent Factory. |
| database-objectives.svg | Conservar datos, búsqueda, selección y autorización. |
| database-similarity.svg | Conservar puntos, ángulos y distancia: son las magnitudes enseñadas. |
| vector-search.svg | Sustituir ondas por CPU en ambos modelos de embeddings. |
| database-product-search.svg | Conservar mochila y tabla de filtros del caso. |
| grounded-answer-v2.png | Conservar pregunta, recuperación autorizada, contexto y respuesta documentada. |
| database-agent-factory.svg | Conservar documentos, tabla y nombres de los agentes. |
| database-select-agent.svg | Añadir bots a ambos agentes y wrench a Tools. |
| database-mcp.svg | Conservar clientes, conexión MCP y base de datos. |
| database-exercise.svg | Conservar escudo de autorización y cruz de escritura no permitida. |
| database-recap.svg | Conservar árbol textual de decisión sin iconos decorativos. |
| database-misconceptions.svg | Conservar comparación error/comprobación. |

Browser comprobó los 58 SVG renderizados, sus referencias y texto, incluidos 89 pictogramas identificados mediante `data-icon`; no hubo referencias vacías ni texto superpuesto o fuera del lienzo. Esa comprobación de DOM no sustituye una evaluación visual completa mediante capturas, que no se realizó por la restricción del proyecto.
