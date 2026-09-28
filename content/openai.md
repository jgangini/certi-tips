La Responses API conecta tu aplicación con modelos y herramientas. El Agents SDK organiza el trabajo de agentes en tu propio código. Entender la diferencia evita atribuir al modelo tareas de ejecución y control que pertenecen al runtime.

## Conceptos clave

Piensa en tres niveles: **modelos** que producen respuestas y propuestas de acciones; **Responses API** como interfaz para invocarlos con contexto y herramientas; y **Agents SDK** para definir agentes y coordinar su loop. Este módulo estudia esa base del curso, no todo el catálogo de productos que pueda publicarse después.

Usar el SDK no significa que OpenAI aloje automáticamente tu aplicación Python. Tu aplicación sigue siendo responsable de su despliegue, integraciones, datos y decisiones de autorización. Una herramienta hospedada y una función de tu backend pueden aparecer en el mismo flujo, aunque se ejecutan en entornos diferentes.

![Capas del OpenAI Agent Stack: aplicación y Agents SDK, Responses API, modelos y herramientas con responsabilidades separadas.]({{base}}assets/diagrams/openai-stack.svg)

## Objetivos del módulo

- Elegir entre una llamada directa a Responses y un loop gestionado por el SDK.
- Diferenciar hosted tools, function tools y agents as tools.
- Explicar quién conserva el control después de un handoff.
- Situar validación, aprobación y observabilidad donde realmente protegen el flujo.

## Responses y contexto

Una solicitud a Responses especifica modelo, entrada y, cuando corresponde, instrucciones y herramientas. La salida puede contener texto y otros elementos, incluidas solicitudes de ejecución. `output_text` facilita leer el texto final, pero un integrador debe examinar los elementos relevantes cuando implementa el loop.

Para mantener conversaciones existen opciones como historial administrado por la aplicación, `previous_response_id` para encadenar respuestas y Conversations para conservar elementos en una conversación. Tener un identificador de continuidad no elimina límites de contexto, costos ni decisiones de retención. Elige una estrategia y conserva los datos que esa estrategia requiere. La [guía oficial de estado de conversación](https://developers.openai.com/api/docs/guides/conversation-state) explica sus diferencias.

## Agentes, runner y herramientas

Un **Agent** reúne una responsabilidad, instrucciones, modelo y capacidades. El **Runner** conduce el ciclo: invoca el modelo, atiende herramientas o delegaciones y devuelve un resultado cuando termina. En Python, `Runner.run` es asíncrono y `Runner.run_sync` sirve en un contexto síncrono apropiado. `final_output` contiene la salida final del resultado; el tipo depende de cómo se haya configurado el agente.

Una **function tool** expone código de tu aplicación. El decorador `@function_tool` aprovecha firma, tipos y descripción para representar la capacidad. El modelo solicita una operación con argumentos; el runtime ejecuta la implementación. Una **hosted tool**, como búsqueda compatible con el modelo elegido, se opera desde el servicio. **Agents as tools** permite que un agente principal consulte un especialista como una capacidad acotada y luego prepare la respuesta.

Los esquemas mejoran la forma de los argumentos, pero una función de reembolso todavía debe verificar propietario, importe, estado y duplicados. Una clave API se guarda en el servidor o en un entorno protegido, nunca en JavaScript público de una página de estudio.

## Handoffs y responsabilidad

Con un **handoff**, el control de esa rama pasa al especialista. Con un **manager** que usa agentes como herramientas, el principal conserva la responsabilidad de la respuesta. No hacen falta varios agentes solo porque existan varias herramientas: divide cuando cambian las responsabilidades, políticas o capacidades. El [patrón de orquestación oficial](https://developers.openai.com/api/docs/guides/agents/orchestration) describe esa distinción.

![Triage deriva una consulta a pedidos, reembolsos o políticas; se compara la transferencia de control con un manager que recibe resultados.]({{base}}assets/diagrams/handoffs.svg)

## Ejemplo paso a paso

Construye mentalmente un sistema de soporte con triage, pedidos y devoluciones.

1. El usuario pregunta “¿Dónde está mi pedido P-204?”. Una validación de entrada comprueba alcance y formato.
2. Triage identifica la intención y realiza un handoff al especialista de pedidos.
3. Ese agente solicita `consultar_pedido`. El backend verifica acceso y devuelve “en preparación”.
4. El especialista redacta la respuesta usando ese resultado, sin afirmar que ya se entregó.
5. Si el usuario pide después devolverlo, se aplica la política de devoluciones y la autorización de la acción concreta antes de emitir un reembolso.

Para la demostración usa datos ficticios y una función que solo simula la operación. Prueba pedido inexistente, acceso denegado y solicitud fuera de tema. En cada caso debe haber una respuesta controlada y ninguna operación financiera real.

## Guardrails y trazas

Los guardrails de entrada, salida y herramientas tienen alcances distintos. En el SDK, los de entrada se aplican al primer agente de la cadena y los de salida al que produce la respuesta final; no debes asumir que se repiten en todo especialista. La validación de una acción sensible se coloca junto a la herramienta, y una aprobación puede pausar el flujo. Los checks en paralelo reducen latencia, pero pueden permitir trabajo especulativo: usa ejecución bloqueante cuando sea necesario. Consulta [guardrails y revisión humana](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals).

Una traza muestra etapas, llamadas y resultados disponibles; ayuda a distinguir tiempo del modelo, de una API y de la validación. Protege los datos registrados y revisa la configuración de trazado. No interpretes una traza como el razonamiento interno completo ni deduzcas que la función más visible es necesariamente el cuello de botella.

## Errores frecuentes

- Confundir SDK cliente de la API con Agents SDK: tienen responsabilidades distintas.
- Esperar que definir una herramienta ejecute inmediatamente su código.
- Creer que un handoff garantiza el regreso al agente de triage.
- Confiar en el guardrail de entrada para autorizar todos los reembolsos posteriores.

## Ejercicio de diseño

Un agente debe consultar dos especialistas y combinar sus resultados en un único informe. ¿Qué patrón expresa mejor esa responsabilidad?

<details>
<summary>Ver solución y explicación</summary>

Un manager con especialistas expuestos como herramientas mantiene el control y sintetiza el informe. El handoff es adecuado cuando otro especialista debe hacerse cargo de la conversación. Ninguno autoriza por sí mismo acciones sensibles: cada herramienta conserva sus validaciones y permisos.

</details>

## Fuentes y repaso

La [introducción oficial al Agents SDK](https://developers.openai.com/api/docs/guides/agents/sdk) enlaza definiciones, ejecución y herramientas. Repasa el caso de soporte señalando qué configuración pertenece al agente y qué lógica debe permanecer en la aplicación. La sintaxis y capacidades exactas deben verificarse con la versión del SDK y el modelo elegidos.
