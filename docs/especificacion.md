# Especificación funcional: entrenador personal de ajedrez

## Objetivo

Desarrollar un entrenador de ajedrez personalizado que analice la
evolución real del jugador, entienda su estilo, detecte patrones de
error y proponga un itinerario de aprendizaje progresivo. Debe
comportarse como un profesor cercano y adaptable: recomienda qué
trabajar, explica el porqué y permite que el jugador elija qué
actividades realizar.

**Importante para la implementación:** este documento recoge decisiones
funcionales. No presupone una arquitectura, una tecnología ni una
plataforma de ajedrez concreta. Antes de implementar, inspecciona el
proyecto existente y determina qué encaja con su estructura actual.

## 1. Perfil y modelo del jugador

El entrenador debe construir y actualizar un perfil dinámico a partir de
las partidas y del rendimiento en las actividades.

Debe intentar identificar, entre otros aspectos:

-   Nivel aproximado y evolución del jugador (por ejemplo, Elo cuando la
    plataforma lo proporcione).
-   Estilo de juego: agresivo, defensivo, posicional, táctico, de
    iniciativa, de control, etc.
-   Fortalezas: patrones tácticos que reconoce bien, uso de piezas,
    cálculo, finales, comprensión de posiciones, entre otras.
-   Debilidades y errores recurrentes: piezas colgadas, amenazas no
    vistas, errores de cálculo, problemas de desarrollo, gestión del
    tiempo, finales, etc.
-   Preferencias y respuesta a distintos tipos de explicación o
    entrenamiento.

No conviertas estas etiquetas en categorías rígidas. El perfil debe
basarse en evidencias, reflejar incertidumbre cuando haya pocos datos y
cambiar conforme evolucione el jugador.

## 2. Conexión con la plataforma de ajedrez

La opción preferida es conectar directamente la plataforma donde juega
el usuario para importar y analizar sus partidas automáticamente,
evitando que tenga que subir archivos manualmente.

Requisitos:

-   Investigar qué plataformas se pueden integrar y qué APIs o
    mecanismos oficiales ofrecen.
-   Detectar qué datos están disponibles: partidas, movimientos, fechas,
    controles de tiempo, resultados, Elo y color, entre otros.
-   Sincronizar partidas nuevas de forma automática, con una estrategia
    razonable de actualización y sin duplicados.
-   Gestionar errores de conexión, límites de API, partidas privadas y
    permisos de forma segura.
-   Permitir revisar el estado de la conexión y volver a sincronizar
    cuando sea necesario.
-   Mantener la posibilidad de importar PGN como alternativa o mecanismo
    de recuperación si la integración lo requiere.

**Pendiente de decisión:** la plataforma concreta que se conectará. No
elijas una por suposición; revisa el proyecto y plantea las opciones
compatibles.

## 3. Análisis de partidas y comparación con maestros

El entrenador no debe limitarse a indicar qué apertura se ha jugado.
Debe ayudar a comprender y mejorar las decisiones del jugador.

Para cada partida, cuando los datos y los motores disponibles lo
permitan:

-   Analizar los movimientos y localizar errores, imprecisiones,
    oportunidades tácticas y mejores alternativas.
-   Explicar las consecuencias de las decisiones con un lenguaje
    adecuado al nivel del jugador.
-   Reconocer patrones que se repiten en distintas partidas.
-   Identificar la apertura y la estructura de peones o planes típicos
    cuando sea posible.
-   Comparar las decisiones con teoría de aperturas y partidas reales de
    grandes maestros (GM).
-   Señalar desviaciones relevantes de la teoría, explicar qué suelen
    jugar los maestros y, sobre todo, por qué.
-   Distinguir entre una desviación teórica que es perfectamente jugable
    y un error real. No presentar la jugada de GM como única opción
    correcta.
-   Convertir los hallazgos en recomendaciones y ejercicios concretos.

Las comparaciones con partidas de GM deben apoyarse en bases de partidas
y fuentes de datos cuya licencia y condiciones de uso se hayan
comprobado.

