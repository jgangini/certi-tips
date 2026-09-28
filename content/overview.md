Entender un agente significa poder seguir una petición desde la intención del usuario hasta una acción comprobable. Esta ruta conecta esa idea con LangChain, MCP, OpenAI, OCI y Oracle AI Database, y termina con una práctica que explica cada respuesta.

## Conceptos clave

La certificación evalúa fundamentos y decisiones de diseño. Aprender nombres de servicios ayuda, pero debes distinguir quién propone una acción, quién la ejecuta, qué datos recibe y dónde se aplican los permisos. Usaremos un caso común: un asistente de soporte que consulta pedidos, busca políticas y deriva incidencias. Así podrás comparar tecnologías sobre el mismo problema.

![Ruta desde los prerrequisitos hasta las seis áreas técnicas, la práctica y el examen oficial.]({{base}}assets/diagrams/certification-roadmap.svg)

## Objetivos y examen

Al terminar podrás explicar el ciclo de un agente; seguir llamadas a herramientas; distinguir un protocolo de un framework; elegir un patrón de delegación; y relacionar runtime, datos y seguridad con las capacidades de Oracle.

| Dato | Información verificada |
| --- | --- |
| Examen | Oracle Agentic AI Foundations Associate 2026 |
| Código | 1Z0-1157-26 |
| Preguntas | 40 |
| Tiempo | 60 minutos |
| Aprobación | 65% |
| Verificación editorial | 28 de septiembre de 2026 |

Oracle publica estos datos y ofrece curso, comprobaciones de conocimientos y examen de práctica en la [presentación oficial de la certificación](https://blogs.oracle.com/oracleuniversity/oracle-agentic-ai-foundations-training-certification-now-available). Revisa MyLearn antes de inscribirte por si cambian las condiciones. Esta guía es independiente; su práctica contiene preguntas originales y no reproduce preguntas del examen. No asignamos porcentajes de ponderación a temas que Oracle no publica en esa fuente.

## Antes de comenzar

Necesitas una idea básica de qué hace un **LLM**: procesa contexto y genera salidas, pero puede equivocarse. Debes reconocer una función Python, parámetros, tipos, diccionarios y una excepción. Para OCI, basta inicialmente con distinguir una **tenancy**, una región, un compartment y una política IAM. Los ejercicios de comprensión de esta guía se pueden resolver sin crear recursos ni pagar llamadas API.

Comprueba tres puntos: ¿puedes explicar por qué una respuesta fluida no garantiza exactitud?, ¿puedes seguir el resultado de una función hasta la siguiente?, ¿sabes por qué una aplicación debe recibir permisos explícitos? Si alguno cuesta, usa el glosario y repite el ejemplo del primer módulo antes de avanzar.

## Cómo recorrer la guía

1. Lee [Agentes y seguridad]({{base}}agentic-ai-foundations-2026/agents/#conceptos-clave) para identificar modelo, herramientas y loop.
2. Sigue [LangChain]({{base}}agentic-ai-foundations-2026/langchain/#conceptos-clave) y observa el intercambio de mensajes.
3. Estudia [MCP]({{base}}agentic-ai-foundations-2026/mcp/#conceptos-clave): integrar herramientas no equivale a implementar razonamiento.
4. Compara [Responses API y Agents SDK]({{base}}agentic-ai-foundations-2026/openai/#conceptos-clave), especialmente handoffs y guardrails.
5. Lleva el diseño a [OCI Enterprise AI]({{base}}agentic-ai-foundations-2026/oci-enterprise/#conceptos-clave).
6. Conecta los datos en [Oracle AI Database]({{base}}agentic-ai-foundations-2026/oracle-database/#conceptos-clave).

En cada capítulo, explica el diagrama en voz alta, resuelve el ejercicio antes de desplegar la solución y anota una confusión que hayas corregido. Marcar una página como completada registra tu avance; no mide dominio por sí solo.

## Ejemplo de una sesión de estudio

Dedica cinco minutos a recordar el tema anterior sin consultar apuntes. Después, lee el capítulo y dibuja sobre papel las responsabilidades del caso de soporte. Formula una petición diferente: si antes consultaste un pedido, ahora pide cancelar uno. Identifica qué nueva autorización hace falta. Finalmente, responde el ejercicio y escribe por qué descartaste las otras alternativas. Este cambio de escenario evita depender de la memoria de una única demostración.

## Errores frecuentes

- Confundir haber visto un video con poder explicar su mecanismo.
- Memorizar pantallas de una consola sin entender recursos, permisos y flujo de datos.
- Interpretar 10/12 en nuestra práctica como una garantía de aprobar. Es una meta orientativa para detectar qué repasar.
- Ignorar los temas de seguridad por parecer menos técnicos: son parte del diseño de agentes.

## Ejercicio de orientación

Un asistente responde correctamente una pregunta general, pero inventa el estado de un pedido. ¿Qué capacidad falta y qué debes comprobar antes de conectarla?

<details>
<summary>Ver solución y explicación</summary>

Falta consultar una fuente autorizada mediante una herramienta, por ejemplo una API de pedidos. Antes de conectarla, define identidad, permisos de lectura, validación del identificador y tratamiento de errores. Darle una instrucción más enfática para que “no invente” no sustituye el acceso a datos reales ni esos controles.

</details>

## Acceso al recorrido oficial

Abre [Oracle MyLearn: curso Agentic AI Foundations 2026](https://mylearn.oracle.com/ou/course/oracle-agentic-ai-foundations-2026/163240/273946), inicia sesión con tu cuenta Oracle y localiza la ruta de aprendizaje correspondiente al código 1Z0-1157-26. Completa los módulos y sus skill checks, revisa el temario oficial y utiliza la práctica oficial antes de seleccionar el examen. La publicación de Oracle enlaza esos recursos; la disponibilidad y los pasos de acceso se confirman dentro de tu cuenta.
