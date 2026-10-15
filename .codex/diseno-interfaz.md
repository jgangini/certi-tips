# Diseño de interfaz de CertiTips

Aplicar al cambiar componentes compartidos, estilos, navegación, chat y visor. Reutilizar `scripts/layout.mjs`, los módulos del navegador, las variables de tema y los diálogos nativos. El contenido Markdown no define controles ni estilos; los diagramas tienen su propia guía en [diagram-design.md](diagram-design.md).

## Base visual y accesibilidad

- Usar los colores, tipografía, radios y separaciones existentes. Mantener ambos temas. El rojo de marca se obtiene de `--red`; no duplicar valores por componente cuando ya exista una variable compartida.
- La barra de grupos del catálogo, la navegación de CertiQuiz, sus tarjetas de roles y los encabezados compartidos de CertiTube, CertiChat y Cognee usan el fondo `--white` de la videoteca. Reutilizar la variable en ambos temas; no fijar un color oscuro ni extenderlo a todos los formularios.
- Los controles habilitados muestran borde e icono rojos al pasar el puntero. Un botón que representa un panel abierto usa fondo y borde rojos con icono blanco; no sustituirlo por fondo gris. El estado debe reflejarse en `aria-expanded` o el atributo accesible correspondiente.
- Conservar nombres accesibles, orden de teclado, foco visible y retorno del foco al control al cerrar un diálogo o panel. No eliminar contornos globalmente para ocultar un foco automático.
- Todos los diálogos emergentes usan el borde superior rojo de 4 px de los paneles, incluido el buscador, el visor y las confirmaciones. Usar diálogos nativos y acciones `Cancelar`/`Aceptar` sin iconos decorativos; enfocar inicialmente el título en las confirmaciones. No limpiar intentos ni conversaciones antes de confirmar o antes de que termine correctamente la operación que los elimina.
- Ajustar el diseño al ancho real disponible y comprobar desbordamientos. No reducir texto o miniaturas hasta volverlos ilegibles para mantener una composición de escritorio.
- Mantener transiciones suaves y cancelables ante clics repetidos. Respetar `prefers-reduced-motion`; no forzar animaciones ni desplazamientos suaves cuando se solicita reducir movimiento.

## Encabezado, catálogo y lectura

- La marca conserva la posición del marco de portada en todos los estados de menú y chat. Los controles terminan en el borde derecho del marco compartido de CertiQuiz, con márgenes adaptables. El pie ocupa todo el ancho.
- Mantener los accesos cuadrados CertiTips, CertiQuiz, CertiTube y CertiChat, en ese orden antes del buscador. CertiTips abre `/courses/` y usa el birrete existente; CertiChat usa el cerebro existente y abre `/certichat/`. Conservar las acciones de portada y la geometría de los SVG.
- La barra de grupos aparece solo en `/courses/`. No mostrarla ni reservar su altura en las lecciones. El modo compacto de grupos depende del ancho real de su contenedor, hasta 800 px; no restaurar el umbral antiguo de 1360 px del encabezado.
- Las rutas de navegación del catálogo y CertiQuiz centran el texto y los controles respecto al alto completo de la barra; compensar la diferencia entre el borde superior rojo y el inferior.
- En escritorio, el panel activo del catálogo tiene como altura máxima la base del chat. La lista de cursos se desplaza dentro del panel con la barra fina y los colores del chat; el título y los controles del carrusel permanecen visibles.
- El catálogo reutiliza Foundation y su carrusel. La navegación del catálogo no modifica la preferencia del lateral de cursos. Mostrar el nivel de cada curso con la clasificación existente, incluido nivel 1 para Data Management Fundamentals; alinear el ordinal con esa etiqueta.
- Lateral, separación de 24 px y lectura comparten el marco de contenido de hasta 1.200 px, ajustado a la columna de chat y los márgenes. El espacio izquierdo usa el color del lateral, sin franja blanca. La lectura es transparente, sin borde, sombra, desenfoque ni esquinas decorativas.
- Encabezado de lección, introducción, párrafos, listas, tablas y navegación anterior/siguiente ocupan el ancho de lectura disponible. No restablecer límites interiores de 780, 820 o 940 px. Comprobar al final de página que el botón flotante no cubra la navegación.
- Hasta 800 px, la lectura ocupa todo el ancho útil sin reservar el lateral ni una columna vacía del chat. Mantener sus márgenes interiores y permitir que el contenido se adapte.
- La navegación de CertiQuiz empieza 20 px bajo el encabezado; conserva 24 px de separación inferior, sin añadir otro margen a su bienvenida.

## Menú del curso

