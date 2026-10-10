# AI Foundations 2026: fuentes y decisiones editoriales

Revisión: 9 de octubre de 2026. Curso: Oracle Cloud Infrastructure AI Foundations Associate, 1Z0-1122-26.

## Cobertura del material aportado

La carpeta fuente contiene 72 lecciones Markdown, un archivo de práctica y un temario. Las transcripciones permanecen fuera del repositorio. `data/coverage-ai-foundations.json` relaciona cada nombre de lección con un módulo y un encabezado publicados. Se han sintetizado en español, sin copiar las transcripciones ni distribuir el banco oficial.

| Grupo fuente | Lecciones | Módulo CertiTips |
| --- | ---: | --- |
| Welcome to AI Foundations | 1 | Orientación |
| AI Foundations | 6 | Fundamentos de IA |
| Machine Learning Foundations | 10 | Machine learning |
| Deep Learning Foundations | 6 | Deep learning |
| Generative AI and LLM Foundations | 8 | IA generativa y LLM |
| OCI Enterprise AI | 12 | Enterprise AI |
| OCI AI Portfolio | 8 | Portafolio de IA en OCI |
| OCI Generative AI Service | 6 | OCI Generative AI |
| OCI AI Services | 9 | Servicios de IA |
| Agentic AI for Database | 6 | IA para bases de datos |

El temario adjunto presenta siete dominios y pesos 10/15/15/15/15/10/20. El checklist los identifica como información del material aportado; no se presenta esa distribución como verificada independientemente para todas las variantes del examen. Enterprise AI y el bloque ampliado de bases de datos forman parte de la cobertura pedagógica sin inventarles pesos oficiales separados.

Las 54 preguntas de CertiTips son originales: seis por módulo técnico, con cuatro alternativas explicadas y referencia a una sección real. Se eligen dos por módulo (18 en total). La meta orientativa es 15/18. Ni el muestreo ni la meta constituyen una simulación de la distribución o calificación oficial. El archivo de práctica aportado sirve para reconocer alcance conceptual; sus preguntas no se incorporan al banco del sitio.

## Contraste con fuentes primarias

- [Ruta MyLearn 2026](https://mylearn.oracle.com/ou/learning-path/become-an-oci-ai-foundations-associate-2026/163544): nombre, código y duración de una hora del examen. No se trasladan los 40 ítems ni el 65% mencionados en material antiguo a la ficha actual sin confirmación de la variante concreta.
- [Listado oficial de exámenes de Oracle Japón](https://www.oracle.com/jp/education/certification/certification-exam-list/): publica 40 preguntas, 60 minutos y 65% de aprobación para `1Z0-1122-26-JPN`. Por solicitud editorial, la tabla de orientación muestra 40 y 65% como texto simple, sin calificador ni enlace. La confirmación pública consultada corresponde a la variante japonesa; no se ha verificado independientemente la cifra para otros idiomas.
- [OCI Generative AI](https://docs.oracle.com/en-us/iaas/Content/generative-ai/overview.htm), [inicio con agentes](https://docs.oracle.com/en-us/iaas/Content/generative-ai/get-started-agents.htm), [projects](https://docs.oracle.com/en-us/iaas/Content/generative-ai/projects.htm) y [guardrails](https://docs.oracle.com/en-us/iaas/Content/generative-ai/guardrails.htm): modelos, herramientas, endpoints, persistencia y alcance de controles.
- [Data Science](https://docs.oracle.com/en-us/iaas/Content/data-science/using/overview.htm) e [infraestructura de IA](https://www.oracle.com/ai-infrastructure/): catálogo, despliegues, jobs y cómputo.
- [Language](https://docs.oracle.com/en-us/iaas/Content/language/using/overview.htm), [Speech](https://docs.oracle.com/en-us/iaas/Content/speech/using/speech.htm), [Vision](https://docs.oracle.com/en-us/iaas/Content/vision/using/overview.htm) y [Document Understanding](https://docs.oracle.com/en-us/iaas/Content/document-understanding/using/home.htm): selección por entrada y salida.
- [AI Vector Search](https://docs.oracle.com/en/database/oracle/oracle-database/26/vecse/overview-ai-vector-search.html), [Select AI](https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/select-ai.html), [Select AI Agent](https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/select-ai-agents-concepts.html), [Private Agent Factory](https://docs.oracle.com/en/database/oracle/agent-factory/26.7/paias/introduction.html) y [MCP de Autonomous](https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/about-mcp-server.html): recuperación, SQL, orquestación y herramientas autorizadas.
- [Attention Is All You Need](https://arxiv.org/abs/1706.03762): atención y arquitectura transformer.

## Correcciones aplicadas al sintetizar

- Tareas específicas no se presentan como inteligencia general. Generar texto sí implica predicción de tokens; el contexto no cambia automáticamente los pesos ni reduce el vocabulario a una lista temática.
- Few-shot prompting aporta ejemplos en contexto. Fine-tuning cambia parámetros entrenables. RAG aporta evidencia recuperada y no garantiza ausencia de alucinaciones.
- Backpropagation calcula gradientes; el optimizador actualiza parámetros. Más épocas o neuronas no garantizan generalización. Se explica fuga de datos y la limitación de accuracy en clases desbalanceadas.
- Extracción de tablas y campos de facturas se asigna a Document Understanding. No se perpetúa la afirmación antigua de que Speech solo admite tres idiomas: depende del modelo y de sus capacidades actuales.
- Las listas antiguas de modelos, GPU, regiones y límites no se presentan como disponibilidad vigente exhaustiva. La ventana de 512 tokens de un embedding concreto no se convierte en límite universal.
- Persistir conversaciones y proyectos exige revisar retención y aislamiento. No se afirma que todos los datos se descarten cuando se habilitan funciones persistentes.
- Una función propia necesita ejecución y validación en la aplicación; MCP no otorga privilegios. Proximidad a la base no garantiza que ninguna llamada externa mueva datos.
- HNSW se desarrolla como Hierarchical Navigable Small World. La precisión objetivo de búsqueda aproximada no es garantía por consulta.

## Formato reutilizado

Se conserva la estructura de Agentic AI: portada, menú por secciones, progreso local, objetivos, conceptos, ejemplo, errores, ejercicio con solución desplegable, fuentes, glosario, checklist y práctica con repaso. Los 63 apartados técnicos tienen SVG propio, descripción y ampliación accesible. El diseño usa la referencia visual de Agentic AI y representa mecanismos concretos: distribuciones, curvas, matrices, flujos de datos y límites de autorización. La [cobertura visual](visual-coverage.md) documenta el criterio editorial y las comprobaciones.
