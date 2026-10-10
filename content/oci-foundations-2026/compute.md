Una campaña multiplicará las visitas de Tienda Andina. El equipo necesita decidir qué ejecutar, qué administrar y cómo ampliar la capacidad sin perder los pedidos.

## Conceptos clave

Una **instancia** es el entorno de cómputo que ejecuta una carga. Su **imagen** aporta el sistema operativo y software inicial. Su **shape** define recursos como procesador, memoria y características de red. Las shapes flexibles permiten ajustar OCPU y memoria dentro de las combinaciones compatibles. Comprueba arquitectura, disponibilidad y límites: una imagen x86 no funciona indistintamente sobre un procesador Arm.

Una **VM** usa hardware virtualizado. Una instancia **bare metal** proporciona un servidor físico dedicado. Un **Dedicated Virtual Machine Host** dedica un host físico a las VMs del cliente. Son opciones distintas de aislamiento y control; “nano instance” no es una categoría general de instancia OCI en este temario.

![Imagen y shape se combinan para crear una instancia conectada a red y volúmenes.]({{base}}assets/diagrams/ocif-compute-concepts.svg "La imagen aporta software; la shape aporta capacidad.")

El **boot volume** contiene el disco de arranque; los volúmenes de datos pueden gestionarse por separado. Una **instance configuration** guarda parámetros reutilizables para crear instancias. No es una copia en ejecución de la aplicación ni reemplaza el respaldo de datos. Un **instance pool** administra un conjunto de instancias con una configuración común.

