# Chess trainer

Entrenador personal de ajedrez: importa tus partidas de chess.com, las analiza con Stockfish,
detecta tus errores recurrentes y te propone bloques diarios de entrenamiento que eliges tú.

Estado: fase 0–1 (sincronización y análisis por línea de comandos). Ver [docs/plan.md](docs/plan.md).

## Puesta en marcha

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt      # Linux/macOS: .venv/bin/pip
winget install Stockfish.Stockfish                  # o el paquete de tu sistema
cp .env.example .env                                # rellena STOCKFISH_PATH si no está en PATH
python -m trainer link --user yo --chesscom TU_USUARIO
python -m trainer sync --user yo
python -m trainer analyze --user yo --limit 50
python -m trainer report --user yo
```

Las claves y rutas viven solo en `.env` o en variables de entorno; nunca en el código.
