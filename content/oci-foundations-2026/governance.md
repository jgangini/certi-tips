La tienda ya funciona. Ahora el equipo necesita saber cuánto consume, quién es responsable de cada recurso y qué acciones pueden evitar gastos innecesarios.

**Al terminar podrás:** interpretar modelos de consumo; distinguir presupuestos, cuotas y límites; usar etiquetas para asignar costos; y reconocer Cost Analysis, Cloud Advisor, BYOL y Support Rewards.

## Conceptos clave

**Pay As You Go** vincula el pago al consumo medido sin una bolsa de consumo comprometida de ese modelo. Un acuerdo de **Universal Credits** incorpora compromiso y condiciones contractuales. El importe depende del servicio y su unidad de medida: capacidad y tiempo, solicitudes, almacenamiento, transferencia u otros medidores. Una VM ociosa puede seguir generando consumo.

![Capacidad por tiempo, almacenamiento y transferencia se suman para estimar el consumo de una aplicación.]({{base}}assets/diagrams/ocif-governance-concepts.svg "Cuenta todos los recursos que necesita la solución.")

La transferencia **ingress** entra a OCI y generalmente no tiene cargo de transferencia de entrada. La **egress** sale y puede generar cargos según destino, modalidad y franquicias. No concluyas que toda salida es cobrada o que enviar datos a otra nube es siempre gratis. Consulta [precios de red](https://www.oracle.com/cloud/networking/pricing/) antes de estimar un caso real.

**BYOL (Bring Your Own License)** permite aprovechar licencias existentes elegibles bajo sus condiciones. **Oracle Support Rewards** acumula beneficios por consumo OCI elegible que pueden aplicarse a facturas elegibles de soporte tecnológico de Oracle. No son la misma herramienta ni una promesa de eliminar cualquier factura. Revisa elegibilidad y términos en [Support Rewards](https://www.oracle.com/cloud/rewards/).

## Presupuestos, cuotas y límites

Un **budget** establece un umbral de gasto con alertas por consumo real o previsto. Es un límite informativo o *soft limit*: **no apaga recursos automáticamente**. Las alertas se evalúan periódicamente, no son un interruptor instantáneo al cruzar un importe. Consulta [Budgets](https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/budgetsoverview.htm).

Las **compartment quotas** delimitan cantidades de recursos que los administradores permiten consumir en un compartimento. Los **service limits** son límites del servicio aplicables al ámbito correspondiente; algunos pueden ampliarse mediante solicitud. Una cuota no aumenta un service limit, y disponer de cuota y límite no garantiza capacidad física inmediata.

![Un presupuesto genera una alerta al superar el umbral; una cuota restringe cantidades; el límite del servicio forma un techo independiente.]({{base}}assets/diagrams/ocif-governance-controls.svg "Dinero, cantidad permitida y límite del servicio se controlan por mecanismos distintos.")

Ejemplo: el entorno de pruebas tiene una cuota de dos unidades de un recurso, un límite de servicio de cinco y un presupuesto de 100 unidades monetarias. La tercera unidad puede quedar bloqueada por la cuota aunque el gasto sea solo 20. Dos unidades que permanecen mucho tiempo encendidas pueden superar el presupuesto; la alerta no las detiene.

## Analizar, etiquetar y optimizar

**Cost Analysis** permite visualizar el gasto y agruparlo por dimensiones como servicio o compartimento. Los **Cost and Usage Reports** dan detalle para análisis, auditoría y conciliación. Ninguno equivale a una política que impida crear recursos.

Una **tag** asocia clave y valor a un recurso. Las **free-form tags** son pares sencillos; las **defined tags** usan namespaces y definiciones administradas. Las **tag defaults** ayudan a aplicar valores al crear recursos en un ámbito. Configura etiquetas de seguimiento de costos cuando corresponda y confirma que el informe utiliza la dimensión adecuada.

![Recursos de cómputo, red y almacenamiento comparten Proyecto=Tienda y se agrupan para analizar su costo.]({{base}}assets/diagrams/ocif-governance-tags.svg "Una etiqueta permite reunir costos aunque los recursos sean de servicios diferentes.")

**Cloud Advisor** presenta recomendaciones sobre costo, rendimiento, seguridad y disponibilidad. Una VM con poco uso puede merecer ajuste o eliminación, pero primero verifica su función, los picos de demanda y las dependencias. Una recomendación es una señal para evaluar, no una autorización universal para borrar.

Define etiquetas útiles como `Proyecto=Tienda`, `Entorno=Pruebas` y `Responsable=Plataforma`. Evita secretos o datos sensibles en etiquetas. Al revisar costos, distingue recursos del equipo y recursos compartidos para no asignar toda la infraestructura común a una sola aplicación.

## Ejemplo paso a paso

1. La tienda separa Producción y Pruebas, y aplica etiquetas de proyecto y responsable.
2. Estima costo de instancias, discos, balanceador, objetos y red antes de la campaña.
3. Configura un presupuesto y alertas de consumo real y previsto para el ámbito elegido.
4. Define cuotas de recursos para Pruebas según lo que el equipo puede utilizar; verifica service limits antes del despliegue.
5. En Cost Analysis filtra el periodo y compara por servicio. Si aumenta Block Volume, busca volúmenes retenidos que ya no necesita ninguna instancia.
6. Revisa Cloud Advisor, valida dependencias y aplica los cambios apropiados. Comprueba después si disminuyó el consumo sin deteriorar la aplicación.

![Una serie de gasto creciente cruza el umbral de alerta; una acción del equipo reduce luego el consumo.]({{base}}assets/diagrams/ocif-governance-example.svg "La alerta informa; la reducción requiere una acción adecuada.")

En la demostración de consola identifica la diferencia entre gasto acumulado, previsión y límite configurado. Un gráfico de costos describe consumo; no prueba que exista autorización para todos los recursos mostrados.

## Errores frecuentes

- **“Budget limita el número de VMs”.** Esa tarea corresponde a cuotas o límites apropiados, no al umbral monetario.
- **“Detuve la VM y desapareció todo el costo”.** Pueden continuar cargos por volúmenes y otros recursos; verifica el comportamiento de la shape y servicios usados.
- **“Cloud Advisor cambia todo automáticamente”.** Evalúa la recomendación, decide y comprueba el resultado de la acción.

![Una instancia detenida sigue asociada a un volumen y otros recursos con medidores propios.]({{base}}assets/diagrams/ocif-governance-errors.svg "El costo de la aplicación incluye más que su CPU.")

## Ejercicio de decisión

El equipo recibe una alerta al llegar al 80 % de su presupuesto. Quiere impedir que Desarrollo cree más de cuatro unidades de un recurso y saber qué servicio está aumentando el gasto. ¿Qué debe utilizar para cada objetivo? ¿La alerta ya detuvo el gasto?

<details>
<summary>Ver solución y explicación</summary>

Usa una cuota del recurso en Desarrollo para controlar su cantidad, dentro de los límites de servicio existentes. Usa Cost Analysis para investigar el incremento y los reportes si necesita detalle adicional. El presupuesto envió una alerta; no detuvo automáticamente recursos ni consumo. El equipo debe decidir una acción conociendo las dependencias.

![Tres solicitudes se asignan a Budget, quota y Cost Analysis: avisar, restringir cantidad y explicar gasto.]({{base}}assets/diagrams/ocif-governance-exercise.svg "El verbo del requisito te ayuda a escoger la herramienta.")

</details>

## Fuentes y repaso

![El ciclo estimar, atribuir, observar y ajustar relaciona precios, etiquetas, análisis y decisiones.]({{base}}assets/diagrams/ocif-governance-recap.svg "El control del gasto es un ciclo, no un único umbral.")

Consulta [costos y facturación](https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/billingoverview.htm), [cuotas](https://docs.oracle.com/en-us/iaas/Content/Quotas/Concepts/resourcequotas.htm), [tagging](https://docs.oracle.com/en-us/iaas/Content/Tagging/Concepts/taggingoverview.htm), [Cloud Advisor](https://docs.oracle.com/en-us/iaas/Content/CloudAdvisor/Concepts/cloudadvisoroverview.htm) y [Support Rewards](https://www.oracle.com/cloud/rewards/). Explica por qué BYOL no es un presupuesto, una cuota no es dinero y una alerta no es un apagado.
