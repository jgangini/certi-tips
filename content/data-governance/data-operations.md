El informe de cobros de Horizonte debe estar listo al iniciar la jornada. El servicio está accesible, pero la carga de facturas quedó incompleta durante la noche. La operación de datos tiene que comprobar el producto entregado, además de la salud de la infraestructura.

## Conceptos Clave

La gestión de almacenamiento y operaciones mantiene los datos utilizables durante su ciclo de vida. Incluye capacidad, rendimiento, disponibilidad, recuperación, cambios y disposición final. Su referencia es el servicio que el negocio necesita: «tablero disponible» no equivale a «tablero completo y actualizado».

Una organización define objetivos de servicio observables. Para Horizonte puede importar que las facturas del día anterior estén publicadas antes de las 08:00, que se conozca el resultado de la reconciliación y que los consumidores vean la última actualización. Son objetivos del caso, no garantías predeterminadas de Oracle.

El **RPO** expresa la pérdida de datos tolerable medida en tiempo; el **RTO** expresa el tiempo objetivo de recuperación. Si el RPO acordado es una hora, un respaldo diario por sí solo no demuestra que se cumpla. Si el RTO es dos horas, almacenar respaldos sin probar restauración tampoco demuestra el resultado.

![RPO y RTO: Dos Límites Distintos]({{base}}assets/diagrams/gov-data-operations-concepts.svg "Los objetivos ilustrativos separan pérdida de datos y tiempo de recuperación. Ante un incidente a las 08:00, un RPO de una hora exige recuperar al menos el estado de las 07:00. Un RTO de dos horas fija las 10:00 como límite objetivo para recuperar el servicio. Comprueba ambos mediante evidencia de estados recuperables y ensayos; disponer de un respaldo no demuestra por sí solo que se cumplen.")

## Servicio, Recuperación y Costo

Un **respaldo** conserva información recuperable. La **alta disponibilidad** reduce interrupciones ante fallos contemplados. La **recuperación ante desastres** contempla incidentes de mayor alcance y sus dependencias. Ninguna etiqueta basta: se deben definir escenarios, responsables y criterios de aceptación, y comprobar el procedimiento adecuado al entorno.

La operación necesita ver el recorrido completo: origen, ejecución, control de calidad, publicación y consumidor. Un job exitoso puede publicar datos vacíos si sus reglas no detectan la situación. Una señal operativa debe desencadenar una decisión: reintentar, detener publicación, mantener la versión previa o escalar al responsable.

El costo forma parte de la sostenibilidad del producto. Hay que considerar cómputo, almacenamiento, consultas, transferencia, base de datos y servicios adicionales utilizados. Se asigna un responsable y un criterio para recursos compartidos. Una etiqueta ayuda a atribuir consumo; no explica por sí sola si el gasto produjo valor.

![Ejecutado No Significa Aceptado]({{base}}assets/diagrams/gov-data-operations-principles.svg "El workflow terminado y la completitud aceptada son dos condiciones para publicar. Si falta una partición, la ejecución puede haber finalizado sin que los datos estén listos. La ruta «No» mantiene disponible la versión anterior, identificada con su fecha, mientras se investiga y recupera. Publica la versión nueva cuando ambas condiciones se hayan comprobado.")

## Operación de Oracle AI Data Platform y Oracle Autonomous AI Lakehouse

