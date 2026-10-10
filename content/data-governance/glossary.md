Usa estas definiciones como vocabulario de trabajo. Un acuerdo empresarial debe añadir propietario, contexto y versión cuando un término pueda interpretarse de distintas maneras.

## Lenguaje de Gobierno

![Gobierno y Ejecución: Responsabilidades Distintas]({{base}}assets/diagrams/gov-glossary-roles.svg "El propietario aprueba significado, finalidad y excepciones y deja una decisión con alcance y fecha. El data steward documenta la definición y trata discrepancias. El custodio configura y opera accesos y ejecuciones con resultados comprobables. Una excepción de finalidad vuelve al propietario. Tener una cuenta administradora no concede autoridad para aprobar el uso empresarial.")

| Término | Significado en el taller | Distinción útil |
| --- | --- | --- |
| Gobierno de datos | Autoridad, decisiones y seguimiento sobre el uso de los datos | La gestión ejecuta las decisiones |
| Data owner / propietario | Responde por un dominio y sus decisiones de uso | No implica que administre la base |
| Data steward | Cuida definiciones, reglas y resolución de incidencias | No reemplaza al propietario en la aceptación del riesgo |
| Custodio | Implementa y opera controles técnicos | El permiso administrativo no confiere autoridad sobre todas las finalidades |
| Producto de datos | Datos con propósito, consumidores, responsable y condiciones de servicio | Una tabla aislada no expresa todos esos acuerdos |
| Contrato de datos | Acuerdo explícito sobre estructura, significado, calidad, acceso y cambios | Es más amplio que el esquema técnico |
| PII | Información que identifica o puede vincularse a una persona | Su tratamiento depende del contexto, combinación y política aplicable |
| Finalidad | Uso autorizado y definido para un dato | Un permiso de lectura no autoriza cualquier uso |
| Consentimiento | Registro de una elección para una finalidad y vigencia | No se resume en una marca universal para toda relación con un cliente |
| Dato maestro | Representación compartida de una entidad de negocio | Las transacciones describen eventos de esas entidades |
| Dato de referencia | Valores controlados que clasifican otros datos | Ejemplo: estados de contrato con vigencia |
| Golden record | Representación consolidada según reglas de correspondencia y supervivencia | No significa elegir todos los campos de la fila más reciente |
| Regla de calidad | Condición medible y contextual de aptitud | «Limpio» sin métrica ni umbral no permite decidir |
| SLA / SLO | Compromiso de servicio / objetivo medible de servicio | En el caso son acuerdos ficticios, no garantías de un producto |

Los ejemplos y definiciones son síntesis originales para este taller.

## Lenguaje de Implementación

![Dato, Metadatos y Evidencia]({{base}}assets/diagrams/gov-glossary-planes.svg "La factura F42, contrato C-104 e importe 100 son datos. Los metadatos explican qué significa total, el grano de la tabla, su responsable y la regla de cálculo. La evidencia registra una lectura con identidad, objeto, acción y resultado. Fecha e identificador de ejecución enlazan el evento con su contexto. Distingue lo registrado, su significado y lo que ocurrió sobre el activo.")

| Término | Significado en el taller | Distinción útil |
| --- | --- | --- |
| Oracle AI Data Platform | Ingeniería de datos y activos de IA | Plataforma que combina ingeniería y activos de IA con controles de acceso |
| Oracle Autonomous AI Lakehouse | Modalidad de Oracle Autonomous AI Database orientada a datos analíticos e IA | Su papel se explica por capacidad, no como sustituto de todo sistema origen |
| Catálogo | Organización de activos y sus metadatos | Cada producto tiene ámbito e interfaz propios |
| Glosario | Definiciones de negocio con contexto y responsables | Un listado de tablas no es un glosario empresarial |
| Metadato | Información que describe datos, estructuras, usos u operaciones | Puede ser empresarial, técnico u operacional |
| Linaje | Relaciones de procedencia y transformación | Linaje de entidad e historia de valores de una columna responden preguntas distintas |
| Análisis de impacto | Identificación de dependencias afectadas por un cambio | La cobertura depende de lo capturado por las herramientas |
| Ontología | Modelo de conceptos, relaciones y restricciones de un dominio | No equivale a renombrar columnas ni a un catálogo de servicios |
| Modelo semántico | Definiciones que vinculan datos con conceptos e indicadores | Requiere validación de negocio, aunque lo sugiera una IA |
| RBAC | Acceso basado en roles | Los privilegios heredados también cuentan en el acceso efectivo |
| CDC | Captura de cambios de un origen | Reducir latencia no valida calidad ni permisos |
| Federación | Acceso lógico a fuentes mediante conexiones configuradas | No implica copiar todo ni propagar automáticamente identidades |
| Iceberg REST catalog | Interfaz de catálogo para tablas Apache Iceberg | Gestionar metadatos no elimina el control del almacenamiento |
| Delta Sharing | Protocolo para compartir datos con receptores autorizados | No equivale a conceder acceso a todos los archivos de un workspace |
| Masking / redacción | Transformación de copias / ocultación de valores en consultas, según el mecanismo | Revisar persistencia y alcance; no intercambiar sus nombres sin explicar el efecto |
| RAG | Recuperación de información para fundamentar una respuesta generativa | Recuperar un fragmento no confirma autorización ni exactitud de la respuesta |
| Cuarentena | Separación de registros que incumplen criterios | Debe conservar motivo, responsable y camino de resolución |
| Preview | Capacidad habilitada en el ámbito publicado, aún con esa etiqueta | Su alcance depende de la versión y los requisitos documentados |
| Extensión implementada | Solución construida con servicios y lógica adicional | Su disponibilidad no convierte toda la solución en función nativa |
| Anunciada | Dirección o función comunicada sin disponibilidad operativa verificada | No sirve como prueba de un control ya ejecutable |

Las referencias de producto y su estado se mantienen en la [matriz de capacidades]({{base}}data-governance/oracle-map/). Usa esa matriz al discutir el [caso integrador]({{base}}data-governance/case-study/).
