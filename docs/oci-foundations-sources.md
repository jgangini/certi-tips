# OCI Foundations Associate · revisión editorial

Fecha: 7 de octubre de 2026. Curso: `oci-foundations-2026`, examen `1Z0-1085-26`.

## Alcance y trazabilidad

57 lecciones aportadas: 2 de orientación, 3 de introducción OCI, 11 de IAM, 8 de red, 9 de cómputo, 9 de almacenamiento, 8 de seguridad y 7 de gobierno. `data/coverage-oci-foundations.json` enlaza cada lección con una sección real. Las demostraciones se sintetizan como decisiones y comprobaciones; no se presentan como laboratorios que el lector haya ejecutado. La guía no publica transcripciones ni rutas personales.

La secuencia de siete módulos técnicos comparte estructura con Agentic AI y AI Foundations: objetivos, tres bloques de enseñanza, ejemplo, errores, ejercicio con solución y repaso. Son 49 diagramas SVG originales y 42 preguntas originales, seis por módulo. Cada intento selecciona 14. La organización y meta de estudio no representan ponderaciones ni nota oficial.

## Fuentes primarias

- [Ruta oficial MyLearn](https://mylearn.oracle.com/ou/learning-path/-become-an-oci-foundations-associate-2026/163541): referencia de edición y acceso. La página pública no expuso detalles del examen al lector automatizado; no se afirman duración, nota mínima ni número oficial de preguntas.
- [Regiones, AD y FD](https://docs.oracle.com/en-us/iaas/Content/General/Concepts/regions.htm): jerarquía, tres FD por AD y variación del número de AD por región.
- [IAM y referencia de permisos](https://docs.oracle.com/en-us/iaas/Content/Identity/policyreference/iampolicyreference.htm): autorización por principal, verbo, recurso y ámbito; los roles de dominio no se equiparan a permisos universales sobre recursos.
- [Tablas de rutas](https://docs.oracle.com/en-us/iaas/Content/Network/Tasks/managingroutetables.htm): rutas hacia fuera y escenarios de enrutamiento dentro de la VCN.
- [Políticas de Load Balancer](https://docs.oracle.com/en-us/iaas/Content/Balance/Reference/lbpolicies.htm): Round Robin, Least Connections, IP Hash y pesos de backend.
- [Migración de instancias](https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/movinganinstance.htm): VM compatible entre hosts y posible pausa breve.
- [Niveles de Object Storage](https://docs.oracle.com/en-us/iaas/Content/Object/Concepts/understandingstoragetiers.htm): Auto-Tiering Standard ↔ Infrequent Access; Archive se trata por separado.
- [Ampliación de volúmenes](https://docs.oracle.com/en-us/iaas/Content/Block/Tasks/resizingavolume.htm): aumento de capacidad y tareas del sistema operativo.
- [Modelo de seguridad](https://docs.oracle.com/en-us/iaas/Content/Security/Concepts/security_overview.htm): responsabilidad compartida y controles del cliente.
- [Budgets](https://docs.oracle.com/en-us/iaas/Content/Billing/Concepts/budgetsoverview.htm): umbrales informativos y alertas; no detención automática.
- [Cuotas](https://docs.oracle.com/en-us/iaas/Content/Quotas/Concepts/resourcequotas.htm), [precios de red](https://www.oracle.com/cloud/networking/pricing/) y [Support Rewards](https://www.oracle.com/cloud/rewards/): no se incluyen tarifas numéricas ni promesas de elegibilidad universal.

## Correcciones respecto del cuestionario aportado

| Pregunta o simplificación | Tratamiento en la guía |
| --- | --- |
| 19: Load Balancer solo L7 frente a NLB L4 | Se conserva la orientación y se aclara TCP en Load Balancer y capacidades L3/4 de NLB. |
| 23: pesos no soportados | Se explica que los pesos de backend sí están disponibles; ejemplo con razón 1:3. |
| 24: Live Migration sin ninguna interrupción y entre cualquier dominio | Se delimita a hosts físicos, compatibilidad y posible pausa breve. |
| 28: Auto-Tiering usa lifecycle hacia Archive | Se separa Auto-Tiering de lifecycle; coincide con la distinción correcta de la pregunta 39. |
| 40: route tables solo sirven para salir de una VCN | Se añade conectividad local implícita y enrutamiento configurable dentro de VCN. |
| Presupuesto como control absoluto del gasto | Se indica explícitamente que no apaga recursos. |
| Administrar el dominio equivale a administrar la tenancy | Se explica la autorización de recursos mediante políticas independientes. |
| Ampliación del volumen implica espacio utilizable inmediato | Se distingue volumen, dispositivo, partición y sistema de archivos. |

Los ejemplos de cantidades, umbrales y curvas son didácticos, no cuotas o tarifas del proveedor. Las preguntas propias requieren escoger por requisitos, incluyen cuatro explicaciones y enlazan el apartado de repaso.
