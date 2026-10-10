Operadora Horizonte registra clientes en ventas, contratos y facturación. Dos registros parecidos pueden corresponder a una persona, a dos familiares o a empresas distintas. El gobierno de datos maestros comienza al decidir qué representa una entidad y quién puede cambiar esa decisión.

## Conceptos Clave

Los **datos maestros** describen entidades compartidas: cliente, producto o proveedor. Los **datos de referencia** delimitan valores acordados, como estados de contrato o tipos de documento. Las **transacciones** registran acontecimientos: una factura, un pago o una modificación contractual. Relacionar una factura con un cliente no convierte la factura en dato maestro.

La identidad debe ser estable y tener un ámbito definido. El identificador que usa Ventas puede diferir del de Facturación; una tabla de correspondencias conserva esa relación. La fuente autorizada también puede cambiar por atributo: una dirección comercial no necesariamente tiene la misma autoridad que una identificación verificada.

![La Factura Usa Entidades y Códigos Compartidos]({{base}}assets/diagrams/gov-master-reference-data-concepts.svg "Cliente C-17 y plan P-2 son identidades maestras compartidas. ACTIVO es un código de referencia cuyo significado es «contrato vigente». La factura F42 es una transacción que usa esas claves y códigos. Relacionarse con un maestro no convierte la factura en maestro: cada objeto conserva su identidad, significado y función dentro del intercambio.")

## Identidad, Correspondencia y Supervivencia

**Match** identifica candidatos que podrían representar la misma entidad. **Merge** combina registros aceptados. Las reglas de **survivorship** determinan qué valores y relaciones sobreviven. Una alta puntuación de similitud no demuestra identidad: debe interpretarse con los identificadores disponibles y el costo de una unión equivocada.

Horizonte define reglas de coincidencia, umbrales y casos que requieren revisión. El propietario de Clientes aprueba la política; el steward examina ambigüedades; las aplicaciones conservan los identificadores originales y la trazabilidad. Un registro consolidado necesita explicar de qué fuente procede cada atributo y qué regla lo eligió.

![La Coincidencia Propone; la Evidencia Decide]({{base}}assets/diagrams/gov-master-reference-data-principles.svg "El nombre parecido y un teléfono compartido proponen una candidatura entre V-18 y F-07. La evidencia decide si representan la misma identidad. Cuando se confirma, se eligen valores por atributo con su regla y fuente. Si la evidencia es negativa o insuficiente, no se fusiona automáticamente: se rechaza con evidencia o se mantiene la revisión pendiente.")

Para los datos de referencia, el riesgo puede ser distinto: un código válido para un sistema no tiene por qué ser válido en otro periodo o mercado. Las listas requieren propietario, definición, fecha efectiva y mapeos. Cambiar “suspendido” por “inactivo” sin acordar su significado puede alterar indicadores y decisiones de atención.

## Datos Compartidos con Oracle

Oracle AI Data Platform y Oracle Autonomous AI Lakehouse permiten preparar, relacionar y consumir conjuntos de datos compartidos. Ese procesamiento necesita una política de identidad definida; almacenar una tabla de clientes en una capa Gold no la convierte automáticamente en un maestro confiable.

**Oracle Fusion Cloud Enterprise Data Management** es una capacidad complementaria para gobierno de datos empresariales. Su documentación actual incluye correspondencia, fusión, deduplicación y reglas de supervivencia. Se debe evaluar su encaje con las entidades, aplicaciones y procesos concretos; no atribuir estas operaciones de forma automática a cualquier catálogo de Oracle AI Data Platform o de Oracle Autonomous AI Lakehouse.

