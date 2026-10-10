Operadora Horizonte quiere evitar facturas duplicadas y respuestas de IA basadas en contratos desactualizados. “Datos de calidad” necesita una definición ligada a cada uso: un dato puede servir para una exploración y ser insuficiente para emitir una factura.

## Conceptos Clave

La calidad expresa la adecuación de los datos a una finalidad. **Completitud** observa valores necesarios presentes; **validez**, cumplimiento de formato o dominio; **exactitud**, correspondencia con la realidad; **consistencia**, ausencia de contradicciones; **unicidad**, ausencia de duplicados según una identidad; **oportunidad**, disponibilidad en el momento requerido.

Una fecha con formato correcto puede estar equivocada. Un teléfono presente no tiene por qué pertenecer al cliente. Un conjunto sin nulos no demuestra exactitud. Cada dimensión requiere reglas y evidencia apropiadas al uso, además de conocer qué población se está evaluando.

![Una Fecha Presente Puede Seguir Siendo Incorrecta]({{base}}assets/diagrams/gov-data-quality-concepts.svg "El contrato verificado indica 01 SEP, pero el dato capturado contiene 31 AGO. La fecha está presente y tiene un formato admitido: cumple completitud y validez. Falla exactitud porque no coincide con la evidencia. Consistencia, unicidad y oportunidad siguen sin prueba. Evalúa cada dimensión con su evidencia específica; superar dos controles no demuestra calidad en todos los usos.")

## Reglas, Umbrales y Remediación

La regla comienza en una necesidad: “no emitir dos veces la misma factura”. El propietario de Facturación define la clave empresarial, la tolerancia y el efecto de un incumplimiento. El steward traduce esa decisión a una regla comprensible. El ingeniero implementa la comprobación y registra resultado, periodo y versión.

Un umbral debe indicar numerador, denominador, tratamiento de exclusiones y operador de comparación. “Al menos 99 %” incluye 99 %; “más de 99 %” no. La tolerancia depende del riesgo: ciertos controles impiden publicar, otros permiten continuar con una excepción autorizada. El promedio de muchas reglas no debe ocultar una falla crítica.

![El Control se Cierra Cuando Mejora el Origen]({{base}}assets/diagrams/gov-data-quality-principles.svg "El control encuentra 198 claves para 200 filas frente a una exigencia de unicidad del 100 %. Se registra el incidente D-17, se asignan responsables y se corrige la causa en el origen. Después se repite la prueba sobre la misma población y regla y se conserva resultado y decisión. El incidente se cierra cuando la nueva medición demuestra la mejora, no solo cuando se limpia una copia.")

La remediación incluye responsable, prioridad, causa, fecha objetivo y verificación posterior. Limpiar una copia puede ser útil para un consumo específico, pero no elimina el problema en la captura. Horizonte distingue dato corregido, dato rechazado y excepción aceptada; conserva la razón para poder explicar el resultado publicado.

## Calidad con Oracle AI Data Platform y Oracle Autonomous AI Lakehouse

Oracle AI Data Platform permite preparar y transformar datos mediante notebooks y workflows; el equipo puede expresar comprobaciones con SQL o código y conservar resultados. Oracle Autonomous AI Lakehouse y Data Studio de Oracle Autonomous AI Database aportan estadísticas, análisis y preparación. **Table AI Assist** propone SQL y recetas que una persona revisa antes de aplicarlas; no certifica que el dato sea verdadero.

