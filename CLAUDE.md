# Chess trainer

Personal chess coach (spec: docs/especificacion.md, plan: docs/plan.md). Standalone: runs entirely on the
user's device, no backend. Single user now, built to be shared.

## Run
- Web app (main product): `cd web` → `npm install` → `npm run dev` · `npm test` · `npm run build`.
  Deployed to GitHub Pages on push to main (.github/workflows/pages.yml).
- Python tools (reference / desktop batch analysis): `.venv`, `pip install -r requirements.txt`, Stockfish on PATH or in `.env`;
  `python -m trainer link|sync|status|analyze|report --user <name>`; tests `python -m unittest discover -s tests`.

## Layout
- `web/src/core.ts` pure logic (win%, classification, chess.com parsing) · `db.ts` IndexedDB · `chesscom.ts` sync ·
  `engine.ts` Stockfish WASM worker · `analysis.ts` · `main.ts` UI
- `trainer/` Python equivalent · `data/` local SQLite (gitignored)

## Rules
- Public repo: no secrets, usernames, emails or personal data in code, tests or commits (author = GitHub noreply).
  Keys (e.g. Gemini) are entered by each user in the app and stay on their device; Python reads `.env` (gitignored).
- Chess facts shown to the user (moves, lines) come from the engine/chess.js, never invented by the LLM.
- Keep web `core.ts` and Python `analysis.py` thresholds in sync.
- chess.com API: keep requests serial; 429 → wait 60 s.
