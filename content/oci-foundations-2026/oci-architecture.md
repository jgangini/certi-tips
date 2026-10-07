Tienda Andina quiere trasladar su aplicación a la nube. La primera decisión es dónde desplegarla y qué parte del servicio debe seguir funcionando ante un fallo.

**Al terminar podrás:** distinguir región, Availability Domain y Fault Domain; relacionar elasticidad con consumo; y ubicar un recurso en la consola sin confundir región con compartimento.

## Conceptos clave

La nube permite aprovisionar recursos por demanda mediante consola, API o herramientas. **Escalabilidad** es la capacidad de aumentar o reducir recursos; **elasticidad** es ajustarlos según la demanda. Una VM sobredimensionada y siempre encendida puede ser escalable sin aprovechar la elasticidad. Pagar por uso tampoco significa pagar únicamente cuando hay clientes visitando tu aplicación: el medidor puede registrar capacidad aprovisionada.

En **IaaS** administras, entre otras cosas, el sistema operativo de tus VMs y la aplicación. En servicios de **PaaS**, Oracle administra más componentes de la plataforma. En **SaaS**, consumes una aplicación terminada. Cuanto más gestionado sea el servicio, cambia la distribución de tareas; la responsabilidad sobre datos y acceso sigue siendo esencial.

![Tres capas de servicio muestran cómo cambia el trabajo del cliente entre IaaS, PaaS y SaaS.]({{base}}assets/diagrams/ocif-architecture-concepts.svg "Identifica qué administras antes de elegir un servicio.")

OCI reúne cómputo, red, almacenamiento, bases de datos, seguridad y otros servicios. Una **tenancy** representa el entorno de tu organización. Un **OCID** identifica de forma única un recurso; su nombre visible sirve para reconocerlo, pero no reemplaza ese identificador.

## Regiones y dominios de fallo

