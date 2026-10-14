```json
{
  "title": "AI Data Plaform Cloud Migration Starter Kits",
  "videoId": "ZjfQUwUdpbI",
  "channelUrl": "https://www.youtube.com/@jgangini",
  "publishedAt": "2026-07-09",
  "addedAt": "2026-10-14T05:16:11.637+00:00",
  "reviewedAt": "2026-10-14",
  "durationSeconds": 342,
  "status": "published",
  "topics": [
    "Oracle AI Data Platform",
    "OCI Resource Manager",
    "OCI Deploy Studio",
    "Arquitectura medallón"
  ]
}
```

## Resumen

Despliega un laboratorio de arquitectura medallón en OCI y comienza a trabajar con un modelo de industria en Oracle AI Data Platform Workbench. En este video recorremos el despliegue con OCI Deploy Studio y el acceso al entorno de práctica.

## Capítulos

### 00:00 — Inicio

Inicio del video. La presentación hablada comienza aproximadamente en el segundo 8 y describe las dos etapas: desplegar el laboratorio y acceder al entorno de práctica.

### 00:30 — OCI Deploy Studio Y Selección Del Proyecto

El recorrido abre el módulo Studio de CloudTechNext y selecciona el proyecto de migración. Se parte de una tenancy existente y aprovisionada.

### 00:46 — Credenciales OCI Y Creación Del Compartment

El despliegue solicita el archivo OCI config y la API Key descargados de la tenancy. También se configura un nuevo compartment y una contraseña para el laboratorio.

### 01:09 — Código De Registro Y Validación

Se define el código que usarán los participantes para registrarse y se valida la conexión con la tenancy y que el compartment no exista.

### 01:23 — Despliegue Con OCI Resource Manager

El aprovisionamiento utiliza OCI Resource Manager para desplegar el laboratorio y crear las políticas del ejemplo. La narración indica que el proceso puede tardar hasta diez minutos.

### 01:46 — URL De La Aplicación Y Correo De Despliegue

El despliegue publica el portal sobre una máquina virtual. Se copia la URL y se revisa el correo con información de la tenancy y del job ejecutado.

### 02:14 — Apertura Del Portal Y Registro Por Industria

Se abre el portal y se registra un participante con nombre y correo. La selección de industria determina los datos de práctica; se ingresa el código definido durante el despliegue.

### 02:46 — Aprovisionamiento Del Participante Y Activación De Cuenta

El proceso copia los archivos necesarios y crea la cuenta. El participante recibe un correo de activación y establece su contraseña.

### 03:12 — Inicio De Sesión Y Autenticación Multifactor

El participante inicia sesión y configura la autenticación multifactor con una aplicación de autenticación y el código QR mostrado.

### 03:51 — Acceso A Oracle AI Data Platform Workbench

Desde el menú de Oracle Cloud se accede a Oracle AI Data Platform Workbench, se selecciona el compartment creado y se autoriza el acceso con autenticación multifactor.

### 04:24 — Master Catalog Y Capas Medallón

El Master Catalog contiene las capas Landing, Bronze, Silver y Gold. La explicación relaciona estas capas con la transición y transformación de los datos.

### 04:46 — Workspace Y Datos De Prueba Por Industria

El workspace contiene una carpeta Medallón asociada al correo del participante y datos ficticios de la industria seleccionada para realizar las pruebas.

### 05:06 — Workflow Medallón Y Clúster Compartido

El workflow reúne las etapas de la arquitectura medallón y está preparado para ejecutarse en un clúster compartido por los participantes del laboratorio.

## Recursos relacionados

- [Video completo en AI CloudTech](https://www.youtube.com/watch?v=ZjfQUwUdpbI).
- [Oracle AI Data Platform Workbench Starter Kits — Código, Laboratorios Y Documentación](https://github.com/jgangini/oci-ai-data-platform-workbench-starter-kits).
- [OCI Deploy Studio — CloudTechNext](https://cloudtechnext.net/#deploy).
