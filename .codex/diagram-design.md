# Criterios de diseño de diagramas de CertiTips

Esta guía define cómo construir, revisar y mejorar los diagramas de cualquier curso. Sus reglas son autosuficientes: una imagen existente puede ayudar a explorar una solución, pero no sustituye los criterios escritos ni determina por sí sola cómo debe ser otra imagen.

## 1. Diseñar la explicación antes que las formas

- Definir qué debe comprender el lector, qué elementos intervienen y qué relación demuestra la figura. Cada elemento visible debe contribuir a esa explicación y cada rótulo pertenecer claramente a una entidad, celda, etapa o conexión. Si el significado necesita una aclaración, corregir el contenido, las etiquetas o la descripción antes de decorar el gráfico.
- Elegir la representación por su función: tabla para atributos, registros y resultados; matriz para cruces de responsabilidades o criterios; conjuntos para pertenencia e intersección; círculos para entidades o instancias; jerarquía para niveles; línea de tiempo para vigencia y sucesión; flujo para transformaciones o decisiones; arquitectura para componentes y sus relaciones. No convertir todas las explicaciones en tarjetas, flujos lineales o círculos.
- Conservar cantidades, unidades, identificadores, cardinalidades, claves y condiciones. Un conector entre campos debe terminar en los campos relacionados; una flecha debe expresar una dirección real. Distinguir asociación, dependencia, secuencia y separación visual.
- Usar un título breve que nombre la idea y sea coherente entre lección, imagen y visor. En títulos, iniciar en mayúscula las palabras principales y dejar artículos, preposiciones y conjunciones en minúscula salvo al inicio: «Gobierno de Datos». Respetar los nombres oficiales. Integrar en el título un rótulo general que, dentro del dibujo, no corresponda a ningún elemento.
- La descripción debe explicar la relación o mecanismo y su utilidad. Cuando la figura presenta un caso, recorrer sus actores y acciones: quién interviene, qué hace y qué demuestra el resultado. No limitarse a repetir etiquetas ni enumerar elementos sin explicar su relación.

## 2. Lienzo, color y jerarquía

La publicación y la validación incrustan las fuentes abiertas existentes: Didact Gothic para texto y JetBrains Mono para código. Las familias históricas Segoe UI, Oracle Sans y Consolas se adaptan a esas fuentes sin cambiar los originales. Los SVG publicados permanecen autocontenidos y con texto editable; no dependen de fuentes instaladas en el equipo. Se admiten únicamente fuentes WOFF2 internas válidas, sin recursos externos ni raster. Medir después de `document.fonts.ready`.

Las unidades siguientes pertenecen al SVG. Son parámetros base de autoría para mantener coherencia; no requieren copiar medidas de otra figura. El tamaño de los contenedores se ajusta al contenido. La paleta y la jerarquía son comunes; alturas, anchos y separaciones iniciales se ajustan para cumplir significado, legibilidad y rellenos, sin recortar ni reducir texto para encajarlo.

| Elemento | Criterio |
| --- | --- |
| Lienzo | `viewBox="0 0 1920 1080"`, fondo `#F1EFED`. |
| Título | Didact Gothic, tamaño 56, peso 700, color `#3C4545`, origen (96,99). |
| Acento del título | Rectángulo `#C74634`, 88×6, origen (96,128). |
| Texto de contenido | Didact Gothic, mínimo 25.5; `#3C4545` para texto general y `#181818` para valores y etiquetas. |
| Superficie de contenido | Blanco `#FFFFFF`; el fondo oscuro de una cabecera no debe extenderse al cuerpo. |
| Cabeceras y estructura | Gris `#59616E`; texto e iconos blancos sobre cabeceras oscuras. |
| Notas explicativas | Fondo neutro `#F1EFED`, borde gris, texto oscuro. |
| Acentos semánticos | Rojo `#C74634` para énfasis, retirada o condición inválida; verde `#2E7D32` para condición válida/activa. Verde `#397C46` y verde azulado `#007E87` pueden diferenciar categorías rotuladas. |

- Mantener el mismo significado del color dentro de cada figura. Mostrar también la palabra o símbolo que expresa el estado; el color no debe ser la única información. Para comparar estados, preferir superficies neutras con texto de color a grandes fondos rojo/verde. Las áreas coloreadas se justifican cuando representan grupos, niveles o datos.
- Reservar la negrita para títulos, cabeceras y énfasis necesario. Usar peso normal en valores, etiquetas y preguntas de decisión. Mantener el mismo tamaño y peso en elementos equivalentes. No destacar todo el contenido a la vez.
- Mantener contraste legible en texto e iconos. Los bordes de insignias necesitan al menos 3:1 respecto al relleno y al fondo exterior; no basta con comprobar uno de los dos.

## 3. Composición y alineación

