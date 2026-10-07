La tienda tiene una administradora de identidades, operadores de producción y desarrolladores. Todos pueden iniciar sesión, pero cada uno necesita realizar tareas diferentes.

**Al terminar podrás:** separar autenticación y autorización; organizar compartimentos y dominios de identidad; leer una política IAM; y explicar cómo una aplicación accede a OCI con su propia identidad.

## Conceptos clave

**Autenticación (AuthN)** comprueba quién hace una solicitud. **Autorización (AuthZ)** determina qué operaciones puede realizar esa identidad. Una contraseña correcta y MFA permiten verificar al usuario; no conceden automáticamente permisos para crear redes o borrar volúmenes.

Un **identity domain** administra identidades, grupos, autenticación y otras funciones de identidad. Los **usuarios** representan personas o identidades administradas; los **grupos** reúnen usuarios a los que quieres otorgar permisos. En una política, el **principal** es la identidad o conjunto de identidades al que se aplica el permiso. El usuario obtiene el acceso de las políticas correspondientes a sus grupos.

![Una persona supera la autenticación, pero la operación sobre un recurso solo pasa después de evaluar la política.]({{base}}assets/diagrams/ocif-iam-concepts.svg "Entrar a la consola y tener permiso para actuar son comprobaciones distintas.")

La **federación** permite confiar en un proveedor de identidad externo. **MFA** añade un factor de verificación. Usa identidades individuales para poder atribuir acciones y revisa los grupos cuando cambien las responsabilidades. No conviertas una cuenta administrativa compartida en el método habitual de trabajo.

## Compartimentos y dominios de identidad

La tenancy incluye el compartimento raíz. Puedes crear compartimentos y subcompartimentos para organizar proyectos o ambientes. Un recurso pertenece a un compartimento a la vez; sus recursos pueden estar en distintas regiones. Una política de un ámbito superior puede conceder acceso a recursos de sus descendientes: revisa la herencia antes de asumir que un subcompartimento está aislado.

![El árbol Producción y Desarrollo contiene recursos; un dominio de identidad separado contiene usuarios y grupos.]({{base}}assets/diagrams/ocif-iam-organization.svg "El dominio organiza identidades; el compartimento organiza recursos.")

Ser **administrador de un dominio de identidad** permite administrar funciones del dominio según el rol asignado. No equivale, por sí solo, a administrar todos los recursos OCI de la tenancy. Esta distinción explica una demostración típica: la administradora puede crear usuarios y grupos, pero no listar una VCN hasta contar con la política necesaria.

En la configuración inicial identifica el dominio utilizado para iniciar sesión, protege las cuentas privilegiadas, crea grupos por función y separa los compartimentos de pruebas y producción. Al crear un dominio nuevo, comprueba el tipo de dominio, la región de origen y sus requisitos; no lo crees únicamente para separar dos equipos si grupos y compartimentos ya resuelven el caso.

## Leer y construir políticas

Una política combina **quién**, **verbo**, **tipo de recurso**, **ubicación** y condiciones opcionales. El ejemplo siguiente es deliberadamente limitado a observar instancias:

```text
Allow group 'Default'/'Observadores' to read instances in compartment Produccion
```

El grupo pertenece al dominio `Default`; `read` identifica el nivel de acceso; `instances` indica el tipo de recurso; `Produccion` delimita dónde. Deben existir esos nombres y el creador necesita permisos para administrar la política. El permiso de una operación completa puede depender de varios tipos de recurso: esta línea no basta para lanzar una VM con red y volúmenes.

![La frase de una política está dividida en principal, verbo, recurso y ámbito.]({{base}}assets/diagrams/ocif-iam-policy.svg "Lee una política como una autorización concreta, no como una contraseña.")

Los verbos **inspect, read, use y manage** suelen expresar acceso creciente. `inspect` permite listar; `read` añade lectura; `use` permite utilizar recursos existentes; `manage` agrega control amplio, incluidas creación y eliminación según el recurso. Las operaciones exactas están en la referencia del servicio: no supongas que `use` prohíbe toda actualización.

El acceso necesita una concesión aplicable. Los permisos de distintos grupos y políticas se acumulan: una política acotada no revoca un permiso amplio concedido por otra. Para reducir acceso, revisa todas las membresías y políticas relevantes, incluidas las heredadas del ámbito superior.

