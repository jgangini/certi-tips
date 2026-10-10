En Horizonte, una persona puede tener varios contratos, un contrato puede producir varias facturas y un consentimiento puede cambiar con el tiempo. Si el modelo ignora esas diferencias, un informe puede duplicar importes y un asistente puede atribuir una autorización al propósito equivocado.

## Conceptos Clave

Un **modelo de datos** representa una parte del negocio para poder comunicarla y trabajar con ella. Selecciona entidades, atributos, relaciones y restricciones relevantes. No reproduce toda la realidad: explicita las decisiones que importan para un uso. «Cliente» requiere acordar si significa persona, organización, cuenta comercial u otra entidad.

La **cardinalidad** indica cuántas ocurrencias pueden relacionarse. Un cliente puede tener muchos contratos; cada contrato del ejemplo pertenece a un cliente. Esa regla se debe validar con el negocio: si existen titulares conjuntos, el modelo necesita otra relación. Dibujar primero una clave foránea sin acordar la regla puede consolidar una suposición incorrecta.

La **granularidad** responde qué representa una fila. Una fila por factura y una fila por línea de factura no son intercambiables. Al combinar conjuntos con granularidades distintas, debemos conservar relaciones e importes correctamente. Un resultado SQL válido puede ser semánticamente equivocado.

![Las Relaciones se Ven en las Instancias]({{base}}assets/diagrams/gov-data-modeling-concepts.svg "El cliente C7 se relaciona con los contratos C2 y C3. C2 tiene las facturas F42 y F43, mientras C3 tiene F44. Las marcas 1 → N muestran que un cliente puede tener varios contratos y cada contrato varias facturas. Las claves conservan cada relación y evitan confundir una persona, un contrato y una factura como si fueran la misma unidad.")

## Del Significado al Modelo Físico

El modelo **conceptual** permite conversar sobre entidades y reglas sin depender de una base de datos. El **lógico** precisa atributos, identificadores, relaciones y restricciones. El **físico** concreta tablas, tipos, índices y estructuras apropiadas para el motor elegido. Pasar de una vista a otra requiere decisiones; no consiste únicamente en traducir nombres.

Una clave técnica identifica un registro; una clave de negocio puede identificar una entidad en un contexto. Un número de cliente de dos sistemas distintos puede coincidir sin referirse a la misma persona. Por eso el mapeo entre identificadores debe mantener su origen. La deduplicación y las decisiones de identidad se profundizan en datos maestros.

El tiempo también se modela. Horizonte registra propósito, estado y vigencia del consentimiento. Un indicador booleano actual no permite explicar qué autorización existía en una fecha pasada. El modelo define qué historial se conserva y cómo se interpreta; la retención aplicable se acuerda con los responsables pertinentes.

![Del Significado al Modelo Lógico]({{base}}assets/diagrams/gov-data-modeling-principles.svg "La regla «un cliente puede tener varios contratos» se representa como una relación 1 a N. En el modelo lógico, CLIENTE.id_cliente es la clave primaria. CONTRATO tiene su propia clave primaria, id_contrato, y usa id_cliente como clave foránea que apunta a CLIENTE.id_cliente. La conexión entre los campos muestra cómo cada contrato conserva su relación con el cliente. Diseña las claves a partir de la regla de negocio acordada, antes de elegir el almacenamiento.")

## Modelado y Semántica en Oracle

En Oracle AI Data Platform y Oracle Autonomous AI Lakehouse, esquemas, tablas y vistas permiten materializar modelos y productos de datos. El catálogo describe los activos, pero descubrir sus columnas no decide automáticamente la granularidad ni la definición de una métrica. El equipo mantiene esa correspondencia entre modelo de negocio y estructuras publicadas.

Una **capa semántica** expresa términos, medidas y relaciones para un consumo consistente. Una **ontología** hace explícitas entidades y relaciones de un dominio; puede aportar contexto para analítica y agentes. No es un sustituto del diseño físico. Tampoco garantiza que una inferencia de IA coincida con la definición aprobada por la organización.