El recorrido de reglas, aceptación y excepciones de la lámina es una **extensión implementada** con notebooks y [workflows de Oracle AI Data Platform](https://docs.oracle.com/en/cloud/paas/ai-data-platform/aidug/workflows.html). El propietario aprueba la regla y la acción ante el incumplimiento; el flujo ejecuta esa decisión antes de publicar, conserva excepciones y permite volver a medir tras corregirlas.

![La Regla Decide Qué Llega al Consumo]({{base}}assets/diagrams/gov-data-quality-oracle.svg "Una regla aprobada se evalúa mediante notebooks y workflows de Oracle AI Data Platform, identificados como extensión implementada. Los datos conformes siguen hacia una publicación autorizada en Oracle Autonomous AI Lakehouse. Los que fallan conservan motivo, responsable y estado; se corrigen y vuelven a medir. La ruta de publicación necesita aceptar la regla y los demás controles correspondientes al uso.")

Oracle Data Transforms permite organizar transformaciones y ejecuciones. Las estadísticas muestran patrones útiles para perfilar, pero una distribución inesperada requiere interpretar el negocio. La detección técnica no decide sola si se bloquea el cierre. Asimismo, la validación de calidad de una Analytic View tiene un alcance específico: no es una certificación integral de todas las fuentes.

Para el taller, la evidencia de una regla es una ficha con propósito, población, lógica, umbral, responsable, resultado y acción. Oracle AI Data Platform y Oracle Autonomous AI Lakehouse son opciones para implementarla; la ficha continúa siendo válida si cambian los motores o la ubicación de los datos.

## Ejemplo Explicado

Horizonte recibe 1 000 contratos. Diez no tienen fecha de inicio y otros veinte presentan una fecha fuera del periodo permitido. Para la regla de presencia, 990 de 1 000 cumplen: **99 %**. Si las dos poblaciones defectuosas no se solapan, la regla combinada de presencia y periodo tiene 970 conformes: **97 %**.

![Dos Reglas Sobre la Misma Población]({{base}}assets/diagrams/gov-data-quality-example.svg "La cuadrícula representa 1 000 contratos, diez por cuadrado, con defectos sin superposición. La completitud alcanza 990/1 000 = 99 % y supera su umbral. La regla de fecha presente y dentro del periodo alcanza 970/1 000 = 97 % y falla el mínimo del 98 %. Distingue población, defectos y umbrales de cada regla antes de combinar o comparar porcentajes.")

El propietario había acordado al menos 99 % para presencia y 98 % para la regla combinada. La primera pasa y la segunda falla. El pipeline no debe reemplazar ambas por un promedio que parezca aceptable. El steward asigna los casos, identifica si la captura permite fechas imposibles y coordina la corrección del formulario o proceso de origen.

Después se vuelve a medir sobre una población identificada. Una mejora declarada sin periodo ni denominador no permite comparar resultados y puede ocultar simplemente que se excluyeron los casos difíciles.

## Errores Frecuentes

- **“Sin nulos significa exacto”.** La presencia no verifica el valor contra la realidad.
- **“Una limpieza resuelve la causa”.** El error puede seguir entrando por el mismo proceso.
- **“El promedio de calidad permite publicar”.** Una falla crítica puede exigir bloqueo aunque otras reglas sean perfectas.

## Ejercicio de Decisión

Una carga de 200 facturas contiene dos registros excedentes según la clave y el criterio de conteo acordados: quedan 198 claves únicas. La política exige **100 % de unicidad para publicar facturas**. Otra regla de completitud alcanza 100 %. El equipo propone promediar ambas reglas y continuar. Decide qué hacer y quién debe resolverlo.

<details>
<summary>Solución</summary>

Con el indicador acordado de claves únicas sobre registros recibidos, 198 de 200 equivalen a 99 %. La publicación falla el requisito de 100 % de unicidad. No se compensa con completitud. Se separan los casos, se investiga la causa y el propietario de Facturación aplica la política de publicación o una excepción formal prevista. Tras corregir, se comprueba nuevamente antes de liberar.

![La Unicidad Decide Si se Publica]({{base}}assets/diagrams/gov-data-quality-exercise.svg "La población tiene 200 filas y 198 claves distintas: unicidad del 99 % frente a una exigencia del 100 %, aunque la completitud sea del 100 %. La ruta bloquea la publicación, investiga las filas y repite la prueba después de corregir. Una excepción formal, si se autoriza, registra propietario, motivo, alcance y vigencia; no convierte el resultado en cumplimiento del umbral.")

</details>
