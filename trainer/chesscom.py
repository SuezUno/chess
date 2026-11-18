"""Incremental import from the chess.com Published-Data API (public, read-only, no auth).

https://www.chess.com/news/view/published-data-api
Strategy: list monthly archives, re-fetch the last stored month (it may have grown) and every
newer one. Games are keyed by chess.com's uuid, so re-fetching never creates duplicates.
"""
import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

from . import config

API = "https://api.chess.com/pub/player/{username}"
DRAW_CODES = {"agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"}


class SyncError(Exception):
    pass


def _get(url: str, retries: int = 4) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": config.CHESSCOM_USER_AGENT})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise SyncError(f"No existe en chess.com o no es público: {url}") from e
            if e.code == 410:
                raise SyncError(f"chess.com ya no sirve este recurso: {url}") from e
            if e.code == 429 and attempt < retries - 1:
                time.sleep(60)  # rate limited: back off a full minute, requests stay serial
                continue
            raise SyncError(f"chess.com respondió {e.code} en {url}") from e
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < retries - 1:
                time.sleep(2 ** attempt * 5)
                continue
            raise SyncError(f"Sin conexión con chess.com: {e}") from e
    raise SyncError(f"Demasiados reintentos: {url}")


def parse_game(raw: dict, username: str) -> dict | None:
    """Turn one chess.com game into a games row (without user/account ids). None if unusable."""
    if not raw.get("pgn"):
        return None
    white, black = raw["white"], raw["black"]
    if white["username"].lower() == username:
        me, opp, color = white, black, "white"
    elif black["username"].lower() == username:
        me, opp, color = black, white, "black"
    else:
        return None
    code = me.get("result", "")
    result = "win" if code == "win" else "draw" if code in DRAW_CODES else "loss"
    detail = code if code != "win" else opp.get("result", "")
    eco_url = raw.get("eco", "")
    opening = eco_url.rsplit("/", 1)[-1].replace("-", " ") if eco_url else None
    eco = None
    for line in raw["pgn"].splitlines():
        if line.startswith("[ECO "):
            eco = line.split('"')[1]
            break
    return {
        "platform_game_id": raw.get("uuid") or raw["url"],
        "url": raw.get("url"),
        "source": "chesscom",
        "time_class": raw.get("time_class"),
        "time_control": raw.get("time_control"),
        "rated": int(bool(raw.get("rated"))),
        "rules": raw.get("rules"),
        "end_time": raw.get("end_time"),
        "user_color": color,
        "user_rating": me.get("rating"),
        "opponent": opp.get("username"),
        "opponent_rating": opp.get("rating"),
        "result": result,
        "result_detail": detail,
        "eco": eco,
        "opening": opening,
        "pgn": raw["pgn"],
    }


def store_games(conn, user_id: int, account_id: int, rows: list[dict]) -> int:
    before = conn.total_changes
    for row in rows:
        row = {**row, "user_id": user_id, "account_id": account_id}
        cols = ", ".join(row)
        conn.execute(
            f"INSERT OR IGNORE INTO games ({cols}) VALUES ({', '.join('?' * len(row))})",
            tuple(row.values()),
        )
    conn.commit()
    return conn.total_changes - before


def sync_account(conn, account_id: int, fetch=_get) -> int:
    """Import new games for one linked account. Returns how many new games were stored."""
    acc = conn.execute("SELECT * FROM platform_accounts WHERE id = ?", (account_id,)).fetchone()
    username = acc["username"]
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    try:
        archives = fetch(API.format(username=username) + "/games/archives")["archives"]
        months = [(url, "/".join(url.rsplit("/", 2)[-2:])) for url in archives]
        pending = [(url, m) for url, m in months if not acc["last_archive"] or m >= acc["last_archive"]]
        added = 0
        for url, month in pending:
            games = fetch(url).get("games", [])
            rows = [r for r in (parse_game(g, username) for g in games) if r]
            added += store_games(conn, acc["user_id"], account_id, rows)
            conn.execute("UPDATE platform_accounts SET last_archive = ? WHERE id = ?", (month, account_id))
            conn.commit()
        conn.execute(
            "UPDATE platform_accounts SET last_sync_at = ?, last_sync_status = 'ok', last_error = NULL "
            "WHERE id = ?",
            (now, account_id),
        )
        conn.commit()
        return added
    except SyncError as e:
        conn.execute(
            "UPDATE platform_accounts SET last_sync_at = ?, last_sync_status = 'error', last_error = ? "
            "WHERE id = ?",
            (now, str(e), account_id),
        )
        conn.commit()
        raise
