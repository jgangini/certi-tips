Fotos de productos, discos de servidores y carpetas compartidas contienen bytes, pero se utilizan de formas diferentes. La elección empieza por el patrón de acceso, no por cuál servicio parece más barato.

**Al terminar podrás:** elegir Object, Block o File Storage; distinguir niveles de objetos; explicar un adjunto iSCSI y una ampliación de volumen; y separar durabilidad, disponibilidad y respaldo.

## Conceptos clave

**Object Storage** guarda objetos identificados por nombre en buckets y se consume con APIs. Un objeto incluye datos y metadatos. El **namespace** proporciona un espacio de nombres de Object Storage para la tenancy; el bucket agrupa objetos. Una clave como `productos/foto.jpg` puede parecer una ruta, pero no convierte el bucket en un disco montado con semántica de sistema de archivos.

**Block Volume** presenta almacenamiento de bloques a una instancia: el sistema operativo puede crear un sistema de archivos y utilizarlo como disco. **File Storage** ofrece un sistema de archivos compartido accesible por NFS. Varios clientes pueden trabajar con archivos mediante un mount target y las reglas de exportación y red apropiadas.

![Fotos como objetos en un bucket, bloques como disco de una VM y archivos compartidos por varios clientes.]({{base}}assets/diagrams/ocif-storage-concepts.svg "API de objetos, disco de bloques y carpetas compartidas son interfaces distintas.")

**Durabilidad** trata de conservar los datos; **disponibilidad**, de poder acceder cuando se necesitan. **Replicación** mantiene copias para resiliencia, mientras un **backup** permite recuperar un estado anterior. Si replicas una eliminación accidental, las copias actuales pueden reflejarla: la replicación no sustituye el respaldo.