La distribución del conjunto aprobado requiere exportación y cargas configuradas. Por ejemplo, Oracle Fusion Cloud Enterprise Data Management permite [exportar correspondencias de dimensiones Universal a CSV](https://docs.oracle.com/en/cloud/saas/enterprise-data-management-cloud/dmcaa/export_mapping_100x31f0bcc0.html). La integración conserva identificadores, versión y reglas aprobadas; el diagrama no presupone sincronización automática con las plataformas de consumo.

![Publicar la Identidad Que Fue Aprobada]({{base}}assets/diagrams/gov-master-reference-data-oracle.svg "Oracle Fusion Cloud Enterprise Data Management se muestra como un ámbito SaaS con alcance y requisitos propios. Correspondencia, revisión y valores supervivientes producen un conjunto aprobado con identidad, códigos y versión. Las exportaciones y cargas configuradas pueden llevar ese conjunto a Oracle AI Data Platform y Oracle Autonomous AI Lakehouse. Comprueba la decisión de identidad y cada integración antes de publicar para consumo.")

La evidencia del proceso incluye candidatos revisados, decisión de fusión, valores supervivientes, mapeo de identificadores y versión publicada. Una métrica de calidad útil es la tasa de fusiones revertidas por error, acompañada del volumen revisado; maximizar fusiones por hora puede incentivar decisiones incorrectas.

## Ejemplo Explicado

Ventas tiene a “Ana Pérez”, identificador V-18, y Facturación a “Ana M. Pérez”, identificador F-07. Comparten teléfono, pero ese número pertenece a una familia. El teléfono genera una candidatura; no basta para unirlos.

El steward comprueba una identificación verificada y confirma que ambos registros representan a la misma cliente. La regla aprobada conserva la identificación de la fuente validada, la dirección de contacto confirmada más reciente y ambos identificadores de origen. Una tercera persona con el mismo teléfono permanece separada.

![Cada Atributo Superviviente Conserva su Razón]({{base}}assets/diagrams/gov-master-reference-data-example.svg "La identidad de Ana ya está confirmada; la tabla explica qué valor sobrevive por atributo. La identificación procede de una fuente validada, la dirección de la confirmación más reciente y los identificadores de Ventas y Facturación se conservan como correspondencias. Un teléfono compartido sigue siendo un indicio. El consentimiento necesita revisión por finalidad y vigencia, separada de la consolidación de identidad.")

Los consentimientos se revisan aparte por finalidad y vigencia. Una fusión de identidad no autoriza a extender un consentimiento de facturación a una campaña comercial. Horizonte publica el maestro y sus correspondencias, y los consumidores verifican que las facturas siguen vinculadas a la entidad correcta.

## Errores Frecuentes

- **“Mismo nombre significa mismo cliente”.** Los homónimos y datos incompletos requieren evidencia adicional.
- **“El último registro gana siempre”.** La novedad no demuestra autoridad; una modificación reciente puede ser incorrecta.
- **“Gold ya significa maestro”.** Una capa de procesamiento no sustituye reglas de identidad, aprobación y distribución.

## Ejercicio de Decisión

Dos clientes comparten nombre, dirección y teléfono, pero sus identificaciones verificadas son distintas. Marketing solicita unirlos para reducir duplicados. Decide cómo tratar la candidatura, qué evidencia conservar y quién resuelve el desacuerdo. Considera qué pasaría con facturas y consentimientos.

<details>
<summary>Solución</summary>

Mantén las identidades separadas: las identificaciones distintas constituyen evidencia importante contra la fusión. El steward documenta la candidatura rechazada y el propietario de Clientes resuelve la política aplicable. No se combinan facturas ni consentimientos por conveniencia de una campaña. Puede modelarse una relación de hogar si existe necesidad y autorización, sin borrar las identidades individuales.

![Un Hogar Compartido No Borra Dos Identidades]({{base}}assets/diagrams/gov-master-reference-data-exercise.svg "Dos clientes comparten hogar, pero tienen identificaciones verificadas distintas, facturas y consentimientos propios. La relación de hogar no justifica fusionar sus identidades. Conserva ambas y registra la candidatura rechazada con su evidencia. El propietario resuelve la política aplicable, sin trasladar el consentimiento de una persona a la otra.")

</details>
