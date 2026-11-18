"""Settings come only from environment variables (or a local .env that is never committed)."""
import os
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(ROOT / ".env")

DATABASE_PATH = Path(os.environ.get("DATABASE_PATH", ROOT / "data" / "trainer.db"))
STOCKFISH_PATH = os.environ.get("STOCKFISH_PATH") or shutil.which("stockfish") or "stockfish"
ENGINE_DEPTH = int(os.environ.get("ENGINE_DEPTH", "16"))
ENGINE_THREADS = int(os.environ.get("ENGINE_THREADS", "1"))
ENGINE_WORKERS = int(os.environ.get("ENGINE_WORKERS", str(max(1, (os.cpu_count() or 2) // 2))))
# chess.com asks API clients to identify themselves; set a contact in .env if you deploy publicly.
CHESSCOM_USER_AGENT = os.environ.get("CHESSCOM_USER_AGENT", "chess-trainer/0.1")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