Una **región** es un área geográfica. Contiene uno o varios **Availability Domains (AD)**, cada uno formado por uno o más centros de datos. Un AD contiene tres **Fault Domains (FD)**: agrupaciones de hardware que permiten separar instancias frente a fallos y mantenimiento. No todas las regiones tienen tres AD. Consulta la [estructura regional de OCI](https://docs.oracle.com/en-us/iaas/Content/General/Concepts/regions.htm).

![Una región contiene un AD ilustrado y tres Fault Domains con instancias separadas; otra región aparece fuera del límite.]({{base}}assets/diagrams/ocif-architecture-regions.svg "La separación debe corresponder al fallo que quieres soportar.")

Dos VMs en FD diferentes dentro del mismo AD ayudan frente a ciertos fallos de hardware. Para soportar la pérdida del AD necesitas diseñar en otro AD disponible; para un evento regional, en otra región. En ambos casos debes resolver también datos, conectividad y recuperación. Duplicar solo la VM no garantiza continuidad.

Elige región por proximidad a usuarios, requisitos de residencia, servicios disponibles y capacidad. La **alta disponibilidad** busca mantener el servicio; la **recuperación ante desastres** define cómo restablecerlo después de una interrupción mayor. Piensa tanto en el tiempo tolerable de recuperación como en cuántos datos podrías perder.

## Consola y formas de consumir OCI

Antes de buscar una VM en la consola, verifica **tenancy, región y compartimento**. Muchos recursos son regionales o están asociados a un AD. Los compartimentos son agrupaciones lógicas que pueden contener recursos de diferentes regiones: cambiar de compartimento no cambia la región de la consola.

![Tres selectores independientes sitúan la búsqueda: tenancy de la tienda, región elegida y compartimento Producción.]({{base}}assets/diagrams/ocif-architecture-console.svg "Un listado vacío puede indicar un contexto equivocado o permisos insuficientes.")

En el recorrido de consola identifica el menú de servicios, búsqueda, selector de región, selector de compartimento, perfil de identidad, ayuda y herramientas de facturación. La consola, la CLI, los SDK y la API acceden a los mismos servicios sujetos a IAM. Un recurso no cambia de dueño porque lo creaste con una interfaz distinta.

La **nube pública** aloja recursos en regiones operadas por Oracle. **OCI Dedicated Region** lleva una región de OCI al centro de datos del cliente bajo condiciones del servicio. **Roving Edge Infrastructure** acerca cómputo y almacenamiento a ubicaciones remotas. En un escenario **multicloud**, soluciones como Oracle Interconnect for Azure y Oracle Database@Azure conectan o integran entornos de proveedores distintos. Son necesidades diferentes: localización, operación en el borde e integración entre nubes. Consulta la [oferta de nube distribuida](https://www.oracle.com/cloud/distributed-cloud/).

## Ejemplo paso a paso

La tienda quiere mantener la web disponible si falla un servidor. Aún no ha pedido continuidad frente a la pérdida de una región.

1. El equipo compara regiones cercanas a sus clientes y comprueba disponibilidad de los servicios necesarios.
2. Crea un compartimento **Producción**, distinto del de aprendizaje.
3. Distribuye dos instancias entre FD diferentes de un AD y coloca un balanceador delante.
4. Separa los datos persistentes del ciclo de vida de una sola instancia y establece copias de seguridad.
5. Simula conceptualmente la pérdida de una instancia: el balanceador debe enviar nuevas peticiones al backend sano. Una pérdida del AD requiere un diseño adicional.

![Un balanceador conserva una ruta hacia la segunda instancia mientras la primera está fuera de servicio.]({{base}}assets/diagrams/ocif-architecture-example.svg "Diseña y comprueba el comportamiento ante un fallo específico.")

Para orientarte en una demostración, anota el OCID, región, AD cuando corresponda, compartimento y estado del recurso. Si una búsqueda no devuelve resultados, revisa ese contexto y los permisos antes de crear un duplicado.

## Errores frecuentes

- **“Dos instancias significan alta disponibilidad”.** Si dependen de un único punto de fallo, ambas pueden quedar inutilizables. Incluye balanceo, datos y salud de la aplicación.
- **“Un compartimento es un centro de datos”.** Organiza y delimita permisos; no proporciona separación física por sí mismo.
- **“Todas las regiones tienen tres AD”.** La cantidad varía. Los tres FD pertenecen a cada AD.

![Un compartimento lógico se contrasta con los límites físicos región, AD y FD.]({{base}}assets/diagrams/ocif-architecture-errors.svg "Organización y ubicación responden a preguntas diferentes.")

## Ejercicio de decisión

Una aplicación debe seguir disponible si sufre mantenimiento un grupo de hardware. Su región dispone de un solo AD. Un compañero propone crear un segundo compartimento y dejar las dos VMs en el mismo FD. ¿Qué cambiarías y qué riesgo permanecería?

<details>
<summary>Ver solución y explicación</summary>

Distribuiría las instancias entre FD distintos y verificaría el balanceo y la disponibilidad de datos. El segundo compartimento puede servir para organización o permisos, pero no cambia su colocación física. El AD sigue siendo un ámbito de fallo compartido; un requisito de continuidad más amplio podría exigir otra región y una estrategia de replicación y recuperación.

![Dos VMs pasan de un mismo Fault Domain a dos FD distintos, manteniéndose dentro del mismo AD.]({{base}}assets/diagrams/ocif-architecture-exercise.svg "Cambia la colocación, no solo la etiqueta organizativa.")

</details>

## Fuentes y repaso

![Una escala de resiliencia relaciona fallo de servidor, AD y región con separaciones progresivas.]({{base}}assets/diagrams/ocif-architecture-recap.svg "Explica cuál es el siguiente límite que todavía comparten tus recursos.")

Repasa [regiones, AD y FD](https://docs.oracle.com/en-us/iaas/Content/General/Concepts/regions.htm), la [consola de OCI](https://docs.oracle.com/en-us/iaas/Content/GSG/Concepts/console.htm) y [nube distribuida](https://www.oracle.com/cloud/distributed-cloud/). Sin mirar el texto: ¿por qué importa la distancia al usuario?, ¿qué información necesitas para encontrar una VM?, ¿cuándo Dedicated Region y multicloud responden a requisitos diferentes?
