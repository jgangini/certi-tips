# Recursos gráficos y revisión didáctica

## Regla de edición para Governance

Antes de modificar un SVG `gov-*`, aplica [las reglas de diseño de Governance](governance-diagram-design.md). Esta guía prevalece sobre las medidas de iteraciones históricas registradas abajo y conserva como referencias los módulos 00–02. El verificador de celdas de `scripts/diagram-check.cjs` comprueba alturas, márgenes, centrado vertical y encabezados partidos innecesariamente.

## Presentación vigente de los módulos 03–11 · 2026-10-10

Quedan 45 gráficos en esos nueve módulos y 66 SVG de Governance en total. Se retiraron las secciones «Fuentes y Repaso» y sus gráficos, además de las imágenes de «Errores Frecuentes»; sus listas explicativas permanecen. Las tablas, círculos, colores y tags siguen las referencias de Arquitectura y Gobierno. El cuerpo usa 25,5 px; los encabezados son grises con texto blanco y los tags de fondo neutro, borde gris y una sola línea. Se centran los conjuntos completos y se conservan textos, significado y pictogramas. Las seis especificaciones técnicas del alcance reflejan el mismo tamaño de texto. La revisión y sus comprobaciones DOM están en [visual-coverage.md](visual-coverage.md).

La procedencia documentada abajo se conserva; las cantidades y decisiones de presentación de 2026-10-09 son históricas y quedan sustituidas por este ajuste para los módulos 03–11.

## Data Management Fundamentals — rediseño de 2026-10-09

El alcance es de **84 láminas SVG**: 73 en los once módulos y 11 en introducción, matriz, glosario y caso integrador. De ellas, **76 son composiciones conceptuales y ocho son arquitecturas técnicas**. Cada lámina conserva su archivo, su sección y el visor accesible del portal. La Pirámide Dorada incorpora el SVG proporcionado por el usuario; las demás composiciones conservan la procedencia documentada aquí.

La especificación de presentación es 16:9, `viewBox="0 0 1920 1080"`, título de 56 px y texto de al menos 32 px. Por ajuste solicitado, `gov-overview-contract.svg` usa texto interior de 25,5 px, equivalente al caption de 10,88 px en el viewport de referencia de 1662 px; su bloque central mide 630 px y sus bordes y conexiones usan el plomo `#59616E` de «Empieza Aquí». `gov-overview-map.svg` preserva la tipografía del original suministrado, 10/12 px a escala uniforme 1,72 (17,2/20,64 px efectivos). Se utiliza un título breve por figura; los datos del caso aparecen dentro del dibujo cuando son necesarios. Los textos alternativos identifican la figura en el visor y los captions explican su significado, sin repetir el título. La composición depende de la relación que se enseña: cardinalidades, decisiones, secuencias, bandas de vigencia, campos anotados, matrices, diferencias de versiones y poblaciones contables. Las flechas distinguen acceso, movimiento, dependencia o evidencia; las relaciones entre entidades no se presentan como procesamiento.

