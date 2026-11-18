"""Engine analysis of stored games: eval + best move per position, move classification.

Win chance and thresholds follow Lichess' published method (win% drop of 10/20/30 for
inaccuracy/mistake/blunder), so a 300 cp slip in a lost position isn't flagged like one in an equal one.
"""
import io
import math
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import chess
import chess.engine
import chess.pgn

from . import config

MATE = 10000
THRESHOLDS = ((30, "blunder"), (20, "mistake"), (10, "inaccuracy"))


def win_chance(cp: int) -> float:
    """Mover's win chance 0-100 from a centipawn score in the mover's point of view."""
    cp = max(-1000, min(1000, cp))
    return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)


def classify(drop: float) -> str | None:
    for limit, name in THRESHOLDS:
        if drop >= limit:
            return name
    return None


def _terminal_eval(board: chess.Board) -> int | None:
    if board.is_checkmate():
        return -MATE if board.turn == chess.WHITE else MATE
    if board.is_game_over(claim_draw=False):
        return 0
    return None


def analyze_pgn(pgn: str, engine, depth: int) -> list[dict]:
    """Return one dict per ply with evals (white's view), best move and classification."""
    game = chess.pgn.read_game(io.StringIO(pgn))
    if game is None:
        return []
    board = game.board()
    limit = chess.engine.Limit(depth=depth)
    plies, evals, bests = [], [], []
    for node in game.mainline():
        info = engine.analyse(board, limit)
        evals.append(info["score"].white().score(mate_score=MATE))
        best = info.get("pv", [None])[0]
        bests.append((best.uci(), board.san(best)) if best else (None, None))
        move = node.move
        plies.append({
            "ply": board.ply() + 1,
            "color": "white" if board.turn == chess.WHITE else "black",
            "san": board.san(move),
            "uci": move.uci(),
            "fen_before": board.fen(),
            "clock_seconds": node.clock(),
        })
        board.push(move)
    final = _terminal_eval(board)
    if final is None:
        final = engine.analyse(board, limit)["score"].white().score(mate_score=MATE)
    evals.append(final)

    for i, p in enumerate(plies):
        sign = 1 if p["color"] == "white" else -1
        before, after = evals[i], evals[i + 1]
        wb, wa = win_chance(sign * before), win_chance(sign * after)
        played_best = p["uci"] == bests[i][0]
        p.update(
            eval_before=before,
            eval_after=after,
            best_uci=bests[i][0],
            best_san=bests[i][1],
            win_before=round(wb, 1),
            win_after=round(wa, 1),
            classification=None if played_best else classify(wb - wa),
        )
    return plies


def analyze_pending(conn, user_id: int, limit: int | None = None, depth: int | None = None,
                    workers: int | None = None, progress=print) -> int:
    """Analyze the user's not-yet-analyzed standard games, newest first. Returns games done."""
    depth = depth or config.ENGINE_DEPTH
    workers = workers or config.ENGINE_WORKERS
    sql = ("SELECT id, pgn FROM games WHERE user_id = ? AND analyzed_at IS NULL "
           "AND (rules IS NULL OR rules = 'chess') ORDER BY end_time DESC")
    rows = conn.execute(sql + (f" LIMIT {int(limit)}" if limit else ""), (user_id,)).fetchall()
    if not rows:
        return 0

    local = threading.local()
    engines = []
    lock = threading.Lock()

    def work(game_id, pgn):
        if not hasattr(local, "engine"):
            local.engine = chess.engine.SimpleEngine.popen_uci(config.STOCKFISH_PATH)
            local.engine.configure({"Threads": config.ENGINE_THREADS})
            with lock:
                engines.append(local.engine)
        return game_id, analyze_pgn(pgn, local.engine, depth)

    done = 0
    try:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(work, r["id"], r["pgn"]) for r in rows]
            for fut in as_completed(futures):
                game_id, plies = fut.result()
                conn.execute("DELETE FROM moves WHERE game_id = ?", (game_id,))
                conn.executemany(
                    "INSERT INTO moves (game_id, ply, color, san, uci, fen_before, clock_seconds, "
                    "eval_before, eval_after, best_uci, best_san, win_before, win_after, classification) "
                    "VALUES (:game_id, :ply, :color, :san, :uci, :fen_before, :clock_seconds, :eval_before, "
                    ":eval_after, :best_uci, :best_san, :win_before, :win_after, :classification)",
                    [{**p, "game_id": game_id} for p in plies],
                )
                conn.execute(
                    "UPDATE games SET analyzed_at = ?, analysis_depth = ? WHERE id = ?",
                    (datetime.now(timezone.utc).isoformat(timespec="seconds"), depth, game_id),
                )
                conn.commit()
                done += 1
                if progress and (done % 10 == 0 or done == len(rows)):
                    progress(f"  analizadas {done}/{len(rows)}")
    finally:
        for engine in engines:
            engine.quit()
    return done
