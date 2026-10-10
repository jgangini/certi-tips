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

![Del Significado a las Claves]({{base}}assets/diagrams/gov-data-modeling-principles.svg "La regla «un cliente puede tener varios contratos» pasa de una relación de negocio a dos estructuras. CLIENTE usa id_cliente como clave; CONTRATO usa id_contrato y conserva id_cliente como referencia. La clave identifica cada entidad y la referencia enlaza ambas. Diseña las estructuras a partir del significado acordado, antes de decidir cómo almacenarlas.")

## Modelado y Semántica en Oracle

En Oracle AI Data Platform y Oracle Autonomous AI Lakehouse, esquemas, tablas y vistas permiten materializar modelos y productos de datos. El catálogo describe los activos, pero descubrir sus columnas no decide automáticamente la granularidad ni la definición de una métrica. El equipo mantiene esa correspondencia entre modelo de negocio y estructuras publicadas.

Una **capa semántica** expresa términos, medidas y relaciones para un consumo consistente. Una **ontología** hace explícitas entidades y relaciones de un dominio; puede aportar contexto para analítica y agentes. No es un sustituto del diseño físico. Tampoco garantiza que una inferencia de IA coincida con la definición aprobada por la organización.

Oracle ha anunciado generación de ontologías empresariales en la evolución de Oracle AI Data Platform. Su estado al 9 de octubre de 2026 es **Anunciado: disponibilidad operativa no confirmada para cada función**. La [comunicación oficial de septiembre](https://investor.oracle.com/investor-news/news-details/2026/Oracle-Announces-Q1-Results-Driven-by-Triple-Digit-Growth-in-Cloud-Infrastructure-Revenues/default.aspx) respalda el anuncio; no convierte todas las capacidades descritas en una pantalla utilizable en cualquier entorno. La validación del significado empresarial sigue requiriendo responsables humanos.

![Del Término de Negocio a la Medida]({{base}}assets/diagrams/gov-data-modeling-oracle.svg "La definición aprobada establece qué significa «contrato vigente» en una fecha de corte. En el ejemplo, C2 está vigente y C3 suspendido, pero ambos pertenecen a C7: la medida resultante cuenta un cliente activo. El recorrido enlaza regla, registros y resultado entre Oracle AI Data Platform y Oracle Autonomous AI Lakehouse. El bloque de ontologías empresariales está identificado como anunciado y requiere comprobar disponibilidad antes de incorporarlo.")

## Ejemplo Explicado

Horizonte tiene una factura de 100 unidades monetarias con dos líneas: 60 por servicio y 40 por instalación. Si el equipo une la cabecera con las líneas y suma el total de cabecera, obtiene 200. La consulta ejecuta correctamente la unión; el error está en sumar una medida de otra granularidad.

La solución es sumar los importes de línea, o agregar primero al nivel de factura antes de combinar con otros conjuntos. El steward documenta la métrica; el modelador confirma la relación; el equipo técnico implementa una vista coherente en el producto de Oracle Autonomous AI Lakehouse. El caso muestra por qué no basta con pedir al asistente «calcula ingresos» sin definir nivel, periodo y regla.

![La Unión Repite el Total de la Factura]({{base}}assets/diagrams/gov-data-modeling-example.svg "F42 tiene un total de cabecera de 100 y dos líneas: Servicio por 60 e Instalación por 40. Al unir cabecera y detalle, el total 100 se repite en las dos filas. Sumar ese campo produce 200 y cuenta dos veces la factura; sumar los importes de línea conserva 100. Comprueba el grano de cada medida antes de agregar el resultado de una unión.")

## Errores Frecuentes

- **Diseñar solo desde las columnas disponibles.** Se omiten reglas del negocio que las columnas actuales quizá no representan.
- **Usar el nombre como identificador inequívoco.** Personas distintas pueden compartirlo y una persona puede cambiarlo.
- **Creer que más contexto elimina toda ambigüedad.** Los términos, relaciones e inferencias propuestas necesitan responsables y revisión.

![Tres Contraejemplos para Revisar el Modelo]({{base}}assets/diagrams/gov-data-modeling-errors.svg "Los tres contraejemplos muestran decisiones de modelado distintas. Dos personas con el mismo nombre necesitan claves que distingan su identidad. Una columna de consentimiento actual no demuestra desde cuándo estuvo autorizado un uso. Y «activo» puede referirse a contrato vigente o a facturación del periodo. Conserva identidad, tiempo y definición aprobada para interpretar correctamente cada registro.")

## Ejercicio de Decisión

Horizonte necesita responder si el cliente autorizó comunicaciones comerciales en la fecha de una campaña. Solo conserva una columna `consentimiento_actual`. ¿Basta para responder? ¿Qué debe representar el modelo?

<details>
<summary>Solución</summary>

No basta. El modelo necesita relacionar el sujeto con el propósito y su estado en el tiempo, incluyendo el evento o evidencia que respalda el cambio. Debe permitir interpretar la vigencia para la fecha consultada. La política define conservación y usos; almacenar más historial por defecto no sustituye esa decisión.

![El Consentimiento se Interpreta en una Fecha]({{base}}assets/diagrams/gov-data-modeling-exercise.svg "El consentimiento comercial de C7 comienza el 1 de marzo y se retira el 20 de abril. La campaña del 15 de abril cae dentro del intervalo mostrado, pero la decisión también debe corresponder a la finalidad autorizada y a su evidencia. Modela sujeto, finalidad, inicio y retirada; un indicador de consentimiento actual no reconstruye por sí solo la autorización de una fecha pasada.")

</details>

## Fuentes y Repaso

![Cinco Preguntas Sobre un Registro]({{base}}assets/diagrams/gov-data-modeling-recap.svg "Usa el contrato C2 para responder cinco preguntas: qué entidad representa, qué clave lo identifica, con qué cliente se relaciona, desde cuándo está vigente y qué representa cada fila. C2 pertenece a C7 y conserva una fecha de inicio. Esa ficha permite comprobar que identidad, relación, tiempo y granularidad mantienen el significado del contrato.")

Consulta [semántica empresarial en Oracle AI Data Platform](https://blogs.oracle.com/ai-data-platform/why-enterprise-ai-needs-deep-business-semantics) y [Master Catalog de Oracle AI Data Platform](https://docs.oracle.com/en/cloud/paas/ai-data-platform/aidug/manage-master-catalog.html). Repasa la diferencia entre identificador, descripción y medida, y explica por qué una definición aprobada importa también para IA.
