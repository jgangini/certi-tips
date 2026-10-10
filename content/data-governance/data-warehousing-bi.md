Finanzas y Atención al Cliente de Operadora Horizonte muestran cantidades distintas de “clientes activos”. Ambas consultas ejecutan correctamente. El problema está en las definiciones, el periodo y la granularidad usados para producir el indicador.

## Conceptos Clave

Un **data warehouse** organiza datos para análisis consistente e histórico. Un enfoque **lakehouse** combina capacidades analíticas con datos almacenados en formatos abiertos y fuentes diversas. Ninguno garantiza que todos los consumidores interpreten igual los datos: se necesitan definiciones acordadas, modelos y controles.

El **grano** indica qué representa una fila. En Horizonte, una tabla puede tener una fila por factura o una por línea de factura. Las **dimensiones** describen contexto, como cliente, plan y fecha; los **hechos** registran eventos y medidas. Mezclar granos puede duplicar importes aunque el SQL no produzca errores.

![El Grano Define Qué Representa Cada Fila]({{base}}assets/diagrams/gov-data-warehousing-bi-concepts.svg "El hecho representa una línea de factura: F-01 tiene una línea de 60 y otra de 40. Las dimensiones Cliente, Plan y Fecha aportan contexto mediante sus relaciones. Declara el grano factura + línea antes de agregar: cada fila representa una línea, no una factura completa ni un cliente distinto.")

## Semántica, Granularidad y Publicación

El propietario del indicador acuerda definición, población, periodo, exclusiones y uso. “Clientes activos al cierre” podría contar identidades con al menos un contrato vigente en la fecha de cierre; “contratos activos” cuenta contratos. Un cliente con tres contratos representa uno en la primera medida y tres en la segunda.

La capa semántica expresa medidas y relaciones reutilizables. Debe conservar unidad, agregación y tratamiento de valores faltantes. Una tasa requiere numerador y denominador compatibles. Promediar porcentajes de segmentos de tamaños diferentes puede producir un resultado equivocado: se deben agregar sus cantidades base cuando la definición así lo exige.

![Una Población Admite Varias Métricas]({{base}}assets/diagrams/gov-data-warehousing-bi-principles.svg "En el corte del 30 de septiembre, los contratos K-01, K-02 y K-03 pertenecen al mismo cliente C-17. Contar clientes distintos produce 1; contar contratos distintos produce 3. Ambas medidas pueden ser correctas, pero responden preguntas diferentes. Define población, unidad, periodo y exclusiones antes de comparar indicadores.")

Publicar un indicador incluye aprobación y evidencia de conciliación. El consumidor conoce la fecha de actualización y el estado: preliminar, cerrado o corregido. Si cambia la definición, se evalúa el impacto histórico; no se reemplaza silenciosamente una serie que ya fundamentó decisiones.

## Analítica Gobernada con Oracle AI Data Platform y Oracle Autonomous AI Lakehouse

Prepara los datos con Oracle AI Data Platform y publica las tablas que analizarás con SQL en Oracle Autonomous AI Lakehouse. En **Data Analysis de Data Studio de Oracle Autonomous AI Database**, crea una **Analytic View** sobre la tabla de hechos y sus dimensiones; revisa las jerarquías, medidas y agregaciones antes de publicar. La guía de [creación de Analytic Views](https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/adp-creating-analytic-views.html) muestra cómo configurar ese modelo. En Horizonte, la medida debe implementar la definición aprobada de cliente activo y contar clientes distintos, aunque tengan varios contratos.

