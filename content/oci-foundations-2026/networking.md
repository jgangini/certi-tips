La tienda necesita recibir HTTPS desde internet, mantener privadas sus aplicaciones y permitir que esas aplicaciones lean objetos y descarguen actualizaciones. Cada camino exige una decisión distinta.

## Conceptos clave

Una **Virtual Cloud Network (VCN)** es una red virtual regional. Su bloque **CIDR** define un rango de direcciones. Por ejemplo, `10.0.0.0/16` puede contener una subred `10.0.1.0/24` y otra `10.0.2.0/24`. El prefijo mayor describe una porción más pequeña del espacio. Planifica rangos sin solapamientos si vas a conectar redes.

Las **subredes regionales** pueden abarcar los AD de la región. Una subred pública permite direcciones IP públicas en sus VNIC; una privada las prohíbe. **VNIC** es la interfaz virtual que conecta una instancia a la red. Ser pública no significa que todas las conexiones estén permitidas: hacen falta dirección apropiada, rutas y reglas.

![Una VCN regional se divide en una subred pública para el balanceador y una privada para los servidores.]({{base}}assets/diagrams/ocif-network-concepts.svg "La entrada pública no obliga a publicar los servidores de la aplicación.")

El asistente de creación de VCN puede construir subredes, gateways y reglas iniciales. Inspecciona los recursos resultantes; usar un asistente no elimina la necesidad de entenderlos. DNS permite resolver nombres a direcciones, pero no concede conectividad ni acceso.

## Rutas, gateways y seguridad

