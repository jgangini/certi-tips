Operadora Horizonte necesita que sus contratos, anexos y consentimientos conserven significado, vigencia y responsables cuando se utilizan para atender clientes o responder con IA. Un documento encontrado rápidamente todavía puede estar vencido o carecer de autorización para ese uso.

## Conceptos Clave

Un **documento** reúne contenido y contexto: autor, propósito, versión, clasificación y relación con un proceso. Un **registro** conserva evidencia de una actividad o decisión, como un consentimiento aceptado. El archivo PDF es su representación digital; cambiar el nombre del archivo no modifica la vigencia del acuerdo que contiene.

La gestión documental abarca captura, clasificación, revisión, publicación, acceso, conservación y disposición. El propietario del proceso decide qué constituye la versión válida. El custodio técnico aplica los controles y el steward mantiene los metadatos. Una taxonomía facilita organizar contenido; la búsqueda semántica ayuda a encontrarlo, pero ninguna de las dos decide su valor probatorio.

![Un Archivo, un Documento y una Evidencia]({{base}}assets/diagrams/gov-content-management-concepts.svg "Los tres bloques representan objetos distintos. C-104.pdf es el archivo digital; el contrato C-104 es el documento cuyo significado depende de versión y vigencia; y la aprobación de la versión 2 es un registro de evidencia. Cambiar el nombre del PDF no cambia la vigencia del acuerdo. Conserva contexto y evidencia para demostrar qué contenido aplica y quién lo aprobó.")

## Ciclo de Vida y Vigencia Documental

Horizonte separa borradores, documentos aprobados y registros retenidos. Antes de publicar un contrato, el área responsable comprueba versión, fecha efectiva, cliente y aprobaciones. Una modificación produce una nueva versión con relación explícita a la anterior. El consumidor debe poder distinguir qué estaba vigente en la fecha de una operación.

La política de conservación se define por categoría y necesidad del negocio, con los responsables jurídicos cuando corresponda. No hay un plazo universal para todos los documentos. Una orden de conservación o una investigación puede suspender la disposición prevista; el proceso debe registrar quién decidió y por qué.

![La Disposición Tiene una Condición de Salida]({{base}}assets/diagrams/gov-content-management-principles.svg "El documento se identifica, revisa, publica para una audiencia y conserva según su categoría. La disposición tiene una condición de salida: necesita autorización. Si no existe, se mantiene la conservación y se registra la suspensión y su motivo; si existe, se dispone con un acta. Una nueva versión o el fin de un plazo no sustituye la comprobación de excepciones y autorización.")

La evidencia útil incluye identificador estable, versión, fecha de aprobación, historial de acceso y acta de disposición. El indicador puede ser el porcentaje de documentos publicados con propietario y vigencia completos. Su denominador debe limitarse al conjunto publicado que realmente se evaluó.

## Documentos e IA con Oracle AI Data Platform y Oracle Autonomous AI Lakehouse

