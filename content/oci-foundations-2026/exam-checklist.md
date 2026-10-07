El objetivo es razonar qué servicio resuelve una necesidad y reconocer el límite de cada alternativa. Saber reconocer un nombre no basta para justificarlo.

## Comprueba tu preparación

| Tema | Puedes avanzar cuando logres… |
| --- | --- |
| Arquitectura | Dibujar región, AD y FD; explicar el fallo que tolera una distribución y encontrar un recurso en la consola. |
| IAM | Leer quién, verbo, recurso y ámbito; distinguir administrador de identidades y permisos OCI; elegir un dynamic group. |
| Redes | Seguir una petición desde cliente a backend; elegir IGW, NAT, Service Gateway o DRG y separar rutas de seguridad. |
| Cómputo | Distinguir imagen, shape, configuración y pool; justificar escalamiento y elegir VM, contenedores u Functions. |
| Almacenamiento | Elegir interfaz por objetos, bloques o archivos; distinguir Auto-Tiering y Archive; explicar adjunto y montaje. |
| Seguridad | Asignar responsabilidades y escoger Security Zones, Cloud Guard, WAF o Vault por la acción requerida. |
| Gobierno | Distinguir alerta monetaria, cuota y límite; explicar costos por recursos y utilizar etiquetas y análisis. |

## Caso integrador

Sin mirar los módulos, dibuja una solución para Tienda Andina con dos servidores privados, entrada HTTPS pública, fotos en un bucket privado, salida a repositorios públicos, una operadora con lectura de instancias y un entorno de pruebas con recursos limitados.

Indica qué ocurre si falla una VM, cómo se autoriza a la aplicación para leer fotos, qué gateway usa cada destino, dónde persisten los datos, cómo se detecta una configuración peligrosa y qué sucede cuando se supera el presupuesto.

<details>
<summary>Comparar con una solución razonada</summary>

Una posibilidad es un Load Balancer público con health checks y backends privados en FD distintos, un pool según la necesidad de escalamiento, Service Gateway para Object Storage compatible y NAT para actualizaciones. La operadora recibe lectura en el compartimento apropiado; la aplicación usa una identidad de recurso autorizada. Los datos requieren persistencia y recuperación independientes de una VM. Cloud Guard detecta riesgos; Security Zones puede impedir operaciones incompatibles con su receta. Una cuota limita recursos de pruebas y un presupuesto avisa de gasto. El diseño todavía debe resolver una pérdida del AD o región si ese requisito existe.

No hay una única solución completa sin conocer carga, objetivos de recuperación y restricciones. Lo evaluable es que cada decisión responda al requisito y reconozca sus límites.

</details>

## Usar la práctica para estudiar

La [práctica interactiva]({{base}}1Z0-1085-26/practice/) tiene un banco de 42 preguntas originales y selecciona 14 por intento. Una meta de estudio es acertar **12 de 14** y explicar por qué las demás opciones no encajan. Es una referencia pedagógica, no una nota oficial ni una predicción de aprobación.

Revisa los errores, abre las secciones recomendadas y repite en otra sesión. Antes de volver a responder una pregunta, intenta formular la regla en una frase: “Budget avisa; quota restringe cantidades”, por ejemplo. No memorices el orden de opciones.

## Continuar en Oracle MyLearn

1. Abre la [ruta oficial de OCI Foundations Associate](https://mylearn.oracle.com/ou/learning-path/-become-an-oci-foundations-associate-2026/163541) y verifica el código **1Z0-1085-26**.
2. Completa las lecciones, demostraciones y skill checks; usa esta guía para sintetizar y practicar.
3. Revisa **Exam Topics** y la preparación de la edición que vas a rendir. La organización de esta guía no define los pesos oficiales.
4. Realiza la práctica oficial y confirma dentro de MyLearn duración, cantidad de preguntas, nota mínima, idioma y modalidad vigentes.
5. Sigue las instrucciones de acceso al examen que presente Oracle. Evita trasladar condiciones de ediciones anteriores sin comprobarlas.

Consulta las condiciones vigentes en MyLearn antes de inscribirte; el formato de nuestra práctica es una decisión pedagógica de esta guía.
