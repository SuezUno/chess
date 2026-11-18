"""SQLite storage. Every row hangs off a user so the app can serve more than one player later."""
import sqlite3
from pathlib import Path

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS platform_accounts (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,              -- 'chesscom' (lichess later)
    username TEXT NOT NULL,
    last_archive TEXT,                   -- newest monthly archive fully stored, 'YYYY/MM'
    last_sync_at TEXT,
    last_sync_status TEXT,               -- 'ok' | 'error'
    last_error TEXT,
    UNIQUE (user_id, platform)
);

CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES platform_accounts(id) ON DELETE CASCADE,
    platform_game_id TEXT NOT NULL,
    url TEXT,
    source TEXT NOT NULL,                -- 'chesscom' | 'pgn'
    time_class TEXT,
    time_control TEXT,
    rated INTEGER,
    rules TEXT,
    end_time INTEGER,                    -- unix seconds
    user_color TEXT NOT NULL,            -- 'white' | 'black'
    user_rating INTEGER,
    opponent TEXT,
    opponent_rating INTEGER,
    result TEXT,                         -- 'win' | 'loss' | 'draw'
    result_detail TEXT,                  -- platform code: checkmated, timeout, resigned...
    eco TEXT,
    opening TEXT,
    pgn TEXT NOT NULL,
    analyzed_at TEXT,
    analysis_depth INTEGER,
    UNIQUE (account_id, platform_game_id)
);
CREATE INDEX IF NOT EXISTS games_user_end ON games(user_id, end_time);

CREATE TABLE IF NOT EXISTS moves (
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    ply INTEGER NOT NULL,                -- 1 = white's first move
    color TEXT NOT NULL,
    san TEXT NOT NULL,
    uci TEXT NOT NULL,
    fen_before TEXT NOT NULL,
    clock_seconds REAL,                  -- mover's clock after the move, if the PGN has it
    eval_before INTEGER,                 -- centipawns, white's point of view (mate = +-10000)
    eval_after INTEGER,
    best_uci TEXT,
    best_san TEXT,
    win_before REAL,                     -- mover's win chance 0-100
    win_after REAL,
    classification TEXT,                 -- null | inaccuracy | mistake | blunder
    PRIMARY KEY (game_id, ply)
);
"""


def connect(path=None) -> sqlite3.Connection:
    path = path or config.DATABASE_PATH
    if str(path) != ":memory:":
        Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.executescript(SCHEMA)
    return conn


def get_or_create_user(conn, display_name: str) -> int:
    row = conn.execute("SELECT id FROM users WHERE display_name = ?", (display_name,)).fetchone()
    if row:
        return row["id"]
    cur = conn.execute("INSERT INTO users (display_name) VALUES (?)", (display_name,))
    conn.commit()
    return cur.lastrowid


def link_account(conn, user_id: int, platform: str, username: str) -> int:
    conn.execute(
        "INSERT INTO platform_accounts (user_id, platform, username) VALUES (?, ?, ?) "
        "ON CONFLICT (user_id, platform) DO UPDATE SET username = excluded.username",
        (user_id, platform, username.lower()),
    )
    conn.commit()
    return conn.execute(
        "SELECT id FROM platform_accounts WHERE user_id = ? AND platform = ?", (user_id, platform)
    ).fetchone()["id"]
