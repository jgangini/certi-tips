Un prototipo funciona mientras alguien mantiene abierta su terminal. Un servicio empresarial necesita además identidad, estado, límites, despliegue y observación. OCI Enterprise AI ofrece capacidades para llevar agentes a ese entorno y permite distinguir el consumo de una API del alojamiento de la aplicación completa.

## Conceptos clave

El **ciclo de vida** comprende diseñar, construir, probar, desplegar, observar y mejorar. El **runtime** sostiene la ejecución: coordina pasos, herramientas, memoria y fallos. El framework ayuda a expresar la lógica, pero no resuelve por sí solo todo el trabajo operativo.

En este módulo, **Enterprise AI Agents** se refiere a capacidades de **OCI Generative AI**, incluida **OCI Responses API**. No debe confundirse automáticamente con el servicio separado llamado OCI Generative AI Agents. Comprueba qué producto y documentación estás utilizando antes de seguir una demostración.

![Dos vías en OCI: aplicación propia que consume Responses API y aplicación alojada en un runtime gestionado; identidad, memoria y observabilidad atraviesan ambas.]({{base}}assets/diagrams/oci-runtime.svg "Consumir la API y alojar la aplicación son decisiones distintas.")

## Objetivos del módulo

- Distinguir framework, ciclo de vida y runtime.
- Identificar para qué sirven proyectos, herramientas, memoria y APIs de soporte.
- Preparar una primera llamada con región, modelo, identidad y proyecto coherentes.
- Elegir entre consumo de API y aplicación alojada según quién opera el software.

![Cuatro objetivos conectan lógica del agente, runtime, primera llamada y despliegue; cada nivel plantea una responsabilidad operativa diferente.]({{base}}assets/diagrams/oci-objectives.svg "Del prototipo a una operación verificable en OCI.")

## Plataforma y bloques de construcción

La plataforma conecta acceso a modelos, desarrollo agentic y gobierno. La **OCI Responses API** admite una interfaz compatible con OpenAI para solicitudes de modelos y herramientas. Usar el SDK de OpenAI con un endpoint OCI no implica que la petición se ejecute en la infraestructura de OpenAI: el destino, autenticación, proyecto y modelo determinan el servicio utilizado.

