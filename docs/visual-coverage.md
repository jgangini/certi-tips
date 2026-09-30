# Cobertura visual de los módulos

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
- No se incluyen kickers decorativos, numeración editorial ni branding en el pie de los gráficos. Los controles técnicos necesarios sí permanecen.
- La frase debajo del gráfico describe su contenido. El control conserva su nombre accesible para ampliar, navegación de teclado y cierre con Escape.
- Los diagramas que revelan soluciones se mantienen dentro del desplegable de respuesta.
- Las ilustraciones conceptuales existentes se conservan. Los esquemas de OCI son didácticos, no planos de despliegue de producción.

## Fuentes y límites

Se revisaron los apuntes originales de las seis áreas técnicas y su correspondencia en `data/coverage.json`. La matriz continúa relacionando las 53 lecciones del recorrido completo con secciones reales del portal. No se publican los apuntes fuente.

La presentación compartida de Oracle Agentic AI Foundations Associate (2026) se consultó únicamente como inspiración pedagógica: secuencias, comparaciones y separación entre inferencia y ejecución. No se incorporaron sus diapositivas ni sus imágenes a los assets del sitio.

Los apuntes OCI tienen dos límites conocidos: `01-06-01` está incompleto y `01-06-06` no contiene la explicación del despliegue. Los gráficos de esas áreas se apoyan en la documentación oficial enlazada en el módulo; no se presentan como una reconstrucción literal de información ausente. Se mantienen las correcciones aritméticas y las distinciones de seguridad del contenido existente.

## Comprobaciones reproducibles

`npm test` comprueba la cobertura de cada H2, los captions y la ubicación de las soluciones visuales. `npm run check` valida todos los SVG publicados, referencias locales, accesibilidad básica, ausencia de contenido activo y la matriz de 53 lecciones. `scripts/diagram-check.cjs` mide límites y solapamientos de texto en el DOM del navegador; `scripts/browser-smoke.cjs` comprueba apertura, teclado y retorno de foco. Ninguno necesita capturas de pantalla.
