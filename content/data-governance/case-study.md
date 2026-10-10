**Operadora Horizonte** necesita un producto de datos para facturación confiable, indicadores comerciales y atención asistida por IA. El comité solicita una propuesta que negocio pueda aprobar y que ingeniería pueda demostrar. Todo el caso es ficticio y se resuelve mediante discusión, sin acceso a una consola.

## El Encargo y las Restricciones

![La Identidad Conecta Contratos, Usos y Transacciones]({{base}}assets/diagrams/gov-case-assets.svg "La identidad P7 enlaza contratos, consentimientos por finalidad y transacciones. C-104 tiene facturas y documentos versionados; el indicador cuenta personas con al menos un contrato vigente al corte. Conserva las relaciones sin multiplicar personas por sus facturas. La identidad de la persona, la vigencia del contrato y el permiso para una finalidad son condiciones distintas del caso.")

Hay 10 000 registros de clientes y 12 400 contratos. Una persona puede tener varios contratos. Dos sistemas usan claves diferentes y algunos números de teléfono son compartidos. La fecha de nacimiento falta en 700 registros; no es un dato requerido para este producto. En cambio, 120 contratos no tienen una referencia válida al cliente. Un dashboard llama «activos» a los clientes con cualquier contrato y otro exige contrato vigente al cierre del día.

La propuesta debe respetar estas condiciones del caso:

- **Facturación:** procesar solo relaciones válidas entre contrato y cliente; conservar y resolver los rechazos.
- **Analítica:** publicar «cliente activo al cierre» con definición, fecha de corte y reconciliación.
- **Atención:** mostrar a un agente autorizado únicamente lo necesario para el caso asignado.
- **IA:** fundamentar respuestas en documentos aprobados y vigentes; escalar ambigüedades a una persona.
- **Consentimiento:** distinguir finalidades, revocaciones y vigencia. No inferir permiso de marketing a partir de un contrato activo.
- **Operación:** objetivo ficticio de frescura de 30 minutos para cambios contractuales, recuperación acordada y gasto atribuible por producto.

La latencia, el volumen y los umbrales son supuestos de enseñanza. La evaluación real exige medirlos con las fuentes y requisitos propios de cada organización.

## Tu Propuesta para el Comité

![Qué Debe Demostrar la Propuesta]({{base}}assets/diagrams/gov-case-decisions.svg "Cada fila enlaza una decisión de la propuesta con evidencia, responsable y revisión. Comprueba definición y finalidad, claves y vigencias, acceso mínimo efectivo, calidad y recuperación, y viabilidad con consumo atribuible. El artefacto debe demostrar la decisión, no solo mencionarla. Si falta evidencia, devuelve esa parte de la propuesta para completarla con el responsable correspondiente.")

Desarrolla tu propuesta usando la [matriz DAMA → Oracle]({{base}}data-governance/oracle-map/). Para cada decisión, indica **responsable, control, evidencia y reacción ante el incumplimiento**.

| Área | Pregunta que debe responder la propuesta |
| --- | --- |
| Gobierno | ¿Quién aprueba la definición y las excepciones de uso? |
| Arquitectura | ¿Qué papel desempeñan Oracle AI Data Platform y Oracle Autonomous AI Lakehouse y qué conexiones debes validar? |
| Modelado | ¿Cómo representas cliente, contrato y consentimiento sin duplicar significados? |
| Operaciones | ¿Cómo detectas retrasos, recuperas una versión y atribuyes el gasto? |
| Seguridad | ¿Qué ve cada perfil y cómo verificas sus permisos efectivos? |
| Integración | ¿Cómo detectas duplicados, reintentos y cambios tardíos? |
| Documentos | ¿Cómo llega un documento vigente a la IA y cómo deja de utilizarse? |
| Maestros | ¿Qué atributos vinculan registros y qué conflictos requieren revisión humana? |
| DW y BI | ¿Cuál es el grano del indicador y cómo evitas multiplicar importes al unir tablas? |
| Metadatos | ¿Cómo identificas consumidores afectados por un cambio de contrato? |
| Calidad | ¿Por qué bloqueas los 120 contratos y no descartas los 700 clientes sin fecha de nacimiento? |

No se evalúa recordar nombres comerciales. Una buena respuesta conecta la finalidad con el mecanismo y reconoce las condiciones para demostrar que funciona.

## Solución Razonada

<details>
<summary>Ver una propuesta posible y sus límites</summary>

![Superar una Regla No Autoriza Todavía la Publicación]({{base}}assets/diagrams/gov-case-solution.svg "De 12 400 contratos, 12 280 tienen referencia válida y 120 se conservan en cuarentena: esa regla alcanza el 99,03 %. El porcentaje no autoriza por sí solo la publicación. También se comprueban las otras reglas, el acceso efectivo y la aprobación. Los rechazados conservan motivo, responsable y resolución; se corrigen en origen y vuelven a validar antes de incorporarlos al producto.")

El **propietario comercial** aprueba «cliente activo al cierre» como una persona con al menos un contrato vigente a la fecha de corte. El steward registra la definición y sus excepciones. Ingeniería modela claves de origen, correspondencias y vigencias; un teléfono compartido no se convierte en identificador universal.