Un **dynamic group** agrupa recursos mediante reglas de coincidencia. Una instancia o función puede actuar como principal y recibir permisos con políticas, evitando guardar credenciales de una persona en la aplicación. La regla selecciona miembros; la política concede permisos. Consulta la [referencia IAM](https://docs.oracle.com/en-us/iaas/Content/Identity/policyreference/iampolicyreference.htm) y [dynamic groups](https://docs.oracle.com/en-us/iaas/Content/Identity/Tasks/managingdynamicgroups.htm).

## Ejemplo paso a paso

Ana debe consultar el estado de las instancias de producción, sin modificarlas. La aplicación debe leer fotos de un bucket privado.

1. Crea o identifica a Ana en el dominio correcto y añádela a **Observadores**.
2. Aplica una política de lectura de instancias en **Produccion**. No uses `manage all-resources in tenancy` para resolver un permiso puntual.
3. Prueba con la identidad de Ana: debería poder consultar las instancias, pero no terminarlas. Si faltan datos auxiliares, revisa las dependencias documentadas.
4. Para la aplicación, define un dynamic group con una regla acotada a sus recursos y concede lectura de los objetos necesarios mediante la política del servicio.
5. Mantén separados los permisos de Ana y los del recurso que ejecuta la aplicación.

![Una usuaria accede mediante un grupo humano y una instancia mediante un dynamic group; ambos caminos llegan a políticas diferentes.]({{base}}assets/diagrams/ocif-iam-example.svg "Una aplicación no necesita heredar la identidad personal de su operador.")

En las demostraciones de usuarios, grupos y políticas comprueba tanto una operación permitida como una denegada. Ver únicamente que el acceso funciona no demuestra que sea mínimo.

## Errores frecuentes

- **“Crear el grupo concede acceso”.** Hace falta una política aplicable; pertenencia y autorización son piezas distintas.
- **“Si tengo permisos IAM, podré conectarme por SSH”.** También necesitas ruta de red, reglas, servicio SSH y la clave correspondiente al sistema operativo.
- **“Vault y compartimentos hacen lo mismo”.** El compartimento organiza recursos; Vault administra claves criptográficas y secretos.

![Una llave de inicio de sesión, una política y un camino de red aparecen como controles diferentes.]({{base}}assets/diagrams/ocif-iam-errors.svg "Identidad, permiso y conectividad no se sustituyen.")

## Ejercicio de decisión

Luis administra usuarios en un dominio nuevo, pero no puede crear una VCN en Desarrollo. ¿Debe desactivar MFA, cambiar de región o revisar los permisos sobre recursos? Explica además por qué añadirlo a cualquier grupo no garantiza acceso.

<details>
<summary>Ver solución y explicación</summary>

Debe revisar la política del grupo y su ámbito. Administrar identidades no implica administrar redes. Un administrador autorizado puede conceder los permisos requeridos para redes en Desarrollo al grupo adecuado. Desactivar MFA no añade autorización. Cambiar la región puede cambiar el listado, pero no sustituye una política. Un grupo sin políticas aplicables no tiene esos permisos.

![Luis puede administrar usuarios y grupos con su rol del dominio; la ruta hacia crear una VCN está interrumpida porque falta una política en Desarrollo.]({{base}}assets/diagrams/ocif-iam-exercise.svg "Concede la función necesaria en el ámbito necesario.")

</details>

## Fuentes y repaso

![Una solicitud se revisa por identidad, membresía, política y ámbito antes de permitir la operación.]({{base}}assets/diagrams/ocif-iam-recap.svg "Para diagnosticar un acceso, sigue la autorización de extremo a extremo.")

Consulta [IAM con dominios de identidad](https://docs.oracle.com/en-us/iaas/Content/Identity/home.htm), [políticas y permisos](https://docs.oracle.com/en-us/iaas/Content/Identity/policyreference/iampolicyreference.htm) y [dynamic groups](https://docs.oracle.com/en-us/iaas/Content/Identity/Tasks/managingdynamicgroups.htm). Explica quién, qué y dónde en una política; luego describe qué cambia cuando el principal es una instancia.
