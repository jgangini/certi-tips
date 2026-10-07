OCI Generative AI permite incorporar modelos gestionados a una aplicación. El servicio de inferencia, un modelo personalizado, la búsqueda vectorial y una consulta SQL tienen responsabilidades distintas.

**Objetivos:** reconocer Playground, modelos y endpoints; distinguir entrenamiento de hosting; relacionar AI Vector Search con RAG; y explicar cómo Select AI utiliza lenguaje natural sobre datos estructurados.

## Conceptos clave

Un modelo de **chat** genera una respuesta; un modelo **embedding** convierte contenido en una representación numérica. Las familias, versiones, regiones y modalidades admitidas cambian: comprueba el catálogo disponible para el caso de uso. Los nombres antiguos que aparecen en una demostración no son una lista exhaustiva actual.

El **Playground** permite explorar prompts y parámetros sin empezar por código. Cuando una prueba es útil, la integras mediante la API y el SDK correspondiente. Una prueba en consola no despliega automáticamente la aplicación completa.

![Comparación de Playground, modelo gestionado e integración mediante una API.]({{base}}assets/diagrams/aif-oci-gen-concepts.svg "Experimentar con un modelo y publicar una aplicación son pasos diferentes.")

Ajusta parámetros de uno en uno. **Temperature** influye en la distribución de muestreo; **top-p** limita candidatos por probabilidad acumulada; **top-k**, cuando está disponible, por cantidad. El límite de salida restringe longitud, no exactitud. Un preámbulo orienta conducta sin reentrenar pesos.

## Personalización y clusters dedicados

El servicio ofrece modelos preentrenados y opciones de personalización para modelos compatibles. En el flujo de fine-tuning presentado por el curso, preparas ejemplos, los guardas en Object Storage y usas cómputo de un **Dedicated AI Cluster** para entrenar. El resultado es un modelo personalizado; un recurso de hosting y un endpoint permiten servir inferencias.

![Separación entre ejemplos de entrenamiento, modelo personalizado y endpoint de inferencia.]({{base}}assets/diagrams/aif-oci-gen-tuning.svg "El bucket contiene ejemplos; el cluster aporta cómputo; el endpoint sirve inferencia.")

No confundas el **cluster de fine-tuning** con el de **hosting**. Uno ajusta el modelo y el otro atiende solicitudes. Métodos eficientes como T-Few o LoRA actualizan una parte de parámetros entrenables; su disponibilidad depende de la familia. Verifica formatos, permisos, evaluación, capacidad y costos antes de reproducir el laboratorio. Los ejercicios de esta guía no necesitan provisionarlos.

## AI Vector Search y Select AI

**AI Vector Search** almacena embeddings en columnas de tipo `VECTOR` junto con datos relacionales. Una función de distancia permite buscar similitud y combinarla con filtros de negocio. Los embeddings pueden generarse con un modelo ONNX compatible dentro de la base o mediante un servicio externo, según la configuración.

**Select AI** convierte preguntas en lenguaje natural en operaciones sobre datos estructurados mediante un perfil de IA, contexto de esquema y un LLM configurado. Puede devolver SQL, resultados o una narración según la acción. La consulta generada debe respetar los permisos y comprobarse; no es una búsqueda vectorial por definición.

![Diferencias entre búsqueda de fragmentos similares y generación de SQL sobre tablas.]({{base}}assets/diagrams/aif-oci-gen-data.svg "Vectores ayudan a recuperar significado; Select AI interpreta preguntas sobre datos.")

Ejemplos: «Busca instrucciones parecidas a este fallo» apunta a recuperación semántica; «Suma las reparaciones de septiembre por sede» necesita una consulta y agregación correctas. Para redactar una respuesta con documentos, RAG añade la generación después de recuperar. El tipo `VECTOR` por sí solo no redacta ni autoriza acceso.

## Ejemplo paso a paso

Un asistente debe explicar una política de reparación y consultar el número de órdenes abiertas.

1. Prueba el formato de respuesta en Playground con una política ficticia y sin datos personales.
2. Prepara documentos autorizados, fragmenta y genera embeddings compatibles con las consultas.
3. Recupera el fragmento pertinente y cita la versión utilizada.
4. Para contar órdenes, usa una consulta controlada o Select AI con tablas aprobadas; inspecciona SQL, filtros y resultados.
5. Entrega ambos resultados al modelo de chat, distinguiendo política documental de cifra calculada.
6. Evalúa preguntas ambiguas, fuentes ausentes y denegación de permisos antes de integrar la aplicación.

![Ejemplo de una respuesta que combina evidencia documental y un resultado SQL.]({{base}}assets/diagrams/aif-oci-gen-example.svg "Una política y un conteo requieren fuentes y comprobaciones diferentes.")

No uses fine-tuning para memorizar el número de órdenes: cambiará. Tampoco supongas que el proveedor del LLM recibe o conserva lo mismo en cualquier configuración; revisa el flujo de datos real.

## Errores frecuentes

- Confundir Object Storage con el cómputo que entrena el modelo.
- Tratar un endpoint como el conjunto de datos de entrenamiento.
- Afirmar que Select AI conoce todas las tablas sin un contexto y permisos adecuados.
- Comparar vectores generados en espacios incompatibles.
- Interpretar la precisión objetivo de un índice aproximado como garantía exacta para cada consulta.

![Separación entre almacenar ejemplos, entrenar y consultar el modelo desplegado.]({{base}}assets/diagrams/aif-oci-gen-errors.svg "Datos, entrenamiento e inferencia tienen recursos y objetivos propios.")

## Ejercicio de diseño

Un usuario pide «¿Cuántas órdenes de mi sede están pendientes?» y luego «¿Qué dice la política sobre demoras?». ¿Qué dos rutas de datos necesita el asistente?

<details>
<summary>Ver solución y explicación</summary>

La primera necesita una consulta estructurada con filtro de sede y estado, ejecutada con autorización. La segunda necesita recuperar la política vigente y usarla como evidencia. Puedes combinar las dos en una respuesta, pero no sustituir un conteo exacto por similitud vectorial ni asumir que recuperar un documento otorga acceso a todas las órdenes.

![Solución de conteo SQL autorizado y recuperación documental para una política.]({{base}}assets/diagrams/aif-oci-gen-exercise.svg "SQL para contar; recuperación documental para explicar una política.")

</details>

## Fuentes y repaso

![Repaso de modelos generativos, vectores y consultas en lenguaje natural.]({{base}}assets/diagrams/aif-oci-gen-recap.svg "Elige el recurso a partir de la operación que necesitas realizar.")

Consulta [OCI Generative AI](https://docs.oracle.com/en-us/iaas/Content/generative-ai/overview.htm), [AI Vector Search](https://docs.oracle.com/en/database/oracle/oracle-database/26/vecse/overview-ai-vector-search.html) y [Select AI](https://docs.oracle.com/en/cloud/paas/autonomous-database/serverless/adbsb/select-ai.html). El material usa tanto Oracle Database 23ai como Oracle AI Database 26ai; comprueba documentación y disponibilidad de tu versión.
