# Cobertura visual de los módulos

## Oracle Agentic AI Foundations

Los seis módulos técnicos conservan sus explicaciones, ejemplos, encabezados y enlaces. Cada apartado H2 incorpora una representación específica de la idea que enseña; la orientación inicial conserva su alcance reducido y no recupera el flujo retirado.

| Módulo | Apartados H2 | Recursos didácticos |
| --- | ---: | --- |
| Agentes de IA | 10 | Comparación de comportamientos, ciclo, estado, patrones, llamadas, controles y decisiones. |
| LangChain | 8 | Bloques reutilizables, mensajes, ejecución de herramientas y depuración. |
| Model Context Protocol | 9 | Roles, capacidades, negociación, transportes y acceso a OCI. |
| Responses API y Agents SDK | 10 | API frente a SDK, herramientas, contexto, delegación y guardrails. |
| OCI Enterprise AI | 10 | Servicios gestionados frente a aplicaciones alojadas, conexiones y responsabilidad operativa. |
| Oracle AI Database | 12 | Vectores, filtros, recuperación, agentes, SQL, MCP y controles sobre datos. |

## Criterio editorial

- Los gráficos son SVG originales y editables: texto seleccionable, `title` y `desc`, sin scripts ni dependencias externas.
- Se reutiliza el estilo del portal: fondo claro, texto azul marino, coral para solicitudes/decisiones, índigo para ejecución/control y verde azulado para datos/resultados. El significado también se expresa con palabras, iconos y flechas.
- Se elige comparación, secuencia, relación o decisión según la lección; no se repite un flujo genérico en todos los apartados.
- Los seis gráficos de «Errores frecuentes» usan una misma comparación: «Error o confusión → Qué comprobar», tarjetas coral y verde azulado, iconos de cruz y comprobación, y la misma tipografía y geometría. Solo varían el contenido y el número de filas; la altura crece sin comprimir el texto.
- No se incluyen kickers decorativos, numeración editorial ni branding en el pie de los gráficos. Los controles técnicos necesarios sí permanecen.
- La frase debajo del gráfico describe su contenido. El control conserva su nombre accesible para ampliar, navegación de teclado y cierre con Escape.
- Los diagramas que revelan soluciones se mantienen dentro del desplegable de respuesta.
- El caso de soporte usa una sola arquitectura OCI: aplicación en Compute, modelo en Generative AI, políticas en Object Storage y pedidos en Autonomous AI Database. Se conserva el ancla anterior para los enlaces existentes.
- El alojamiento propio y gestionado incorpora dos ilustraciones 3D generadas con IA, con texto y conexiones SVG editables. La recuperación de evidencia usa una nueva ilustración secuencial sin flechas bidireccionales duplicadas. Los esquemas de OCI son didácticos, no planos de despliegue de producción.
- Los conectores con punta son trazos independientes; los cambios de dirección usan curvas reales. Los iconos Lucide incorporados conservan su licencia en `assets/icons/LICENSE-lucide.txt`; otros símbolos nativos y los iconos OCI existentes mantienen su procedencia.

## Fuentes y límites

Se revisaron los apuntes originales de las seis áreas técnicas y su correspondencia en `data/coverage.json`. La matriz continúa relacionando las 53 lecciones del recorrido completo con secciones reales del portal. No se publican los apuntes fuente.

La presentación compartida de Oracle Agentic AI Foundations Associate (2026) se consultó únicamente como inspiración pedagógica: secuencias, comparaciones y separación entre inferencia y ejecución. No se incorporaron sus diapositivas ni sus imágenes a los assets del sitio.

Los apuntes OCI tienen dos límites conocidos: `01-06-01` está incompleto y `01-06-06` no contiene la explicación del despliegue. Los gráficos de esas áreas se apoyan en la documentación oficial enlazada en el módulo; no se presentan como una reconstrucción literal de información ausente. Se mantienen las correcciones aritméticas y las distinciones de seguridad del contenido existente.

## Comprobaciones reproducibles

`npm test` comprueba la cobertura de cada H2, los captions y la ubicación de las soluciones visuales. `npm run check` valida todos los SVG publicados, referencias locales, accesibilidad básica, ausencia de contenido activo y la matriz de 53 lecciones. `scripts/diagram-check.cjs` mide límites y solapamientos de texto en el DOM del navegador; `scripts/browser-smoke.cjs` comprueba apertura, teclado y retorno de foco. Ninguno necesita capturas de pantalla.

## Oracle Cloud Infrastructure AI Foundations