- Organizar la lectura y las conexiones antes de fijar coordenadas. Compartir marco cuando varias columnas sean etapas o vistas de un mismo mecanismo; separar bloques cuando representen unidades independientes. El número de columnas procede de la explicación, no de una plantilla.
- Centrar el cuerpo completo, incluidas sus notas, en el área disponible bajo el título: centro base (960,608). Mantener el título fuera de ese grupo. Comprobar primero el conjunto, después los bloques y finalmente su contenido; centrar piezas por separado no garantiza una composición centrada.
- Alinear los bordes superiores e inferiores de elementos equivalentes, sus filas relacionadas y los ejes de sus conexiones. Igualar alturas solo cuando los bloques deban leerse como pares o etapas comparables. Colocar cada nota debajo de su propio bloque, con proximidad y ancho que dejen clara la asociación.
- Medir la geometría visible de letras e iconos, no solo sus cajas nominales ni la línea base del texto. Tratar icono y rótulo como un grupo para centrarlo; después revisar la separación entre ambos. Revisar por separado texto y fondo de una etiqueta: el fondo puede estar centrado y el texto desplazado.
- En tarjetas centradas, admitir como máximo 2 unidades de desplazamiento y mantener al menos 12 de relleno interior. Para grupos compactos, usar 8–24 entre icono y rótulo, con desviación de eje máxima de 4; entre título interno y descripción, partir de 8–16. Medir tras renderizar.
- Reducir huecos que no expresen agrupación o jerarquía. Evitar tanto bloques vacíos innecesariamente altos como elementos pegados al borde. Ensanchar, redistribuir o ajustar los saltos de línea antes de reducir tipografía. Comprobar el resultado dentro de la página y del visor, además del SVG aislado.

## 4. Tablas, etiquetas y notas

| Componente | Medidas iniciales y comportamiento |
| --- | --- |
| Cabecera simple | Altura 64; una línea cuando quepa con su relleno. |
| Fila de texto | Altura 52–56; texto normal alineado a la izquierda salvo motivo para centrarlo. |
| Fila con etiqueta | Altura 72 para una etiqueta de altura 48. |
| Cabecera con icono | Altura 80–96 según contenido; centrar el conjunto visible. |
| Rellenos | Horizontal mínimo 12; vertical mínimo 8 en filas y 12 en cabeceras/notas. |
| Bordes y esquinas | Reglas de tabla de 1.5; radios ordinarios de 12–16. |
| Etiqueta | Fondo blanco, texto `#181818` normal en una línea, borde gris de 1.5, radio 12, altura 48 y relleno horizontal mínimo 12. |
| Nota | Altura del contenido renderizado más 24–32; texto normal centrado si es una nota breve. |

- Calcular ancho y alto a partir del texto real y el espacio requerido. Una cabecera no debe saltar de línea si cabe en una; si no cabe, redistribuir anchos o permitir un salto intencionado. El interlineado debe mantener legibilidad y equilibrio, no reproducir una distancia tomada de otra imagen.
- Usar etiquetas para identificar o rotular una relación cuando aporten claridad. Los valores ordinarios, estados y resultados de una tabla no necesitan una etiqueta alrededor; pueden usar texto simple y color semántico. Un resultado tabular se integra en una fila, sin añadir un círculo decorativo.
- Mantener blanco el cuerpo de la tabla y reservar el gris oscuro para su cabecera. Redondear las esquinas exteriores; mantener recto el borde inferior de la cabecera para que encaje con el cuerpo. Usar separadores blancos dentro de cabeceras oscuras, líneas grises finas entre celdas y divisores discontinuos solo para distinguir áreas. No confundir divisores con conexiones entre datos.
- Una nota de dos líneas no tiene una altura fija universal. Derivarla de las dos líneas y sus márgenes. No trasladar a todas las figuras una altura, ancho o espaciado que resolvió un único caso.

## 5. Conectores, símbolos y tiempo

- Usar conectores continuos grises `#59616E`, de ancho 3, como base. Preferir segmentos rectos entre elementos alineados. Cuando haya un giro necesario, usar rutas ortogonales y curvas de radio 16; evitar rodeos, cruces y grosor que compita con el contenido.
- Añadir punta de flecha cuando haya flujo o referencia dirigida. Una asociación sin dirección puede carecer de punta. Centrar el extremo sobre el punto real de entrada/salida; no apuntar al espacio entre filas. Mantener continuo el trazado hasta su punta y separar rutas que se superpongan.
- Rotular decisiones y cardinalidades junto a la conexión correspondiente. Mantener las etiquetas de conexión a unas 16 unidades de la línea. Una ruta discontinua o de otro color necesita significado explícito, por ejemplo una alternativa que no garantiza el resultado; no usarla como adorno.
- Para entidades representadas por círculos, usar fondo blanco, borde gris fino, nombre oscuro en negrita e identificador rojo normal. La forma no implica que otros tipos de resultados deban presentarse igual.
- Usar iconos reconocibles del catálogo existente, de una fuente establecida o proporcionados por el usuario; evitar inventar un símbolo cuando ya existe uno adecuado. Elegirlos por significado: robot para agente, procesador para modelo, ventana para aplicación, flujo para orquestación y herramienta para ejecución. Una marca de verificación indica una comprobación realizada, no una capacidad prometida. Conservar geometría, atribución y licencias; un icono de servicio debe corresponder al servicio rotulado y acompañarse de un nombre legible. Mejorar su contraste mediante fondo o variante permitida sin cambiar su identidad ni recolorear arbitrariamente una marca.
- En líneas de tiempo, usar un eje horizontal continuo, hitos alineados, estados cerca y por encima de cada hito, fechas por debajo. Distinguir inicio, evento y retirada mediante etiquetas y color. Conservar las condiciones que permiten interpretar una fecha; un estado actual no sustituye una condición histórica.