## 4. Repertorio y recomendaciones de aperturas

El entrenador debe sugerir aperturas y líneas compatibles con el estilo,
fortalezas, nivel y preferencias observadas del jugador.

Ejemplos de señales que puede considerar:

-   Si el jugador busca posiciones agresivas o prefiere posiciones
    sólidas.
-   Si destaca en patrones tácticos concretos, como forks (ataques
    dobles), clavadas o ataques al rey.
-   Si se siente cómodo con determinadas estructuras de peones o tipos
    de medio juego.
-   Qué resultados y dificultades muestra en las aperturas que ya juega.

Las sugerencias deben incluir una explicación de por qué esa apertura
podría encajar, qué ideas debería aprender y qué posibles inconvenientes
tiene.

**El entrenador recomienda, no impone.** El jugador conserva el control
de su repertorio y puede aceptar, ignorar o explorar otras aperturas.
Las recomendaciones deben mejorar con los datos acumulados.

## 5. Entrenamiento adaptativo basado en errores propios

El sistema debe generar un ciclo continuo de mejora:

1.  Analizar las partidas del usuario.
2.  Detectar errores recurrentes, fortalezas y oportunidades
    desaprovechadas.
3.  Priorizar los aspectos que más pueden mejorar su juego.
4.  Crear ejercicios y mini lecciones a partir de esas necesidades.
5.  Ajustar la dificultad según el rendimiento.
6.  Comprobar posteriormente si el jugador ha corregido los patrones
    detectados.

Siempre que sea viable, los ejercicios tácticos deben partir de
posiciones de las propias partidas del usuario, incluyendo oportunidades
que no vio o decisiones que tomó incorrectamente. También puede
complementar con ejercicios externos adecuados al objetivo.

No repetir únicamente puzzles genéricos sin relación con el diagnóstico
del jugador.

## 6. Recomendaciones diarias por bloques (experiencia tipo Duolingo)

La experiencia debe organizarse en piezas o bloques independientes, no
en una sesión cerrada que obligue al usuario a reservar una cantidad
concreta de tiempo.

Cada día, el entrenador prepara una selección de actividades
recomendadas, por ejemplo:

-   A. Mini lección de táctica (aprox. 10 minutos).
-   B. Práctica personalizada con posiciones de sus partidas (aprox. 15
    minutos).
-   C. Lección de aperturas o repaso de repertorio.
-   D. Ejercicio de estrategia o finales.
-   E. Repaso de errores anteriores.

Los tiempos son orientativos y configurables; no deben convertirse en
una obligación ni en un límite rígido.

**Decisión funcional clave:** el sistema no debe empezar preguntando
cuánto tiempo tiene el usuario. Debe presentar las recomendaciones del
día y permitir que el usuario elija libremente qué bloques hacer: solo
A, A y C, B y C, todos, etc. El usuario puede completar un bloque y
continuar con el siguiente cuando quiera.

La experiencia debe recordar a Duolingo en cuanto a claridad,
continuidad, pequeñas lecciones y sensación de progreso, pero adaptada
al aprendizaje del ajedrez.

El sistema debe:

-   Explicar brevemente por qué recomienda cada bloque.
-   Mostrar el progreso y qué actividades quedan pendientes, sin
    penalizar al usuario por no completarlas.
-   Permitir retomar el itinerario en otro momento.
-   Actualizar las recomendaciones según las partidas y el rendimiento
    reciente.
-   Evitar que la rutina se vuelva repetitiva; equilibrar refuerzo de
    debilidades y desarrollo de fortalezas.

## 7. Personalidad y adaptación pedagógica

El profesor debe combinar cercanía y rigor técnico.

-   Tono natural, amable y motivador, sin resultar infantil ni
    excesivamente formal.
-   Explicaciones claras y directas, evitando tecnicismos innecesarios.
-   Utilizar terminología ajedrecística precisa cuando el nivel lo
    permita y explicar los términos nuevos cuando haga falta.
-   Adaptar automáticamente la profundidad, vocabulario y complejidad al
    nivel demostrado por el jugador.