Algunas shapes incluyen **NVMe local**, discos físicamente asociados al host con baja latencia y alto rendimiento. No tienen la misma protección gestionada que Block Volume: debes diseñar la durabilidad y recuperación de sus datos. Un dato temporal regenerable puede encajar; la única copia de un pedido requiere otra estrategia. Consulta [protección de datos NVMe](https://docs.oracle.com/en-us/iaas/Content/Compute/References/nvmedeviceinformation.htm). La **persistencia** también importa: identifica qué datos sobreviven al ciclo de vida de la instancia y qué datos debes poder reconstruir.

## Objetos, niveles y acceso

| Nivel | Acceso esperado | Decisión que importa |
| --- | --- | --- |
| Standard | Frecuente, acceso inmediato | Contenido activo y patrones desconocidos |
| Infrequent Access | Poco frecuente, acceso inmediato | Considerar cargos de recuperación y retención mínima |
| Archive | Muy poco frecuente, restauración previa | Aceptar espera de recuperación y condiciones de retención |

**Auto-Tiering** mueve objetos elegibles entre **Standard e Infrequent Access** según patrones observados. No traslada automáticamente a Archive. Las reglas de **Object Lifecycle Management** permiten otras transiciones y acciones según las condiciones configuradas; no son sinónimo de Auto-Tiering. Consulta [niveles de almacenamiento](https://docs.oracle.com/en-us/iaas/Content/Object/Concepts/understandingstoragetiers.htm).

![Standard e Infrequent Access están unidos en ambos sentidos por Auto-Tiering; Archive tiene un camino separado de lifecycle y restauración.]({{base}}assets/diagrams/ocif-storage-tiers.svg "Acceso infrecuente no significa necesariamente esperar horas.")

Un bucket privado requiere autorización para acceder. Un **pre-authenticated request (PAR)** proporciona acceso acotado mediante un enlace con vigencia: quien posea ese enlace puede ejercer el acceso concedido. Una política de visibilidad pública es una decisión diferente. Para datos internos conserva acceso privado; no hagas público todo un bucket para resolver el acceso de una aplicación.

La consola y OCI CLI permiten crear buckets y subir objetos. En Cloud Shell puedes consultar el namespace con `oci os ns get`; una CLI externa requiere su configuración de autenticación. Al subir un archivo identifica bucket, nombre del objeto y región, y verifica con la identidad que debe consumirlo. **Versioning** conserva versiones; retención y lifecycle añaden controles diferentes.

## Volúmenes y sistemas de archivos

Un Block Volume pertenece a un AD y se replica dentro de él para durabilidad. No implica por sí solo una copia utilizable en otra región. Elige capacidad y nivel de rendimiento por las necesidades de IOPS y throughput; un disco grande no es automáticamente la solución a todo cuello de botella.

![Un volumen se adjunta a una VM, aparece como dispositivo en el sistema operativo y se monta para que lo use la aplicación.]({{base}}assets/diagrams/ocif-storage-volumes.svg "Crear, adjuntar, conectar y montar son pasos distintos.")

En un adjunto **paravirtualizado**, OCI presenta el dispositivo mediante virtualización. En **iSCSI**, la instancia se conecta al volumen mediante el protocolo correspondiente; la configuración manual o el agente debe completar la conexión. Que la consola muestre el adjunto no demuestra que exista un sistema de archivos montado. No formatees un volumen con datos para resolver un problema de montaje.

**Online Resizing** permite ampliar un volumen conectado. Después puede ser necesario que el sistema operativo vuelva a detectar la capacidad y ampliar la partición o sistema de archivos. No es una operación para reducirlo. Sigue [Resizing a Volume](https://docs.oracle.com/en-us/iaas/Content/Block/Tasks/resizingavolume.htm).

En File Storage distingue **file system**, **mount target** y **export**. El sistema contiene los archivos; el destino da acceso de red; la exportación y sus opciones controlan cómo acceden los clientes. Configura NFS y, cuando corresponda, cifrado en tránsito; no lo asumas por el simple hecho de que los datos en reposo estén cifrados.

## Ejemplo paso a paso

1. La tienda guarda fotos originales en un bucket privado de Object Storage; su aplicación obtiene permisos específicos de lectura.
2. Mantiene fotos de uso habitual en Standard. Para patrones variables evalúa Auto-Tiering; para históricos raramente requeridos evalúa Archive, aceptando el proceso de restauración.
3. Una aplicación heredada requiere un disco persistente: crea un Block Volume en el AD adecuado, lo adjunta y confirma su disponibilidad dentro del sistema operativo.
4. Dos servidores necesitan la misma carpeta de informes: evalúa File Storage por su acceso compartido NFS.
5. Define recuperación por separado: versiones o backups, retención, restauración y pruebas según el tipo de dato.

![Tres necesidades de la tienda se asignan a Object Storage, Block Volume y File Storage, sin hacerlos intercambiables.]({{base}}assets/diagrams/ocif-storage-example.svg "Cada dato tiene una forma de uso y una estrategia de recuperación.")

En la demostración de objetos prueba la diferencia entre una lectura autorizada y una URL sin autorización. En la de bloques verifica el disco desde la instancia antes de atribuir el problema a permisos IAM.

## Errores frecuentes

- **“Auto-Tiering usa Archive”.** Solo intercambia Standard e Infrequent Access; Archive se gestiona por otros mecanismos.
- **“Replicado significa que no necesito backups”.** Una copia actual no siempre recupera un estado anterior.
- **“La ampliación ya aparece en OCI, así que la aplicación ve todo el espacio”.** Falta comprobar la capa del sistema operativo y el sistema de archivos.

![Un volumen aumenta de 100 a 200 unidades, pero el sistema de archivos conserva 100 hasta completar la ampliación.]({{base}}assets/diagrams/ocif-storage-errors.svg "Capacidad del volumen y capacidad utilizable son capas diferentes.")

## Ejercicio de decisión

Un archivo casi nunca se consulta, pero debe entregarse inmediatamente cuando se pide. Otro es un histórico que puede esperar una restauración. ¿En qué niveles los colocarías? ¿Qué costo adicional revisarías en el primero?

<details>
<summary>Ver solución y explicación</summary>

Infrequent Access puede encajar con el primero; hay que evaluar cargos de recuperación, retención mínima y patrón real. Archive puede encajar con el histórico que tolera espera. Elegir únicamente por el precio por GB ignoraría el tiempo de acceso y los cargos asociados.

![Dos relojes distinguen recuperación inmediata en Infrequent Access y restauración previa en Archive.]({{base}}assets/diagrams/ocif-storage-exercise.svg "La tolerancia a la espera cambia la elección.")

</details>

## Fuentes y repaso

![Un árbol de elección separa objetos por API, disco por bloques y archivos NFS; una segunda pregunta plantea restauración.]({{base}}assets/diagrams/ocif-storage-recap.svg "Primero decide la interfaz; después el acceso y la recuperación.")

Consulta [Object Storage](https://docs.oracle.com/en-us/iaas/Content/Object/Concepts/objectstorageoverview.htm), [niveles](https://docs.oracle.com/en-us/iaas/Content/Object/Concepts/understandingstoragetiers.htm), [Block Volume](https://docs.oracle.com/en-us/iaas/Content/Block/Concepts/overview.htm) y [File Storage](https://docs.oracle.com/en-us/iaas/Content/File/Concepts/filestorageoverview.htm). Explica por qué una foto, un disco y una carpeta compartida conducen a servicios diferentes.
