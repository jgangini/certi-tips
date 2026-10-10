Horizonte necesita que Atención vea información suficiente para resolver consultas, que Finanzas concilie cobros y que los analistas trabajen sin recibir datos personales innecesarios. Proteger el dato exige relacionar propósito, identidad, alcance y evidencia.

## Conceptos Clave

La seguridad de datos protege **confidencialidad**, **integridad** y **disponibilidad**. Evitar lectura indebida no basta si alguien modifica facturas sin autorización o si los usuarios autorizados no pueden acceder cuando lo necesitan. El programa parte de riesgos y del valor del dato para cada proceso.

**Autenticar** confirma una identidad. **Autorizar** determina qué puede hacer en un contexto. **Cifrar** protege el contenido mediante claves. **Auditar** conserva evidencia de actividad. Una conexión cifrada puede transportar una consulta excesivamente privilegiada: los mecanismos se complementan y no deben intercambiarse en la explicación.

El **mínimo privilegio** concede lo necesario para una tarea. La **minimización** reduce los datos tratados para el propósito. Un analista puede necesitar importes por segmento y periodo sin necesitar nombres, documentos de identidad ni direcciones. Una cuenta autorizada no implica permiso para cualquier uso futuro.

![Cuatro Controles Sobre la Misma Consulta]({{base}}assets/diagrams/gov-data-security-concepts.svg "La misma consulta necesita controles complementarios. Autenticar comprueba quién actúa; autorizar determina si puede leer contratos; cifrar protege el contenido del canal; y auditar conserva evidencia del evento observado. El registro enlaza identidad, acción, objeto y resultado. Ninguno de estos controles sustituye la comprobación de los otros ni la finalidad acordada para usar los datos.")

## Acceso, Protección y Evidencia

La clasificación relaciona sensibilidad y contexto con controles. No todo dato público tiene cualquier uso permitido; una combinación de atributos puede permitir identificar personas. El responsable define categorías útiles, las revisa y establece tratamiento para copias, exportaciones y derivados.

**Enmascarar** modifica o sustituye valores sensibles; **subsetting** selecciona un subconjunto representativo. Reducir filas no oculta automáticamente la identidad, y enmascarar columnas no reduce necesariamente el volumen. En pruebas puede hacer falta combinar ambos, conservando las relaciones necesarias y evaluando el riesgo residual.

La segregación de funciones evita concentrar decisiones incompatibles: quien administra permisos no tiene por qué aprobar su propio acceso excepcional. La revisión de accesos y el manejo de excepciones forman parte del ciclo. Cada autorización debe tener alcance, motivo y un mecanismo de revisión adecuado al riesgo.

![Seleccionar Filas y Proteger Valores]({{base}}assets/diagrams/gov-data-security-principles.svg "El conjunto original tiene cuatro clientes. El subsetting selecciona C7 y C8 y reduce el conjunto a dos filas. El masking sustituye los nombres sensibles, mientras conserva contratos e importes necesarios para la prueba. Comprueba por separado qué filas se incluyen y cómo se protegen los valores: reducir la población no equivale a proteger los datos que permanecen.")

## Seguridad en Oracle AI Data Platform

