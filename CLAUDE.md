# Chess trainer

Personal chess coach (spec: docs/especificacion.md, plan: docs/plan.md). Single user now, built to be multi-user.

## Run
- Setup: `python -m venv .venv` → `.venv\Scripts\pip install -r requirements.txt`, Stockfish installed (`winget install Stockfish.Stockfish`), copy `.env.example` → `.env`.
- `python -m trainer link --user <name> --chesscom <username>` · `sync` · `status` · `analyze [--limit N]` · `report` (all take `--user`).
- Tests: `python -m unittest discover -s tests`

## Layout
- `trainer/config.py` env settings · `db.py` SQLite schema · `chesscom.py` sync · `analysis.py` Stockfish · `cli.py`
- `data/` local DB (gitignored)

## Rules
- No secrets, usernames or personal data in code or commits: only env vars / `.env` (gitignored). `.env.example` documents every key.
- Every table row hangs off `user_id`; never assume a single user.
- Chess facts shown to the user (moves, lines) come from the engine/python-chess, never invented by the LLM.
- Platform: chess.com public API (read-only). Keep requests serial; 429 → wait 60 s.
