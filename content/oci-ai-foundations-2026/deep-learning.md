Una red neuronal aprende representaciones que ayudan a resolver una tarea. Para elegir una arquitectura, observa cómo se relacionan los datos: posiciones en una imagen, pasos de una secuencia o columnas de una tabla.

**Objetivos:** seguir el cálculo de una neurona; explicar entrenamiento y backpropagation; comparar MLP, CNN, RNN y LSTM; y reconocer límites de capacidad y generalización.

## Conceptos clave

Una neurona calcula una suma ponderada de entradas, añade un **bias** y aplica una **función de activación**. Los pesos determinan la contribución de cada entrada. La activación aporta no linealidad: apilar transformaciones puramente lineales no produce por sí solo una frontera no lineal.

La capa de entrada recibe características; las capas ocultas producen representaciones intermedias; la de salida representa la predicción. Para reconocer dígitos de 0 a 9, una imagen de 28 × 28 aporta 784 valores si es de un canal y se aplana, y la salida puede tener diez puntuaciones.

![Cálculo de una neurona a través de suma ponderada, sesgo y activación.]({{base}}assets/diagrams/aif-dl-concepts.svg "Una neurona transforma entradas; las capas combinan esas transformaciones.")

Durante el entrenamiento, la red predice, calcula pérdida y propaga gradientes hacia atrás (**backpropagation**). Un optimizador usa esos gradientes para actualizar parámetros. Un **epoch** es una pasada por el conjunto de entrenamiento; un **batch** es un grupo procesado en una actualización. Más épocas o más neuronas no garantizan mejor generalización.

## MLP y redes convolucionales

Un **Multilayer Perceptron (MLP)** conecta capas de neuronas y puede aprender fronteras no lineales. En la demostración de círculos concéntricos, una recta no separa el círculo interior del exterior. Añadir capacidad y activaciones permite una frontera más adecuada; el resultado debe comprobarse en puntos nuevos.

Una **Convolutional Neural Network (CNN)** aprovecha patrones locales y comparte filtros sobre distintas posiciones. Un kernel recorre regiones de la imagen y produce un mapa de características. Las primeras capas pueden responder a bordes y texturas; otras combinan patrones más complejos.

![Etapas de una CNN: filtros locales, activación y reducción espacial antes de clasificar.]({{base}}assets/diagrams/aif-dl-cnn.svg "Convolución extrae patrones locales; pooling resume regiones.")

**ReLU** introduce no linealidad. **Pooling** reduce dimensiones espaciales; no sustituye el aprendizaje de filtros. Capas finales combinan las características para clasificar. **Softmax** convierte puntuaciones en una distribución sobre clases. **Dropout** desactiva aleatoriamente parte de las unidades durante el entrenamiento para regularizar; no significa eliminar permanentemente los datos.

Una CNN puede formar parte de clasificación, detección o segmentación. Clasificar identifica categorías, detectar añade localización y segmentar asigna etiquetas por píxel. No son salidas equivalentes.

## Modelos de secuencia

Una **RNN** procesa pasos ordenados y mantiene un estado oculto. El resultado de un paso influye en el siguiente. Una reseña completa que produce una etiqueta de sentimiento es **many-to-one**; una entrada que genera una secuencia musical, **one-to-many**; traducción entre secuencias, **many-to-many**.

![Comparación de RNN con estado recurrente y LSTM con memoria regulada por compuertas.]({{base}}assets/diagrams/aif-dl-sequence.svg "RNN transporta estado; LSTM regula qué información conservar.")

Las RNN simples pueden tener dificultad con dependencias largas, entre otros motivos por gradientes que se desvanecen durante el entrenamiento. **LSTM** añade estado de celda y compuertas de entrada, olvido y salida. Estas regulan información nueva, retenida y expuesta. Ayuda a conservar contexto, pero no garantiza recordar cualquier longitud.

Otros modelos resuelven objetivos diferentes: los **autoencoders** aprenden a reconstruir entradas mediante una representación; las **GAN** enfrentan generador y discriminador; los **transformers** usan atención y se estudian en el módulo siguiente. No todas las redes se entrenan exclusivamente con etiquetas humanas.

## Ejemplo paso a paso

Supón una neurona con entradas `x1 = 2`, `x2 = 3`, pesos `w1 = 0,5`, `w2 = −1` y bias `1`.

1. Multiplica: `2 × 0,5 = 1` y `3 × (−1) = −3`.
2. Suma y añade bias: `1 − 3 + 1 = −1`.
3. Aplica ReLU: `max(0, −1) = 0`.
4. Durante entrenamiento, compara la salida de la red con el objetivo, calcula pérdida y ajusta los parámetros mediante gradientes.

![Ejemplo numérico de suma ponderada igual a menos uno y salida ReLU igual a cero.]({{base}}assets/diagrams/aif-dl-example.svg "El bias desplaza la suma; ReLU devuelve cero para una entrada negativa.")

En el ejemplo de círculos, cambia una sola variable, como cantidad de neuronas, y observa la frontera. Conserva una evaluación separada: una curva que sigue perfectamente ruido de entrenamiento puede empeorar fuera de él.

## Errores frecuentes

- Atribuir a pooling el ajuste de todos los pesos de una CNN.
- Creer que backpropagation es la inferencia: es parte del cálculo usado al entrenar.
- Elegir una RNN solo porque los datos contienen números, aunque su orden no sea relevante.
- Interpretar una puntuación softmax como certeza de que la etiqueta sea correcta.
- Afirmar que una red más grande siempre es mejor o más explicable.

![Relación entre capacidad, entrenamiento y generalización, con límites de cada concepto.]({{base}}assets/diagrams/aif-dl-errors.svg "Más capacidad necesita mejor evaluación, no confianza automática.")

## Ejercicio de arquitectura

Debes detectar defectos visuales en una pieza y analizar una serie temporal de vibraciones. ¿Qué familias usarías como punto de partida y qué evaluarías?

<details>
<summary>Ver solución y explicación</summary>

Una CNN es un punto de partida para patrones espaciales en imágenes. Para vibraciones ordenadas en el tiempo, compara un modelo de secuencia como RNN o LSTM con una alternativa sencilla. Evalúa con imágenes y periodos nuevos, evitando que muestras casi idénticas del mismo equipo aparezcan a ambos lados de la división. La arquitectura no sustituye datos representativos.

![Solución que diferencia patrones espaciales y dependencias temporales.]({{base}}assets/diagrams/aif-dl-exercise.svg "La estructura espacial o temporal orienta la arquitectura inicial.")

</details>

## Fuentes y repaso

![Repaso de pesos y activación, convolución y memoria secuencial.]({{base}}assets/diagrams/aif-dl-recap.svg "Sigue una neurona, un filtro y un estado: son mecanismos diferentes.")

Revisa Deep Learning Foundations y la demostración de MLP en la [ruta oficial](https://mylearn.oracle.com/ou/learning-path/become-an-oci-ai-foundations-associate-2026/163544). Sin mirar la tabla, explica qué cambia entre clasificación de imagen, detección de objetos y una secuencia de salida.