Configura el acceso al servicio con **Oracle Cloud Infrastructure Identity and Access Management** y asigna en Oracle AI Data Platform los [permisos sobre cada objeto](https://docs.oracle.com/en/cloud/paas/ai-data-platform/aidug/permissions-model.html). Para el analista de Horizonte, concede lectura del producto autorizado y revisa los permisos heredados; para ingeniería, asigna las acciones necesarias sobre los procesos de carga. Usa [Audit Log](https://docs.oracle.com/en/cloud/paas/ai-data-platform/aidug/audit-log.html) para consultar las operaciones registradas y relacionarlas con identidad, objeto y resultado.

Para proteger atributos sensibles durante la preparación, implementa el [flujo de gobierno de datos sensibles sobre Oracle AI Data Platform](https://blogs.oracle.com/cloud-infrastructure/aidp-sensitive-data-governance). Configura reglas de clasificación y tratamiento, presenta las recomendaciones al steward y aplica las decisiones aprobadas mediante vistas protegidas o copias enmascaradas. Publica esos resultados con permisos por rol y compara periódicamente la configuración con la política aprobada. Este flujo conecta la clasificación y el mínimo privilegio de DAMA con tareas de ingeniería y evidencia de su cumplimiento.

En **Oracle Data Safe**, registra una copia de la base de datos destinada a pruebas y configura [Data Subsetting](https://docs.oracle.com/en-us/iaas/data-safe/doc/data-subsetting-overview.html): selecciona la tabla inicial, los filtros y el tratamiento de las tablas relacionadas. Combina la política con masking para reducir filas y proteger valores. Revisa el informe del trabajo y comprueba que clientes, contratos y facturas conservan las relaciones necesarias para la prueba.

![Cada Ámbito Comprueba su Permiso]({{base}}assets/diagrams/gov-data-security-oracle.svg "Configura acceso a plataforma, permisos sobre objetos e identidad de conexión a la fuente. Los bloques corresponden a Oracle Cloud Infrastructure Identity and Access Management, Oracle AI Data Platform y Oracle Autonomous AI Database. El flujo de protección aplica reglas aprobadas por el steward; Oracle Data Safe trabaja sobre el destino registrado. Prueba el acceso con cada perfil y conserva los resultados como evidencia de los controles aplicados.")

## Ejemplo Explicado

El equipo de pruebas de Horizonte solicita una copia completa de clientes y facturas. Su objetivo es comprobar conciliación y relaciones, no identificar personas reales. El owner acuerda un conjunto representativo con casos normales y excepciones; el custodio conserva las relaciones cliente–contrato–factura y protege los atributos sensibles.

En una base compatible, Oracle Data Safe puede ayudar con subsetting y masking. Para otros activos se diseña el tratamiento correspondiente. Antes de entregar, el equipo verifica que el conjunto permite probar el escenario y que no expone identificadores innecesarios. La aprobación y las comprobaciones quedan registradas; llamar «pruebas» al entorno no modifica el riesgo del contenido.

![La Protección Conserva las Relaciones Necesarias]({{base}}assets/diagrams/gov-data-security-example.svg "Compara el original con el conjunto de prueba. El cliente C7 se sustituye por P7 y el contrato C3 actualiza su referencia al cliente protegido. La factura F42 sigue apuntando a C3 y conserva el importe 100. El recorrido P7 → C3 → F42 permite verificar que la protección de identidad mantiene las relaciones y la conciliación requeridas para la prueba.")

## Errores Frecuentes

- **Cifrado equivale a autorización correcta.** Revisa identidades, roles y alcance de lectura o modificación.
- **Una muestra pequeña es anónima.** Puede conservar identificadores y combinaciones sensibles.
- **Una propuesta generada por IA es una política aprobada.** El responsable debe validar alcance, excepciones y aplicación.

## Ejercicio de Decisión

Un asistente de Atención tiene acceso al workspace y necesita consultar contratos. El equipo propone darle permisos de administrador porque la conexión ya usa cifrado. ¿Qué decisión reduce el riesgo y conserva el objetivo?

<details>
<summary>Solución</summary>

Definir la consulta necesaria, otorgar el permiso mínimo sobre datos y herramientas, revisar la identidad efectiva de la conexión y comprobar el resultado. El cifrado no justifica administración general. Debe quedar evidencia del acceso y una revisión acorde con el uso; los permisos del workspace por sí solos no describen toda la autorización.

![El Permiso Sigue la Tarea del Asistente]({{base}}assets/diagrams/gov-data-security-exercise.svg "El asistente de Atención necesita consultar contratos autorizados para resolver consultas. La matriz permite esa acción y excluye administrar la plataforma o modificar roles. Comprueba la identidad efectiva usada por la conexión del agente y el alcance real de los datos accesibles. Conserva evidencia del acceso observado para contrastarlo con la tarea y los permisos acordados.")

</details>
