# Organización y depuración · 11 de octubre de 2026

La fuente publicada es el conjunto de páginas definido en `data/catalog.json`. El build no recorre copias, archivos históricos ni transcripciones para elaborar el corpus.

```text
content/<código>/NN_nombre/
  NN_nombre.md
  img/                         # SVG y PNG usados por este módulo
data/<código>/
  questions.json
  coverage.json
data/CDMP-DMF/
  architecture/                # Ocho especificaciones de autoría
  diagram-sources/             # Dos originales aportados; procedencia conservada
assets/                        # Interfaz, iconos, licencias y animación compartidos
docs/archive/                  # Material retirado, fuera del sitio y del corpus
```

La numeración sigue `modules` y después `resources`. `file` controla la ubicación física; `slug` conserva el enlace del módulo. `course.id` mantiene las claves de progreso, las salas y los IDs de las fuentes. `route` publica por código, sin convertir CDMP-DMF en un examen Oracle. Los alias anteriores redirigen y los enlaces de módulo conservan `#apartado`.

| Código | Markdown | SVG utilizados | Introducciones | Secciones | Preguntas | Unidades de recuperación |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1Z0-1085-26 | 11 | 49 | 11 | 58 | 42 | 111 |
| 1Z0-1122-26 | 13 | 63 | 13 | 74 | 54 | 141 |
| 1Z0-1157-26 | 10 | 58 | 10 | 72 | 36 | 118 |
| CDMP-DMF | 16 | 66 | 16 | 75 | 66 | 157 |
| Catálogo de portada | — | — | — | — | — | 1 |
| Total | 50 | 236 | 50 | 279 | 198 | 528 |

Los 528 documentos del índice no son 528 archivos Markdown. Se extraen introducciones, secciones con ancla y preguntas explicadas. Tres documentos largos se dividen en dos, generando 531 segmentos para Cognee. Unir los Markdown no reduce estas unidades y dificultaría editar, citar y recuperar una sección concreta. Las introducciones contienen texto propio. Solo las cuatro introducciones de Práctica repiten 63 caracteres de carga; no se fusionan porque pertenecen a cuatro páginas distintas.

## Resultado del inventario

- Los 236 SVG de curso están utilizados y cada uno pertenece a un solo Markdown. No hubo duplicados por SHA256 entre las 270 imágenes versionadas examinadas. Los nombres parecidos entre cursos no bastan para declarar duplicación.
- Se trasladaron los 50 Markdown y 240 imágenes vigentes (236 SVG y cuatro PNG) a sus módulos. Los dos PNG usados dentro de `oci-runtime.svg` permanecen junto a él y se incrustan al construir el sitio.
- `grounded-answer.png` y `support-agent.png`, conservados solo como referencias editoriales, pasan a `docs/archive/illustrations/`: dejan de copiarse a `dist/`, aproximadamente 3,7 MB menos. La ilustración vigente pierde el sufijo `-v2` dentro de su propio módulo.
- `review.md` y `study-path.md` estaban retirados del catálogo; se conservan en `docs/archive/1Z0-1157-26/`, fuera de `content/`. El archivo no se publica ni se indexa.
- Los ocho JSON de arquitectura y dos SVG originales de Governance se agrupan en `data/CDMP-DMF/`. Conservan su función de autoría y procedencia. Los 18 iconos Lucide originales y licencias siguen siendo recursos compartidos verificados, no residuos.
- La auditoría de 26 scripts y 56 archivos de servicios no encontró duplicados no vacíos ni archivos malformados: se comprobaron sintácticamente 17 JavaScript, nueve PowerShell y 32 Python. Los checks de navegador, despliegue y recuperación tienen fines distintos; no se eliminan por no figurar en `package.json`.
- `requirements*.in` y `requirements*.txt` son especificaciones y locks de dependencias. `videos/` conserva el proyecto editable del vídeo de portada y sus recursos de plantilla. No es otra copia de las guías.
- `dist/`, `output/`, `node_modules/`, Graphify, cachés y `.private/` no son fuentes públicas y están ignorados. `dist/` se reemplaza en cada build. No existe una carpeta `source/` versionada; las transcripciones permanecen fuera del repositorio y no se incorporan al corpus.
- `data/certichat-graph.json` es una proyección pública necesaria para servir el grafo estático; no contiene otra colección de lecciones. Las bases nativas de Cognee y las credenciales permanecen fuera de Git.

## Índice y versiones

El cambio de URL de CDMP-DMF modifica el hash del corpus publicado. La igualdad de todos los IDs, títulos, cursos y hashes de texto permite reutilizar el índice nativo ya terminado. El snapshot conserva su versión física y sus bases intactas; las citas usan exclusivamente las URL del manifiesto vigente validado. Cualquier alta, baja o cambio de contenido impide reutilizar ese snapshot. No se reescriben bases abiertas ni se inventan enlaces por sustitución de cadenas.

La mudanza se contrastó con la publicación anterior: 528 documentos y todos sus textos e identidades permanecen iguales; solo cambian las 157 URL de CDMP-DMF. El resultado previsto y construido coincide en `948be480197dbe1b745a03588e0c36630602b5d5b6f2ff8d5c819878a5d68eb4`.

## Comprobaciones manuales disponibles

Los comandos de navegador se ejecutan con `playwright-cli -s=<sesión> run-code --filename scripts/<archivo>`, sobre una sesión aislada del preview. No toman capturas.

| Archivo | Propósito |
| --- | --- |
| `governance-smoke.cjs` | Curso CDMP-DMF, navegación, diagramas, móvil y práctica |
| `anchor-navigation-smoke.cjs` | Enlaces de fuentes, anclas e imágenes retrasadas |
| `certichat-explorer-smoke.cjs` | Selección por respuesta, grafo, enlaces y movimiento reducido |
| `certichat-mobile-smoke.cjs` | Panel, teclado y controles móviles |
| `certiquiz-animation-check.cjs` | Animaciones y geometría de participantes |
| `certichat-local-selfcheck.ps1` | Configuración local, aislamiento y recuperación; se ejecuta con PowerShell |

Las pruebas ordinarias siguen siendo `npm run build`, `npm run check` y `npm test`, más las suites de cada servicio cuando se modifica su contrato.