- En escritorio empieza abierto salvo preferencia previa de plegado. El botón permanece en el encabezado y conserva su estado entre lecciones.
- Si el chat está desplegado y el ancho de lectura resulta menor que el ancho del chat, plegar automáticamente el lateral. Basarse en las dimensiones reales; el objetivo es conservar lectura utilizable.
- Plegar y desplegar lateral, separación y contenido de forma coordinada, con la transición compartida de 360 ms. Mantener opaco el lateral durante el recorrido para evitar superposición visible del texto.
- Los grupos internos del menú usan apertura y cierre suaves de 240 ms. Mantener sus enlaces compactos, con filas de 36 px como referencia; no volver al espaciado amplio anterior.
- En móvil, el lateral se superpone al contenido. Detrás aparece el fondo translúcido con desenfoque de los diálogos, entre encabezado y pie, por debajo del menú. Pulsar ese fondo o Escape pliega el lateral; el contenido cubierto no recibe la interacción.
- No restaurar la franja numérica del menú plegado ni vincular el clic de lectura a una barra de grupos que ya no existe en los cursos.

## Práctica y progreso

- La finalización de lección sigue siendo un botón redondeado con interruptor interior: gris y `Sin Completar` cuando está pendiente; rojo y `Completado` al terminar.
- La práctica usa el rótulo rojo `PRÁCTICA`, encabezado compacto CertiQuiz y borde superior rojo de 4 px. La entrada muestra cantidades de preguntas y áreas, con `Comenzar` a la derecha bajo un separador.
- Deshabilitar `Siguiente` hasta seleccionar una opción. Los resultados muestran puntuación, tabla de preguntas y totales neutros por área; reinicio y salida están arriba a la derecha y confirman antes de borrar un intento.
- Mantener elipsis en filas largas y texto completo al pasar el puntero. Al abrir una pregunta, mostrar detalle de solo lectura con `Resumen` junto a `Siguiente`, sin duplicar su estado. No restablecer consejos, enlaces de continuación ni acciones inferiores retiradas.

## CertiChat y búsqueda

- Los controles superiores del chat conservan el tamaño compacto de referencia en todos los anchos: botones de 31 × 31 px e iconos de 17 × 17 px. No crecen al tamaño del encabezado de escritorio.

- El chat abierto mide 420 px en escritorio; hasta 800 px usa el panel móvil de pantalla completa también en CertiTube, ocultando la página de fondo y bloqueando su desplazamiento. No reservar un panel pequeño sobre el video. Su estado abierto/cerrado se conserva al navegar y restaurar historial en la misma pestaña; en el explorador permanece abierto. Un cierre manual se respeta en páginas posteriores.
- En portada, el botón flotante muestra icono y texto `CertiChat` por encima de 800 px; en móvil conserva el formato de solo icono. No aplicar a portada el umbral compacto particular de cursos.
- Renderizar Markdown con el mecanismo existente de Deep Chat también al restaurar historial: negrita, listas y código deben verse formateados. Mantener HTML inactivo, imágenes como texto alternativo y validación de enlaces en el límite de renderizado; el componente puede sustituir su validador al cargar extensiones. No eliminar esa protección.
- Mantener sangría compacta de listas de respuestas, de `1.6em`, conservando sus números y marcadores. El formato no debe generar otra consulta ni modificar el texto original almacenado.
- Mostrar fuentes bajo `Recursos Relacionados`, una línea con elipsis y título completo, con texto e icono del color principal del tema. Elegir el SVG según URL validada: curso, video o enlace genérico admitido. Aplicar al terminar la respuesta progresiva y al restaurar historial.
- Borrar conversación depende de la carga y de operaciones pendientes, no de `verified`. La vista local solo borra su historial tras confirmar; la conectada usa `DELETE /api/conversation` y conserva mensajes ante fallo. No reiniciar cuotas ni debilitar comprobaciones de envío.
- El SVG de envío conserva su contorno y se vuelve rojo al pasar el puntero, incluso con el campo vacío; ese estilo no habilita un envío inválido.
- La búsqueda conserva su listado inicial y carga de forma diferida el corpus Markdown publicado. Mantener relevancia, acrónimos por palabras completas, destinos reales de sección o tiempo, icono azul para videos y alternativa de metadatos/reintento cuando falla la carga. El fondo de los iconos de video y la leyenda CertiTube comparten `--video-accent` en ambos temas; el azul de los enlaces puede variar para conservar contraste.
- En móvil, ocultar el segmento `Developed by` del pie y mantener el botón flotante fuera del texto visible. Comprobar geometría del teclado y de la ventana, y conservar aislamiento del almacenamiento por curso, práctica y chat, incluida la alternativa en memoria.

## Explorador de evidencia

- Las relaciones y enlaces proceden de evidencia vigente validada. No inferir referencias por nombres o palabras clave. Guías en rojo; fuentes de video en azul; una relación azul requiere una referencia de video común a sus extremos. Los conceptos compartidos con evidencia de video usan azul.
- Mantener leyenda compacta con iconos CertiTips/CertiTube y formato del indicador de escala. La tarjeta de concepto tiene borde rojo y línea desde su base hasta el nodo; sus fuentes usan una línea, elipsis y título completo.
- Solo las respuestas terminadas seleccionan evidencia al pasar el puntero, sin mover la cámara. Conservar los manejadores directos e idempotentes por burbuja: la captura delegada de entrada/salida de puntero en el árbol de sombra resultó insuficiente.
- Clic o Enter/Espacio centra la evidencia; los enlaces conservan su navegación. La selección repite ondas que se expanden y desvanecen; ocultar la página o manipular el mapa detiene la repetición. Movimiento reducido usa un aro fijo y omite animación de cámara.
- Validar y limitar los metadatos no confiables del historial. Restaurar no envía consultas pagadas. No simplificar `restoreChat` eliminando validaciones para reducir un indicador de complejidad.

