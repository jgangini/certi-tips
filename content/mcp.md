MCP permite conectar una aplicación de IA con herramientas y datos mediante un contrato común. Para entenderlo, separa tres preguntas: quién decide qué hacer, quién transporta la solicitud y quién realiza la operación.

## Conceptos clave

**Model Context Protocol (MCP)** estandariza cómo se descubren y utilizan capacidades externas. Reduce integraciones particulares entre cada aplicación y cada sistema, pero no elimina la configuración, las credenciales, las políticas ni las diferencias de soporte. Un servidor compatible no obtiene automáticamente permiso para leer todos tus archivos o modificar tus cuentas.

El **host** es la aplicación que administra la interacción y el contexto. Dentro del host, un **cliente MCP** mantiene la conexión con un **servidor MCP**, que expone capacidades. Un host puede utilizar varios clientes para conectarse a varios servidores. El LLM y el loop del agente siguen teniendo su función: MCP no aporta por sí mismo el razonamiento ni reemplaza la orquestación.

![Arquitectura MCP con un host, clientes independientes y servidores que exponen herramientas, recursos y prompts.]({{base}}assets/diagrams/mcp-architecture.svg)

## Objetivos del módulo

- Diferenciar host, cliente y servidor sin confundirlos con el modelo.
- Elegir entre tools, resources y prompts según la necesidad.
- Seguir descubrimiento, invocación y retorno de una herramienta.
- Distinguir el transporte MCP de las llamadas que el servidor haga a otra API.

## Tres capacidades del servidor

| Capacidad | Qué proporciona | Ejemplo de soporte |
| --- | --- | --- |
| Tools | Operaciones con entradas descritas por un esquema. | `consultar_pedido` devuelve su estado. |
| Resources | Información que la aplicación puede incorporar como contexto. | Una política de devoluciones identificada mediante URI. |
| Prompts | Plantillas reutilizables que el usuario puede seleccionar. | Una plantilla para preparar el diagnóstico de una incidencia. |

Se habla de tools controladas por el modelo porque este puede decidir solicitarlas; la aplicación y el servidor conservan los controles de ejecución. Resources son gestionados por la aplicación y prompts se ofrecen para elección del usuario. Estos términos describen el patrón de interacción, no conceden autoridad irrestricta. La [documentación de capacidades del servidor](https://modelcontextprotocol.io/docs/learn/server-concepts) detalla la distinción.

## Conexión, mensajes y transporte

En el establecimiento de la conexión se acuerdan versión y capacidades. Después, el cliente puede descubrir herramientas con `tools/list` e invocarlas con `tools/call`. El esquema comunica nombres, propósito y argumentos; las respuestas indican resultados o errores. MCP utiliza mensajes basados en JSON-RPC, que relacionan solicitudes y respuestas por identificadores. Una notificación no requiere el mismo intercambio de respuesta que una solicitud.

Con **stdio**, cliente y servidor se comunican por la entrada y salida estándar de un proceso local. Con **Streamable HTTP**, el cliente se conecta a un endpoint HTTP; es apropiado para servidores remotos y también puede usarse localmente. La seguridad y autenticación dependen del transporte y del despliegue. Comprueba las capacidades de la versión que utilices en la [arquitectura oficial de MCP](https://modelcontextprotocol.io/docs/learn/architecture).

“Servidor de un proveedor externo” no significa necesariamente “proceso remoto”. Puedes ejecutar localmente un paquete de terceros mediante stdio y que ese paquete llame después a una API cloud por HTTPS. Son dos conexiones distintas. Esta diferencia ayuda a localizar errores de credenciales, red y configuración.

## Ejemplo paso a paso

Nuestro equipo quiere compartir una consulta de pedidos entre un agente LangChain y un asistente de desarrollo compatible con MCP.

1. Expone `consultar_pedido(id_pedido)` en un servidor. Su descripción indica que solo lee y que requiere un identificador concreto.
2. Configura en cada host la conexión y las credenciales autorizadas. El cliente inicia la sesión y consulta las herramientas disponibles.
3. El usuario pregunta por el pedido `P-204`. El modelo propone la llamada; el host aplica sus permisos.
4. El cliente envía `tools/call` con el nombre y los argumentos. El servidor valida identidad y acceso antes de consultar el sistema de pedidos.
5. El servidor devuelve un resultado como estado “en preparación” y fecha estimada, o un error si no existe acceso.
6. El host agrega esa observación al contexto y el agente explica el resultado. Un segundo host puede reutilizar la misma capacidad si admite su protocolo, transporte y autenticación.

La prueba valiosa no es que ambos asistentes escriban respuestas parecidas: es que las trazas muestren la herramienta esperada y el resultado correcto. Si el asistente dispone de otra herramienta equivalente, una respuesta correcta no demuestra que haya usado tu servidor.

## Del ejemplo local al caso OCI

Un servidor de uso y costos puede encapsular una API de OCI. El cliente MCP describe el periodo y agrupación; el servidor aplica las credenciales y consulta la API. Para validar la respuesta, compara fechas, moneda, zona horaria y alcance con un informe autorizado de la misma fuente. Una diferencia no prueba que MCP haya calculado mal: puede existir un filtro diferente o datos aún no consolidados.

Antes de ejecutar un paquete externo revisa procedencia y permisos. Para una simple suma dentro de una aplicación, una función local es suficiente; MCP resulta especialmente útil cuando la capacidad se comparte, se mantiene por separado o ya existe en otro sistema.

## Errores frecuentes

- Suponer que `tools/list` ejecuta herramientas: solo las descubre.
- Confundir un recurso de contexto con una función que modifica un registro.
- Atribuir permisos, identidad o razonamiento al protocolo por sí solo.
- Registrar secretos o datos privados completos para depurar una integración.

## Ejercicio de arquitectura

Un host inicia un servidor por stdio. El servidor consulta OCI por HTTPS. ¿Debes configurar el cliente MCP como Streamable HTTP solo porque los datos proceden de la nube?

<details>
<summary>Ver solución y explicación</summary>

No. El transporte MCP describe la conexión entre cliente y servidor: en este caso es stdio. La conexión HTTPS del servidor hacia OCI es otra integración. Cambiar el transporte sin cambiar el despliegue rompería la comunicación; el lugar donde están los datos no determina automáticamente el transporte MCP.

</details>

## Fuentes y repaso

Revisa [Architecture overview](https://modelcontextprotocol.io/docs/learn/architecture) y [Understanding MCP servers](https://modelcontextprotocol.io/docs/learn/server-concepts). Para la aplicación en Oracle, conecta este módulo con [MCP en Autonomous AI Database]({{base}}agentic-ai-foundations-2026/oracle-database/#mcp-en-autonomous-ai-database). Debes poder identificar ambos extremos de cada conexión antes de elegir transporte o permisos.
