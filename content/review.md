Este repaso funciona mejor con el material cerrado. Intenta responder cada pregunta en voz alta y después consulta el módulo correspondiente. Saber explicar una diferencia ayuda más que recordar una sigla aislada.

## Seis distinciones que debes dominar

| Área | La distinción | Pregunta para comprobarla |
| --- | --- | --- |
| [Agentes]({{base}}agentic-ai-foundations-2026/agents/) | Proponer una acción y ejecutarla son pasos distintos. | ¿Quién valida los argumentos y quién realiza la operación? |
| [LangChain]({{base}}agentic-ai-foundations-2026/langchain/) | Una cadena fija y un ciclo con decisiones no son lo mismo. | ¿El siguiente paso está predefinido o depende de la salida del modelo? |
| [MCP]({{base}}agentic-ai-foundations-2026/mcp/) | Estandarizar la conexión no resuelve el razonamiento ni la autorización. | ¿Qué componente descubre y llama capacidades externas? |
| [OpenAI]({{base}}agentic-ai-foundations-2026/openai/) | La API y el SDK operan en capas diferentes. | ¿Necesito control directo de llamadas o coordinación de agentes? |
| [OCI]({{base}}agentic-ai-foundations-2026/oci-enterprise/) | Un runtime administrado no define automáticamente una política de negocio correcta. | ¿Qué gestiona el servicio y qué debo evaluar y configurar yo? |
| [Database]({{base}}agentic-ai-foundations-2026/oracle-database/) | Recuperar contexto, generar SQL y ejecutar tareas son capacidades distintas. | ¿Busco pasajes relevantes, una consulta o una acción controlada? |

## Sigue una solicitud de extremo a extremo

Una persona pregunta: “¿Puedo devolver mi pedido y cuánto me reembolsarían?”. Distingue cinco pasos:

1. **Entender la solicitud.** El modelo identifica la intención y qué datos faltan.
2. **Consultar información.** La aplicación puede recuperar la política vigente y consultar el pedido con herramientas autorizadas.
3. **Integrar observaciones.** Los resultados regresan al ciclo; una respuesta de herramienta sigue siendo información que se debe interpretar y validar.
4. **Controlar acciones sensibles.** Explicar una política no es emitir un reembolso. La ejecución requiere autorización, argumentos válidos y los controles establecidos.
5. **Responder y dejar evidencia operativa.** Comunicar el resultado real, conservar trazabilidad adecuada y no afirmar que se ejecutó algo si solo se propuso.

<details>
<summary>¿Dónde encajan las seis áreas?</summary>

El ciclo explica el agente. LangChain o Agents SDK pueden coordinarlo. MCP puede conectar una herramienta compartida de pedidos. Un runtime OCI aporta capacidades de operación según la opción elegida. Vector Search puede recuperar políticas, mientras herramientas de base de datos consultan o actúan sobre datos con permisos. Ninguna pieza sustituye a todas las demás.

</details>

## Errores de interpretación frecuentes

- **“El modelo llamó a Python, entonces ya ejecutó la función.”** Comprueba la ejecución en la aplicación y su resultado.
- **“Hay guardrails, por eso toda la aplicación es segura.”** Revisa alcance, permisos, validación de argumentos, salidas y límites.
- **“MCP hace interoperables todos los comportamientos.”** El protocolo facilita la integración; herramientas, autenticación y capacidades deben seguir siendo compatibles.
- **“El vector más cercano contiene la respuesta verdadera.”** La similitud sirve para recuperar candidatos, no para certificar sus hechos.
- **“Un handoff es una llamada normal a una función.”** Examina qué agente conserva el control de la conversación.
- **“Al alojar un agente ya evalué su calidad.”** Despliegue y evaluación resuelven problemas diferentes.

## Cómo resolver una pregunta por escenario

Subraya mentalmente la restricción: **datos**, **acción**, **protocolo**, **control del flujo**, **seguridad** u **operación**. Busca la alternativa que resuelve esa necesidad concreta. Desconfía de opciones que atribuyen a una sola pieza todas las responsabilidades o usan absolutos como “siempre”, “sin permisos” o “automáticamente seguro”.

Explica también por qué descartas las otras opciones. Si solo reconoces una palabra del enunciado, todavía hay una oportunidad de repasar.

## Antes de cerrar tus apuntes

Comprueba que puedes dibujar un ciclo, situar host/cliente/servidor MCP, justificar API frente a SDK, delimitar un runtime y explicar cómo se generan y usan embeddings. Después realiza una [práctica de 12 preguntas]({{base}}agentic-ai-foundations-2026/practice/) y termina con la [práctica oficial de Oracle](https://mylearn.oracle.com/ou/course/practice-exam-oci-agentic-ai-associate-certification/163247).
