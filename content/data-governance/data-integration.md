Horizonte recibe contratos de un sistema comercial, facturas de otro y consentimientos de un portal. Integrar no consiste únicamente en trasladar filas: hay que conservar significado, identidad, orden temporal y condiciones de uso.

## Conceptos Clave

La **integración** combina datos o conecta procesos para atender un uso. La **interoperabilidad** permite que sistemas intercambien e interpreten información de forma compatible. Puede existir conexión técnica sin acuerdo semántico: dos sistemas transmiten «fecha» correctamente, pero uno representa emisión y otro vencimiento.

La integración necesita identificar el sistema de origen, la entidad, la transformación y el consumidor. Debe conocer qué es una actualización, cómo se expresa una eliminación y cuándo un resultado está completo. Un campo que llega vacío puede significar desconocido, no aplicable o un error; el contrato debe distinguir lo relevante para el uso.

La elección entre lote, eventos y captura de cambios depende de frescura, volumen, capacidad y reglas del proceso. Menor latencia puede costar más y propagar un error más rápido. El objetivo es cumplir el requisito, no conseguir tiempo real en todos los flujos.

![Transmitir una Fecha No Acuerda su Significado]({{base}}assets/diagrams/gov-data-integration-concepts.svg "Los dos sistemas aceptan el valor 01/09, pero uno lo interpreta como fecha de emisión y el otro como fecha de vencimiento. El transporte y el formato pueden ser correctos mientras el significado es incorrecto. Acuerda qué representa el campo y su interpretación en ambos extremos antes de usarlo en conciliación o indicadores.")

## Contratos, Identidades y Sincronización

Un **contrato de datos** explicita estructura, significado, claves, frecuencia, calidad esperada, permisos y gestión de cambios. También identifica productor, consumidor y responsable de incidentes. No requiere una herramienta específica: necesita acuerdos verificables que guíen la operación.

La **idempotencia** permite repetir una operación sin multiplicar su efecto esperado. Si una carga se reintenta, Horizonte no debe duplicar facturas. Puede usar una clave estable del origen y reglas de actualización; elegir el mecanismo exacto depende del sistema. «El job reintentó» no prueba que el destino mantenga un resultado correcto.

Una integración debe considerar correcciones tardías, eliminaciones y cambios incompatibles de esquema. La identidad técnica que se conecta a una fuente también forma parte del contrato de acceso. Cuando se comparte una credencial, no se debe asumir que la fuente distingue automáticamente a cada usuario final. Hay que verificar qué identidad ve, qué permite y qué registra.

![Un Mensaje Debe Poder Explicar su Contrato]({{base}}assets/diagrams/gov-data-integration-principles.svg "La factura F42 viaja con clave estable, operación, versión del contrato y estado acordados. La clave permite reconocer el mismo registro al reintentar; las operaciones deben contemplar altas, correcciones y anulaciones. El intercambio también define identidad efectiva, permisos, frecuencia, calidad y responsable. Ese contrato permite comprobar el resultado del flujo y tratar sus fallos.")

## Integración con Oracle AI Data Platform y Oracle Autonomous AI Lakehouse