**Oracle AI Data Platform** coordina ingestión y transformaciones con permisos por rol. Oracle Cloud Infrastructure GoldenGate es una opción si los orígenes y el objetivo de frescura justifican CDC; un lote también puede cumplir si su duración y frecuencia lo demuestran. El control de frescura compara la marca de origen con la publicación, incluyendo retrasos y reintentos. El último dato cargado no garantiza que todos los cambios estén presentes.

Las reglas de calidad se implementan sobre los datos: los 120 contratos sin cliente válido van a **cuarentena**, con motivo y propietario de resolución. Los 700 clientes sin fecha de nacimiento permanecen si cumplen las reglas del producto; exigir un dato innecesario añadiría fricción y exposición. El resultado de esa regla concreta es 12 280 contratos con referencia válida de 12 400, aproximadamente **99,03 %**. Eso no demuestra que las otras dimensiones de calidad estén satisfechas.

**Oracle Autonomous AI Lakehouse** sirve estructuras SQL con grano explícito. Facturas e importes no se unen directamente a todos los consentimientos para calcular ingresos, porque esa relación puede multiplicar filas. El indicador de clientes usa la regla de existencia de un contrato vigente y se reconcilia con una muestra conocida. Oracle Analytics Cloud publica la definición aprobada; sus asistentes Preview ayudan al trabajo en su alcance habilitado, con revisión humana de resultados.

**Seguridad** distingue operador de plataforma, ingeniero, steward, analista, agente de atención y auditor. Cada acceso se verifica desde su identidad efectiva, incluidas herencias y credenciales de conexiones externas. Oracle Data Safe puede preparar copias protegidas de bases soportadas. Los controles de fila o columna se aplican en el motor que los soporte; no se atribuyen por analogía a todos los catálogos. Una extensión sobre Oracle AI Data Platform para clasificación y protección mantiene aprobaciones humanas y evidencia de su lógica.

El **propietario documental** publica únicamente condiciones comerciales vigentes y aprobadas en la base de conocimiento. Mantiene un inventario de versiones, procedimiento de retirada y verificación de reingestión. El asistente necesita autorización para recuperar contenido y para cualquier acción posterior; RAG no concede esas autorizaciones.

**Metadatos** registra definiciones, identificadores, responsables y conexiones. El linaje de Oracle AI Data Platform Preview ayuda a analizar el impacto de cambios sobre los artefactos capturados. Para reconstruir decisiones históricas, el equipo conserva además versiones y aprobaciones, porque el grafo operativo no sustituye todo ese historial.

**Operaciones y FinOps** revisan ejecuciones, alertas, recuperación y gasto etiquetado. Una alerta presupuestaria abre una revisión del consumo; no detiene por sí sola la plataforma. Un proceso acordado decide qué trabajo reprogramar sin perder la evidencia ni incumplir los servicios prioritarios.

Oracle Fusion Cloud Enterprise Data Management se evalúa cuando la gestión del dominio maestro, sus aprobaciones y match/merge justifican sus requisitos y escala. No es obligatorio incorporarlo para resolver cada duplicado de una tabla. La arquitectura conserva el criterio DAMA aunque cambie la herramienta.

</details>

## Criterios de Aceptación y Cierre

![Cómo Evaluar una Propuesta]({{base}}assets/diagrams/gov-case-rubric.svg "La rúbrica puntúa responsabilidad, significado, protección, confiabilidad y viabilidad de 0 a 2: ausente, mencionado o demostrado. Decir «hay permisos por rol» obtiene 1 en protección; una prueba de acceso permitido y administración no concedida, con identidad y resultado, permite demostrarla. Usa la meta pedagógica de 8/10 sin omitir responsabilidad ni protección, y explica qué evidencia sostiene cada puntuación.")

Asigna de cero a dos puntos a cada criterio: cero si falta, uno si se menciona y dos si se explica con un ejemplo verificable.

| Criterio | Evidencia de una respuesta completa |
| --- | --- |
| Responsabilidad | Propietario y steward identificados; aprobaciones y excepciones con seguimiento |
| Significado | Entidades, finalidad, vigencia y grano coherentes entre ejemplos e indicadores |
| Protección | Accesos efectivos comprobables; tratamiento de PII y documentos según contexto |
| Confiabilidad | Reglas, cuarentena, frescura, recuperación e impacto de cambios con evidencia |
| Viabilidad | Controles aplicables, requisitos verificados y gasto atribuido |

Una meta pedagógica es **ocho de diez puntos**, sin omitir protección ni responsabilidad. No es un umbral oficial de certificación. Repite la explicación con un cambio: un cliente revoca marketing mientras conserva un contrato vigente. Debes poder mostrar qué uso cambia, qué operación continúa y qué evidencia demostraría ambas decisiones.

Completa la [práctica de 22 preguntas]({{base}}data-governance/practice/) y vuelve a las secciones enlazadas desde los errores. El cierre del taller es la capacidad de defender y revisar una propuesta, no la memorización de una lista de productos.