Oracle AI Data Platform organiza archivos mediante volúmenes y puede incorporarlos a **Knowledge Bases** para recuperación semántica. La documentación actual describe ingestión de PDF, DOCX y TXT, fragmentación, embeddings y consulta mediante una herramienta RAG asociada a un agente. La funcionalidad de IA utiliza Oracle Autonomous AI Lakehouse 26ai o superior según sus [requisitos publicados](https://docs.oracle.com/en/cloud/paas/ai-data-platform/aidug/get-started-oracle-ai-data-platform.html).

![Recuperar el Documento Que Sí Aplica]({{base}}assets/diagrams/gov-content-management-oracle.svg "Un documento aprobado y vigente entra en una carpeta autorizada de un volumen de Oracle AI Data Platform. La ingesta de una Knowledge Base genera fragmentos y embeddings que una herramienta RAG del agente recupera. El gráfico identifica Oracle Autonomous AI Lakehouse 26ai o superior como base vectorial. La aprobación, la vigencia y la conservación siguen siendo decisiones documentales que deben comprobarse junto con el acceso y los cambios del índice.")

Esto permite trabajar sobre contenido empresarial, pero **una Knowledge Base no cubre por sí sola todo el gobierno documental**. Horizonte debe mantener la aprobación, la vigencia, las excepciones de conservación y la política de acceso. También debe comprobar que una actualización o retirada llegue a los índices y consumidores; no asumir sincronización instantánea.

El linaje de Oracle AI Data Platform, disponible en **Preview**, incluye Knowledge Bases y sus fuentes soportadas. Sirve para entender dependencias; la documentación indica que muestra el último linaje capturado de cada proceso, no un historial completo. Por eso una evidencia histórica exige conservar además las versiones e identificadores necesarios para reconstruir la respuesta.

## Ejemplo Explicado

Un agente responde que un cliente puede cancelar sin cargo. Recuperó el contrato inicial, pero existe un anexo aprobado posterior. La similitud del fragmento era alta; la respuesta falla por la selección de la versión aplicable.

El propietario de Contratos define que el anexo sustituye esa cláusula desde una fecha concreta. El steward relaciona contrato y anexo, clasifica la versión anterior y registra la fecha efectiva. El equipo de datos actualiza el conjunto autorizado para recuperación y comprueba una consulta sobre el periodo anterior y otra sobre el posterior.

![La Fecha de la Consulta Elige la Evidencia]({{base}}assets/diagrams/gov-content-management-example.svg "La línea temporal distingue el contrato v1 y el anexo v2 que sustituye una cláusula desde septiembre. Una consulta sobre febrero usa la cláusula de v1; una consulta sobre octubre considera el anexo v2. Selecciona la versión aplicable a la fecha y finalidad consultadas, en lugar de responder siempre con el archivo más reciente.")

El resultado esperado no es borrar toda versión antigua: auditoría puede necesitarla. Es evitar que una respuesta actual use una cláusula sustituida sin advertirlo, conservando la trazabilidad del cambio.

## Errores Frecuentes

- **“Si está en la Knowledge Base, está aprobado”.** La ingestión técnica no constituye una aprobación del propietario.
- **“Eliminar el PDF elimina toda referencia”.** Hay que revisar fragmentos, índices, respuestas almacenadas y consumidores según su ciclo de vida.
- **“Un permiso al repositorio resuelve cualquier uso”.** Se deben evaluar finalidad, audiencia, permisos efectivos y exposición de los fragmentos recuperados.

![Retirar un Archivo No Retira Todas sus Huellas]({{base}}assets/diagrams/gov-content-management-errors.svg "Retirar el PDF de origen no demuestra que se hayan retirado sus fragmentos, el índice o las respuestas derivadas. Antes de incorporar contenido confirma versión y aprobación. Al cambiarlo o retirarlo, verifica los derivados y consumidores afectados. Antes de responder comprueba audiencia y finalidad. La retirada debe abarcar todo el recorrido de recuperación correspondiente al uso.")

## Ejercicio de Decisión

Un contrato sustituido aparece en una respuesta actual. Auditoría necesita conservarlo y Atención al Cliente necesita responder con la versión vigente. Decide qué se conserva, qué se retira del conjunto de recuperación actual y qué evidencia documenta el cambio. Identifica al responsable de cada decisión.

<details>
<summary>Solución</summary>

Contratos confirma la versión aplicable y sus fechas. Se conserva el registro anterior bajo la política correspondiente, con acceso adecuado, y se actualiza el conjunto de recuperación para el caso actual. El custodio comprueba la actualización del índice; el steward registra la relación entre versiones. Se conserva evidencia de aprobación, actualización y comprobación de ambas fechas.

![Conservar la Historia; Responder con la Versión Vigente]({{base}}assets/diagrams/gov-content-management-exercise.svg "La versión v1 sustituida tiene dos tratamientos. Para auditoría puede conservarse con su relación a v2 y acceso según la política. Para recuperación actual se usa el conjunto autorizado con v2 y se retira v1 de ese uso. El propietario decide conservación, el steward documenta la relación y el custodio comprueba el índice. Prueba consultas históricas y actuales para verificar que cada una recibe la versión que corresponde.")

</details>

## Fuentes y Repaso

![Pasaporte Documental: C-104, Versión 2]({{base}}assets/diagrams/gov-content-management-recap.svg "El pasaporte del contrato C-104 reúne versión 2, vigencia desde 01/09 y aprobación identificable. Añade propietario, finalidad, audiencia autorizada, política de conservación y relación con la cláusula sustituida de v1. Usa esta ficha para decidir si el documento sirve para una consulta concreta; disponer del archivo sin ese contexto no demuestra su aplicabilidad.")

Desarrollo original del caso para aprendizaje. Fuentes Oracle revisadas al **9 de octubre de 2026**: [Knowledge Bases](https://docs.oracle.com/en/cloud/paas/ai-data-platform/aidug/knowledge-bases.html), [requisitos de funciones de IA](https://docs.oracle.com/en/cloud/paas/ai-data-platform/aidug/ai-feature-enablement.html) y [Lineage (Preview)](https://docs.oracle.com/en/cloud/paas/ai-data-platform/aidug/lineage.html). Repasa la diferencia entre encontrar contenido, autorizar su uso y conservar evidencia.