## CertiTube

- Conservar el reproductor a la izquierda y la videoteca a la derecha en escritorio; en móvil, colocar la videoteca debajo. No añadir menú lateral, botón de menú ni bloque Biblioteca.
- El reproductor muestra título revisado y subtítulo `CertiTube`, seguido de reproductor, `Resumen`, una fila de capítulos cuando existan, explicación seleccionada y `Recursos relacionados`. Omitir encabezados externos duplicados y controles permanentes de reproducción.
- El título `Resumen` queda visible al desplazar su texto, con separación suficiente para no cortar la primera línea. Sin segmentos, el resumen aprovecha la altura restante y los recursos quedan al final; no reservar un bloque vacío de capítulos. En móvil, mantener altura natural.
- En vertical, la videoteca muestra el encabezado CertiTube con `Tube` rojo y subtítulo `Videoteca`; ocultar ese encabezado solo en el carrusel horizontal. Conservar el borde superior rojo en ambos modos. Su columna crece de 300 a 360 px cuando hay espacio, dentro del mismo marco. En vertical, conservar miniaturas grandes de 120 a 144 px de ancho y títulos de hasta tres líneas con elipsis. Solo en horizontal, limitar el título a dos líneas y ajustar la altura de la miniatura a esas dos líneas, conservando su proporción. Filas grises como respuestas del chat, borde solo al pasar el puntero y texto completo accesible; sin ordinal ni canal repetido. La fila horizontal mantiene separación entre tarjetas y margen interior al inicio y al final, incluso tras el ajuste automático del desplazamiento; su altura se ajusta al contenido sin márgenes de listas editoriales.
- Desde 1024 px, el conjunto de reproductor y lista, como el explorador, admite hasta 1.200 px. Con chat abierto, centrar ambos paneles juntos con columna de 420 px, separación de 24 px y margen mínimo de 24 px. Mantener inicio 20 px bajo el encabezado y altura calculada de ventana, mínima de 460 px. Al cerrar el chat, centrar sin reservar una columna vacía.
- Reutilizar las flechas de capítulos del explorador y sus controles. Cambiar explicación con transición de altura/texto de 240 ms, cancelando la anterior ante otra selección. Al navegar entre videos con el chat abierto, evitar animar el desplazamiento global del contenido.
- Seguir el tiempo nativo cada 500 ms solo durante reproducción visible, sin volver a buscar el tiempo, desplazar verticalmente la página ni añadir historial. Detener al pausar, terminar, ocultar la página o fallar. La entrada sin fragmento permanece detenida; el enlace externo de recuperación aparece solo ante fallo y conserva el segundo seleccionado.
- Los recursos usan icono de enlace, sin sangría de viñetas, una línea con elipsis y texto completo al pasar el puntero. Mantener foco visible en controles; el enfoque automático de una cita no dibuja otro marco rojo en toda la tarjeta.

## Visor de diagramas

- La imagen ampliada se adapta al espacio disponible sin desplazamiento horizontal, también en ventanas estrechas. No restaurar un ancho mínimo fijo de 960 px.
- El navegador de miniaturas conserva su ancho estándar de 220 px, con separación interior de 12 px. No reducirlo a una columna de 82 px que impida reconocer los gráficos.
- Al abrirlo, el fondo translúcido y desenfocado cubre imagen y descripción, por debajo del navegador y del encabezado. Pulsarlo cierra solo el navegador, sin salir de la presentación ni avanzar la imagen.
- El botón cerrado muestra borde e icono rojos al pasar el puntero; abierto usa fondo rojo e icono blanco. Aplicar el mismo comportamiento de borde/icono a los controles de presentación y cierre.
- Seleccionar una miniatura desplaza suavemente el navegador hasta la selección, sin mover la página de fondo. Respetar la última selección en clics rápidos y usar movimiento inmediato con reducción de movimiento.

## Imágenes para compartir y aceptación

Usar `assets/icons/share-logo-square.png` como imagen Open Graph pública de 512×512, roja y opaca hasta las esquinas. Preservar los píxeles originales del logo; favicon y marca de navegación tienen usos independientes. Comprobar metadatos y píxeles sin enviar mensajes de prueba ni capturas.

Elegir las comprobaciones de [validation.md](validation.md) según el componente. Verificar ambos temas, tamaños a ambos lados del punto de adaptación, teclado, estados abiertos/cerrados, clics repetidos y movimiento reducido cuando corresponda. Medir rectángulos y estilos tras estabilizarse el diseño. No confundir una imagen aportada por el usuario con una autorización para tomar nuevas capturas.