En **Oracle Analytics Cloud**, usa [Semantic Modeler](https://docs.oracle.com/en/cloud/paas/analytics-cloud/acmdg/workflow-build-semantic-model.html) para conectar las tablas con términos y medidas del negocio. Define las uniones físicas por sus claves, representa Cliente y Contrato mediante [relaciones lógicas y cardinalidad](https://docs.oracle.com/en/cloud/paas/analytics-cloud/acmdg/logical-joins.html) y publica un modelo que los analistas puedan reutilizar. Oracle AI Data Platform y Oracle Autonomous AI Lakehouse aportan los datos preparados para ese consumo.

Para medir «clientes activos», selecciona los contratos vigentes en la fecha de corte y cuenta los identificadores de cliente distintos. C7 aporta un cliente aunque tenga varios contratos vigentes. El propietario aprueba la definición; el modelador configura la [agregación de la medida](https://docs.oracle.com/en/cloud/paas/analytics-cloud/acmdg/levels-aggregation.html) y contrasta el resultado con casos conocidos. En Oracle Autonomous AI Database, [Data Analysis](https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/data-analysis-tool.html) permite organizar dimensiones, jerarquías y medidas en vistas analíticas. Así aplicas el modelado de DAMA: conservas el significado acordado desde las entidades hasta el indicador publicado.

![Del Término de Negocio a la Medida]({{base}}assets/diagrams/gov-data-modeling-oracle.svg "La definición aprobada establece qué significa «contrato vigente» en una fecha de corte. En el ejemplo, C2 está vigente y C3 suspendido, pero ambos pertenecen a C7: la medida resultante cuenta un cliente activo. El recorrido enlaza regla, registros y resultado entre Oracle AI Data Platform y Oracle Autonomous AI Lakehouse. La semántica empresarial conecta conceptos, relaciones y medidas con el significado aprobado por el negocio.")

## Ejemplo Explicado

Horizonte tiene una factura de 100 unidades monetarias con dos líneas: 60 por servicio y 40 por instalación. Si el equipo une la cabecera con las líneas y suma el total de cabecera, obtiene 200. La consulta ejecuta correctamente la unión; el error está en sumar una medida de otra granularidad.

La solución es sumar los importes de línea, o agregar primero al nivel de factura antes de combinar con otros conjuntos. El steward documenta la métrica; el modelador confirma la relación; el equipo técnico implementa una vista coherente en el producto de Oracle Autonomous AI Lakehouse. El caso muestra por qué no basta con pedir al asistente «calcula ingresos» sin definir nivel, periodo y regla.

![La Unión Repite el Total de la Factura]({{base}}assets/diagrams/gov-data-modeling-example.svg "F42 tiene un total de cabecera de 100 y dos líneas: Servicio por 60 e Instalación por 40. Al unir cabecera y detalle, el total 100 se repite en las dos filas. Sumar ese campo produce 200 y cuenta dos veces la factura; sumar los importes de línea conserva 100. Comprueba el grano de cada medida antes de agregar el resultado de una unión.")

## Errores Frecuentes

- **Diseñar solo desde las columnas disponibles.** Se omiten reglas del negocio que las columnas actuales quizá no representan.
- **Usar el nombre como identificador inequívoco.** Personas distintas pueden compartirlo y una persona puede cambiarlo.
- **Creer que más contexto elimina toda ambigüedad.** Los términos, relaciones e inferencias propuestas necesitan responsables y revisión.

## Ejercicio de Decisión

Horizonte necesita responder si el cliente autorizó comunicaciones comerciales en la fecha de una campaña. Solo conserva una columna `consentimiento_actual`. ¿Basta para responder? ¿Qué debe representar el modelo?

<details>
<summary>Solución</summary>

No basta. El modelo necesita relacionar el sujeto con el propósito y su estado en el tiempo, incluyendo el evento o evidencia que respalda el cambio. Debe permitir interpretar la vigencia para la fecha consultada. La política define conservación y usos; almacenar más historial por defecto no sustituye esa decisión.

![El Consentimiento se Interpreta en una Fecha]({{base}}assets/diagrams/gov-data-modeling-exercise.svg "El consentimiento comercial de C7 comienza el 1 de marzo y se retira el 20 de abril. La campaña del 15 de abril cae dentro del intervalo mostrado, pero la decisión también debe corresponder a la finalidad autorizada y a su evidencia. Modela sujeto, finalidad, inicio y retirada; un indicador de consentimiento actual no reconstruye por sí solo la autorización de una fecha pasada.")

</details>
