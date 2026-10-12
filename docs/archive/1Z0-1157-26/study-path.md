Aprender un tema no es lo mismo que reconocer una frase. En cada sesión vas a producir algo pequeño: un diagrama explicado, una decisión justificada o un caso resuelto. Calcula entre 45 y 75 minutos por sesión; ajusta el ritmo según tus conocimientos de Python, LLM y OCI.

## Antes de empezar

Revisa [tu punto de partida]({{base}}1Z0-1157-26/overview/). Si no puedes explicar qué es una inferencia, leer una función Python o distinguir una API de una interfaz web, dedica primero tiempo a esos conceptos. No necesitas crear recursos de pago para realizar los ejercicios conceptuales de CertiTips.

Abre un documento de notas con tres columnas: **lo que entiendo**, **lo que confundo** y **cómo lo comprobaré**. Después de cada sesión, transforma al menos una duda en una explicación con tus palabras.

## Siete sesiones con un entregable

| Sesión | Qué estudiar | Qué debes poder demostrar |
| --- | --- | --- |
| 1 · Del chat a la acción | Introducción y [agentes]({{base}}1Z0-1157-26/agents/) | Dibujar un ciclo con dos llamadas a herramientas y una condición de parada. Explicar quién ejecuta cada llamada. |
| 2 · Orquestación | [LangChain]({{base}}1Z0-1157-26/langchain/) | Diferenciar una cadena fija de un agente. Seguir el estado de un cálculo en varios pasos. |
| 3 · Interoperabilidad | [MCP]({{base}}1Z0-1157-26/mcp/) | Ubicar host, cliente y servidor; clasificar una herramienta, un recurso y un prompt. |
| 4 · Elegir una capa | [Responses API y Agents SDK]({{base}}1Z0-1157-26/openai/) | Justificar cuándo usar cada capa y cuándo un handoff tiene sentido. |
| 5 · Operar con control | [OCI Enterprise AI]({{base}}1Z0-1157-26/oci-enterprise/) | Separar lo que proporciona el runtime de las políticas y evaluaciones que debes diseñar. |
| 6 · Datos y agentes | [Oracle AI Database]({{base}}1Z0-1157-26/oracle-database/) | Distinguir recuperación semántica, generación de SQL, tareas de un agente y exposición por MCP. |
| 7 · Integrar y practicar | [Repaso]({{base}}1Z0-1157-26/review/), [práctica]({{base}}1Z0-1157-26/practice/) y ruta oficial | Resolver un caso de extremo a extremo, revisar los errores y preparar el siguiente paso oficial. |

## La rutina de cada sesión

1. **Recupera lo anterior · 5 minutos.** Explica un concepto sin mirar las notas.
2. **Estudia · 20–30 minutos.** Lee el módulo, amplía sus diagramas y consulta las lecciones oficiales relacionadas.
3. **Aplica · 15–25 minutos.** Resuelve el ejercicio antes de desplegar su solución.
4. **Explica · 5–10 minutos.** Describe a otra persona la decisión técnica y una alternativa que descartaste.
5. **Registra · 5 minutos.** Actualiza tus dudas y marca el apartado como completado cuando hayas hecho el ejercicio.

> El botón “Completado” registra tu avance de lectura. No mide por sí mismo el dominio del tema ni modifica tu progreso en Oracle MyLearn.

## Un caso que conecta todo

Diseña un asistente de soporte que consulta documentación, comprueba el estado de un pedido y escala solicitudes complejas. No hace falta desplegarlo: especifica sus piezas.

- ¿Qué preguntas puede contestar usando búsqueda y cuáles necesitan una herramienta de negocio?
- ¿Qué ejecuta el modelo y qué ejecuta la aplicación?
- ¿Qué servicio externo justificaría MCP?
- ¿Qué especialista recibiría una solicitud de facturación y qué permisos tendría?
- ¿Qué dato guardarías en la sesión y cuál evitarías conservar?
- ¿Cómo comprobarías que una operación sensible necesita aprobación?

<details>
<summary>Una solución razonada</summary>

La búsqueda recupera documentación autorizada; una herramienta separada consulta pedidos con la identidad del usuario. El modelo propone llamadas y la aplicación valida y ejecuta. MCP resulta útil si el servicio de pedidos se comparte con varios clientes. Un especialista de facturación puede recibir un handoff, pero no debe adquirir permisos extra solo por recibirlo. La sesión conserva el contexto mínimo necesario. Cancelaciones o devoluciones necesitan controles de autorización y, cuando corresponda, aprobación humana. Una traza registra llamadas y resultados operativos sin convertirla en un almacén indiscriminado de datos sensibles.

</details>

## Cuándo avanzar al examen

Busca consistencia, no una única puntuación alta. Si fallas una pregunta, explica por qué elegiste esa alternativa y qué dato del enunciado cambia la decisión. Repite la práctica tras repasar, completa la [práctica oficial de Oracle](https://mylearn.oracle.com/ou/course/practice-exam-oci-agentic-ai-associate-certification/163247) y sigue el [checklist del examen]({{base}}1Z0-1157-26/exam-checklist/).
