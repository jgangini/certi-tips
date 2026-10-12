Usa las diferencias de la última columna para elegir entre alternativas parecidas. Los términos en inglés se conservan porque aparecen en la consola y en la documentación.

## Organización e identidad

| Término | Significado | No lo confundas con |
| --- | --- | --- |
| Tenancy | Entorno OCI de una organización, con compartimento raíz | Una región |
| Region | Área geográfica con uno o varios AD | Un compartimento lógico |
| Availability Domain (AD) | Uno o más centros de datos aislados dentro de una región | Un FD |
| Fault Domain (FD) | Agrupación de hardware dentro de un AD; hay tres por AD | Otro AD o región |
| Compartment | Agrupación lógica de recursos y ámbito para políticas | Un almacén de secretos |
| OCID | Identificador único de un recurso OCI | Su nombre visible |
| Identity domain | Administración de identidades, grupos y autenticación | El dominio de red DNS |
| Authentication | Verificar la identidad de quien accede | Conceder todas las operaciones |
| Authorization | Determinar qué operaciones están permitidas | Conocer una contraseña |
| Principal | Identidad a la que se aplica una autorización | La ubicación del recurso |
| Dynamic group | Selección de recursos que pueden recibir permisos mediante políticas | Un grupo de personas |
| Federation / MFA | Confianza en otro proveedor de identidad / verificación con varios factores | Una política de acceso a VMs |

## Red y cómputo

| Término | Significado | Diferencia útil |
| --- | --- | --- |
| VCN / CIDR | Red virtual regional / notación de un rango IP | Diseña rangos que no se solapen al conectar redes |
| Subnet / VNIC | Subred / interfaz virtual de red | La VNIC conecta el recurso a la subred |
| Route table | Reglas para dirigir tráfico | No define por sí sola permisos de firewall |
| Internet Gateway | Camino hacia internet para recursos con configuración pública | No es NAT |
| NAT Gateway | Salida a internet para recursos privados y sus respuestas | No publica la VM para conexiones entrantes |
| Service Gateway | Acceso privado a servicios Oracle compatibles de la región | No es salida a cualquier sitio web |
| DRG | Enrutador virtual para conectar redes como VCN y on-premises | No es un balanceador HTTP |
| Security List / NSG | Reglas para VNIC de una subred / grupo de VNIC o recursos compatibles | Subred frente a función de los recursos |
| Stateful / stateless | Rastreo de conexiones / reglas explícitas para los sentidos necesarios | Ambos requieren diseñar los permisos |
| Listener / backend set | Entrada del balanceador / conjunto de servidores y configuración | Entrada frente a destinos |
| Health check | Verificación de disponibilidad del backend | Estado Running de una VM |
| Shape / image | Capacidad de cómputo / software de arranque | Hardware virtual frente a sistema y software |
| Instance configuration / pool | Parámetros reutilizables / conjunto de instancias | Plantilla frente a instancias administradas |
| Autoscaling | Ajuste automático por métricas o programación | No resuelve todo cuello de botella |
| Live Migration | Cambio de host de una VM compatible mientras funciona | Puede incluir una pausa breve |
| OKE | Kubernetes gestionado para orquestar contenedores | Ejecutar un contenedor no obliga a usarlo |
| Functions | Ejecución de código por invocación o evento | No exige administrar una VM por función |

## Datos, seguridad y gobierno

| Término | Significado | Diferencia útil |
| --- | --- | --- |
| Object / bucket / namespace | Dato y metadatos / agrupación / espacio de nombres de Object Storage | Un objeto no es un disco adjunto |
| Block Volume | Almacenamiento por bloques para instancias | No es una carpeta NFS compartida |
| File Storage | Sistema de archivos compartido por NFS | No es una API de objetos |
| Auto-Tiering | Transición de objetos elegibles entre Standard e Infrequent Access | Archive requiere otro mecanismo |
| Lifecycle policy | Acciones y transiciones de objetos según reglas | No es sinónimo de Auto-Tiering |
| PAR | Enlace de acceso preautorizado con alcance y vigencia | Protege el enlace como una credencial |
| Durability / availability | Conservar datos / poder acceder cuando se necesitan | Ninguna sustituye por sí sola un backup |
| iSCSI | Protocolo para conectar almacenamiento de bloques | Adjuntar no equivale a montar archivos |
| Online Resizing | Ampliación de volumen conectado | Puede requerir trabajo dentro del sistema operativo |
| Vault / key / secret | Servicio de gestión / material criptográfico / credencial u otro valor sensible | La clave cifra; el secreto almacena un valor protegido |
| Cloud Guard | Detectar riesgos y facilitar respuestas configuradas | No deniega preventivamente toda operación |
| Security Zone | Ámbito con políticas que pueden denegar operaciones incompatibles | No es una subred especial |
| WAF | Inspección y filtrado de solicitudes web | No sustituye la validación de la aplicación |
| Audit / Monitoring | Registro de acciones / métricas y alarmas | Quién hizo qué frente a cómo se comporta el recurso |
| Budget / quota / service limit | Umbral monetario / cantidad permitida / límite del servicio | Avisar no equivale a detener consumo |
| Cost Analysis / Cloud Advisor | Analizar gasto / obtener recomendaciones | Datos de consumo frente a propuestas de mejora |
| Defined tag | Etiqueta con namespace y definición administrados | Más gobernada que una free-form tag |
| BYOL / Support Rewards | Uso de licencias elegibles / beneficios sobre soporte elegible | Ambos dependen de sus condiciones |

Vuelve al [recorrido del curso]({{base}}1Z0-1085-26/overview/) o aplica las diferencias en la [práctica]({{base}}1Z0-1085-26/practice/).
