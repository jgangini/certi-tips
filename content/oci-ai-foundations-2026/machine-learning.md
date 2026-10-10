Aprender de los datos significa encontrar una relación útil y comprobar que funciona en ejemplos nuevos. Un resultado excelente sobre los datos ya vistos no basta.

**Objetivos:** identificar features y labels; distinguir regresión y clasificación; interpretar clustering y refuerzo; y seguir el flujo de un notebook con separación correcta entre entrenamiento y evaluación.

## Conceptos clave

Una **feature** es una característica de entrada, como horas de uso o temperatura. Una **label**, target o variable objetivo es la respuesta conocida durante el entrenamiento supervisado, como duración de una reparación o tipo de avería. Una fila con entradas y respuesta forma un ejemplo.

El **algoritmo** ajusta parámetros usando los ejemplos. El **modelo entrenado** contiene lo aprendido. **Inferencia** es aplicar ese modelo a una nueva entrada; no implica volver a entrenarlo.

![Separación entre datos con etiquetas, entrenamiento e inferencia sobre datos nuevos.]({{base}}assets/diagrams/aif-ml-concepts.svg "Entrenar ajusta el modelo; inferir utiliza lo aprendido.")

En **regresión**, la salida es numérica: horas estimadas de reparación. En **clasificación**, la salida es una clase: avería eléctrica, mecánica o de software. Dos clases constituyen clasificación binaria; más de dos, multiclase.

## Aprendizaje supervisado y evaluación

Una regresión lineal sencilla calcula `predicción = w × x + b`. El peso `w` cambia la pendiente y el sesgo `b` desplaza la recta. La función de pérdida mide el error; el entrenamiento busca parámetros que lo reduzcan. Una pérdida cuadrática penaliza más los errores grandes.

La **regresión logística**, pese a su nombre, sirve para clasificación. En su versión binaria, una sigmoide transforma una puntuación en un valor entre 0 y 1. Un umbral convierte ese valor en una decisión. El umbral apropiado depende del costo de falsos positivos y falsos negativos; no es una ley fija de 0,5.

![Flujo de separar los datos, ajustar solo con entrenamiento y evaluar en datos reservados.]({{base}}assets/diagrams/aif-ml-evaluation.svg "Separa antes de ajustar: el conjunto de prueba no enseña al modelo.")

Reserva datos para evaluar generalización. **Train** ajusta; **validation** ayuda a elegir configuraciones; **test** estima el resultado final sin seguir afinando contra él. Si estandarizas, calcula media y desviación solo sobre entrenamiento y reutiliza esa transformación. Ajustarla usando todos los datos filtra información del test.

**Accuracy** es aciertos dividido por casos, pero puede engañar con clases desbalanceadas. Si 98 de 100 equipos están sanos, responder siempre «sano» alcanza 98% y detecta cero fallos. **Precision** responde cuántas alertas eran correctas; **recall**, cuántos fallos reales encontraste. **F1** combina ambas. **Overfitting** es ajustarse demasiado a los ejemplos vistos y generalizar mal.

## Clustering y aprendizaje por refuerzo

El aprendizaje **no supervisado** descubre estructura sin una etiqueta objetivo. Un clustering podría agrupar equipos por patrones de uso. La distancia y el escalado influyen: medir horas y voltios sin tratar sus escalas puede dominar los grupos. Un grupo matemático necesita interpretación; no trae un nombre de negocio garantizado.

En **reinforcement learning**, un agente observa un estado, selecciona una acción e interactúa con un entorno que devuelve consecuencias y recompensa. Una **política** guía las acciones. El objetivo es mejorar la recompensa acumulada, considerando resultados futuros. Explorar permite aprender; explotar usa lo que ya funciona. Un agente LLM que llama herramientas no está necesariamente entrenándose por refuerzo durante esa conversación.

![Comparación entre etiquetas, grupos y recompensas como señales de aprendizaje.]({{base}}assets/diagrams/aif-ml-approaches.svg "Etiquetas para supervisado, estructura para clustering y recompensa para refuerzo.")

## Ejemplo paso a paso

En la demostración de Iris, cuatro medidas de sépalos y pétalos son las features y la especie es la etiqueta. Hay tres especies: es clasificación multiclase, aunque el algoritmo usado se llame regresión logística.

1. Abre un notebook de Jupyter y reconoce sus celdas de código y Markdown. El kernel conserva variables; reiniciarlo y ejecutar en orden comprueba reproducibilidad.
2. Inspecciona columnas y valores faltantes. Retira el identificador de fila y la especie de las entradas.
3. Divide ejemplos en entrenamiento y prueba; una semilla fija hace reproducible la división, no garantiza calidad.
4. Ajusta escalado y clasificador con entrenamiento. Transforma las entradas del test sin reajustar el escalador.
5. Compara predicciones con etiquetas reservadas; transforma una flor nueva con el mismo escalador antes de inferir.

![Recorrido de Iris desde cuatro medidas hasta evaluación y predicción de una nueva flor.]({{base}}assets/diagrams/aif-ml-example.svg "La especie es la respuesta; no debe aparecer entre las características de entrada.")

Un 100% en una partición pequeña no prueba perfección universal. Repite la evaluación con datos representativos y revisa los casos difíciles.

## Errores frecuentes

- Evaluar solo con las filas utilizadas para entrenar.
- Confundir una variable numérica que codifica categorías con un problema de regresión.
- Suponer que todo punto atípico es fraude o toda agrupación es una clasificación supervisada.
- Ajustar el escalador o seleccionar features con información del test.
- Dar al modelo una columna calculada después del evento que pretende predecir.

![Contraste entre memorización, fuga de datos y evaluación sobre ejemplos realmente nuevos.]({{base}}assets/diagrams/aif-ml-errors.svg "Una buena puntuación necesita un procedimiento de evaluación válido.")

## Ejercicio de diagnóstico

De 200 equipos, 190 están sanos y 10 fallan. Un modelo predice «sano» para todos. Otro problema pide estimar horas de reparación. ¿Qué concluyes del primer modelo y qué tarea es la segunda?

<details>
<summary>Solución</summary>

El primero alcanza `190 / 200 = 95%` de accuracy, pero su recall para fallos es `0 / 10 = 0%`. No cumple la tarea de detectarlos. Estimar horas es regresión. Debes elegir métricas y evaluar cada objetivo por separado; una cifra global alta no sustituye el resultado de negocio.

![Cálculo de 95 por ciento de aciertos y cero fallos detectados, junto a la salida numérica de regresión.]({{base}}assets/diagrams/aif-ml-exercise.svg "95% de accuracy puede coexistir con 0% de detección de fallos.")

</details>

## Fuentes y repaso

![Repaso del objetivo, la señal de aprendizaje y la evaluación con datos reservados.]({{base}}assets/diagrams/aif-ml-recap.svg "Describe la señal de aprendizaje y la prueba de generalización.")

Repasa Machine Learning Foundations y sus demostraciones en [Oracle MyLearn](https://mylearn.oracle.com/ou/learning-path/become-an-oci-ai-foundations-associate-2026/163544). Explica por qué validar un formato fijo no necesita ML y por qué el nombre «regresión logística» no describe una salida continua.