Las **preemptible instances** ofrecen capacidad de menor costo que puede ser recuperada por OCI, terminando la instancia. Encajan con trabajos tolerantes a interrupciones, como un lote que guarda avances y puede reintentarse; no con la única instancia que mantiene una operación indispensable. Verifica las shapes y funciones compatibles: no todas las opciones de una VM normal están disponibles. Véase [capacidad preemptible](https://docs.oracle.com/en-us/iaas/Content/Compute/Concepts/preemptible.htm).

## Lanzar, conectar y escalar

Al crear una VM elige compartimento, ubicación, imagen, shape, VCN, subred, acceso SSH y almacenamiento. Guarda la clave privada bajo tu control; OCI recibe la clave pública. Una conexión SSH necesita tanto autenticación del sistema operativo como conectividad y reglas de red. La pertenencia a Administrators no reemplaza la clave del usuario Linux.

**Cloud Shell** ofrece un entorno de terminal con herramientas como OCI CLI y autenticación de sesión. No evade IAM ni hace alcanzable cualquier IP privada por sí solo. Para llegar a una VM privada necesitas un método de acceso y conectividad configurados para esa red, por ejemplo Bastion o una conexión privada adecuada.

![Escalamiento vertical aumenta una VM; el horizontal añade VMs detrás de un balanceador.]({{base}}assets/diagrams/ocif-compute-scaling.svg "Más recursos por instancia y más instancias resuelven problemas diferentes.")

En **escalamiento vertical**, ajustas la capacidad de una instancia compatible; puede requerir reinicio. En **horizontal**, cambias el número de instancias. **Autoscaling** puede ajustar el tamaño o estado del pool con políticas basadas en métricas o programación. Define mínimos, máximos y tiempos de espera para no reaccionar de forma inestable a cada pico breve.

**Live Migration** mueve una VM compatible entre hosts físicos mientras continúa funcionando, con una posible pausa breve. No es una garantía universal de cero interrupción ni el procedimiento para mover cualquier carga entre regiones. Revisa compatibilidad y mantenimiento en [migración de instancias](https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/movinganinstance.htm).

## Contenedores, Kubernetes y funciones

Un **contenedor** empaqueta una aplicación y dependencias de usuario. Comparte el kernel del entorno donde se ejecuta; no elimina la existencia del sistema operativo. Una **imagen de contenedor** y una imagen de VM son artefactos diferentes.

![Una VM contiene su sistema operativo; los contenedores comparten un kernel; una función se representa como ejecución disparada por un evento.]({{base}}assets/diagrams/ocif-compute-runtimes.svg "Elige también cuánto de la plataforma quieres operar.")

| Necesidad de la tienda | Servicio que debes evaluar |
| --- | --- |
| Aplicación que necesita controlar su sistema operativo | Compute VM o bare metal según requisitos |
| Ejecutar contenedores sin administrar un clúster Kubernetes | Container Instances |
| Orquestar despliegues, servicios y escalamiento con Kubernetes | Oracle Kubernetes Engine (OKE) |
| Ejecutar lógica acotada ante una llamada o evento | Oracle Functions |

En **OKE**, Oracle administra el plano de control; las responsabilidades sobre nodos y ejecución dependen de las opciones elegidas. Tú sigues siendo responsable de cargas, acceso y configuración. Los **pods** ejecutan contenedores, los **deployments** expresan réplicas deseadas y los **services** ofrecen acceso estable. **OCI Container Registry** almacena imágenes privadas o públicas según configuración.

En **Functions**, el equipo despliega código empaquetado y define cómo invocarlo. Un evento de subida de objeto puede activar el procesamiento de una imagen. “Serverless” significa que no administras servidores individuales para esa ejecución; sigue habiendo recursos, permisos, límites, observabilidad y costos. Consulta [OKE](https://docs.oracle.com/en-us/iaas/Content/ContEng/Concepts/contengoverview.htm) y [Functions](https://docs.oracle.com/en-us/iaas/Content/Functions/Concepts/functionsoverview.htm).

## Ejemplo paso a paso

1. La tienda empieza con dos VMs para una aplicación ya existente; no necesita reescribirla para aprender OCI.
2. Captura los parámetros de lanzamiento en una instance configuration y crea un pool.
3. Coloca el pool detrás de un balanceador; guarda los pedidos fuera del disco efímero y evita sesiones que dependan de una única VM.
4. Define una política de autoscaling. Un ejemplo didáctico parte de dos instancias, permite hasta cuatro y aumenta capacidad si la métrica permanece elevada durante la evaluación configurada. Estos números son del caso, no valores obligatorios de OCI.
5. Comprueba también el descenso: antes de retirar capacidad, las peticiones y datos deben quedar a salvo.

![El pool pasa de dos a cuatro instancias durante la campaña y vuelve a dos después; los datos permanecen fuera del pool.]({{base}}assets/diagrams/ocif-compute-example.svg "La elasticidad funciona mejor cuando las instancias son reemplazables.")

Para la generación de miniaturas, la tienda evalúa Functions disparada por eventos. Es una decisión independiente del runtime de la aplicación principal.

## Errores frecuentes

- **“Autoscaling arregla una base de datos lenta”.** Añadir frontends no elimina el cuello de botella compartido. Observa la carga antes de escalar.
- **“Una instance configuration conserva mis pedidos”.** Describe cómo crear instancias; los datos necesitan su propia estrategia.
- **“Serverless no tiene servidores ni responsabilidades”.** El proveedor abstrae su administración; el código, acceso y operación siguen importando.

![Cuatro servidores esperan ante una misma base de datos saturada: aumentar frontends no amplía ese recurso.]({{base}}assets/diagrams/ocif-compute-errors.svg "Escala el componente que limita el resultado.")

## Ejercicio de decisión

La tienda quiere ejecutar un contenedor de procesamiento sin mantener Kubernetes. Otra tarea debe transformar cada foto al recibir un evento. ¿Qué opciones evaluarías? ¿Qué dato te haría reconsiderarlas?

<details>
<summary>Solución</summary>

Container Instances para el contenedor sin clúster propio y Functions para la tarea por evento. Si la primera aplicación exige las APIs y orquestación de Kubernetes, considera OKE. Si la segunda requiere ejecuciones o recursos incompatibles con los límites de Functions, evalúa otro runtime. La palabra “contenedor” no obliga a elegir Kubernetes.

![La necesidad de orquestación conduce a OKE; un contenedor directo a Container Instances; un evento acotado a Functions.]({{base}}assets/diagrams/ocif-compute-exercise.svg "Parte de la necesidad operativa, no de la herramienta más conocida.")

</details>

## Fuentes y repaso

![El ciclo preparar, lanzar, observar y ajustar conecta configuración, instancia, métricas y autoscaling.]({{base}}assets/diagrams/ocif-compute-recap.svg "Explica qué cambia y qué debe persistir al reemplazar una instancia.")

Consulta [Compute](https://docs.oracle.com/en-us/iaas/Content/Compute/Concepts/computeoverview.htm), [autoscaling](https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/autoscalinginstancepools.htm), [Container Instances](https://docs.oracle.com/en-us/iaas/Content/container-instances/overview.htm) y [migración](https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/movinganinstance.htm). Compara imagen y shape, vertical y horizontal, y OKE y Functions con un ejemplo propio.