-   No explicar conceptos básicos a un jugador avanzado como si fuera
    principiante.
-   No abrumar a un principiante con análisis demasiado técnicos.
-   Permitir que el usuario solicite más profundidad, variantes o
    explicaciones sencillas.
-   Ajustar progresivamente el nivel de las explicaciones conforme el
    jugador mejora.

El objetivo es que se sienta como un profesor que conoce al jugador y su
evolución, no como un analizador frío que devuelve puntuaciones.

## 8. Principios de producto

-   **Personalización basada en datos:** las recomendaciones deben
    derivarse de partidas y resultados reales, no de suposiciones.
-   **Autonomía:** el entrenador propone; el jugador decide.
-   **Continuidad:** mantener un historial de aprendizaje y evitar
    empezar de cero en cada sesión.
-   **Explicabilidad:** justificar las recomendaciones y mostrar qué
    evidencia las respalda.
-   **Progreso medible:** observar si disminuyen los errores recurrentes
    y mejoran las áreas trabajadas.
-   **Calidad antes que cantidad:** priorizar pocas recomendaciones
    útiles frente a listas interminables.
-   **Privacidad y permisos:** tratar las cuentas y partidas conectadas
    de forma segura y respetar los permisos y condiciones de cada
    plataforma.

## 9. Qué debe hacer Cloud Code antes de implementar

Inspecciona el repositorio y la arquitectura actual del proyecto. No
empieces a modificar código basándote únicamente en este documento.

Entrega primero un análisis que incluya:

1.  Qué partes del sistema ya existen y cuáles se pueden reutilizar.
2.  Qué componentes, servicios, modelos de datos y pantallas habría que
    crear o modificar.
3.  Qué plataforma de ajedrez sería viable conectar, qué APIs ofrece y
    qué limitaciones tiene.
4.  Cómo obtener y almacenar partidas, análisis, perfil del jugador,
    errores recurrentes, ejercicios y progreso.
5.  Qué motor de análisis y qué fuentes de partidas/teoría de GM podrían
    utilizarse, teniendo en cuenta licencias, rendimiento y costes.
6.  Cómo generar ejercicios a partir de posiciones reales y validar que
    las soluciones sean correctas.
7.  Cómo implementar el sistema de recomendaciones diarias por bloques y
    la selección libre de actividades.
8.  Cómo adaptar el lenguaje y profundidad pedagógica al nivel del
    jugador.
9.  Riesgos técnicos, dependencias, costes, límites de API y cuestiones
    de privacidad.
10. Una propuesta de implementación por fases, con prioridades,
    dependencias y criterios de aceptación.

Después del análisis, presenta un plan concreto y espera confirmación
antes de realizar cambios estructurales importantes. Si detectas
decisiones que este documento deja abiertas, enuméralas y recomienda una
opción con sus ventajas e inconvenientes; no las resuelvas
silenciosamente mediante suposiciones.

## 10. Criterios de aceptación funcional

La primera versión de estas funcionalidades debería permitir comprobar
que:

-   El usuario puede conectar una plataforma compatible y sincronizar
    sus partidas sin subir cada PGN manualmente.
-   El entrenador analiza partidas y detecta al menos algunos patrones
    de error y fortalezas.
-   Las explicaciones se adaptan al nivel del jugador.
-   El entrenador ofrece recomendaciones de aperturas razonadas y no
    obligatorias.
-   El usuario recibe bloques de entrenamiento recomendados y puede
    elegir cualquier combinación.
-   Puede completar bloques en momentos distintos sin perder el
    progreso.
-   Los ejercicios personalizados se relacionan con errores u
    oportunidades detectados en sus partidas.
-   Las recomendaciones cambian cuando aparecen nuevos datos de
    rendimiento.

------------------------------------------------------------------------

**Resultado esperado:** un entrenador que conoce progresivamente cómo
juega el usuario, entiende qué necesita mejorar y le propone pequeñas
actividades útiles para avanzar de forma constante, manteniendo siempre
la libertad de elegir cómo entrenar.