Una **route table** decide el siguiente destino del tráfico que coincide con una regla. Una ruta `0.0.0.0/0` coincide con cualquier IPv4 que no tenga una ruta más específica. La conectividad local de la VCN tiene rutas implícitas; también existen rutas configurables dentro de la VCN para escenarios avanzados. No memorices que las tablas solo pueden dirigir tráfico fuera de ella. Consulta [VCN Route Tables](https://docs.oracle.com/en-us/iaas/Content/Network/Tasks/managingroutetables.htm).

| Destino o necesidad | Pieza que debes reconocer |
| --- | --- |
| Internet desde recursos con IP pública | Internet Gateway, más rutas y reglas |
| Salida a internet desde instancias privadas, sin conexiones entrantes iniciadas desde internet | NAT Gateway |
| Servicios compatibles de Oracle en la misma región sin atravesar internet | Service Gateway |
| Redes on-premises y conexión entre VCN | Dynamic Routing Gateway (DRG) según el diseño |
| Conexión cifrada por internet hacia on-premises | Site-to-Site VPN |
| Conectividad privada dedicada hacia OCI | FastConnect |

![Cuatro caminos distintos salen de una subred: Internet Gateway, NAT, Service Gateway y DRG, cada uno con su destino.]({{base}}assets/diagrams/ocif-network-routing.svg "Elige por el destino y por quién inicia la conexión.")

Las **Security Lists** aplican reglas a las VNIC de una subred; los **Network Security Groups (NSG)** agrupan VNIC o recursos compatibles por función. Ambos definen reglas de ingreso y salida. Una regla **stateful** rastrea la conexión y permite su respuesta; con **stateless** debes permitir explícitamente ambos sentidos. También revisa el firewall del sistema operativo. La ruta indica dónde ir; la seguridad decide qué tráfico puede pasar.

## Balanceadores y salud de la aplicación

Un balanceador recibe tráfico por un **listener** y lo distribuye a servidores de un **backend set**, usando una política y **health checks**. Un backend que no supera la comprobación de salud no debe recibir tráfico nuevo como uno sano. Ver una VM en estado Running no demuestra que su aplicación responda.

![Un listener distribuye peticiones a dos backends sanos y excluye un tercero cuyo health check falla.]({{base}}assets/diagrams/ocif-network-balancing.svg "La salud se comprueba en el servicio, no solo en la máquina.")

**Load Balancer** incorpora capacidades de capa 7 para HTTP/HTTPS y también admite TCP. **Network Load Balancer** está orientado a balanceo de alto rendimiento en capas 3/4, incluyendo TCP, UDP e ICMP según el listener. La comparación “L7 frente a L4” sirve como orientación, pero no significa que Load Balancer carezca de TCP.

Un balanceador **público** acepta tráfico a través de una dirección pública. Uno **privado** sirve a clientes con conectividad privada. Ambos necesitan rutas y controles adecuados. Las políticas de Load Balancer incluyen **Round Robin, Least Connections e IP Hash**; se pueden asignar **pesos** a los backends. Con pesos 1 y 3, Round Robin ponderado distribuye aproximadamente una de cada cuatro peticiones al primero, no la mitad. Véase [políticas de balanceo](https://docs.oracle.com/en-us/iaas/Content/Balance/Reference/lbpolicies.htm).

## Ejemplo paso a paso

1. Usa una VCN con subred pública para el balanceador y privada para dos servidores de pedidos.
2. Configura HTTPS en el listener con su certificado. Permite solo los puertos necesarios desde los clientes.
3. Permite que el balanceador llegue al puerto de aplicación y al de health check de los backends. Un NSG por función facilita expresar esta relación.
4. Prueba la salud de ambos servidores antes de habilitar tráfico de clientes. Si uno falla, comprueba puerto, proceso y reglas.
5. Da a la subred privada una ruta hacia NAT para actualizaciones y otra hacia Service Gateway para los servicios de Oracle compatibles.

![El cliente llega por HTTPS al balanceador público y el tráfico de aplicación continúa hacia backends privados; estos acceden a Object Storage por Service Gateway.]({{base}}assets/diagrams/ocif-network-example.svg "Sigue una petición y después el acceso de la aplicación a sus datos.")

Para reproducir la demostración de balanceador privado, sustituye el cliente de internet por uno con conectividad privada a la VCN. Cambiar la visibilidad del frontend cambia quién puede alcanzarlo; no cambia la necesidad de backend sets y comprobaciones de salud.

## Errores frecuentes

- **“Abrí el puerto en una Security List, así que ya hay ruta”.** Comprueba rutas y destino además de las reglas.
- **“NAT publica mi servidor privado”.** Permite conexiones salientes y sus respuestas; no crea una entrada pública para clientes.
- **“Service Gateway conecta con todos los sitios web”.** Da acceso privado a servicios compatibles de Oracle, no a internet en general.

![Tres pasos independientes para una conexión: dirección y ruta, regla de seguridad y proceso escuchando.]({{base}}assets/diagrams/ocif-network-errors.svg "Un fallo de conectividad puede estar en cualquiera de las capas.")

## Ejercicio de decisión

Una VM privada lee fotos de Object Storage y descarga paquetes de un repositorio público. No debe aceptar conexiones nuevas desde internet. ¿Qué dos gateways elegirías? ¿Una tabla de rutas basta para que funcione?

<details>
<summary>Solución</summary>

Service Gateway para Object Storage de la misma región y NAT Gateway para el repositorio público. Configura las rutas correspondientes y permite la salida necesaria, la resolución DNS y las respuestas. Para leer objetos también hacen falta permisos IAM. La tabla de rutas no sustituye estos controles.

![La VM privada bifurca su tráfico hacia Object Storage por Service Gateway y hacia el repositorio público por NAT.]({{base}}assets/diagrams/ocif-network-exercise.svg "Dos destinos distintos pueden necesitar dos caminos distintos.")

</details>

## Fuentes y repaso

![Un paquete recorre cliente, listener, comprobación de salud y backend; a un lado se distinguen ruta y permiso de red.]({{base}}assets/diagrams/ocif-network-recap.svg "Explica el recorrido y el control de cada salto.")

Consulta [VCN](https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/overview.htm), [rutas](https://docs.oracle.com/en-us/iaas/Content/Network/Tasks/managingroutetables.htm), [NSG](https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/networksecuritygroups.htm), [Load Balancer](https://docs.oracle.com/en-us/iaas/Content/Balance/Concepts/balanceoverview.htm) y [Network Load Balancer](https://docs.oracle.com/en-us/iaas/Content/NetworkLoadBalancer/overview.htm). Sin mirar: compara NSG y Security List, explica NAT frente a DRG y justifica un health check.