La paleta toma los valores de la [guía oficial Oracle Redwood, octubre de 2024](https://www.oracle.com/a/ocom/docs/oracle-brand-guidelines.pdf): Slate `#3C4545`, `#697778`, `#C2D4D4`, Neutral `#F1EFED` y acento Oracle Red `#C74634` para conceptos; Pine `#1E3224`, `#33553C`, `#4C825C` para tecnología. Las 84 láminas usan el fondo Neutral `#F1EFED` de la Pirámide Dorada; los cuerpos blancos de las tarjetas conservan su función de agrupar contenido. La asignación de estas familias a las láminas es una decisión editorial del curso, no una plantilla oficial de capacitación. Los colores planos y el espacio libre acompañan las etiquetas; el color no es la única señal del significado.

**Paleta complementaria aportada por el usuario.** Los colores de su referencia son naranja `#C06D30`, verde `#749B6B`, cian `#00B0F0`, azul petróleo `#2E5C70` y gris cálido `#8A847F`, sobre Neutral `#F1EFED`. Se aplican por función: decisión y autoridad, ejecución, información y consumo o valor. Se combinan pocos tonos en cada figura, con etiquetas y formas que permiten interpretarla sin depender del color. Estos valores proceden de la referencia del usuario; no se presentan como una nueva paleta oficial Oracle. Los iconos oficiales de producto conservan sus colores y geometría. La Pirámide Dorada conserva exactamente los cuatro rellenos y el texto claro `#FBFBE7` del SVG suministrado; no se aplica a este original el contraste de la variante oscurecida anterior.

La pirámide de introducción conserva las once áreas y una cima de resultados diferenciada. El original [data/diagram-sources/dama.svg](../data/diagram-sources/dama.svg), exportado por Visio, se mantiene byte por byte para reproducir la importación. Su viewBox es `0 0 1154.55 841.89`; los trazados, posiciones, rótulos ingleses y punta/base redondeadas se incorporan con una sola escala de 1,72. Solo se retiran metadatos Visio y se añade una alternativa tipográfica a Oracle Sans. La base termina en `y=1000`, con 80 px de margen inferior. No se atribuye una licencia externa no verificada al archivo aportado. La pirámide de gobierno distingue autoridad, gestión y valor mediante estratos y responsables. Sus niveles tienen esquinas curvas, texto blanco de peso normal (36 px para nombres y 32 px para explicaciones) y rellenos rojo `#C74634`, verde `#397C46` y azul verdoso `#007E87`, con contraste mínimo de 4,82:1. Las responsabilidades aparecen en tarjetas blancas con cabecera gris; las líneas vinculan cada tarjeta con el contorno de su nivel. El acento rojo común se coloca **debajo del título**, separado de la composición, en las 84 láminas.

**Personas.** Se incorpora exactamente la geometría de los dos trazados SVG de 16 × 16 proporcionados por el usuario: cabeza circular y torso. Se inserta como geometría interna autocontenida, identificada por `data-person-icon="user-supplied"`, y solo varían escala, posición y color. No se utiliza para servicios Oracle, modelos ni agentes de inteligencia artificial. La procedencia es el SVG pegado por el usuario; no se le atribuye una licencia o autor externo no verificado.

### Pictogramas conceptuales y asociación con el contenido

El catálogo de Governance contiene **18 SVG originales de Lucide**, seleccionados tras consultar la [colección Lucide Line Icons en SVG Repo](https://www.svgrepo.com/collection/lucide-line-icons/). La descarga desde SVG Repo presentó un desafío de acceso que no se eludió. Los archivos se obtuvieron del [repositorio oficial Lucide, revisión `70562c1ee1c4fdcf736fe97bc893fb8511927934`](https://github.com/lucide-icons/lucide/tree/70562c1ee1c4fdcf736fe97bc893fb8511927934/icons). SVG Repo fue la fuente de descubrimiento; no se afirma que estos originales coincidan con versiones antiguas alojadas allí ni que se verificara cada ficha individual.

La licencia real es **ISC AND MIT**: los avisos de Lucide y de los trazados derivados de Feather se conservan en [`assets/icons/LICENSE-lucide.txt`](../assets/icons/LICENSE-lucide.txt). No se aplica una atribución CC0 tomada de extractos genéricos de SVG Repo. El [`manifest.json`](../assets/icons/governance/manifest.json) registra la clave semántica, el significado previsto, la URL de descubrimiento, el archivo y la revisión de origen, la licencia, el `viewBox` y los hashes SHA-256 del archivo y de su geometría. Los originales se validaron contra una lista de elementos y atributos permitidos; al estar libres de contenido activo o referencias externas, se conservaron sin alterar sus trazados.

Cada pictograma se integra como geometría autocontenida con `data-svgrepo-icon`, dentro del mismo grupo visual que su objeto y explicación. Un contrato, una base de datos o una excepción deben quedar asociados a su rótulo y a la conclusión que ilustran; la ausencia de colisiones por sí sola no demuestra esa relación. El escudo y el contrato no incluyen una aprobación implícita, y el check se reserva para comprobaciones completadas. Tablas, cálculos, cardinalidades y pirámides mantienen su notación cuando añadir iconos sería decorativo. Esta incorporación preserva los **23 pictogramas oficiales Oracle** de las ocho arquitecturas y la geometría humana exacta aportada por el usuario; no los sustituye por símbolos genéricos ni añade una dependencia al sitio.

### Procedencia de las ocho arquitecturas

El plugin **OCI Architecture Diagram 0.4.10** aporta el catálogo de servicios, los pictogramas locales y la validación/renderización de las especificaciones. Los SVG finales adaptan esas relaciones al formato de lámina. Conservan la geometría y los colores de los pictogramas; solo cambian posición y escala. Se usan los nombres completos de los productos y se evita representar un producto con el símbolo de otro servicio.

| Lámina | Propósito técnico |
| --- | --- |
| `gov-map-architecture.svg` | Rutas de consumo y dependencia explícita de las funciones de IA. |
| `gov-data-architecture-oracle.svg` | Arquitectura aportada por el usuario: etapas Landing/Bronze/Silver/Gold, catálogo, linaje, agentes y modelos de lenguaje. |
| `gov-data-security-oracle.svg` | Ámbitos de acceso, identidad efectiva y controles de bases compatibles. |
| `gov-data-integration-oracle.svg` | Captura de cambios cuando el requisito justifica ese patrón. |
| `gov-content-management-oracle.svg` | Ingestión documental, recuperación y requisitos de las funciones de IA. |
| `gov-master-reference-data-oracle.svg` | Decisiones sobre maestros y distribución de conjuntos aprobados. |
| `gov-data-warehousing-bi-oracle.svg` | Conexiones analíticas configuradas y semántica compartida. |
| `gov-data-quality-oracle.svg` | Reglas implementadas, aceptación y tratamiento de excepciones. |

La arquitectura del módulo 02 usa el original [data/diagram-sources/arq.svg](../data/diagram-sources/arq.svg), conservado byte por byte. Por ajuste solicitado, se retira Oracle Analytics Cloud y su conexión, y se amplía y centra el conjunto restante con escala uniforme de 3,2 (texto efectivo de 32 px). Se preservan las posiciones relativas y los trazados restantes. Linaje, Agent Flow y Master Catalog usan bloques plomos redondeados con texto blanco; Streaming usa el verde de Gobierno `#397C46`, esquinas redondeadas y texto blanco. Las conexiones de entrada y de IA son rojas `#C74634`. La conexión «Memory» representa una integración propuesta, explicada en el caption; la memoria nativa del agente es de sesión. Su registro conserva el hash del original y las fuentes públicas actuales. No se atribuye una licencia externa no verificada al archivo aportado.

Las ocho especificaciones persistentes están en [`data/architecture-governance`](../data/architecture-governance/); registran los nodos, el significado de las conexiones y sus fuentes públicas. Los pictogramas utilizados corresponden a Oracle AI Data Platform, Oracle Autonomous AI Database, Oracle Analytics Cloud, Oracle Cloud Infrastructure Identity and Access Management, Oracle Cloud Infrastructure Object Storage, Oracle Cloud Infrastructure GoldenGate y Oracle Data Safe. El pictograma de Oracle Autonomous AI Database identifica su modalidad Oracle Autonomous AI Lakehouse. Oracle Fusion Cloud Enterprise Data Management conserva una etiqueta textual porque el catálogo instalado no aporta un pictograma exacto de ese producto.

La referencia pública de iconografía es [Graphics for Topologies and Diagrams de Oracle](https://docs.oracle.com/en-us/iaas/Content/General/Reference/graphicsfordiagrams.htm). El registro de preparación `output/governance-redesign/audit-architectures.json` conserva los identificadores del catálogo y los archivos fuente; los manifiestos conceptuales registran objetivo, problema anterior y composición propuesta. La autoría y los renders intermedios se mantienen en `output/`, fuera del código de ejecución del portal. Los gráficos conceptuales combinan geometría SVG propia, el pictograma humano suministrado y los originales Lucide del catálogo documentado arriba. La revisión de cada figura registra la relación entre pictograma, objeto, explicación y conclusión, además de su geometría.

### Estado de revisión

Ajuste focal actual: **Pirámide Dorada** importada desde el SVG del usuario, con sus doce rótulos originales, trazados y colores exactos. Exportación nativa inspeccionada; DOM con trece textos sin recortes ni solapamientos y margen inferior de 80 px. El caption explica la pirámide de Peter Aiken. Esta importación sustituye la reconstrucción anterior y sus afirmaciones de texto uniforme/contraste. Registros `output/governance-pyramid-source-`.

En la revisión general anterior se revisaron las **88 exportaciones reales de SVG** individualmente, sin capturas de pantalla: **79 ajustadas y 9 conservadas**. Las superficies explicativas son claras, con tintes editoriales `#F7EFE8`, `#EEF3EC`, `#EEF3F4` y `#EDF1F2`, texto oscuro y color intenso limitado a acentos o datos que lo requieren. Estos tintes no se atribuyen a la paleta oficial de Oracle. Se conservan los colores de la referencia en las dos pirámides y la codificación de conjuntos, intervalos y cantidades.

«Del propósito al control» se reconstruyó: aprobación del propietario, activo nombrado dentro del producto y filas que agrupan contexto, permisos y auditoría. La publicación tiene una conexión rotulada y exige configurar el acceso en el destino. Los originales Lucide representan objetos concretos; no sustituyen pictogramas oficiales de servicios. [Registro individual y observaciones](visual-coverage.md).

El DOM comprobó 1495 elementos de texto y 114 instancias Lucide, sin recortes, superposiciones, cruces de marcos ni pictogramas separados más de 80 unidades del rótulo más próximo. Los 88 visores cargan, abren con Enter, cierran con Escape y restituyen el foco. Se comprobaron 48 vistas de página y el nuevo gráfico en móvil y tema oscuro. El contraste mínimo de las 1820 líneas muestreadas es 4,626:1; la lente curva del Venn se verifica aparte del muestreador.

Los registros de build, 81 pruebas, check y postflight usan `output/governance-composition-`. Las cuatro auditorías conservan `surfaceReview` por figura, historial y hashes. El test de iconos valida originales y ausencia de contenido activo, normalizando CRLF a LF para Git en Windows. La autoría local y las exportaciones permanecen bajo `output/governance-redesign/`; la comprobación DOM del navegador es independiente de la inspección de las exportaciones nativas.

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