La segunda guía cubre nueve módulos técnicos con siete apartados H2 cada uno: conceptos, dos bloques de desarrollo, ejemplo, errores, ejercicio y fuentes/repaso. Los 63 apartados tienen un SVG propio bajo el prefijo `aif-`, con descripción y ampliación accesible. Todos siguen el lenguaje visual de Agentic AI: iconografía nativa, tipografía jerarquizada, círculos ilustrados, conectores etiquetados y colores con significado redundante en texto.

| Módulo | Gráficos nuevos | Reutilizados | Foco |
| --- | ---: | ---: | --- |
| Fundamentos de IA | 7 | 0 | Campo, modalidad, tarea, regla y predicción |
| Machine learning | 7 | 0 | Etiquetas, evaluación, grupos, recompensa y desbalance |
| Deep learning | 7 | 0 | Neurona numérica, filtros, estado y generalización |
| IA generativa | 7 | 0 | Tokens, transformers, contexto, recuperación y ajuste |
| Enterprise AI | 7 | 0 | Ciclo de herramientas, memoria, control y ejecución |
| Portafolio OCI | 7 | 0 | API, desarrollo, catálogo, despliegue y jobs |
| OCI Generative AI | 7 | 0 | Playground, ajuste, hosting, vectores y SQL |
| Servicios de IA | 7 | 0 | Texto, audio, imagen, documento y formatos de salida |
| IA para bases de datos | 7 | 0 | Workflow vectorial, identidad, similitud y herramientas |

Las composiciones representan el mecanismo que se enseña: familias anidadas para IA/ML/DL; puntos, grupos y particiones para ML; pesos, sumatoria, curva ReLU, filtros y memoria para redes; barras de probabilidades para tokens; secuencia de llamadas para herramientas; cajas de objetos y tablas para extracción; y vecindarios vectoriales para similitud. No se limita cada sección a tres tarjetas de texto. Las comparaciones de responsabilidades no llevan flechas que sugieran una secuencia inexistente.

Los ejemplos mantienen cantidades verificables: la neurona produce `ReLU(2 × 0,5 + 3 × (−1) + 1) = 0`; 190 equipos sanos de 200 dan 95% de accuracy aunque no se detecte ninguno de los 10 fallos; y una política de 90 días con 35 transcurridos deja 55 días, si no hay otras condiciones. Las ilustraciones distinguen contenido recuperado de autorización, catálogo de endpoint y similitud de identidad exacta.

La revisión combina lectura pedagógica de las exportaciones nativas de los 63 SVG, medición de límites y superposiciones de texto con `diagram-check.cjs`, y comprobación de integración con `ai-foundations-smoke.cjs`. Cargar un archivo sin errores o cubrir un H2 no demuestra por sí solo que el gráfico enseñe: también se comprueban jerarquía, conectores, correspondencia con la sección y precisión de las salidas dibujadas. No se usan capturas de pantalla; las láminas revisadas son exportaciones del arte SVG real.

## OCI Foundations · 2026-10-07

La tercera guía añade 49 SVG bajo el prefijo `ocif-`: siete por cada módulo técnico. Cada H2 tiene un gráfico propio y las siete soluciones de ejercicios permanecen dentro de `details`. La paleta, tipografía y símbolos nativos continúan el estilo de las guías anteriores. Los archivos contienen título, descripción, texto real y recursos internos; no usan dependencias remotas.

| Módulo | Gráficos | Mecanismo representado |
| --- | --- | --- |
| Arquitectura | 7 | Capas gestionadas, región/AD/FD anidados, contexto de consola y respuesta ante fallo |
| IAM | 7 | Autenticación/autorización, árbol de compartimentos, partes de política e identidades de recursos |
| Redes | 7 | Subredes, caminos por destino, backends sanos y recorrido hacia un servicio regional |
| Cómputo | 7 | Imagen + shape, tamaño frente a cantidad, límites de runtimes y dependencia saturada |
| Almacenamiento | 7 | Interfaces, transiciones entre niveles, adjunto/montaje y espacio del volumen frente al sistema de archivos |
| Seguridad | 7 | Responsabilidades, denegación frente a detección, cifrado con clave separada y acceso público |
| Gobierno | 7 | Medidores, alerta frente a cuota, atribución por etiquetas y acción posterior a una alerta |

Revisión semántica del SVG y del texto: Object Storage aparece fuera de las subredes; un compartimento no representa separación física; Archive está fuera del intercambio Auto-Tiering; las capas gestionadas en SaaS no eliminan el control del cliente sobre sus datos y accesos. Las cifras de capacidad y consumo son ejemplos, no precios ni límites de OCI.