En Oracle AI Data Platform, crea un [catálogo externo](https://docs.oracle.com/en/cloud/paas/ai-data-platform/aidug/external-catalogs.html) para descubrir esquemas y consultar tablas de una fuente compatible. Configura la credencial con acceso al conjunto autorizado y actualiza los metadatos cuando cambie la estructura del origen. Usa notebooks y workflows para preparar y coordinar transformaciones, y publica el resultado curado en Oracle Autonomous AI Lakehouse. Al diseñar el intercambio, decide entre consultar en origen o cargar una copia: la primera opción depende de la fuente y la segunda requiere administrar actualización y conservación.

Para distribuir el conjunto autorizado con **Delta Sharing** en Oracle AI Data Platform, crea un share, añade sus esquemas o tablas, asigna destinatarios y activa su acceso. Este mecanismo comparte esos activos; para volúmenes y archivos del workspace, utiliza su gestión de acceso correspondiente. Acompaña el intercambio con significado, condiciones de uso y vigencia acordados con el receptor. La guía de [compartir datos](https://docs.oracle.com/en/cloud/paas/ai-data-platform/aidug/share-data.html) detalla la administración de activos, destinatarios y permisos.

Cuando el requisito exige captura continua de cambios, configura la [integración de Oracle Cloud Infrastructure GoldenGate con Oracle AI Data Platform](https://docs.oracle.com/en/cloud/paas/ai-data-platform/aidug/oracle-goldengate-integration.html). Prepara la zona temporal en Oracle Cloud Infrastructure Object Storage y la conexión JDBC para aplicar los cambios mediante *stage and merge*. Comprueba en destino altas, actualizaciones y eliminaciones usando las claves del contrato de datos. Para transformar datos replicados entre bases de datos, la guía de [Oracle Data Transforms con Oracle Cloud Infrastructure GoldenGate](https://docs.oracle.com/en/cloud/paas/goldengate-service/ocigg/quickstarts/discover-oci-goldengate-data-transforms.html) muestra cómo combinar replicación y flujos de transformación.

Usa el [linaje de Oracle AI Data Platform](https://docs.oracle.com/en/cloud/paas/ai-data-platform/aidug/lineage.html) para seguir fuentes, transformaciones y consumidores de las ejecuciones capturadas. La vista muestra la última captura de cada proceso. Para reconstruir intercambios anteriores, conserva las versiones del código, los identificadores de ejecución y los datos asociados al periodo del contrato.

![Capturar Cambios y Actualizar la Tabla]({{base}}assets/diagrams/gov-data-integration-oracle.svg "El recorrido parte de una fuente compatible y captura altas, cambios y bajas con Oracle Cloud Infrastructure GoldenGate. Oracle Cloud Infrastructure Object Storage funciona como zona temporal; la conexión JDBC hacia Spark de Oracle AI Data Platform participa en stage-and-merge. Comprueba que la tabla de destino refleja los cambios previstos, con conexiones y permisos configurados para cada tramo.")

## Ejemplo Explicado

Horizonte recibe cada noche facturas con `id_origen`, importe y estado. Una caída obliga a repetir la carga. El contrato define que `id_origen` identifica una factura dentro del sistema productor y que una corrección actualiza su estado. El destino compara esa clave y aplica el cambio sin añadir otra factura idéntica.

Además, una factura anulada debe dejar de contribuir al indicador acordado. Si el flujo solo agrega registros nuevos, el tablero seguirá mostrando un ingreso incorrecto aunque todas las transferencias hayan terminado bien. El equipo comprueba claves, cambios y anulaciones antes de publicar el producto. La solución técnica materializa el contrato; no lo sustituye.

![Tres Eventos; una Sola Factura]({{base}}assets/diagrams/gov-data-integration-example.svg "El primer evento inserta F42 como emitida. El segundo repite esa emisión: reconocer el reintento conserva una sola fila. El tercero anula F42 y actualiza el estado de la misma factura. La anulación también debe llegar al indicador consumidor. Verifica identidad estable y tratamiento de cambios para que los reintentos no dupliquen registros ni dejen estados antiguos.")

## Errores Frecuentes

- **Tiempo real resuelve significado y calidad.** Reduce demora; los acuerdos y controles siguen siendo necesarios.
- **Un conector hereda toda identidad del usuario.** Verifica credencial efectiva, permisos y auditoría en cada extremo.
- **Solo hay que manejar altas.** Las correcciones, bajas y cambios de esquema también modifican el producto.

## Ejercicio de Decisión

Comercial cambia el código de estado de «A» a «ACTIVO» sin avisar. La carga termina bien, pero el indicador de contratos activos cae a cero. ¿El primer cambio debe ser aumentar cómputo, cambiar frecuencia o corregir el acuerdo y su validación?

<details>
<summary>Solución</summary>

Hay que confirmar el cambio con el productor, corregir el mapeo y acordar versionado y aviso de cambios. Un control sobre valores admitidos habría detenido la publicación incorrecta. Más cómputo o mayor frecuencia ejecutaría más rápido la misma interpretación equivocada. Después se reprocesa y reconcilia el periodo afectado.

![El Job Termina; el Indicador Cae a Cero]({{base}}assets/diagrams/gov-data-integration-exercise.svg "La carga termina sin errores, pero el indicador cae a cero porque el filtro espera A y ahora recibe ACTIVO. La definición de negocio no cambió; el mapeo sí quedó desactualizado. Valida los valores, aprueba una nueva versión del contrato y reprocesa el periodo afectado. Comprueba el indicador reconciliado antes de aceptar el resultado técnico como correcto.")

</details>
