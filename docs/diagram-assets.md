# Recursos gráficos y revisión didáctica

## Iconografía

Se incorporan trazados del [repositorio oficial Lucide](https://github.com/lucide-icons/lucide/tree/main/icons), sin nueva dependencia JavaScript. Licencia ISC y atribución MIT de Feather conservadas íntegramente en `assets/icons/LICENSE-lucide.txt`.

Familias utilizadas: cpu, bot, workflow, wrench, list-filter, app-window, server, file-text, messages-square, network, plug, search, cloud, database, repeat-2, panels-top-left, headset, package, clipboard-list, dollar-sign, file-input, shield-check, file-check, key-round, cloud-upload, file-search, list-ordered, folder-cog, brain-circuit, boxes, braces, table, blocks, lock-keyhole, gauge y activity. Los símbolos de comparación y aritmética siguen siendo SVG nativos del portal. No se atribuye a Lucide todo el dibujo.

`oci-support.svg` reutiliza la arquitectura y los iconos oficiales OCI ya presentes. El caso mantiene separados el modelo, la aplicación que ejecuta las herramientas y los servicios de datos. La explicación de proyecto frente a API se contrasta con [Projects](https://docs.oracle.com/en-us/iaas/Content/generative-ai/projects.htm) y [Building AI Agents](https://docs.oracle.com/en-us/iaas/Content/generative-ai/building-agents.htm).

## Ilustraciones generadas con IA

Los recursos siguientes son ilustraciones didácticas, no capturas de infraestructura real ni iconos oficiales Oracle. Se generaron con imagegen; no se copiaron imágenes de la PPT de referencia.

| Archivo | Propósito y dirección del prompt |
| --- | --- |
| `self-hosted-runtime.png` | Ilustración 3D isométrica mate, transparente, 3:2: un portátil moderno blanco/azul marino con código abstracto índigo y una torre de servidor conectada. Sin texto, logos ni flechas. Representa operación propia. |
| `managed-runtime.png` | Ilustración a juego, transparente, 3:2: tres módulos de servidor blanco/azul marino, luces verde azulado y nube blanca. Sin texto, logos ni flechas. Representa alojamiento gestionado. |
| `grounded-answer-v2.png` | Rediseño de la ilustración existente en cuatro columnas: pregunta, recuperación autorizada (búsqueda vectorial o SQL), modelo con contexto y respuesta con evidencia. Flechas solo hacia la derecha, sin tuberías decorativas ni flechas opuestas. Nota sobre validación del acceso por la aplicación. |

Las ilustraciones transparentes se mantienen como PNG fuente y se incrustan durante el build en `oci-runtime.svg`: los navegadores no cargan imágenes externas desde un SVG mostrado mediante `<img>`. El validador solo permite PNG inline y continúa rechazando SVG activos, eventos y referencias externas.

## Revisión

Se revisan geometría renderizada, márgenes interiores, conexiones y significado de cada flujo. La revisión en Browser usa DOM, accesibilidad, carga real, apertura, Escape y retorno de foco; no usa capturas. Las pruebas de regresión protegen trazos con punta independientes, números blancos, ejemplo en USD, caso OCI único y estado completado sin insignia adicional.