En los [workflows de Oracle AI Data Platform](https://docs.oracle.com/en/cloud/paas/ai-data-platform/aidug/workflows.html), organiza la carga, la validación y la publicación como tareas con dependencias. Programa la ejecución y revisa el estado y los registros de cada tarea para investigar fallos. En Horizonte, la publicación depende de comprobar las particiones esperadas y conciliar las facturas; el responsable del producto define estos criterios de aceptación y la respuesta ante un fallo.

En Oracle Autonomous AI Lakehouse, configura la conservación de respaldos conforme al periodo que necesita el producto e identifica el estado que recuperarás en cada escenario. Ejecuta un ensayo con las dependencias del servicio y compara la pérdida de datos y el tiempo de recuperación con el RPO y el RTO acordados. La guía de [respaldo y recuperación de Oracle Autonomous AI Database](https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/backup-restore.html) explica cómo consultar respaldos, ajustar la conservación y restaurar la base de datos.

Para administrar el costo, identifica los componentes facturados con la [guía de precios de Oracle AI Data Platform](https://docs.oracle.com/en/cloud/paas/ai-data-platform/aidug/pricing.html) y atribuye el consumo del producto en **Cost Analysis de Oracle Cloud Infrastructure**. Configura umbrales y responsables de respuesta con [Budgets de Oracle Cloud Infrastructure](https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/budgetsoverview.htm). Sus alertas avisan sobre el gasto; el responsable decide y ejecuta el ajuste de recursos, porque una alerta no detiene automáticamente el consumo.

![Operar Exige Tres Clases de Evidencia]({{base}}assets/diagrams/gov-data-operations-oracle.svg "Los tres bloques separan evidencia de ejecución, recuperación y consumo. En Oracle AI Data Platform revisa tareas, resultados, fallos y reintentos. En Oracle Autonomous AI Lakehouse identifica el estado recuperable y comprueba su recuperación con sus dependencias. Cost Analysis y Budgets de Oracle Cloud Infrastructure apoyan la atribución del consumo y la decisión de una acción. Una ejecución, un respaldo y una alerta responden preguntas distintas.")

## Ejemplo Explicado

El control de Horizonte esperaba las facturas del día anterior, pero detecta una partición ausente. El workflow finalizó técnicamente; la aceptación del producto falla. El equipo conserva la versión anterior, señala su fecha al consumidor y abre una incidencia con el productor. No presenta la cifra parcial como un nuevo cierre completo.

Después de recibir la partición faltante, reprocesa con una regla que evita duplicar las facturas ya procesadas, reconcilia el conjunto y publica una nueva versión. El owner acepta la recuperación del servicio y se registra la causa. En la revisión de costo se considera el reproceso y se decide si prevenir la recurrencia requiere mejorar el contrato, el control o la capacidad.

![Una Partición Ausente Cambia la Publicación]({{base}}assets/diagrams/gov-data-operations-example.svg "La primera carga contiene P1 y P3, pero falta P2: se detiene la publicación candidata y continúa disponible la versión anterior con fecha visible. Después de recuperar P2, reprocesar sin duplicar facturas y conciliar el conjunto, se acepta una nueva versión. La recuperación debe corregir la carga y comprobar el resultado antes de sustituir la publicación.")

## Errores Frecuentes

- **Confundir ejecución exitosa con datos aceptables.** Verifica completitud, fecha de corte y reconciliación acordadas.
- **Creer que un respaldo resuelve todo incidente.** Prueba recuperación y dependencias frente al escenario previsto.
- **Tratar una alerta de presupuesto como apagado.** La reducción de consumo requiere una acción adecuada y autorizada.

## Ejercicio de Decisión

Horizonte tolera perder como máximo una hora de datos y necesita recuperar el producto en dos horas. El equipo propone respaldos diarios, nunca ensayó la restauración y recibe una alerta de gasto. ¿Qué tres supuestos debe corregir?

<details>
<summary>Solución</summary>

Debe alinear la estrategia de recuperación con el RPO de una hora; comprobar que recuperación y dependencias cumplen el RTO de dos horas; e investigar el gasto antes de decidir una acción. El respaldo diario no demuestra el RPO, la mera existencia del respaldo no prueba el RTO y la alerta no detiene consumo.

![Los Objetivos Necesitan Pruebas Diferentes]({{base}}assets/diagrams/gov-data-operations-exercise.svg "Contrasta tres supuestos con sus objetivos. Un respaldo diario deja hasta 24 horas entre copias y no acredita un RPO de una hora. Una restauración sin ensayo no demuestra un RTO de dos horas. Una alerta de consumo necesita análisis y una acción acordada. Cada objetivo requiere su propia prueba, en lugar de usar la misma señal como evidencia de los tres.")

</details>
