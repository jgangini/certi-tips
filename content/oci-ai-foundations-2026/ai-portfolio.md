El portafolio de OCI permite consumir modelos ya preparados, desarrollar modelos propios o administrar infraestructura para cargas especializadas. La decisión depende del trabajo que necesitas controlar.

**Objetivos:** distinguir AI Services, Data Science e infraestructura; reconocer el ciclo del modelo; explicar GPU y RDMA; y aplicar principios de IA responsable a un caso concreto.

## Conceptos clave

| Necesidad | Capa inicial | Responsabilidad que conservas |
| --- | --- | --- |
| Extraer información con una capacidad conocida | AI Services | Preparar datos, permisos y revisión de resultados |
| Entrenar y operar un modelo de tu problema | OCI Data Science | Datos, algoritmo, evaluación y despliegue |
| Controlar una carga de cómputo especializada | Infraestructura de IA | Entorno, distribución y operación según el servicio |

![Tres niveles del portafolio: consumir una API, desarrollar un modelo y utilizar infraestructura.]({{base}}assets/diagrams/aif-portfolio-concepts.svg "Elige cuánto necesitas construir y controlar.")

Los servicios preentrenados se consumen mediante consola, API, SDK o CLI; algunos permiten modelos personalizados. No necesitas entrenar una red desde cero para cada tarea. **Digital Assistant** organiza experiencias conversacionales y skills; no es otro nombre de una GPU, un notebook o el servicio Language.

## OCI Data Science y ciclo del modelo

**Projects** organizan trabajo. Las **notebook sessions** proporcionan un entorno JupyterLab donde explorar y entrenar. Un **Conda environment** administra dependencias; no es un modelo. El SDK **ADS** ayuda con tareas del ciclo de datos y modelos.

El **Model Catalog** guarda artefactos y metadatos para seguimiento y colaboración. Un **Model Deployment** expone un modelo para inferencia a través de un endpoint. Un **job** ejecuta una tarea repetible, como preparar datos o entrenar; una pipeline coordina etapas. Guardar en el catálogo no crea automáticamente un endpoint activo.

![Flujo desde notebook y preparación del artefacto hasta catálogo y despliegue.]({{base}}assets/diagrams/aif-portfolio-lifecycle.svg "Guardar un modelo y servir predicciones son etapas separadas.")

Para reproducir un resultado conserva versión de datos, código, dependencias y configuración. En la demostración de Data Science, ADS prepara el artefacto, verifica su capacidad de predecir y lo guarda; el despliegue y la llamada de predicción son pasos posteriores. Consulta los conceptos de [OCI Data Science](https://docs.oracle.com/en-us/iaas/Content/data-science/using/overview.htm).

## Infraestructura e IA responsable

Una **GPU** ejecuta muchas operaciones similares en paralelo, lo que favorece cálculo matricial de entrenamiento e inferencia. No toda tarea mejora al añadir GPU: influyen tamaño de datos, memoria, transferencias y software. La CPU sigue participando en otras partes del trabajo.

Para entrenamiento distribuido, la comunicación entre nodos puede limitar el rendimiento. **RDMA** permite transferencias con menor intervención de CPU; **RoCE** transporta RDMA sobre Ethernet. La localidad reduce recorridos de comunicación. No confundas los enlaces dentro del nodo con la red entre nodos ni un Supercluster con un endpoint de aplicación.

![Relación entre cálculo GPU, red entre nodos y evaluación responsable del sistema.]({{base}}assets/diagrams/aif-portfolio-infrastructure.svg "Capacidad de cómputo, comunicación y gobernanza resuelven problemas diferentes.")

El material resume IA confiable como **lícita, ética y robusta**. En la práctica, define responsables, controles de datos, evaluación por grupos, explicaciones adecuadas, supervisión humana y monitoreo después del despliegue. Un promedio de accuracy puede esconder un desempeño peor para una población o condición de uso. Un modelo técnicamente preciso también puede usarse con un objetivo inapropiado.

## Ejemplo paso a paso

La empresa quiere estimar el tiempo de reparación con historial propio.

1. Define la salida numérica y la decisión que apoyará; comprueba que las features existen antes de la reparación.
2. Organiza un proyecto de Data Science y abre una notebook session con el entorno necesario.
3. Entrena una referencia sencilla y evalúa en reparaciones posteriores, sin filtrar información futura.
4. Prepara y verifica el artefacto, registra el modelo y sus metadatos en el catálogo.
5. Si una aplicación necesita predicciones en línea, crea un despliegue; si recalcula cada noche, considera un job.
6. Monitorea errores por tipo de equipo y conserva una vía de corrección humana.

![Ejemplo de desarrollo, registro y consumo de un predictor de horas de reparación.]({{base}}assets/diagrams/aif-portfolio-example.svg "El objetivo y la frecuencia de uso determinan cómo servir el modelo.")

Si el problema cambiara a transcribir audios, empieza evaluando Speech. No necesitas mantener un modelo propio solo porque ya conoces Data Science.

## Errores frecuentes

- Confundir catálogo con despliegue o un job con un endpoint siempre disponible.
- Creer que una notebook session elimina la necesidad de IAM y acceso a datos.
- Memorizar GPU, fechas de disponibilidad o tamaños de clusters de una grabación como límites actuales.
- Tratar «gestionado» como ausencia de costo o de responsabilidad.
- Añadir una declaración ética sin evaluar resultados y mecanismos de reclamación.

![Distinción entre artefacto, endpoint y tarea de ejecución repetible.]({{base}}assets/diagrams/aif-portfolio-errors.svg "Identifica si necesitas conservar, servir o ejecutar el trabajo.")

## Ejercicio de elección

Un equipo debe transcribir 300 grabaciones, entrenar un clasificador propio y ejecutar su evaluación cada semana. Asigna una capacidad a cada necesidad.

<details>
<summary>Ver solución y explicación</summary>

Evalúa Speech para transcripción por lotes; usa Data Science para desarrollar el clasificador; utiliza jobs o una pipeline para repetir la evaluación. El catálogo conserva el modelo. Si después necesitas inferencia en línea, añade un despliegue. No es necesario administrar un Supercluster para justificar estas tareas.

![Solución con Speech, desarrollo en Data Science y evaluación repetible mediante jobs.]({{base}}assets/diagrams/aif-portfolio-exercise.svg "Cada servicio cubre una responsabilidad del ciclo.")

</details>

## Fuentes y repaso

![Repaso de consumir una capacidad, desarrollar un modelo y evaluar su operación.]({{base}}assets/diagrams/aif-portfolio-recap.svg "Explica qué gestionas tú y qué aporta la plataforma.")

Revisa OCI AI Portfolio y la demostración de Data Science en [MyLearn](https://mylearn.oracle.com/ou/learning-path/become-an-oci-ai-foundations-associate-2026/163544). Consulta la [infraestructura de IA de Oracle](https://www.oracle.com/ai-infrastructure/) para modelos de GPU y disponibilidad actual; las cifras de una demostración son ejemplos de su fecha.