En Oracle Analytics Cloud, configura la [conexión a Oracle AI Data Platform](https://docs.oracle.com/en/cloud/paas/analytics-cloud/acsds/connect-ai-data-platform.html) para el catálogo que vas a consumir; crea otra conexión si necesitas otro catálogo. Usa la [conexión a Oracle Autonomous AI Lakehouse](https://docs.oracle.com/en/cloud/paas/analytics-cloud/acsds/connect-oracle-autonomous-ai-lakehouse.html) para consultar los datos publicados en la base de datos. Aplica la misma definición, periodo y granularidad a los indicadores que compararás entre ambos entornos.

![Un Indicador Conserva su Definición]({{base}}assets/diagrams/gov-data-warehousing-bi-oracle.svg "Oracle Analytics Cloud puede consumir resultados mediante conexiones configuradas a Oracle AI Data Platform y Oracle Autonomous AI Lakehouse. El gráfico separa preparación, resultados SQL y consumo analítico. La definición revisada de clientes activos al cierre conserva identidad, contrato vigente y fecha. Verifica el grano de la medida: un cliente con tres contratos no representa tres clientes.")

La consulta federada accede a datos en su ubicación; una carga los copia y una caché conserva una representación local para acelerar acceso. Deben evaluarse actualización, acceso y evidencia en cada modalidad. Data Sharing ofrece mecanismos de intercambio con alcances distintos: publicar una versión no equivale a prometer actualización continua.

Al generar SQL con lenguaje natural, revisa medidas, filtros y permisos antes de aceptar el resultado. Contrasta la consulta con la ficha de la métrica y concilia una muestra contra el origen. Conserva el grano, la definición y el resultado de la conciliación junto con la versión publicada del indicador.

## Ejemplo Explicado

Una factura de 100 unidades monetarias tiene dos líneas. Un analista une la cabecera con las líneas y suma el total de cabecera: obtiene 200 porque el importe aparece dos veces. El error proviene de la relación entre granos.

Finanzas confirma que el indicador es importe facturado y decide sumar los importes de línea, 60 y 40, o agregar una sola vez cada factura en su grano. El ingeniero corrige el modelo compartido y el steward documenta la medida. Se verifican facturas con una línea, varias líneas y notas de ajuste.

![Un Join Puede Duplicar el Importe de Cabecera]({{base}}assets/diagrams/gov-data-warehousing-bi-example.svg "Después del join, F-01 aparece una vez por cada línea. El importe de cabecera 100 se repite y su suma produce 200. Los importes de línea 60 y 40 mantienen su grano y suman el total real de 100. Elige la medida que corresponde a la granularidad del resultado y concilia contra la factura de origen.")

El gráfico mensual se publica después de conciliarlo con la fuente autorizada y registrar el periodo. Si una factura llega tarde, se aplica la política acordada para ajustar el cierre, conservando la versión anterior cuando sea necesaria para explicar un reporte ya emitido.

## Errores Frecuentes

- **“Una consulta válida produce una métrica correcta”.** La validez técnica no comprueba grano ni definición.
- **“Todos los dashboards usan la misma verdad”.** Se deben verificar modelo, filtros, fecha y versión de cada consumidor.
- **“Federar significa que no hay ninguna copia”.** El diseño puede incorporar cachés, extracciones y resultados persistidos.

## Ejercicio de Decisión

Después de publicar el cierre de septiembre, llega una factura atrasada. Ventas quiere reemplazar inmediatamente el total; Finanzas exige explicar qué vio el directorio. Decide cómo publicar la corrección y qué conservar para evitar dos resultados sin contexto.

<details>
<summary>Solución</summary>

El propietario del indicador aplica la política de cierre y autoriza una versión corregida, si corresponde. La ficha indica fecha, motivo y diferencia; se mantiene la relación con el reporte emitido. Los consumidores reciben la versión y su estado. Se conserva la conciliación de la factura tardía para reproducir tanto el cierre original como la corrección.

![Una Corrección Conserva el Cierre Original]({{base}}assets/diagrams/gov-data-warehousing-bi-exercise.svg "La publicación v1 conserva el cierre de septiembre. Una factura tardía recibida en octubre origina una corrección v2 del mismo periodo, con motivo, aprobación y vínculo a v1. El ajuste Δ cambia el importe publicado sin sobrescribir la evidencia anterior. Registra versión y relación entre ambas para explicar y reproducir el cierre original y su corrección.")

</details>