## 6. Construcción y revisión

- Editar SVG nativo y conservar lo que ya funciona. No regenerar en masa para resolver un ajuste local. Mantener `title`, `desc` y nombre accesible; prohibir contenido activo, dependencias externas y raster incrustado. Todos los gráficos publicados son vectoriales con texto editable, nunca letras convertidas a trazados. La excepción PNG del logo para compartir no aplica a diagramas. Aplicar [Internacionalización](internacionalizacion.md) y comprobar geometría en ES/EN/PT-BR/IT.
- Preservar los originales proporcionados y los símbolos oficiales. Una excepción de un original debe indicar qué propiedad se conserva y por qué; no se convierte en una alternativa de estilo para figuras nuevas. Sus transformaciones y metadatos son evidencia del caso, no valores globales.
- Marcar el cuerpo con `data-layout="module-artwork"` y `data-center="960 608"`. Para tarjetas centradas, usar `data-layout="centered-card"` y agrupar lo visible en `data-card-content`. En celdas nuevas o revisadas usar `data-table-cell` con valor `header`, `row`, `tag-row`, `icon-header` o `note`, exactamente un `data-cell-frame` y un `data-cell-content`. Usar `data-cell-align="center"` solo donde se pretende centrar.
- `data-cell-exception` requiere una razón semántica o de composición concreta; no justifica recortes, desalineación ni vacíos accidentales. No quitar marcas para eludir una comprobación.
- Después de editar diagramas, ejecutar `scripts/diagram-check.cjs` sobre el DOM renderizado y las comprobaciones del sitio indicadas en [validation.md](validation.md). Inspeccionar cuántos elementos fueron medidos: algunas comprobaciones actuales dependen de atributos o prefijos y no cubren por igual todos los archivos. Comprobar explícitamente cualquier criterio aplicable que la herramienta no mida.
- Revisar en este orden: significado y fidelidad; lectura y agrupación; dimensiones y jerarquía; alineación y conexiones; contraste y legibilidad; coherencia con la descripción. Iterar si falla cualquiera. Ausencia de colisiones no demuestra claridad, y una prueba aprobada no demuestra cobertura completa. Usar DOM, geometría y lectura del contenido; no tomar capturas como verificación.

## 7. Cómo mejorar esta regla durante el trabajo

1. Ante una corrección, identificar la causa general y su alcance: por ejemplo, «ajustar la altura al contenido» en lugar de «hacer todas las notas de 116». Distinguir un defecto repetible de una preferencia para una figura concreta.
2. Incorporar un criterio explícito del usuario cuando aplique al diseño general. Para hallazgos propios, exigir al menos dos recurrencias en el repositorio antes de promoverlos a regla común; mientras tanto, resolver el caso y registrar solo la evidencia útil. Una observación aislada no autoriza imponer un nuevo estilo a todos los cursos.
3. Formular la regla con condición de aplicación, resultado esperado y forma de verificarlo. Separar invariantes de significado/legibilidad de medidas iniciales ajustables. Si una corrección posterior reemplaza otra, conservar la decisión vigente y su razón.
4. Editar la regla existente y retirar formulaciones superadas; no apilar instrucciones contradictorias ni añadir una excepción por cada imagen. Mantener esta guía como única definición del criterio, sin remitir a módulos, capturas o chats para poder aplicarlo.
5. Registrar en [improvement-log.md](improvement-log.md) la fecha, el problema observado, la evidencia, el criterio adoptado y su alcance. Las referencias históricas pueden quedar allí como trazabilidad, pero no son requisitos para diseñar.
6. Cuando el criterio sea repetible y medible, extender la comprobación existente con el caso mínimo que detecte la regresión y ejecutarlo sobre las figuras afectadas. Los criterios semánticos requieren revisión del contenido. No inventar una medición para simular una revisión de diseño ni afirmar que una regla está automatizada cuando no lo está.