Validación DOM en navegador: 49 SVG cargados, texto mínimo de 21 unidades en el lienzo de 1200, cero textos fuera del lienzo y cero superposiciones de texto. Las 11 páginas se comprobaron a 1280, 390 y 320 píxeles sin desbordamiento horizontal ni contenido cubierto por el pie. Se ejercitaron los 49 visores con Escape y retorno de foco, progreso, búsqueda, rutas antiguas, recarga del intento, explicaciones y repaso separado. No se tomaron capturas de pantalla ni se afirma verificación visual basada en capturas.

### Revisión de composición y proximidad

Los comentarios posteriores sobre IAM mostraron un límite de la comprobación anterior: que el texto no se superponga no demuestra que esté centrado ni bien agrupado. Se revisaron las 49 composiciones, distinguiendo encabezados de contenedores (región, subred, runtime) de mensajes contenidos en tarjetas. Las tarjetas centran el conjunto de título y descripción; los contenedores conservan el encabezado arriba para dar espacio a su estructura interna.

| Módulo revisado | Ajustes y criterios comprobados |
| --- | --- |
| Arquitectura (7) | Centrado de capas y contexto de consola; margen dentro de FD; descripción dentro de Región B; ruta fallida interrumpida y estados junto a cada VM. |
| IAM (7) | Identidad, membresía y permiso en columnas; ejemplos de Ana y la aplicación; títulos y descripciones próximos; denegación explícita cuando falta la política de Desarrollo. |
| Redes (7) | Gateways centrados, flechas alineadas con su destino y health checks dentro de la tarjeta del backend; el servidor fallido no recibe una flecha de tráfico activo. |
| Cómputo (7) | Etiquetas centradas en los bloques del runtime; proximidad entre icono, concepto y explicación; escalamiento y dependencia compartida conservan cantidades y límites claros. |
| Almacenamiento (7) | Etiquetas del sistema de archivos centradas; tres clientes conectados al mismo recurso NFS; Standard/IA y Archive conservan mecanismos separados. |
| Seguridad (7) | Pares de iconos centrados en sus paneles; explicación más próxima a la acción; denegación, detección y autorización de datos siguen diferenciadas. |
| Gobierno (7) | Títulos y descripciones agrupados; símbolos y textos de Budget/Quota/Service limit alineados; conectores terminan junto a la etiqueta común. |

La medición en Browser cubre 57 tarjetas centradas y 118 grupos de etiquetas, además de límites y superposiciones de los 49 SVG. Se acepta una desviación del centro de hasta 2 unidades, margen interior mínimo de 12 y separación título-descripción entre 8 y 16 unidades del lienzo. Los dos grupos de IAM señalados tienen una separación renderizada de aproximadamente 10,1 unidades. `scripts/diagram-check.cjs` conserva estas comprobaciones para futuras revisiones. La validación usa DOM y geometría renderizada; no capturas de pantalla.

### Revisión de contraste y grupos de iconos

La siguiente revisión atendió los círculos poco visibles en IAM, la distancia entre Producción/Desarrollo y sus servidores, el conjunto descentrado de escalamiento horizontal y la etiqueta de la clave. Los 61 círculos de OCI Foundations ahora tienen fondo blanco y borde de 2,5 unidades; la prueba de contraste exige una relación mínima de 3:1 entre el borde, el relleno y los extremos de los degradados del dibujo. Los conjuntos de servidores, flechas y descripción se centran como una unidad dentro de sus paneles.

Se sustituyó la llave en las cinco imágenes que la utilizan, incluyendo `oci-objectives.svg`, por el trazado proporcionado por el usuario. Se conserva su silueta y hueco interior; el color sigue la paleta semántica de cada diagrama. «Clave administrada» queda junto al símbolo.

La comprobación DOM posterior cubrió los 49 SVG, 77 tarjetas centradas y 129 pares de icono y etiqueta. La separación entre figura y primera etiqueta queda entre 8 y 24 unidades, con desviación de su eje de hasta 4; las tarjetas conservan el máximo de 2 unidades respecto al centro y al menos 12 de margen. También se comprobaron 55 grupos de título y descripción, texto mínimo de 21, límites del lienzo y cruces con bordes. No se encontraron incumplimientos. `scripts/diagram-check.cjs` incluye ahora la proximidad tanto horizontal como vertical; `tests/diagram-design.test.mjs` comprueba el contraste de los círculos. No se realizaron capturas.