Para elegir un modelo, separa tres tareas: **chat** genera respuestas; **embeddings** convierten contenido en vectores para recuperar candidatos por similitud; y **rerank** vuelve a ordenarlos según su relevancia para una consulta. En un RAG, estos candidatos aportan contexto al modelo de chat. Rerank es una etapa opcional que debes evaluar, no un requisito de todo agente. Una temperatura menor, cuando el modelo permite configurarla, reduce variación; no garantiza que la respuesta sea verdadera. Comprueba las capacidades y regiones en el [catálogo de modelos de OCI](https://docs.oracle.com/en-us/iaas/Content/generative-ai/models.htm).

El modo **on-demand** ofrece acceso gestionado compartido y consumo según uso. Los **Dedicated AI Clusters** reservan capacidad de cómputo para tus modelos, sin compartirla con otras tenancies, y se facturan por capacidad y tiempo. Elige según carga, aislamiento y modelos compatibles; revisa cuotas y ciclo de vida, sin asumir latencia garantizada ni disponibilidad indefinida. Son decisiones sobre **servir modelos**, distintas de alojar tu aplicación. Consulta [clusters dedicados](https://docs.oracle.com/en-us/iaas/Content/generative-ai/ai-cluster.htm) y [modalidades de costo](https://docs.oracle.com/en-us/iaas/Content/generative-ai/calculate-cost.htm).

El **gobierno** combina red, identidad y comportamiento: los private endpoints delimitan el acceso de red; ZPR puede añadir controles de comunicación basados en identidad; IAM define permisos sobre recursos; y los guardrails configurados revisan contenido, intentos de inyección o datos personales. No sustituyen la autorización de una acción ni eliminan todo riesgo. La [guía de gobierno de OCI](https://docs.oracle.com/en-us/iaas/Content/generative-ai/governance.htm) sitúa estas capas, y la [referencia de guardrails](https://docs.oracle.com/en-us/iaas/Content/generative-ai/guardrails.htm) detalla su configuración y límites.

![Un flujo documental usa embeddings para recuperar, rerank opcional para priorizar y chat para responder; on-demand o clusters dedicados aportan capacidad, mientras red, IAM y guardrails protegen capas diferentes.]({{base}}assets/diagrams/oci-models-governance.svg "Distingue la tarea del modelo, su capacidad de servicio y sus controles.")

Los bloques estudiados incluyen **File Search** para recuperación documental; **Code Interpreter** para ejecutar código en un entorno aislado administrado; **Function Calling** para funciones que ejecuta tu aplicación; y llamadas a **MCP** para herramientas externas. Las APIs de Files, Vector Stores y Containers apoyan esos escenarios. Un contenedor temporal de una herramienta no es lo mismo que desplegar toda tu aplicación empresarial. Revisa soporte por modelo y región en la [referencia OCI Responses API](https://docs.oracle.com/en-us/iaas/Content/generative-ai/responses-api.htm).

Un **proyecto** organiza recursos relacionados. La memoria de conversación mantiene contexto de una interacción; la memoria a largo plazo permite recuperar información entre interacciones cuando se configura; y la **compaction** condensa contexto. Resumir puede perder detalles: comprueba que las decisiones y restricciones importantes sobrevivan. Define retención y acceso antes de almacenar datos personales. Estas capacidades se documentan en [Enterprise AI Agents en OCI Generative AI](https://docs.oracle.com/en-us/iaas/Content/generative-ai/agents.htm).

![Un proyecto agrupa Responses API, herramientas, memoria y APIs de apoyo; se distingue el sandbox administrado de las funciones ejecutadas por la aplicación y de los servidores MCP externos.]({{base}}assets/diagrams/oci-building-blocks.svg "Herramientas, memoria y recursos se organizan dentro del proyecto.")

## Primeros pasos verificados

Esta sección completa la lección que estaba vacía en los apuntes proporcionados, usando el [Quick Start oficial de Enterprise AI Agents](https://docs.oracle.com/en-us/iaas/Content/generative-ai/get-started-agents.htm), consultado el 28 de septiembre de 2026.

1. Selecciona un compartment de práctica y verifica permisos IAM con el administrador.
2. Crea un proyecto; registra su OCID y revisa retención y memoria antes de activarlas.
3. Configura autenticación: una clave específica de OCI Generative AI para pruebas, o autenticación IAM según el entorno. Una clave por sí sola no reemplaza la política de acceso.
4. Instala el cliente compatible indicado en la documentación y configura el endpoint de tu región.
5. Elige un modelo disponible allí y apto para la capacidad que vas a probar.
6. Envía una petición de texto sencilla y confirma que recibes una respuesta antes de agregar herramientas.

Los permisos amplios del Quick Start son para un entorno de aprendizaje controlado; una aplicación real necesita permisos ajustados a sus operaciones. Mantén credenciales fuera del repositorio y del contenido proyectado durante una charla.

![Seis comprobaciones de inicio: permisos IAM, proyecto, autenticación, endpoint regional, modelo compatible y respuesta de texto antes de agregar herramientas.]({{base}}assets/diagrams/oci-first-call.svg "Primero verifica una llamada básica y luego amplía el flujo.")

## Ejemplo paso a paso

Nuestro asistente debe informar si un pedido está listo y estimar el costo total de sus artículos.

1. La aplicación configura cliente, región, proyecto y modelo. Realiza primero una solicitud de texto para aislar posibles errores de acceso.
2. Describe `consultar_pedido` y `calcular_total` como herramientas con argumentos acotados.
3. La API devuelve una solicitud de consulta. El código de la aplicación valida usuario e identificador y ejecuta su backend de prueba.
4. El resultado se devuelve asociado a la llamada. Si hace falta calcular, el modelo solicita la segunda herramienta y el código la ejecuta.
5. La aplicación entrega la respuesta cuando termina el loop, o devuelve un error controlado al alcanzar sus límites.

Observa que, para funciones propias, la aplicación sigue ejecutando las operaciones. Usar un servicio gestionado para modelos no convierte automáticamente todo el código en ejecución remota. Conserva una traza mínima con identificadores, tiempos y estados; no publiques pedidos reales para demostrar que funciona.

![Secuencia entre la aplicación y OCI Responses API: declarar herramientas, recibir una solicitud, validar y ejecutar, devolver el resultado asociado y continuar hasta la respuesta final.]({{base}}assets/diagrams/oci-tool-sequence.svg "La aplicación ejecuta sus funciones y devuelve resultados a OCI.")

## Una solución completa: operación empresarial

![Arquitectura conceptual empresarial: una aplicación utiliza el runtime del agente, conectado a modelos y herramientas; las herramientas acceden a datos y la operación incluye permisos y observabilidad.]({{base}}assets/illustrations/enterprise-agent.png "El runtime conecta ejecución, datos y controles de operación.")

El runtime coordina sesiones, estado y ejecución. Los modelos y las herramientas son capacidades conectadas, no el runtime mismo. La observabilidad permite inspeccionar el recorrido de una solicitud, mientras los permisos deben verificarse en cada recurso y operación, no únicamente en el acceso inicial.

**Cómo leer la imagen:** sigue una solicitud desde la aplicación, identifica dónde se conserva su estado y qué componentes intervienen si necesita consultar datos. La vista es conceptual: los símbolos de agentes no representan un número de réplicas recomendado, ni el dibujo prescribe una topología OCI, un escalado automático o una disponibilidad de servicio.

## Desplegar y escalar

En la primera vía, la aplicación vive en tu laptop, una VM, un servicio o un cluster y consume OCI Responses API. Tu equipo sigue operando ese despliegue. En la segunda, preparas una aplicación compatible, la empaquetas y la publicas mediante el alojamiento gestionado de aplicaciones de OCI Generative AI.

El recorrido de referencia es desarrollar y probar, empaquetar una imagen, publicarla en el registro correspondiente, crear la aplicación y configurar un despliegue con endpoint. Define red, autenticación, almacenamiento y capacidad según el caso. La [documentación de Enterprise AI](https://docs.oracle.com/en-us/iaas/Content/generative-ai/agents.htm) describe las aplicaciones alojadas. No confundas replicar el servidor con hacer ilimitados los modelos o APIs que consume: sus cuotas y latencias siguen importando.

Antes de actualizar un agente publicado, versiona sus instrucciones, herramientas y configuración. Evalúa la nueva versión con casos normales, errores y límites; después despliega observando calidad, latencia y fallos. Conserva la versión anterior para poder volver atrás si aparecen regresiones. Una respuesta mejor en un único ejemplo no demuestra una mejora general.

![Flujo de alojamiento: desarrollar y probar, empaquetar una imagen, publicarla en OCIR, configurar la aplicación, crear un deployment y atender por su endpoint.]({{base}}assets/diagrams/oci-deployment.svg "De la imagen probada al endpoint de una aplicación alojada.")

## Errores frecuentes

- Copiar un modelo de una demostración sin comprobar disponibilidad regional.
- Cambiar solo la URL y asumir compatibilidad completa de toda característica.
- Confundir proyecto con compartment: tienen funciones diferentes.
- Resolver un error de permisos otorgando acceso administrativo permanente.
- Habilitar memoria sin revisar retención, datos personales y alcance de acceso.

![Señales de integración y comprobaciones: disponibilidad regional, compatibilidad, tipo de OCID, permisos mínimos y política de retención.]({{base}}assets/diagrams/oci-errors.svg "Relaciona cada fallo con la configuración que debes revisar.")

## Ejercicio de elección

El equipo quiere conservar su aplicación en un backend existente y solo sustituir el proveedor de inferencia por OCI. ¿Necesita necesariamente desplegarla como aplicación alojada de Enterprise AI?

<details>
<summary>Ver solución y explicación</summary>

No. Puede conservar el backend y consumir OCI Responses API, ajustando autenticación, endpoint, proyecto, modelo y capacidades compatibles. El alojamiento gestionado es una segunda opción cuando también se quiere trasladar la operación de la aplicación. En ambos casos hay que probar herramientas, estado, permisos y manejo de fallos.

![El backend existente mantiene lógica y funciones mientras envía peticiones a OCI Responses API mediante un cliente configurado con identidad, proyecto, región y modelo compatibles.]({{base}}assets/diagrams/oci-exercise.svg "Puedes conservar el backend y cambiar el proveedor de inferencia.")

</details>

## Fuentes y repaso

Usa el [Quick Start](https://docs.oracle.com/en-us/iaas/Content/generative-ai/get-started-agents.htm) para practicar y [OCI Responses API](https://docs.oracle.com/en-us/iaas/Content/generative-ai/responses-api.htm) para comprobar soporte. Antes de avanzar, explica dónde corre cada función de tu ejemplo y quién es responsable de escalarla, autorizarla y registrar su resultado.

![Repaso de seis responsabilidades operativas: acceso, ejecución, estado, herramientas, capacidad y observación a lo largo del ciclo de vida del agente.]({{base}}assets/diagrams/oci-recap.svg "Ubica cada responsabilidad antes de pasar a producción.")
