# Plan de implementación

## Decisiones tomadas (18/11/2026)
- **Plataforma:** chess.com (API pública de solo lectura, archivos mensuales, sin OAuth). PGN como alternativa.
- **Formato:** web primero, pensada para el móvil e instalable como app (PWA). Debe permitir jugar posiciones
  en el tablero, no solo verlas. Si hace falta app nativa, se envuelve la misma web más adelante.
- **Usuarios:** uno (el dueño, beta tester), pero todo preparado para más: datos por `user_id`, sin secretos ni
  datos personales en el código (solo `.env` / variables de entorno), configuración documentada en `.env.example`.
- **Explicaciones:** LLM (Gemini, plan gratuito: aquí solo hay partidas) con plantillas de prompt por nivel y
  texto de plantilla como respaldo si no hay clave o falla la API. Las jugadas que se citen se comprueban con python-chess.
- **Motor:** Stockfish 19 local (GPL-3, proceso aparte). Un proceso por worker.
- **Almacenamiento:** SQLite (`data/trainer.db`). Migrable a Postgres si llega a multiusuario real.

## Fases
| Fase | Contenido | Aceptación | Estado |
|---|---|---|---|
| 0 | Prueba real: descargar partidas y analizar con Stockfish | Clasificación de jugadas sobre partidas reales | **Hecha** |
| 1 | Sincronización incremental sin duplicados, estado y errores, análisis en lote | 2.ª sync = 0 nuevas; error queda registrado; `status` | **Hecha (CLI)**; falta import PGN y sync automática |
| 2 | Hallazgos y perfil con evidencias y confianza (pieza colgada, amenaza no vista, castigo no visto, apuros de tiempo, finales, aperturas) | ≥3 patrones y ≥2 fortalezas con partidas de respaldo | Siguiente |
| 3 | Ejercicios desde posiciones propias, validados con multi-PV; repaso espaciado | Cada ejercicio enlaza a su hallazgo; solución única y verificada | |
| 4 | Web/PWA: bloques diarios elegibles, tablero jugable, progreso por bloque | Cualquier combinación de bloques, en momentos distintos, sin perder progreso | |
| 5 | Aperturas: identificación, desviaciones frente a maestros, sugerencias de repertorio | Sugerencia razonada (por qué encaja / inconvenientes), no obligatoria | |
| 6 | Explicaciones adaptadas al nivel con Gemini + plantillas; «más simple / más detalle» | Mismo error explicado distinto según nivel | |

## Abierto
- Dónde se aloja el servidor (un servidor doméstico modesto va justo para Stockfish en lote; analizar en el PC de trabajo o en un VPS).
- Fuente de partidas de maestros para la fase 5: revisar licencia antes de usar (explorador de Lichess, TWIC...).
- Sync automática: tarea periódica (p. ej. cada hora) en el servidor que se elija.
